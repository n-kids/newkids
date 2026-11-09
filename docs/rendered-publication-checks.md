# Read-only rendered publication checks

The module reads only public publication rows using the configured public key, credentials: omit and GET. It does not read drafts, send preview documents, save, publish, follow button links or change DB state. Manual checks are enabled after the editor has loaded. Auto-check after successful publication is opt-in.

It loads same-origin, allowlisted public routes without nkpreview in two offscreen frames (1280px and 390px), preserves the selected board/program hash, and compares title, description, computed banner min-height and the main button text/resolved URL. It follows the renderer's inheritance and numeric bounds. Both publication documents and common settings are compared again before a pass is reported. Missing publications, inaccessible frames, rendering timeouts, mismatches and changed versions are not reported as success. Cancellation and changing pages remove frames and invalidate pending results.

Frames share the current browser's login/storage environment. This is NOT anonymous-browser isolation, a screenshot/pixel comparison, full responsive-layout or accessibility certification, or proof that external button destinations are reachable. A match only covers the listed fields. Run the existing fresh-context tests separately for session isolation.

Test the BUILT _site. The browser tests mock Supabase and never write production data. Source/helper/build checks are not proof that the entire Playwright suite or the production site passes. No DB migration or Cron change is required for this feature.
