const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { publicURL, expected } = require('../../page-editor-verify.js');

const base = 'http://127.0.0.1:8765/';
const mock = fs.readFileSync(path.join(__dirname, 'fixtures/supabase-mock.js'), 'utf8');
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'apikey, authorization'
};

async function setupRoutes(context, extraScript = '', pubResolver = null) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:8765') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
      const injected = typeof extraScript === 'function' ? extraScript() : extraScript;
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: mock + (injected ? '\n' + injected : '')
      });
    }
    if (url.hostname === 'jmdyqdckclgfyimqpqce.supabase.co' && url.pathname === '/rest/v1/page_editor_publications') {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const rows = pubResolver ? pubResolver(url) : [];
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify(rows)
      });
    }
    return route.abort();
  });
}

test('verify helpers accept page.html id/c routes and ignore empty numeric heights', () => {
  expect(publicURL(base + 'page.html?id=about&nkpreview=1', base, 'page:about', 42).searchParams.get('id')).toBe('about');
  expect(publicURL(base + 'page.html?c=about&nkpreview=1', base, 'page:about', 42).searchParams.get('c')).toBe('about');
  expect(() => publicURL(base + 'page.html?id=other', base, 'page:about', 42)).toThrow();
  const row = { page_key: 'page:about', version: 1, document: { title: '소개', description: '설명', inherit: false, hero: { desktopHeight: '', mobileHeight: '' } } };
  expect(expected(row, null, 'page:about', 1280, base).minHeight).toBe(220);
  expect(expected(row, null, 'page:about', 390, base).minHeight).toBe(180);
});

test('checkboxes stay compact, preview sits above diagnostic cards, and single Supabase client is shared', async ({ page, context }) => {
  const trackClients = `(() => {
    const orig = window.supabase.createClient;
    window.__NK_CREATE_COUNT = 0;
    window.supabase.createClient = (...args) => { window.__NK_CREATE_COUNT++; return orig(...args); };
  })();`;
  await setupRoutes(context, trackClients);
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  expect(await page.evaluate(() => window.__NK_CREATE_COUNT)).toBe(1);
  expect(await page.evaluate(() => Boolean(window.__nkEditorSb))).toBe(true);

  for (const id of ['#nk-copy-text', '#nk-review-ack', '#nk-render-auto', '#nk-audit-system']) {
    const box = await page.locator(id).boundingBox();
    expect(box, id + ' bounding box').not.toBeNull();
    expect(box.width).toBeLessThanOrEqual(24);
    expect(box.height).toBeLessThanOrEqual(24);
    const labelBox = await page.locator(id).locator('xpath=ancestor::label[1]').boundingBox();
    expect(labelBox.height).toBeLessThan(64);
  }

  const previewBox = await page.locator('.preview').boundingBox();
  const deployBox = await page.locator('#nk-deployment-panel').boundingBox();
  const verifyBox = await page.locator('#nk-render-check').boundingBox();
  const auditBox = await page.locator('#nk-audit-panel').boundingBox();
  expect(previewBox.y).toBeLessThan(deployBox.y);
  expect(deployBox.y).toBeLessThan(verifyBox.y);
  expect(verifyBox.y).toBeLessThan(auditBox.y);
  await expect(page.locator('#publication-status')).toHaveText('미공개');
  await expect(page.locator('#nk-audit-panel .nk-audit-filters')).toBeVisible();
  await expect(page.locator('#nk-audit-reset')).toBeVisible();
});

test('hash-only subpage switch reloads preview, clears stale diff, and renders Korean diff labels', async ({ page, context }) => {
  await setupRoutes(context);
  page.on('dialog', d => d.accept());
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  await page.locator('#page').selectOption('page:notice');
  await expect(page.locator('#preview-status')).toContainText('초안 미리보기 반영됨');
  await page.locator('#title').fill('공지 테스트 제목');
  await expect(page.frameLocator('#preview').locator('#view-hero h1')).toHaveText('공지 테스트 제목');

  await page.locator('#compare').click();
  await expect(page.locator('#diff')).toContainText('제목:');
  await expect(page.locator('#diff')).not.toContainText('title:');
  await page.locator('#close-diff').click();

  await page.locator('#page').selectOption('page:reference');
  await expect(page.locator('#preview-status')).toContainText('초안 미리보기 반영됨');
  await expect(page.locator('#inline-diff')).toContainText('변경 비교를 누르면');
  expect(await page.locator('#preview').getAttribute('src')).toContain('nk_page=page%3Areference');

  await page.locator('#title').fill('자료실 새 제목');
  await expect(page.frameLocator('#preview').locator('#view-hero h1')).toHaveText('자료실 새 제목');
});

