const { test, expect } = require('@playwright/test');

const DB_KEY = '__nk_posts_form_test_db_v1';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

function buildQuillMockScript() {
  return `(() => {
    class MockQuill {
      constructor(selector) {
        const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
        this.root = document.createElement('div');
        this.root.className = 'ql-editor';
        this.root.contentEditable = 'true';
        container.innerHTML = '';
        container.appendChild(this.root);
        this._handlers = {};
        this._selection = { index: 0, length: 0 };
        this.root.addEventListener('input', () => this._emit('text-change', {}, {}, 'user'));
      }
      static import() { return { whitelist: [] }; }
      static register() {}
      static find() { return null; }
      on(evt, fn) {
        this._handlers[evt] = this._handlers[evt] || [];
        this._handlers[evt].push(fn);
      }
      _emit(evt, ...args) {
        (this._handlers[evt] || []).forEach(fn => fn(...args));
      }
      getText() { return (this.root.textContent || '') + '\\n'; }
      getLength() { return (this.root.textContent || '').length + 1; }
      getSelection() { return this._selection; }
      setSelection(idx) { this._selection = idx === null ? null : { index: idx, length: 0 }; }
      blur() {}
      update() {}
      getModule() { return { hide() {} }; }
      setContents(_ops, source = 'api') {
        this.root.innerHTML = '';
        this._emit('text-change', {}, {}, source);
      }
      insertEmbed(_index, type, value, source = 'api') {
        if (type === 'image') {
          const img = document.createElement('img');
          img.src = value;
          this.root.appendChild(img);
        } else if (type === 'video') {
          const ifr = document.createElement('iframe');
          ifr.className = 'ql-video';
          ifr.src = value;
          this.root.appendChild(ifr);
        }
        this._emit('text-change', {}, {}, source);
      }
      insertText(_index, text, source = 'api') {
        this.root.appendChild(document.createTextNode(text));
        this._emit('text-change', {}, {}, source);
      }
    }
    window.Quill = MockQuill;
    window.QuillBlotFormatter = { default: function() {} };
  })();`;
}

