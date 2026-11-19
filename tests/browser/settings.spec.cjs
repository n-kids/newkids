const { test, expect } = require('@playwright/test');

const DB_KEY = 'nk_settings_test_db_v1';
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function buildQuillMockScript() {
  return `(() => {
    class MockQuill {
      static import() { return { whitelist: [] }; }
      static register() {}
      constructor(selector) {
        const container = typeof selector === 'string' ? document.querySelector(selector) : selector;
        this.root = document.createElement('div');
        this.root.className = 'ql-editor';
        this.root.contentEditable = 'true';
        this.root.innerHTML = '<p><br></p>';
        if (container) { container.innerHTML = ''; container.appendChild(this.root); }
      }
      on() {}
      getText() { return (this.root.textContent || '') + '\\n'; }
      getLength() { return this.getText().length; }
      getSelection() { return { index: 0, length: 0 }; }
      setSelection() {}
      blur() {}
      update() {}
      getModule() { return null; }
      insertEmbed() {}
      insertText() {}
    }
    window.Quill = MockQuill;
    window.QuillBlotFormatter = { default: function() {} };
  })();`;
}

function buildSupabaseSettingsMockScript(seedJson) {
  return `(() => {
    const KEY = ${JSON.stringify(DB_KEY)};
    const copy = (v) => JSON.parse(JSON.stringify(v));

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

    function query(table) {
      const filters = [];
      const orders = [];
      let single = false;
      let start = 0;
      let end = Infinity;
      let action = 'select';
      let payload = null;

      function applySelect(rows) {
        let out = rows.filter(r => filters.every(fn => fn(r)));
        for (let i = orders.length - 1; i >= 0; i--) {
          const { col, ascending } = orders[i];
          out.sort((a, b) => {
            const av = a[col];
            const bv = b[col];
            if (av === bv) return 0;
            if (av === null || av === undefined) return 1;
            if (bv === null || bv === undefined) return -1;
            return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
          });
        }
        return out;
      }

      const chain = {
        select() { return chain; },
        insert(rows) { action = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return chain; },
        update(patch) { action = 'update'; payload = patch; return chain; },
        delete() { action = 'delete'; return chain; },
        eq(col, val) { filters.push(r => String(r[col]) === String(val)); return chain; },
        neq(col, val) { filters.push(r => String(r[col]) !== String(val)); return chain; },
        in(col, vals) {
          const set = new Set((vals || []).map(String));
          filters.push(r => set.has(String(r[col])));
          return chain;
        },
        order(col, opts = {}) { orders.push({ col, ascending: opts.ascending !== false }); return chain; },
        limit(n) { end = n - 1; return chain; },
        range(from, to) { start = from; end = to; return chain; },
        or() { return chain; },
        ilike() { return chain; },
        single() { single = true; return chain; },
        maybeSingle() { single = true; return chain; },
        then(resolve, reject) {
          try {
            const db = readDb();
            if (!Array.isArray(db[table])) db[table] = [];
            let resultData = null;

            if (action === 'insert') {
              const inserted = payload.map(item => {
                const row = copy(item);
                if (row.id === undefined || row.id === null) {
                  db.seq = (db.seq || 300) + 1;
                  row.id = db.seq;
                }
                if (!row.created_at) row.created_at = new Date().toISOString();
                db[table].push(row);
                return row;
              });
              writeDb(db);
              resultData = single ? (inserted[0] || null) : inserted;
            } else if (action === 'update') {
              const matched = [];
              db[table] = db[table].map(row => {
                if (filters.every(fn => fn(row))) {
                  const updated = Object.assign({}, row, copy(payload));
                  matched.push(updated);
                  return updated;
                }
                return row;
              });
              writeDb(db);
              resultData = single ? (matched[0] || null) : matched;
            } else if (action === 'delete') {
              const remaining = [];
              const removed = [];
              db[table].forEach(row => {
                if (filters.every(fn => fn(row))) removed.push(row);
                else remaining.push(row);
              });
              db[table] = remaining;
              writeDb(db);
              resultData = single ? (removed[0] || null) : removed;
            } else {
              const matched = applySelect(db[table]);
              const sliced = matched.slice(start, Number.isFinite(end) ? end + 1 : undefined);
              resultData = single ? (sliced[0] || null) : sliced;
            }
            return Promise.resolve({ data: copy(resultData), error: null, count: Array.isArray(resultData) ? resultData.length : (resultData ? 1 : 0) }).then(resolve, reject);
          } catch (err) {
            return Promise.resolve({ data: null, error: { message: err.message } }).then(resolve, reject);
          }
        }
      };
      return chain;
    }

    const client = {
      from: query,
      storage: {
        from: () => ({
          upload: async (path, file) => {
            const db = readDb();
            if (db.failNextUpload) {
              db.failNextUpload = false;
              writeDb(db);
              return { data: null, error: { message: '스토리지 용량 초과 모의 오류' } };
            }
            db.uploads = db.uploads || [];
            db.uploads.push({ path, size: file?.size || 0, type: file?.type || '' });
            writeDb(db);
            return { data: { path }, error: null };
          },
          list: async () => ({ data: [], error: null }),
          getPublicUrl: (p) => ({ data: { publicUrl: 'https://example.invalid/storage/v1/object/public/images/' + p } }),
          remove: async (paths) => {
            const db = readDb();
            db.removedFiles = (db.removedFiles || []).concat(paths || []);
            writeDb(db);
            return { data: paths, error: null };
          }
        })
      },
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@newkids.com' } } }, error: null }),
        signInWithPassword: async () => ({ data: { session: { user: { id: 'admin-1', email: 'admin@newkids.com' } } }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      },
      rpc: async () => ({ data: { count: 0, tallies: {} }, error: null })
    };

    window.__nkReadSettingsTestDb = readDb;
    window.__nkWriteSettingsTestDb = writeDb;
    window.supabase = { createClient: () => client };
  })();`;
}