test('PAGE-type category opens page.html?id without redirect and passes live verify check', async ({ page, context }) => {
  const publications = [];
  const extra = () => `(() => {
    const seeded = ${JSON.stringify(publications)};
    for (const row of seeded) window.__NK_EDITOR_TEST.publications[row.page_key] = row;
    const client = window.supabase.createClient();
    const origFrom = client.from.bind(client);
    const origRpc = client.rpc.bind(client);
    client.from = table => {
      if (table !== 'program_categories') return origFrom(table);
      const chain = origFrom(table);
      const origThen = chain.then.bind(chain);
      chain.then = (resolve, reject) => origThen(res => {
        const extraRow = { code: 'about', name: '회사 소개', type: 'PAGE', hero_title: '회사 소개', hero_desc: '뉴키즈 소개', is_visible: true, order_num: 5 };
        const data = Array.isArray(res.data) ? [...res.data, extraRow] : (res.data || extraRow);
        return resolve({ ...res, data });
      }, reject);
      return chain;
    };
    client.rpc = async (name, args) => {
      const res = await origRpc(name, args);
      if (name === 'page_editor_publish' && res.data) window.__NK_PUB_SYNC?.(res.data);
      return res;
    };
  })();`;
  await page.exposeFunction('__NK_PUB_SYNC', row => {
    const idx = publications.findIndex(item => item.page_key === row.page_key);
    if (idx >= 0) publications[idx] = row;
    else publications.push(row);
  });
  await setupRoutes(context, extra, url => {
    const filter = url.searchParams.get('page_key') || '';
    return publications.filter(row => filter.includes(row.page_key));
  });
  page.on('dialog', d => d.accept());
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  await page.locator('#page').selectOption('page:about');
  await expect(page.locator('#open-page')).toHaveAttribute('href', /page\.html\?id=about$/);
  await expect(page.locator('#preview-status')).toContainText('초안 미리보기 반영됨');
  await page.locator('#title').fill('뉴키즈 회사 소개');
  await expect(page.frameLocator('#preview').locator('#page-hero h1')).toHaveText('뉴키즈 회사 소개');
  expect(await page.frameLocator('#preview').locator('#page-hero').evaluate(el => getComputedStyle(el).display)).toBe('flex');

  await page.locator('#publish').click();
  await page.locator('#nk-preflight-confirm').click();
  await expect(page.locator('#status')).toContainText('공개본 v1 저장 완료');

  await page.locator('#nk-render-run').click();
  await expect(page.locator('#nk-render-status')).toHaveAttribute('data-state', 'passed', { timeout: 20000 });
});

test('transient load error does not permanently lock page switching and recovery', async ({ page, context }) => {
  const extra = `(() => {
    const client = window.supabase.createClient();
    const origFrom = client.from.bind(client);
    let failOnce = true;
    client.from = table => {
      const chain = origFrom(table);
      if (table !== 'page_editor_drafts') return chain;
      let targetKey = '';
      const origEq = chain.eq.bind(chain);
      chain.eq = (k, v) => { if (k === 'page_key') targetKey = v; return origEq(k, v); };
      const origThen = chain.then.bind(chain);
      chain.then = (resolve, reject) => {
        if (failOnce && targetKey === 'page:qna') {
          failOnce = false;
          return Promise.resolve({ data: null, error: { message: 'Temporary network blip' } }).then(resolve, reject);
        }
        return origThen(resolve, reject);
      };
      return chain;
    };
  })();`;
  await setupRoutes(context, extra);
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  await page.locator('#page').selectOption('page:qna');
  await expect(page.locator('#status')).toContainText('불러오기 실패: Temporary network blip');
  await expect(page.locator('#save')).toBeDisabled();
  await expect(page.locator('#page')).toBeEnabled();

  await page.locator('#page').selectOption('page:reference');
  await expect(page.locator('#save')).toBeEnabled();
  await expect(page.locator('#status')).toContainText('초안 v0');
});