function buildSupabasePostsMockScript(seedJson) {
  return `(() => {
    const KEY = ${JSON.stringify(DB_KEY)};
    const copy = (v) => JSON.parse(JSON.stringify(v));
    let clientSeq = 0;

    function readDb() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      const init = ${seedJson};
      try { localStorage.setItem(KEY, JSON.stringify(init)); } catch (_) {}
      return init;
    }
    function writeDb(db) {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {}
    }

    function evalOrCondition(row, condStr) {
      const clauses = String(condStr || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!clauses.length) return true;
      return clauses.some(clause => {
        const parts = clause.split('.');
        if (parts.length < 3) return true;
        const col = parts[0];
        const op = parts[1];
        const val = parts.slice(2).join('.');
        const cell = row[col];
        if (op === 'is' && val === 'null') return cell === null || cell === undefined;
        if (op === 'lte') return cell != null && String(cell) <= val;
        if (op === 'gte') return cell != null && String(cell) >= val;
        if (op === 'eq') return String(cell) === val;
        if (op === 'neq') return String(cell) !== val;
        if (op === 'ilike') {
          const needle = val.replace(/^%|%$/g, '').toLowerCase();
          return String(cell || '').toLowerCase().includes(needle);
        }
        return true;
      });
    }

    function createClientInstance() {
      const clientId = ++clientSeq;
      const startLoggedOut = new URLSearchParams(location.search).has('test_logged_out');
      let signedIn = !startLoggedOut;

      function ensureAuthForWrite(table) {
        const db = readDb();
        if (!signedIn && (table === 'post_revisions' || table === 'total_posts')) {
          db.staleClientViolations = db.staleClientViolations || [];
          db.staleClientViolations.push({ clientId, table });
          writeDb(db);
          return { message: 'Unauthenticated/stale client #' + clientId + ' cannot access ' + table };
        }
        return null;
      }

      function query(table) {
        const filters = [];
        let op = 'select';
        let payload = null;
        let wantSingle = false;
        let orders = [];
        let limitNum = null;
        let rangeBounds = null;

        const chain = {
          select() { return chain; },
          insert(rows) { op = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
          update(patch) { op = 'update'; payload = patch; return chain; },
          delete() { op = 'delete'; return chain; },
          eq(k, v) { filters.push(row => String(row[k]) === String(v)); return chain; },
          neq(k, v) { filters.push(row => row[k] !== v); return chain; },
          in(k, vals) { filters.push(row => vals.map(String).includes(String(row[k]))); return chain; },
          or(cond) { filters.push(row => evalOrCondition(row, cond)); return chain; },
          like(k, pat) {
            const raw = String(pat || '');
            const parts = raw.split('%');
            filters.push(row => {
              const s = String(row[k] || '');
              if (parts.length === 1) return s === raw;
              let pos = 0;
              if (parts[0] && !s.startsWith(parts[0])) return false;
              pos = parts[0].length;
              for (let i = 1; i < parts.length - 1; i++) {
                const idx = s.indexOf(parts[i], pos);
                if (idx === -1) return false;
                pos = idx + parts[i].length;
              }
              const last = parts[parts.length - 1];
              return !last || (s.endsWith(last) && s.length - last.length >= pos);
            });
            return chain;
          },
          ilike(k, pat) {
            const needle = String(pat || '').replace(/^%|%$/g, '').toLowerCase();
            filters.push(row => String(row[k] || '').toLowerCase().includes(needle));
            return chain;
          },
          gte(k, v) { filters.push(row => row[k] != null && String(row[k]) >= String(v)); return chain; },
          lte(k, v) { filters.push(row => row[k] != null && String(row[k]) <= String(v)); return chain; },
          gt(k, v) { filters.push(row => row[k] != null && String(row[k]) > String(v)); return chain; },
          lt(k, v) { filters.push(row => row[k] != null && String(row[k]) < String(v)); return chain; },
          is(k, v) { filters.push(row => v === null ? row[k] == null : row[k] === v); return chain; },
          not(k, opName, v) {
            if (opName === 'is' && v === null) filters.push(row => row[k] != null);
            return chain;
          },
          order(col, opts) { orders.push({ col, asc: !opts || opts.ascending !== false }); return chain; },
          limit(n) { limitNum = n; return chain; },
          range(from, to) { rangeBounds = [from, to]; return chain; },
          single() { wantSingle = true; return chain; },
          maybeSingle() { wantSingle = true; return chain; },
          then(resolve, reject) {
            const db = readDb();
            if (op !== 'select') {
              const authErr = ensureAuthForWrite(table);
              if (authErr) return Promise.resolve({ data: null, error: authErr }).then(resolve, reject);
            }
            if (table === 'site_config') {
              const row = { id: 1, company_name: '뉴키즈', primary_color: '#1a3c6e', accent_color: '#b85a17' };
              return Promise.resolve({ data: wantSingle ? row : [row], error: null }).then(resolve, reject);
            }
            const arr = db[table] || [];
            if (op === 'insert') {
              const inserted = payload.map(item => {
                db.seq = (db.seq || 100) + 1;
                return {
                  id: item.id ?? db.seq,
                  created_at: item.created_at || new Date().toISOString(),
                  ...copy(item)
                };
              });
              arr.push(...inserted);
              db[table] = arr;
              writeDb(db);
              return Promise.resolve({ data: copy(wantSingle ? inserted[0] : inserted), error: null }).then(resolve, reject);
            }
            if (op === 'update') {
              const updated = [];
              arr.forEach((row, idx) => {
                if (filters.every(fn => fn(row))) {
                  arr[idx] = { ...row, ...copy(payload) };
                  updated.push(arr[idx]);
                }
              });
              db[table] = arr;
              writeDb(db);
              return Promise.resolve({ data: copy(wantSingle ? (updated[0] || null) : updated), error: null }).then(resolve, reject);
            }
            if (op === 'delete') {
              const deleted = [];
              const kept = [];
              arr.forEach(row => {
                if (filters.every(fn => fn(row))) deleted.push(row);
                else kept.push(row);
              });
              db[table] = kept;
              writeDb(db);
              return Promise.resolve({ data: copy(deleted), error: null }).then(resolve, reject);
            }

            let matched = arr.filter(row => filters.every(fn => fn(row)));
            if (orders.length) {
              matched.sort((a, b) => {
                for (const o of orders) {
                  const av = a[o.col] ?? '';
                  const bv = b[o.col] ?? '';
                  if (av === bv) continue;
                  if (typeof av === 'number' && typeof bv === 'number') return o.asc ? av - bv : bv - av;
                  return o.asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
                }
                return 0;
              });
            }
            const totalCount = matched.length;
            if (rangeBounds) matched = matched.slice(rangeBounds[0], rangeBounds[1] + 1);
            if (limitNum !== null) matched = matched.slice(0, limitNum);
            return Promise.resolve({
              data: copy(wantSingle ? (matched[0] || null) : matched),
              count: totalCount,
              error: wantSingle && !matched.length ? { message: 'Row not found' } : null
            }).then(resolve, reject);
          }
        };
        return chain;
      }

      const sessionObj = () => signedIn ? { user: { id: 'admin-1', email: 'admin@example.invalid' } } : null;
      return {
        __clientId: clientId,
        from: query,
        storage: {
          from: () => ({
            upload: async (path, file) => {
              const db = readDb();
              db.uploads = db.uploads || [];
              db.uploads.push({ path, size: file?.size || 0, type: file?.type || '' });
              writeDb(db);
              return { data: { path }, error: null };
            },
            list: async () => ({ data: [], error: null }),
            getPublicUrl: (p) => ({ data: { publicUrl: 'https://example.invalid/storage/v1/object/public/images/' + p } }),
            remove: async () => ({ data: [], error: null })
          })
        },
        auth: {
          getSession: async () => ({ data: { session: sessionObj() }, error: null }),
          signInWithPassword: async () => { signedIn = true; return { data: { session: sessionObj() }, error: null }; },
          signOut: async () => { signedIn = false; return { error: null }; },
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
        },
        rpc: async () => ({ data: { count: 0, tallies: {} }, error: null })
      };
    }

    window.__nkReadTestDb = readDb;
    window.supabase = { createClient: () => createClientInstance() };
  })();`;
}