function makeSeedDb(overrides = {}) {
  return Object.assign({
    seq: 300,
    uploads: [],
    removedFiles: [],
    failNextUpload: false,
    site_config: [
      {
        id: 1,
        company_name: '뉴키즈 교육',
        ceo_name: '김대표',
        address: '경기도 김포시 김포한강로 100',
        phone: '010-2333-2563',
        primary_color: '#1a3c6e',
        accent_color: '#b85a17',
        main_hero_title: '우리 원에 필요한 모든 즐거움',
        main_hero_desc: '검증된 영유아 교재부터 특별한 원어민 행사까지',
        main_hero_title_color: '#ffffff',
        main_hero_desc_color: '#ffffff',
        main_hero_bg_color: '#1a3c6e',
        main_hero_overlay_color: '#1a3c6e',
        main_hero_overlay_opacity: 0.4,
        main_hero_image: null,
        sheet_url: ''
      }
    ],
    program_categories: [
      { code: 'korean', name: '한글', type: 'EDU', hero_title: '한글', hero_desc: '교재 안내', is_visible: true, order_num: 0 },
      { code: 'notice', name: '공지사항', type: 'BOARD', hero_title: '공지사항', hero_desc: '', is_visible: true, order_num: 1 }
    ],
    total_posts: [],
    post_comments: [],
    post_revisions: [],
    admin_activity_logs: [],
    site_popups: [
      {
        id: 1,
        image_url: 'https://example.invalid/storage/v1/object/public/images/popup_existing.webp',
        link_url: 'https://example.com/event"><script>window.__popupXss=1</script>',
        is_visible: true,
        order_num: 0,
        created_at: new Date(Date.now() - 3600000).toISOString()
      }
    ],
    custom_forms: [],
    form_responses: [],
    page_editor_publications: []
  }, overrides);
}

async function setupRoutes(context, seedDb) {
  const sbMock = buildSupabaseSettingsMockScript(JSON.stringify(seedDb));
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
    if (url.hostname === 'example.invalid') {
      return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(TINY_PNG_B64, 'base64') });
    }
    if (url.hostname.endsWith('supabase.co')) {
      throw new Error('Production database request blocked: ' + url.pathname);
    }
    return route.abort();
  });
}

async function openSettingsTab(page) {
  await page.goto('/admin.html');
  await expect(page.locator('#admin-layout')).toBeVisible();
  await page.locator('.nav-item', { hasText: '환경 설정' }).click();
  await expect(page.locator('#tab-settings')).toBeVisible();
}