test('missing workflow schema cache transparently uses built-in fallback for review, single-admin approval, schedule, and audit history', async ({ page, context }) => {
  const extra = `(() => {
    const client = window.supabase.createClient();
    const origRpc = client.rpc.bind(client);
    const origFrom = client.from.bind(client);
    client.rpc = async (name, args) => {
      if (name === 'page_editor_workflow') {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.page_editor_workflow(p_action, p_payload) in the schema cache' } };
      }
      return origRpc(name, args);
    };
    client.from = table => {
      if (table !== 'page_editor_audit') return origFrom(table);
      const chain = {};
      for (const m of ['select', 'eq', 'in', 'is', 'gte', 'lt', 'order', 'limit', 'abortSignal']) chain[m] = () => chain;
      chain.then = (resolve, reject) => Promise.resolve({
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.page_editor_audit' in the schema cache" }
      }).then(resolve, reject);
      return chain;
    };
  })();`;
  await setupRoutes(context, extra);
  page.on('dialog', d => d.accept());
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  // Panels connect cleanly without warning or error banners
  await expect(page.locator('#nk-schedule-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('#nk-review-status')).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('#nk-audit-status')).toHaveAttribute('data-state', 'loaded');

  // 1) Save draft & request review -> single admin can self-approve
  await page.locator('#title').fill('폴백 워크플로 초안 제목');
  await page.locator('#nk-review-request').click();
  await expect(page.locator('#nk-review-status')).toContainText('검토를 요청했습니다');
  await expect(page.locator('#nk-review-info')).toContainText('1인 관리자 본인 승인 가능');

  await page.locator('#nk-review-ack').check();
  await expect(page.locator('#nk-review-approve')).toBeEnabled();
  await page.locator('#nk-review-approve').click();
  await expect(page.locator('#nk-review-status')).toContainText('승인했습니다');

  // 2) Approved review is immediately available in schedule panel and can be scheduled
  const range = await page.evaluate(() => {
    const pad = n => String(n).padStart(2, '0');
    const local = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    return { start: local(new Date(Date.now() + 3600000)), end: local(new Date(Date.now() + 7200000)) };
  });
  await page.locator('#nk-schedule-start').fill(range.start);
  await page.locator('#nk-schedule-end').fill(range.end);
  await expect(page.locator('#nk-schedule-create')).toBeEnabled();
  await page.locator('#nk-schedule-create').click();
  await expect(page.locator('#nk-schedule-status')).toContainText('예약 등록을 확인했습니다');
  await expect(page.locator('#nk-schedule-list')).toContainText('예약 대기');

  // 3) Audit history records the draft save, review request, approval, and schedule creation
  await page.locator('#nk-audit-refresh').click();
  await expect(page.locator('#nk-audit-status')).toHaveAttribute('data-state', 'loaded');
  await expect(page.locator('#nk-audit-table tbody tr').first()).toBeVisible();
  expect(await page.locator('#nk-audit-table tbody tr').count()).toBeGreaterThanOrEqual(4);
});

test('integrated full-page design controls, subpage manager, and environment settings work end-to-end', async ({ page, context }) => {
  await setupRoutes(context);
  page.on('dialog', d => d.accept());
  await page.goto('/page-editor.html');
  await expect(page.locator('#save')).toBeEnabled();

  // 1) Main page: apply hero theme preset, edit body section title & contact phone, and edit global header logo
  await page.locator('[data-hero-theme="sky"]').click();
  await expect(page.locator('#background')).toHaveValue('#eef6ff');
  await expect(page.locator('#titleColor')).toHaveValue('#1e3a8a');

  await page.locator('#main-sections-design summary').nth(1).click();
  await page.locator('#evTitle').fill('맞춤형 특별 행사');
  await expect(page.frameLocator('#preview').locator('#events h2')).toHaveText('맞춤형 특별 행사');

  await page.locator('#main-sections-design summary').nth(3).click();
  await page.locator('#ctPhone1').fill('010-9999-8888');
  await expect(page.frameLocator('#preview').locator('#contact .contact-link').first()).toContainText('010-9999-8888');

  await page.locator('#global-layout-card summary').click();
  await page.locator('#layLogoTitle').fill('뉴키즈 에듀');
  await expect(page.frameLocator('#preview').locator('header .logo-text strong')).toHaveText('뉴키즈 에듀');

  // Save main draft to clear dirty state before switching
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('초안 v1 저장 완료');

  // 2) Subpage manager: create a new category and jump directly to its design editor
  await page.locator('[data-editor-view="subpages"]').click();
  await expect(page.locator('#nk-subpage-manager-card')).toBeVisible();
  await page.locator('#nk-cat-new-type').selectOption('EDU');
  await page.locator('#nk-cat-new-code').fill('cooking');
  await page.locator('#nk-cat-new-name').fill('요리 활동');
  await page.locator('#nk-cat-new-desc').fill('즐거운 오감 요리 수업');
  await page.locator('#nk-cat-add-btn').click();
  await expect(page.locator('#nk-cat-status')).toContainText('새 서브 페이지(요리 활동)가 생성되었습니다');

  await page.locator('[data-cat-design="page:cooking"]').click();
  await expect(page.locator('#page')).toHaveValue('page:cooking');
  await expect(page.locator('#subpage-design-card')).toBeVisible();

  await page.locator('[data-sub-theme="mint"]').click();
  await expect(page.locator('#subBodyBgColor')).toHaveValue('#f0fdf4');
  await expect(page.frameLocator('#preview').locator('#view-hero h1')).toHaveText('요리 활동');

  // 3) Environment settings & popup manager
  await page.locator('[data-editor-view="env"]').click();
  await expect(page.locator('#nk-env-settings-card')).toBeVisible();
  await page.locator('#nk-env-company').fill('주식회사 뉴키즈에듀');
  await page.locator('#nk-env-ceo').fill('김뉴키즈');
  await page.locator('#nk-env-save-btn').click();
  await expect(page.locator('#nk-env-status')).toContainText('환경 설정(회사 정보 · 브랜드 컬러 · 메인 배너 DB)이 저장되었습니다');

  await page.locator('#nk-popup-url').fill('https://example.com/popup.webp');
  await page.locator('#nk-popup-alt').fill('신학기 안내 팝업');
  await page.locator('#nk-popup-add-btn').click();
  await expect(page.locator('#nk-env-status')).toContainText('새 공지 팝업이 추가되었습니다');
  await expect(page.locator('#nk-popup-list')).toContainText('신학기 안내 팝업');
});