function makeSeedDb() {
  const pastIso = new Date(Date.now() - 86400000).toISOString();
  const futureIso = new Date(Date.now() + 3 * 86400000).toISOString();
  return {
    seq: 200,
    uploads: [],
    staleClientViolations: [],
    program_categories: [
      { code: 'korean', name: '한글', type: 'EDU', hero_title: '한글', hero_desc: '', is_visible: true, order_num: 0 },
      { code: 'season', name: '시즌 행사', type: 'EVENT', hero_title: '시즌 행사', hero_desc: '', is_visible: true, order_num: 1 },
      { code: 'notice', name: '공지사항', type: 'BOARD', hero_title: '공지사항', hero_desc: '', is_visible: true, order_num: 2 },
      { code: 'about', name: '회사소개', type: 'PAGE', hero_title: '회사소개', hero_desc: '', is_visible: true, order_num: 3 }
    ],
    total_posts: [
      {
        id: 10,
        title: '기존 한글 교재',
        content: '<p>기존 본문 <a href="https://example.com" target="_blank">외부링크</a></p>',
        category: 'korean',
        order_num: 5,
        video_url: 'ORDER_ALL|https://youtu.be/dQw4w9WgXcQ',
        link_url: 'https://example.com/guide',
        thumbnail_url: 'https://example.invalid/storage/v1/object/public/images/old_thumb.webp',
        image_url: 'https://example.invalid/storage/v1/object/public/images/doc1.pdf@@안내서.pdf',
        password: 'pw1',
        download_password: 'dl1',
        is_notice: true,
        is_draft: false,
        is_visible: true,
        publish_at: pastIso,
        created_at: pastIso,
        download_count: 12
      },
      {
        id: 11,
        title: '공개 공지글 (publish_at NULL)',
        content: '<p>레거시 공지 본문</p>',
        category: 'notice',
        order_num: 1,
        video_url: '',
        link_url: '관리자',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: false,
        is_visible: true,
        publish_at: null,
        created_at: pastIso,
        download_count: 0
      },
      {
        id: 20,
        title: '비공개 초안 게시글',
        content: '<p>초안 내용</p>',
        category: 'notice',
        order_num: 0,
        video_url: '',
        link_url: '',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: true,
        is_visible: false,
        publish_at: pastIso,
        created_at: pastIso,
        download_count: 0
      },
      {
        id: 21,
        title: '미래 예약 발행 게시글',
        content: '<p>예약 내용</p>',
        category: 'notice',
        order_num: 0,
        video_url: '',
        link_url: '',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: false,
        is_visible: true,
        publish_at: futureIso,
        created_at: pastIso,
        download_count: 0
      },
      {
        id: 22,
        title: '미래 예약 발주 교재',
        content: '<p>예약 발주</p>',
        category: 'korean',
        order_num: 0,
        video_url: 'ORDER_ITEM',
        link_url: '',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: false,
        is_visible: true,
        publish_at: futureIso,
        created_at: pastIso,
        download_count: 0
      },
      {
        id: 30,
        title: '회사소개 초안',
        content: '<p>노출되면 안 되는 초안</p>',
        category: 'about',
        order_num: 0,
        video_url: '',
        link_url: '',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: true,
        is_visible: true,
        publish_at: pastIso,
        created_at: futureIso,
        download_count: 0
      },
      {
        id: 31,
        title: '회사소개 본문',
        content: '<p>뉴키즈 소개입니다.</p><p>[투표:form_live]</p>',
        category: 'about',
        order_num: 1,
        video_url: '',
        link_url: '',
        thumbnail_url: null,
        image_url: null,
        password: '',
        download_password: '',
        is_notice: false,
        is_draft: false,
        is_visible: true,
        publish_at: pastIso,
        created_at: pastIso,
        download_count: 0
      }
    ],
    post_revisions: [],
    post_comments: [],
    admin_activity_logs: [],
    site_popups: [],
    custom_forms: [
      {
        id: 'form_live',
        title: '2026 체험 신청 폼',
        description: '테스트 폼',
        is_active: true,
        max_participants: 10,
        end_date: futureIso,
        prevent_duplicate: false,
        created_at: pastIso,
        form_schema: {
          version: 2,
          questions: [{ id: 'q1', title: '의견', type: 'text', required: true }],
          settings: { respondent: { anonymous: true, name: 'hidden', affiliation: 'hidden', contact: 'hidden' } }
        }
      }
    ],
    form_responses: []
  };
}