test('main hero image crop updates preview immediately, avoids placeholder URL corruption, handles upload errors, and keeps user on settings tab after save', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  page.on('dialog', d => d.accept());
  await openSettingsTab(page);

  // 1) Initial load with main_hero_image=null uses clean SVG data placeholder, never via.placeholder.com
  const initialPreviewSrc = await page.locator('#preview-main-hero').getAttribute('src');
  expect(initialPreviewSrc).toContain('data:image/svg+xml');
  expect(initialPreviewSrc).not.toContain('via.placeholder.com');
  await expect(page.locator('#main-hero-status-badge')).toHaveText('배경 이미지 없음');

  // 2) Saving without an image keeps main_hero_image as null (never saves placeholder src!) and stays on #tab-settings
  await page.locator('#conf-main-title').fill('새로운 메인 배너 타이틀');
  await page.locator('#btn-save-site-config').click();
  await expect(page.locator('#tab-settings')).toHaveClass(/active/);
  const savedWithoutImg = await page.evaluate(() => window.__nkReadSettingsTestDb().site_config[0]);
  expect(savedWithoutImg.main_hero_image).toBeNull();
  expect(savedWithoutImg.main_hero_title).toBe('새로운 메인 배너 타이틀');

  // 3) Click deleteMainHeroImage(), then select & crop a new main hero image -> isMainHeroDeleted resets and preview updates
  await page.locator('#tab-settings button', { hasText: '이미지 삭제' }).click();
  const pngBuf = Buffer.from(TINY_PNG_B64, 'base64');
  await page.locator('#conf-main-hero').setInputFiles({ name: 'main-hero.png', mimeType: 'image/png', buffer: pngBuf });
  await expect(page.locator('#crop-modal')).toBeVisible();
  await page.locator('#crop-modal button', { hasText: '편집 적용 완료' }).click();
  await expect(page.locator('#crop-modal')).toBeHidden();

  await expect(page.locator('#main-hero-status-badge')).toHaveText('새 배경 이미지 적용 예정');
  await expect(page.locator('#btn-clear-main-hero')).toBeVisible();
  const croppedPreviewSrc = await page.locator('#preview-main-hero').getAttribute('src');
  expect(croppedPreviewSrc).toMatch(/^blob:/);

  // 4) Simulate storage upload failure -> save aborts with error toast and does not save blob: URL to DB
  await page.evaluate(() => {
    const db = window.__nkReadSettingsTestDb();
    db.failNextUpload = true;
    window.__nkWriteSettingsTestDb(db);
  });
  await page.locator('#btn-save-site-config').click();
  await expect(page.locator('#toast-wrap')).toContainText('배경 이미지 업로드 실패');
  expect(await page.evaluate(() => window.__nkReadSettingsTestDb().site_config[0].main_hero_image)).toBeNull();

  // 5) Retry save (upload succeeds) -> saves public storage URL to site_config and stays on #tab-settings
  await page.locator('#btn-save-site-config').click();
  await expect(page.locator('#toast-wrap')).toContainText('성공적으로 저장되었습니다');
  await expect(page.locator('#tab-settings')).toHaveClass(/active/);
  const savedWithImg = await page.evaluate(() => window.__nkReadSettingsTestDb().site_config[0]);
  expect(savedWithImg.main_hero_image).toMatch(/^https:\/\/example\.invalid\/storage\/v1\/object\/public\/images\/main_\d+\.webp$/);
  await expect(page.locator('#main-hero-status-badge')).toHaveText('기존 배경 유지');
});

test('color HEX inputs, reset buttons, live previews, and page-editor publication sync work and reflect on index.html', async ({ context, page }) => {
  const seed = makeSeedDb({
    page_editor_publications: [
      {
        page_key: 'main',
        version: 1,
        document: {
          title: '이전 편집기 제목',
          description: '이전 편집기 설명',
          inherit: false,
          hero: { background: '#fbf6ee', titleColor: '#172451', descriptionColor: '#545b6e', desktopHeight: 560, mobileHeight: 440 }
        }
      }
    ]
  });
  await setupRoutes(context, seed);
  page.on('dialog', d => d.accept());
  await openSettingsTab(page);

  // Page editor publication banner is visible when a main publication exists
  await expect(page.locator('#main-hero-publication-banner')).toBeVisible();
  await expect(page.locator('#chk-sync-page-editor')).toBeChecked();

  // Typing a 3-digit or 6-digit HEX code updates the color picker and live preview
  await page.locator('#hex-main-bg-color').fill('#fff4e6');
  await page.locator('#hex-main-bg-color').blur();
  await expect(page.locator('#conf-main-bg-color')).toHaveValue('#fff4e6');

  await page.locator('#hex-main-title-color').fill('#0f172a');
  await page.locator('#hex-main-title-color').blur();
  await expect(page.locator('#conf-main-title-color')).toHaveValue('#0f172a');

  // Reset buttons restore defaults
  await page.locator('#tab-settings button', { hasText: '기본 브랜드 컬러 복원' }).click();
  await expect(page.locator('#conf-primary')).toHaveValue('#1a3c6e');
  await expect(page.locator('#conf-accent')).toHaveValue('#b85a17');

  // Update company info and save -> syncs both site_config and page_editor_publications
  await page.locator('#conf-main-title').fill('동기화된 메인 제목');
  await page.locator('#conf-main-desc').fill('동기화된 메인 설명');
  await page.locator('#conf-name').fill('뉴키즈 파트너스');
  await expect(page.locator('#settings-footer-live-preview')).toContainText('뉴키즈 파트너스');

  await page.locator('#btn-save-site-config').click();
  const afterSave = await page.evaluate(() => {
    const db = window.__nkReadSettingsTestDb();
    return {
      config: db.site_config[0],
      pub: db.page_editor_publications[0].document
    };
  });
  expect(afterSave.config.main_hero_bg_color).toBe('#fff4e6');
  expect(afterSave.config.main_hero_title_color).toBe('#0f172a');
  expect(afterSave.pub.title).toBe('동기화된 메인 제목');
  expect(afterSave.pub.hero.background).toBe('#fff4e6');
  expect(afterSave.pub.hero.titleColor).toBe('#0f172a');

  // Verify index.html applies custom hero colors from site_config even when no page_editor_publications override is active
  await page.evaluate(() => {
    const db = window.__nkReadSettingsTestDb();
    db.page_editor_publications = [];
    window.__nkWriteSettingsTestDb(db);
  });
  await page.goto('/index.html');
  await expect(page.locator('.hero h1')).toContainText('동기화된 메인 제목');
  const heroStyles = await page.evaluate(() => {
    const hero = document.querySelector('.hero');
    const h1 = hero.querySelector('h1');
    return {
      bg: getComputedStyle(hero).backgroundColor,
      titleColor: getComputedStyle(h1).color
    };
  });
  expect(heroStyles.bg).toBe('rgb(255, 244, 230)'); // #fff4e6
  expect(heroStyles.titleColor).toBe('rgb(15, 23, 42)'); // #0f172a
});

