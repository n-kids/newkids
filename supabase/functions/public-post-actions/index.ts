const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ALLOWED_ORIGINS = new Set(["https://n-kids.github.io"]);

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const publicFields = [
  "id", "created_at", "title", "content", "image_url", "category",
  "thumbnail_url", "link_url", "order_num", "video_url", "is_visible",
  "is_secret", "download_count", "is_notice", "publish_at",
];

function safePost(row: Record<string, unknown>, includeContent = true) {
  const out: Record<string, unknown> = {};
  for (const field of publicFields) {
    if (field === "content" && !includeContent) continue;
    out[field] = row[field] ?? null;
  }
  out.has_download_password = Boolean(row.download_password);
  return out;
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return body ? JSON.parse(body) : null;
}

async function findPost(id: number) {
  const rows = await rest(`total_posts?id=eq.${id}&select=*`);
  return Array.isArray(rows) ? rows[0] : null;
}

function validId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function json(origin: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed" }, 405);
  if (req.headers.get("apikey") !== ANON_KEY) return json(origin, { error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || JSON.stringify(body).length > 300_000) {
      return json(origin, { error: "Invalid request" }, 400);
    }
    const id = validId(body.id);
    const password = typeof body.password === "string" ? body.password : "";
    const action = body.action;

    const id = validId(body.id);
    const password = typeof body.password === "string" ? body.password : "";
    const action = body.action;

    if (action === "admin_get_sheet_url" || action === "admin_save_sheet_url") {
      const bearer = req.headers.get("Authorization") || "";
      const userResponse = await fetch(`${PROJECT_URL}/auth/v1/user`, {
        headers: { apikey: ANON_KEY, Authorization: bearer },
      });
      const user = userResponse.ok ? await userResponse.json() : null;
      if (user?.id !== "f17f6f28-84d7-426e-9eb1-cdac8ec015d4") {
        return json(origin, { error: "Administrator access required" }, 403);
      }
      if (action === "admin_get_sheet_url") {
        const rows = await rest("site_config?id=eq.1&select=sheet_url");
        return json(origin, { sheet_url: rows?.[0]?.sheet_url || "" });
      }
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!/^https?:\/\//i.test(url) || url.length > 4000) {
        return json(origin, { error: "Invalid sheet URL" }, 400);
      }
      await rest("site_config?id=eq.1", {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ sheet_url: url }),
      });
      return json(origin, { success: true });
    }

    if (action === "create") {
      const post = body.post;
      if (!post || typeof post !== "object" || !password || password.length > 256) {
        return json(origin, { error: "Title and post password are required" }, 400);
      }
      if (typeof post.title !== "string" || !post.title.trim() || post.title.length > 300 ||
          typeof post.content !== "string" || post.content.length > 200_000 ||
          typeof post.category !== "string" || post.category.length > 100) {
        return json(origin, { error: "Invalid post fields" }, 400);
      }
      const row = {
        title: post.title.trim(),
        content: post.content,
        category: post.category,
        link_url: typeof post.link_url === "string" ? post.link_url.slice(0, 2000) : null,
        image_url: typeof post.image_url === "string" ? post.image_url.slice(0, 20_000) : null,
        thumbnail_url: typeof post.thumbnail_url === "string" ? post.thumbnail_url.slice(0, 2000) : null,
        is_visible: true,
        is_secret: false,
        is_notice: false,
        password,
        publish_at: new Date().toISOString(),
      };
      const inserted = await rest("total_posts?select=*", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      return json(origin, { post: safePost(inserted[0]) }, 201);
    }

    if (!id) return json(origin, { error: "Invalid post id" }, 400);
    const row = await findPost(id);
    if (!row) return json(origin, { error: "Post not found" }, 404);

    if (action === "get_secret_metadata") {
      if (!row.is_secret || row.is_visible === false) return json(origin, { error: "Post not found" }, 404);
      return json(origin, { post: safePost(row, false) });
    }

    if (action === "verify_post_password" || action === "load_for_edit") {
      if (!password || password.length > 256 || row.password !== password) {
        return json(origin, { authorized: false }, 200);
      }
      return json(origin, { authorized: true, post: safePost(row) });
    }

    if (action === "verify_download") {
      return json(origin, {
        authorized: Boolean(password && row.download_password && row.download_password === password),
      });
    }

    if (action === "increment_download") {
      const nextCount = (Number(row.download_count) || 0) + 1;
      await rest(`total_posts?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ download_count: nextCount }),
      });
      return json(origin, { success: true, download_count: nextCount });
    }

    if (action === "update") {
      if (!password || password.length > 256 || row.password !== password || row.is_secret) {
        return json(origin, { error: "Post password is incorrect or post is unavailable" }, 403);
      }
      const post = body.post;
      if (!post || typeof post !== "object" ||
          typeof post.title !== "string" || !post.title.trim() || post.title.length > 300 ||
          typeof post.content !== "string" || post.content.length > 200_000 ||
          typeof post.category !== "string" || post.category.length > 100) {
        return json(origin, { error: "Invalid post fields" }, 400);
      }
      const patch = {
        title: post.title.trim(),
        content: post.content,
        category: post.category,
        link_url: typeof post.link_url === "string" ? post.link_url.slice(0, 2000) : null,
        image_url: typeof post.image_url === "string" ? post.image_url.slice(0, 20_000) : null,
        thumbnail_url: typeof post.thumbnail_url === "string" ? post.thumbnail_url.slice(0, 2000) : null,
      };
      await rest(`total_posts?id=eq.${id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      return json(origin, { success: true });
    }

    if (action === "delete") {
      if (!password || password.length > 256 || row.password !== password) {
        return json(origin, { error: "Post password is incorrect" }, 403);
      }
      await rest(`total_posts?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json(origin, { success: true });
    }

    return json(origin, { error: "Unknown action" }, 400);
  } catch (error) {
    console.error("public-post-actions error:", error);
    return json(origin, { error: "Request could not be completed" }, 500);
  }
});