async function setupRoutes(context, seedDb) {
  const sbMock = buildSupabasePostsMockScript(JSON.stringify(seedDb));
  const quillMock = buildQuillMockScript();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: sbMock });
    }
    if (url.hostname === 'cdn.quilljs.com' && url.pathname.endsWith('quill.js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: quillMock });
    }
    if (url.hostname === 'unpkg.com' && url.pathname.includes('quill-blot-formatter')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* mocked */' });
    }
    if (url.hostname.endsWith('supabase.co')) {
      throw new Error('Production database request blocked: ' + url.pathname);
    }
    return route.abort();
  });
}

async function openPostsTab(page, query = '') {
  await page.goto('/admin.html' + query);
  if (!query.includes('test_logged_out=1')) {
    await expect(page.locator('#admin-layout')).toBeVisible();
    await page.locator('.nav-item').nth(1).click();
    await expect(page.locator('#tab-posts')).toBeVisible();
    await expect(page.locator('#manage-list .post-manage-card').first()).toBeVisible();
  }
}

test('category validation, Shorts thumbnail, safe attachment keys, XSS escaping, and double-submit guard', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  // 1) Missing category is blocked and highlights selector
  await page.locator('#post-title').fill('<img src=x onerror="window.__xss=1">테스트 글');
  await page.locator('#btn-submit').click();
  await expect(page.locator('#custom-cat-trigger')).toHaveClass(/nk-cat-trigger-error/);
  const countBefore = await page.evaluate(() => window.__nkReadTestDb().total_posts.length);

  // 2) Select category clears error, Shorts URL previews thumbnail
  await page.locator('#custom-cat-trigger').click();
  await page.locator('#custom-cat-dropdown .cs-group-header', { hasText: '교육' }).click();
  await page.locator('#custom-cat-dropdown .cs-item', { hasText: '한글' }).click();
  await expect(page.locator('#custom-cat-trigger')).not.toHaveClass(/nk-cat-trigger-error/);
  await page.locator('#youtube-url').fill('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  await expect(page.locator('#thumb-preview-badge')).toHaveText('유튜브 자동 추출 예정');
  await expect(page.locator('#thumb-preview-img-wrap img')).toHaveAttribute('src', 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

  // 3) Upload extensionless file + XSS filename
  await page.locator('#post-file').setInputFiles([
    { name: 'README', mimeType: 'text/plain', buffer: Buffer.from('hello world') },
    { name: 'bad<img src=x onerror="window.__xss=2">.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }
  ]);
  await expect(page.locator('#existing-files-list .file-item-row')).toHaveCount(2);
  await expect(page.locator('#existing-files-list .nk-file-origin-badge.is-new')).toHaveCount(2);
  await expect(page.locator('#existing-files-list img')).toHaveCount(0);

  // 4) Trigger double submit quickly -> only 1 post created
  await page.evaluate(() => {
    window.uploadPost(false);
    window.uploadPost(false);
  });
  await expect.poll(async () => page.evaluate(() => window.__nkReadTestDb().total_posts.length)).toBe(countBefore + 1);

  const db = await page.evaluate(() => window.__nkReadTestDb());
  const created = db.total_posts[db.total_posts.length - 1];
  expect(created.thumbnail_url).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  expect(db.uploads[0].path).toMatch(/^d_\d+_0$/);
  expect(db.uploads[1].path).toMatch(/^d_\d+_1\.pdf$/);

  // 5) Manage card escapes title and removes inline JSON from onclick
  await expect(page.locator('#manage-list .pm-title img')).toHaveCount(0);
  const onclickVal = await page.locator('#manage-list .pm-title').first().getAttribute('onclick');
  expect(onclickVal).toMatch(/^editPostById\(\d+\)$/);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

test('edit -> cancel -> create isolates all state, supports thumbnail deletion, and copyPost resets sensitive fields', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });

  // Open edit on post #10
  await page.locator('.post-manage-card[data-id="10"] button', { hasText: '수정' }).click();
  await expect(page.locator('#post-mode-banner')).toBeVisible();
  await expect(page.locator('#post-mode-banner')).toHaveClass(/is-edit/);
  await expect(page.locator('#thumb-manage-area')).toBeVisible();
  await expect(page.locator('#thumb-preview-badge')).toHaveText('기존 썸네일 유지');
  // Past publish_at should NOT fill schedule picker
  await expect(page.locator('#post-publish-at')).toHaveValue('');
  await expect(page.locator('#publish-at-status')).toContainText('기존 공개 일시가 유지됩니다');

  // Toggle delete existing thumbnail
  await page.locator('#delete-thumb-check').check();
  await expect(page.locator('#thumb-preview-badge')).toHaveText('유튜브 자동 추출 예정');

  // Uncheck and cancel cleanly without false dirty prompt on fresh open
  await page.locator('.post-manage-card[data-id="10"] button', { hasText: '수정' }).click();
  dialogs.length = 0;
  await page.waitForTimeout(50);
  await page.locator('#btn-cancel-edit').click();
  expect(dialogs).toEqual([]);

  // Verify full reset
  await expect(page.locator('#post-order')).toHaveValue('0');
  await expect(page.locator('#youtube-url')).toHaveValue('');
  await expect(page.locator('#post-link')).toHaveValue('');
  await expect(page.locator('#post-mode-banner')).toBeHidden();
  await expect(page.locator('#thumb-manage-area')).toBeHidden();

  // Create brand-new post right after cancel -> zero leak from post #10
  await page.locator('#custom-cat-trigger').click();
  await page.locator('#custom-cat-dropdown .cs-group-header', { hasText: '게시판' }).click();
  await page.locator('#custom-cat-dropdown .cs-item', { hasText: '공지사항' }).click();
  await page.locator('#post-title').fill('클린 신규 게시글');
  await page.locator('#btn-submit').click();

  await expect.poll(async () => page.evaluate(() => {
    const p = window.__nkReadTestDb().total_posts.find(x => x.title === '클린 신규 게시글');
    return p ? { thumb: p.thumbnail_url, video: p.video_url, link: p.link_url, order: p.order_num } : null;
  })).toEqual({ thumb: null, video: '', link: '', order: 0 });

  // Copy post #10 -> resets passwords, notice, publish_at, shows copy banner
  await page.locator('.post-manage-card[data-id="10"] button', { hasText: '복사' }).click();
  await expect(page.locator('#post-mode-banner')).toBeVisible();
  await expect(page.locator('#post-mode-banner')).toHaveClass(/is-copy/);
  await expect(page.locator('#post-title')).toHaveValue('[복사본] 기존 한글 교재');
  await expect(page.locator('#post-password')).toHaveValue('');
  await expect(page.locator('#post-dl-password')).toHaveValue('');
  await expect(page.locator('#chk-is-notice')).not.toBeChecked();
});

test('crop modal setEditMode switches modes properly and closeCropModal preserves unrelated file inputs', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  const pngBuf = Buffer.from(TINY_PNG_B64, 'base64');

  // Set an unrelated file input on settings tab (without firing its own crop modal)
  await page.evaluate((b64) => {
    const dt = new DataTransfer();
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    dt.items.add(new File([arr], 'hero.png', { type: 'image/png' }));
    document.getElementById('conf-main-hero').files = dt.files;
  }, TINY_PNG_B64);
  // Trigger crop modal via thumbnail input
  await page.locator('#post-thumb-file').setInputFiles({ name: 'thumb.png', mimeType: 'image/png', buffer: pngBuf });
  await expect(page.locator('#crop-modal')).toBeVisible();

  // Switch to draw mode -> cursor must be crosshair (not invalid 'pen') and mode updated
  await page.locator('#btn-mode-draw').click();
  const drawState = await page.evaluate(() => ({
    cursor: document.getElementById('crop-source-canvas').style.cursor,
    drawActive: document.getElementById('btn-mode-draw').classList.contains('active')
  }));
  expect(drawState).toEqual({ cursor: 'crosshair', drawActive: true });

  // Add text & delete selected text (only works when currentMode === 'text')
  await page.locator('#text-input').fill('샘플 라벨');
  await page.locator('#crop-modal button', { hasText: '글자추가' }).click();
  await expect(page.locator('#btn-mode-text')).toHaveClass(/active/);
  await page.locator('#crop-modal button', { hasText: '선택 삭제' }).click();

  // Apply crop -> updates preview card and does NOT wipe #conf-main-hero
  await page.locator('#crop-modal button', { hasText: '편집 적용 완료' }).click();
  await expect(page.locator('#crop-modal')).toBeHidden();
  await expect(page.locator('#thumb-preview-badge')).toHaveText('새 썸네일 적용 예정');
  await expect(page.locator('#btn-clear-new-thumb')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('conf-main-hero').files.length)).toBe(1);

  // Clear selected thumbnail
  await page.locator('#btn-clear-new-thumb').click();
  await expect(page.locator('#thumb-preview-badge')).toHaveText('미설정');
});