test('popup management escapes XSS, validates links, edits popup links inline, increments order_num, and openSavedSheet highlights the sheets nav item', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb());
  page.on('dialog', d => d.accept());
  await openSettingsTab(page);

  // 1) XSS in existing popup link_url is safely escaped and never executed
  expect(await page.evaluate(() => window.__popupXss || 0)).toBe(0);
  await expect(page.locator('.popup-list-item').first()).toBeVisible();

  // 2) Inline link update rejects javascript: scheme and normalizes bare domain
  const firstPopupInput = page.locator('#popup-link-input-1');
  await firstPopupInput.fill('javascript:alert(1)');
  await page.locator('.popup-list-item').first().locator('button', { hasText: '링크 저장' }).click();
  await expect(page.locator('#toast-wrap')).toContainText('안전하지 않은 링크 형식');

  await firstPopupInput.fill('newkids.example.com/promo');
  await page.locator('.popup-list-item').first().locator('button', { hasText: '링크 저장' }).click();
  await expect(page.locator('#toast-wrap')).toContainText('팝업 링크가 수정되었습니다');
  expect(await page.evaluate(() => window.__nkReadSettingsTestDb().site_popups[0].link_url)).toBe('https://newkids.example.com/promo');

  // 3) Add a new popup -> shows preview before upload, normalizes link, assigns order_num = 1 (not 999)
  const pngBuf = Buffer.from(TINY_PNG_B64, 'base64');
  await page.locator('#new-popup-file').setInputFiles({ name: 'notice-popup.png', mimeType: 'image/png', buffer: pngBuf });
  await expect(page.locator('#new-popup-preview-wrap')).toBeVisible();
  await expect(page.locator('#new-popup-preview-name')).toContainText('notice-popup.png');

  await page.locator('#new-popup-link').fill('notice.html#notice');
  await page.locator('#btn-add-popup').click();
  await expect(page.locator('.popup-list-item')).toHaveCount(2);
  await expect(page.locator('#new-popup-preview-wrap')).toBeHidden();

  const popupsInDb = await page.evaluate(() => window.__nkReadSettingsTestDb().site_popups);
  expect(popupsInDb).toHaveLength(2);
  expect(popupsInDb[1].order_num).toBe(1);
  expect(popupsInDb[1].link_url).toBe('notice.html#notice');

  // 4) Reset browser 'hide_main_popup_date' flag
  await page.evaluate(() => localStorage.setItem('hide_main_popup_date', '2026-11-19'));
  await page.locator('#tab-settings button', { hasText: '오늘 하루 열지 않기' }).click();
  expect(await page.evaluate(() => localStorage.getItem('hide_main_popup_date'))).toBeNull();

  // 5) openSavedSheet() when no sheet_url is set navigates to #tab-sheets and highlights the '신청서 확인' nav item (not '폼/투표 관리')
  await page.evaluate(() => window.openSavedSheet());
  await expect(page.locator('#tab-sheets')).toHaveClass(/active/);
  await expect(page.locator('.nav-item', { hasText: '신청서 확인' })).toHaveClass(/active/);
  await expect(page.locator('.nav-item', { hasText: '폼/투표 관리' })).not.toHaveClass(/active/);
});