test('base64 pasted images and inline data:image tags are uploaded to Storage before saving', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  await page.locator('#custom-cat-trigger').click();
  await page.locator('#custom-cat-dropdown .cs-group-header', { hasText: '게시판' }).click();
  await page.locator('#custom-cat-dropdown .cs-item', { hasText: '공지사항' }).click();
  await page.locator('#post-title').fill('이미지 붙여넣기 테스트');

  // Inject an inline data:image tag into editor (as from rich HTML paste)
  await page.evaluate((b64) => {
    const editor = document.querySelector('#editor-container .ql-editor');
    editor.innerHTML = '<p>설명 텍스트</p><p><img src="data:image/png;base64,' + b64 + '"></p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, TINY_PNG_B64);

  await expect(page.locator('#editor-char-count')).toContainText('공백 포함 6자');
  await page.locator('#btn-submit').click();

  await expect.poll(async () => page.evaluate(() => {
    return window.__nkReadTestDb().total_posts.find(x => x.title === '이미지 붙여넣기 테스트') || null;
  })).not.toBeNull();

  const saved = await page.evaluate(() => window.__nkReadTestDb().total_posts.find(x => x.title === '이미지 붙여넣기 테스트'));
  expect(saved.content).not.toContain('data:image/');
  expect(saved.content).toContain('https://example.invalid/storage/v1/object/public/images/editor_paste_');
});

test('order-only disables youtube input, contextual hints react to category, and schedule clear works', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  // Order-only mode disables #youtube-url and shows notice
  await page.locator('#chk-order').check();
  await page.locator('#chk-intro').uncheck();
  await expect(page.locator('#youtube-url')).toBeDisabled();
  await expect(page.locator('#order-only-notice')).toBeVisible();

  // Selecting non-EDU category while order checked shows warning
  await page.locator('#custom-cat-trigger').click();
  await page.locator('#custom-cat-dropdown .cs-group-header', { hasText: '행사' }).click();
  await page.locator('#custom-cat-dropdown .cs-item', { hasText: '시즌 행사' }).click();
  await expect(page.locator('#order-exposure-help')).toBeVisible();
  await expect(page.locator('#post-link-label')).toHaveText('외부 이동 링크 URL (행사 카드 연결)');

  // Schedule future date -> shows scheduled status -> clear resets
  const futureLocal = await page.evaluate(() => {
    const d = new Date(Date.now() + 86400000);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  await page.locator('#post-publish-at').fill(futureLocal);
  await expect(page.locator('#publish-at-status')).toHaveClass(/is-scheduled/);
  await page.locator('#btn-clear-publish-at').click();
  await expect(page.locator('#post-publish-at')).toHaveValue('');
  await expect(page.locator('#publish-at-status')).toHaveText('비워두면 즉시 공개됩니다.');
});

test('fresh adminLogin replacing window.sb works cleanly with admin-convenience revision saving', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page, '?test_logged_out=1');

  await expect(page.locator('#login-section')).toBeVisible();
  await page.locator('#admin-email').fill('admin@example.invalid');
  await page.locator('#admin-password').fill('secret');
  await page.locator('#login-section button', { hasText: '로그인' }).click();

  await expect(page.locator('#admin-layout')).toBeVisible();
  await page.locator('.nav-item').nth(1).click();
  await expect(page.locator('.post-manage-card[data-id="10"]')).toBeVisible();

  await page.locator('.post-manage-card[data-id="10"] button', { hasText: '수정' }).click();
  await page.locator('#post-title').fill('로그인 후 수정된 제목');
  await page.locator('#btn-submit').click();

  await expect.poll(async () => page.evaluate(() => {
    const db = window.__nkReadTestDb();
    return {
      title: db.total_posts.find(p => p.id === 10)?.title,
      revisions: db.post_revisions.length,
      violations: db.staleClientViolations.length
    };
  })).toEqual({ title: '로그인 후 수정된 제목', revisions: 1, violations: 0 });
});

test('inline draft restore banner avoids confirm dialogs and upgraded previewPost sanitizes and renders rich elements', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await context.addInitScript(() => {
    if (!localStorage.getItem('nk_post_draft')) {
      localStorage.setItem('nk_post_draft', JSON.stringify({
        title: '임시저장 복구 제목',
        content: '<p>본문 [투표:form_live]</p><script>window.__xss=99</script><img src=x onerror="window.__xss=98">',
        category: 'korean',
        categoryName: '한글',
        order: '3',
        isIntro: true,
        isOrder: false,
        isNotice: true,
        youtubeUrl: 'https://youtube.com/shorts/dQw4w9WgXcQ',
        linkUrl: 'https://example.com/info',
        publishAt: '',
        time: Date.now()
      }));
    }
  });

  const unexpectedDialogs = [];
  page.on('dialog', d => { unexpectedDialogs.push(d.message()); d.accept(); });

  await openPostsTab(page);
  await page.waitForTimeout(1100);
  expect(unexpectedDialogs).toEqual([]);

  await expect(page.locator('#draft-restore-banner')).toBeVisible();
  await expect(page.locator('#draft-restore-meta')).toContainText('임시저장 복구 제목');
  await page.locator('#draft-restore-banner button', { hasText: '불러오기' }).click();

  await expect(page.locator('#post-title')).toHaveValue('임시저장 복구 제목');
  await expect(page.locator('#post-category')).toHaveValue('korean');
  await expect(page.locator('#youtube-url')).toHaveValue('https://youtube.com/shorts/dQw4w9WgXcQ');
  await expect(page.locator('#post-link')).toHaveValue('https://example.com/info');

  await page.locator('#tab-posts button', { hasText: '미리보기' }).click();
  await expect(page.locator('#nk-preview-modal')).toBeVisible();
  const srcdoc = await page.locator('#nk-preview-modal iframe').getAttribute('srcdoc');
  expect(srcdoc).not.toContain('<script>');
  expect(srcdoc).not.toContain('onerror=');
  expect(srcdoc).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ');
  expect(srcdoc).toContain('https://example.com/info');
  expect(srcdoc).toContain('pv-poll-card');
  expect(srcdoc).toContain('2026 체험 신청 폼');
});

test('public pages filter draft/scheduled posts, sanitize links, and render alphanumeric poll tokens', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());

  // 1) Anonymous visitor blocked from viewing draft (#20) and future scheduled (#21)
  await page.goto('/view.html?id=20&test_logged_out=1');
  await expect(page.locator('#v-content')).toContainText('아직 공개되지 않았거나 숨김 처리된 게시글입니다.');
  await page.goto('/view.html?id=21&test_logged_out=1');
  await expect(page.locator('#v-content')).toContainText('아직 공개되지 않았거나 숨김 처리된 게시글입니다.');

  // 2) Logged-in admin CAN preview draft (#20) with warning banner
  await page.goto('/view.html?id=20');
  await expect(page.locator('#admin-unpublished-banner')).toBeVisible();
  await expect(page.locator('#v-title')).toHaveText('비공개 초안 게시글');

  // 3) Post with URL link_url displays author '관리자', shows related link banner, preserves target=_blank
  await page.goto('/view.html?id=10&test_logged_out=1');
  await expect(page.locator('#v-author')).toHaveText('작성자: 관리자');
  await expect(page.locator('#related-link-banner a')).toHaveAttribute('href', 'https://example.com/guide');
  const bodyLink = page.locator('#v-content a[href="https://example.com"]');
  await expect(bodyLink).toHaveAttribute('target', '_blank');
  await expect(bodyLink).toHaveAttribute('rel', 'noopener noreferrer');

  // 4) page.html skips draft (#30), renders published (#31) inside .view-content, replaces [투표:form_live]
  await page.goto('/page.html?c=about&test_logged_out=1');
  await expect(page.locator('#page-content')).toHaveClass(/view-content/);
  await expect(page.locator('#page-content')).toContainText('뉴키즈 소개입니다.');
  await expect(page.locator('#page-content')).not.toContainText('노출되면 안 되는 초안');
  await expect(page.locator('#page-content')).not.toContainText('[투표:form_live]');
  await expect(page.locator('#form-iframe-form_live')).toBeVisible();

  // 5) notice.html excludes draft (#20) and future (#21) while keeping publish_at=null (#11)
  await page.goto('/notice.html#notice');
  await expect(page.locator('#board-list-wrapper')).toContainText('공개 공지글 (publish_at NULL)');
  await expect(page.locator('#board-list-wrapper')).not.toContainText('비공개 초안 게시글');
  await expect(page.locator('#board-list-wrapper')).not.toContainText('미래 예약 발행 게시글');

  // 6) order.html excludes future scheduled product (#22) while keeping published (#10)
  await page.goto('/order.html');
  await expect(page.locator('#product-list-area')).toContainText('기존 한글 교재');
  await expect(page.locator('#product-list-area')).not.toContainText('미래 예약 발주 교재');
});

test('block design mode renders live split preview and previewPost modal with figure/custom fonts/forms', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  await openPostsTab(page);

  await expect(page.locator('#nk-pe-bar')).toBeVisible();
  await page.locator('#post-title').fill('블록 디자인 미리보기 테스트');

  // 1) Switch to block design mode and load template
  await page.locator('#nk-pe-mode-blocks').click();
  await expect(page.locator('#nk-pe-wrap')).toHaveClass(/active/);
  await expect(page.locator('#nk-pe-right-pane')).toBeVisible();

  await page.locator('#nk-pe-tpl-sel').selectOption('textbook');
  await expect(page.locator('#nk-pe-preview-box')).toContainText('신규 교재 프로그램 소개');
  await expect(page.locator('#nk-pe-preview-box table')).toHaveCount(1);
  await expect(page.locator('#editor-char-count')).not.toContainText('공백 포함 0자');

  // 2) Add image block with URL & caption -> triggers auto thumbnail preview and preserves figure/figcaption
  await page.locator('[data-p-add="image"]').click();
  const imgIdx = await page.locator('#nk-pe-blocks-list .nk-pblk-card').count() - 1;
  await page.locator(`#nk-pe-blocks-list input[data-pk="src"][data-pi="${imgIdx}"]`).fill('https://example.invalid/sample.webp');
  await page.locator(`#nk-pe-blocks-list input[data-pk="caption"][data-pi="${imgIdx}"]`).fill('교재 사진 설명');
  await expect(page.locator('#thumb-preview-badge')).toHaveText('본문 첫 이미지 자동 사용');

  // 3) Add custom Google font on heading block and insert form block via top toolbar button
  await page.locator('#nk-pe-blocks-list .nk-font-mgr summary').first().click();
  await page.locator('#nk-pe-blocks-list [data-font-label="0"]').fill('개구쟁이체');
  await page.locator('#nk-pe-blocks-list [data-font-css="0"]').fill('Gaegu');
  await page.locator('#nk-pe-blocks-list [data-font-add="0"]').click();
  await page.locator('#form-insert-select').selectOption('form_live');
  await page.locator('#tab-posts button', { hasText: '본문에 넣기' }).click();
  await expect(page.locator('#nk-pe-preview-box')).toContainText('2026 체험 신청 폼');

  // 4) Main '미리보기' button (previewPost) renders block design content, figure/figcaption, custom font, and form card
  await page.locator('#tab-posts button', { hasText: '미리보기' }).click();
  await expect(page.locator('#nk-preview-modal')).toBeVisible();
  const srcdoc = await page.locator('#nk-preview-modal iframe').getAttribute('srcdoc');
  expect(srcdoc).toContain('신규 교재 프로그램 소개');
  expect(srcdoc).toContain('<figure');
  expect(srcdoc).toContain('<figcaption');
  expect(srcdoc).toContain('교재 사진 설명');
  expect(srcdoc).toContain('fonts.googleapis.com/css2?family=Gaegu');
  expect(srcdoc).toContain('pv-poll-card');
  expect(srcdoc).toContain('2026 체험 신청 폼');

  await page.locator('#nk-preview-modal [data-modal-close]').click();
  await expect(page.locator('#nk-preview-modal')).toBeHidden();

  // 5) Raw HTML mode inside block design mode also updates previewPost and sanitizes unsafe tags
  await page.locator('#nk-pe-toggle-raw').click();
  await page.locator('#nk-pe-raw-ta').fill('<h2>직접 HTML 미리보기</h2><script>window.__xss=77</script>');
  await expect(page.locator('#nk-pe-preview-box')).toContainText('직접 HTML 미리보기');
  await page.locator('#tab-posts button', { hasText: '미리보기' }).click();
  const rawSrcdoc = await page.locator('#nk-preview-modal iframe').getAttribute('srcdoc');
  expect(rawSrcdoc).toContain('직접 HTML 미리보기');
  expect(rawSrcdoc).not.toContain('<script>');
  await page.locator('#nk-preview-modal [data-modal-close]').click();

  // 6) Switching back to Quill mode restores Quill previewPost behavior
  await page.locator('#nk-pe-mode-quill').click();
  await page.evaluate(() => {
    const editor = document.querySelector('#editor-container .ql-editor');
    editor.innerHTML = '<p>일반 글쓰기 복귀 본문</p>';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#tab-posts button', { hasText: '미리보기' }).click();
  const quillSrcdoc = await page.locator('#nk-preview-modal iframe').getAttribute('srcdoc');
  expect(quillSrcdoc).toContain('일반 글쓰기 복귀 본문');
  expect(quillSrcdoc).not.toContain('직접 HTML 미리보기');
});
