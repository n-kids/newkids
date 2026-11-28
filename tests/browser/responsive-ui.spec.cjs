const { test, expect } = require('@playwright/test');

const SAMPLE_SVG_1 = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#eef3fc"/><text x="200" y="155" font-size="22" font-family="sans-serif" text-anchor="middle" fill="#172451">교재 미리보기</text></svg>');
const SAMPLE_SVG_2 = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><rect width="400" height="220" fill="#172451"/><text x="200" y="115" font-size="22" font-family="sans-serif" text-anchor="middle" fill="#ffffff">공지 팝업 1</text></svg>');
const SAMPLE_SVG_3 = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><rect width="400" height="220" fill="#b85a17"/><text x="200" y="115" font-size="22" font-family="sans-serif" text-anchor="middle" fill="#ffffff">공지 팝업 2</text></svg>');

function buildMockSupabaseScript() {
  const categories = [
    { code: 'notice', name: '공지사항', type: 'BOARD', hero_title: '공지사항', hero_desc: '새 소식 안내', is_visible: true, order_num: 0 },
    { code: 'reference', name: '자료실', type: 'BOARD', hero_title: '자료실', hero_desc: '연간계획안 및 교육자료', is_visible: true, order_num: 1 },
    { code: 'qna', name: '문의사항', type: 'BOARD', hero_title: '문의사항', hero_desc: '궁금한 점을 남겨주세요', is_visible: true, order_num: 2 },
    { code: 'korean', name: '한글', type: 'EDU', hero_title: '한글', hero_desc: '신나는 한글 교재', is_visible: true, order_num: 3 },
    { code: 'reading', name: '독서', type: 'EDU', hero_title: '독서', hero_desc: '생각이 자라는 독서', is_visible: true, order_num: 4 },
    { code: 'english', name: '영어', type: 'EDU', hero_title: '영어', hero_desc: '재미있는 영어 프로그램', is_visible: true, order_num: 5 },
    { code: 'math', name: '수학', type: 'EDU', hero_title: '수학', hero_desc: '창의 수학', is_visible: true, order_num: 6 },
    { code: 'science', name: '과학', type: 'EDU', hero_title: '과학', hero_desc: '신나는 과학', is_visible: true, order_num: 7 },
    { code: 'art', name: '미술', type: 'EDU', hero_title: '미술', hero_desc: '감성 미술', is_visible: true, order_num: 8 },
    { code: 'environment', name: '환경', type: 'EDU', hero_title: '환경', hero_desc: '생태 환경', is_visible: true, order_num: 9 },
    { code: 'nuri', name: '누리과정', type: 'EDU', hero_title: '누리과정', hero_desc: '누리과정 통합 프로그램', is_visible: true, order_num: 10 },
    { code: 'infant', name: '영아', type: 'EDU', hero_title: '영아', hero_desc: '영아 프로그램', is_visible: true, order_num: 11 },
    { code: 'culture', name: '문화체험', type: 'EVENT', hero_title: '원어민 문화체험', hero_desc: '세계 문화 탐험', is_visible: true, order_num: 12 },
    { code: 'season', name: '시즌 행사', type: 'EVENT', hero_title: '시즌 행사', hero_desc: '즐거운 계절 행사', is_visible: true, order_num: 13 }
  ];
  const posts = [
    { id: 101, category: 'korean', title: '쏙쏙 깨치는 뉴키즈 한글 1단계', thumbnail_url: '/m-hero.jpg', content: '<p>한글 소개</p>', video_url: '', order_num: 1, is_visible: true, is_draft: false, created_at: '2026-11-20T09:00:00Z' },
    { id: 102, category: 'korean', title: '재미있는 놀이 한글 워크북 2단계', thumbnail_url: '/m-ev-culture.jpg', content: '<p>워크북</p>', video_url: '', order_num: 2, is_visible: true, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 103, category: 'reading', title: '그림책과 함께하는 생각 독서 5세', thumbnail_url: '/m-hero.jpg', content: '<p>독서</p>', video_url: null, order_num: 1, is_visible: true, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 104, category: 'culture', title: '세계 전통의상 원어민 문화 체험', thumbnail_url: '/m-ev-culture.jpg', content: '<p>행사</p>', video_url: null, order_num: 1, is_visible: true, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 105, category: 'korean', title: '숨김 처리된 한글 교재', thumbnail_url: '', content: '', video_url: null, order_num: 3, is_visible: false, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 106, category: 'korean', title: '임시저장 초안 한글 교재', thumbnail_url: '', content: '', video_url: null, order_num: 4, is_visible: true, is_draft: true, created_at: '2026-11-21T09:00:00Z' },
    { id: 107, category: 'korean', title: '예약 공개 예정 한글 교재', thumbnail_url: '', content: '', video_url: null, order_num: 5, is_visible: true, is_draft: false, publish_at: '2099-01-01T00:00:00Z', created_at: '2026-11-21T09:00:00Z' },
    { id: 201, category: 'korean', title: '뉴키즈 한글 1단계 (상/하)', thumbnail_url: '', content: '', video_url: 'ORDER_ITEM', order_num: 1, is_visible: true, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 202, category: 'reading', title: '생각 독서 그림책 패키지', thumbnail_url: '', content: '', video_url: 'ORDER_ITEM', order_num: 2, is_visible: true, is_draft: false, created_at: '2026-11-21T09:00:00Z' },
    { id: 301, category: 'notice', title: '[공지] 2027학년도 교재 OT 및 배송 일정 안내', content: '<p>원장님 안녕하세요. 김포·고양·파주 지역 배송과 https://n-kids.github.io/newkids/notice.html#reference 안내드립니다.</p>', link_url: '관리자', is_notice: true, is_visible: true, is_draft: false, download_count: 15, created_at: '2026-11-25T09:00:00Z' },
    { id: 304, category: 'notice', title: '[초안] 비공개 임시저장 공지', content: '<p>초안</p>', link_url: '관리자', is_notice: false, is_visible: true, is_draft: true, download_count: 0, created_at: '2026-11-26T09:00:00Z' },
    { id: 302, category: 'reference', title: '[연간] 2026년 5~7세 정규 교육과정 연간교육계획안 모음집', content: '<p>첨부된 PDF 파일을 눌러 미리보거나 다운로드하실 수 있습니다.</p>', image_url: '/apple-touch-icon.png@@2026_뉴키즈_정규_연간교육계획안_유아용_최종본.pdf', link_url: '관리자', is_notice: false, is_visible: true, is_draft: false, download_count: 42, created_at: '2026-11-24T09:00:00Z' },
    { id: 303, category: 'reference', title: '[OT자료] 신학기 학부모 오리엔테이션 발표 PPT 템플릿', content: '<p>OT 자료입니다.</p>', link_url: '관리자', is_notice: false, is_visible: true, is_draft: false, download_count: 19, created_at: '2026-11-23T09:00:00Z' },
    { id: 401, category: 'qna', title: '비밀 문의글 제목', content: '<p>비밀 본문</p><script>window.__xss=1;</script>', link_url: '홍길동', password: 'secret-pw', is_secret: true, is_visible: true, is_draft: false, created_at: '2026-11-25T10:00:00Z' }
  ];
  const popups = [
    { id: 1, image_url: '/m-hero.jpg', link_url: 'notice.html#notice', is_visible: true, order_num: 1, created_at: '2026-11-25T09:00:00Z' },
    { id: 2, image_url: '/m-ev-culture.jpg', link_url: 'child.html#korean', is_visible: true, order_num: 2, created_at: '2026-11-24T09:00:00Z' }
  ];
  const db = { program_categories: categories, total_posts: posts, site_popups: popups, site_config: [], post_comments: [], page_editor_publications: [] };
  return `(() => {
    const db = ${JSON.stringify(db)};
    function evalOrClause(row, expr) {
      return String(expr || '').split(',').some(clause => {
        const parts = clause.trim().split('.');
        if (parts.length < 3) return true;
        const col = parts[0], op = parts[1], val = parts.slice(2).join('.');
        const cur = row[col];
        if (op === 'is' && val === 'null') return cur === null || cur === undefined;
        if (op === 'neq') return cur !== val;
        if (op === 'lte') return !cur || String(cur) <= val;
        return true;
      });
    }
    function query(table) {
      const filters = [];
      let orders = [];
      let rangeStart = 0;
      let rangeEnd = Infinity;
      let isSingle = false;
      const chain = {
        select() { return chain; },
        eq(k, v) { filters.push(r => r[k] === v || (typeof r[k] === 'number' && String(r[k]) === String(v))); return chain; },
        neq(k, v) { filters.push(r => r[k] !== v); return chain; },
        in(k, vals) { const set = new Set((vals || []).map(String)); filters.push(r => set.has(String(r[k]))); return chain; },
        like(k, pat) { const rx = new RegExp('^' + String(pat).replace(/[-/\\\\^$*+?.()|[\\]{}]/g, '\\\\$&').replace(/%/g, '.*') + '$'); filters.push(r => rx.test(String(r[k] || ''))); return chain; },
        ilike(k, pat) { const inner = String(pat).replace(/^%|%$/g, '').toLowerCase(); filters.push(r => String(r[k] || '').toLowerCase().includes(inner)); return chain; },
        or(expr) { filters.push(r => evalOrClause(r, expr)); return chain; },
        order(col, opts) { orders.push({ col, asc: !opts || opts.ascending !== false }); return chain; },
        limit(n) { rangeEnd = Math.min(rangeEnd, n - 1); return chain; },
        range(a, b) { rangeStart = a; rangeEnd = b; return chain; },
        single() { isSingle = true; return chain; },
        maybeSingle() { isSingle = true; return chain; },
        then(resolve, reject) {
          let rows = (db[table] || []).filter(r => filters.every(fn => fn(r))).map(r => ({ ...r }));
          for (let i = orders.length - 1; i >= 0; i--) {
            const { col, asc } = orders[i];
            rows.sort((a, b) => {
              const av = a[col] ?? '';
              const bv = b[col] ?? '';
              if (av === bv) return 0;
              return (av > bv ? 1 : -1) * (asc ? 1 : -1);
            });
          }
          const total = rows.length;
          const sliced = rows.slice(rangeStart, Number.isFinite(rangeEnd) ? rangeEnd + 1 : undefined).map(r => {
            if (typeof r.thumbnail_url === 'string' && r.thumbnail_url.startsWith('/')) r.thumbnail_url = location.origin + r.thumbnail_url;
            if (typeof r.image_url === 'string' && r.image_url.startsWith('/')) r.image_url = location.origin + r.image_url;
            return r;
          });
          return Promise.resolve({ data: isSingle ? (sliced[0] || null) : sliced, error: null, count: total }).then(resolve, reject);
        }
      };
      return chain;
    }
    window.supabase = {
      createClient: () => ({
        from: query,
        auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
        rpc: async () => ({ data: null, error: null })
      })
    };
  })();`;
}

const MOCK_JS = buildMockSupabaseScript();

test.beforeEach(async ({ context, page }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: MOCK_JS });
    }
    if (url.hostname.endsWith('supabase.co')) {
      throw new Error('Production Supabase request blocked in test: ' + url.pathname);
    }
    return route.abort();
  });
  page.on('dialog', dialog => dialog.accept());
});

test('1. catalog chip bar wraps cleanly inside controls and instant search works without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/child.html#korean');
  await expect(page.locator('.catalog-controls .catalog-chip')).toHaveCount(9);
  await expect(page.locator('#post-list .post-card')).toHaveCount(2);

  const chipContainment = await page.evaluate(() => {
    const box = document.querySelector('.catalog-controls').getBoundingClientRect();
    const chips = Array.from(document.querySelectorAll('.catalog-controls .catalog-chip')).map(el => el.getBoundingClientRect());
    const maxRight = Math.max(...chips.map(r => r.right));
    return { boxRight: Math.round(box.right), maxRight: Math.round(maxRight), wrapped: chips.some(r => r.top > chips[0].top + 4) };
  });
  expect(chipContainment.maxRight).toBeLessThanOrEqual(chipContainment.boxRight + 1);
  expect(chipContainment.wrapped).toBe(true);

  await page.locator('.catalog-search-input').fill('워크북');
  await expect(page.locator('#post-list .post-card')).toHaveCount(1);
  await expect(page.locator('#post-list .post-title')).toContainText('워크북');

  await page.locator('.catalog-chip[data-code="reading"]').click();
  await expect(page.locator('#post-list .post-card')).toHaveCount(1);
  await expect(page.locator('#post-list .post-title')).toContainText('독서');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('2. board renders mobile 2-row cards with author while keeping desktop meta nowrap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/notice.html#reference');
  await expect(page.locator('#board-list-wrapper .board-list-row')).toHaveCount(2);
  const desktopMetaWrap = await page.evaluate(() => getComputedStyle(document.querySelector('.board-list-head .board-col-meta')).whiteSpace);
  expect(desktopMetaWrap).toBe('nowrap');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.board-list-head')).toBeHidden();
  await expect(page.locator('#board-list-wrapper .board-list-row .board-col-author').first()).toBeVisible();
  const titleLines = await page.evaluate(() => {
    const t = document.querySelector('#board-list-wrapper .board-post-text');
    return getComputedStyle(t).webkitLineClamp;
  });
  expect(titleLines).toBe('2');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('3. order touch steppers and proposal sticky summary bars update live', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/order.html');
  await expect(page.locator('#product-list-area .category-wrapper')).toHaveCount(9);
  await page.locator('#product-list-area .order-category-header').first().click();
  await page.locator('#product-list-area .order-item-row').first().locator('.order-item-info').click();

  const plusBtn = page.locator('#product-list-area .order-item-row').first().locator('.nk-step-plus');
  await plusBtn.click();
  await plusBtn.click();
  await expect(page.locator('#nk-order-summary')).toBeVisible();
  await expect(page.locator('#nk-order-summary-text')).toHaveText('총 1종 · 2부');

  await page.goto('/proposal.html');
  await expect(page.locator('#proposal-grid-area .sub-cat-wrapper')).toHaveCount(9);
  await page.locator('#proposal-grid-area .sub-cat-header').first().click();
  await page.locator('#proposal-grid-area input[name="items"]').first().check();
  await expect(page.locator('#nk-proposal-summary')).toBeVisible();
  await expect(page.locator('#nk-proposal-summary-text')).toHaveText('선택된 프로그램 1개');
});

test('4. main home keeps quick cards hidden on PC, renders inline edu preview tabs, and shows bottom-sheet popup on mobile while preserving hero-v2', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('#m-quick-sec')).toBeHidden();
  await expect(page.locator('.hero-v2 .hero-eyebrow')).toBeAttached();

  await expect(page.locator('#m-edu button[role="tab"]')).toHaveCount(9);
  await expect(page.locator('#m-edu-preview')).toBeVisible();
  await expect(page.locator('#m-edu-preview-title')).toHaveText('한글');
  await expect(page.locator('#m-edu-cards .m-edu-card')).toHaveCount(2);
  await expect(page.locator('#m-edu-more-link')).toHaveAttribute('href', 'child.html#korean');

  await page.locator('#m-edu button[data-code="reading"]').click();
  await expect(page.locator('#m-edu-preview-title')).toHaveText('독서');
  await expect(page.locator('#m-edu-cards .m-edu-card')).toHaveCount(1);
  await expect(page.locator('#m-edu-cards .m-edu-card-title').first()).toContainText('독서');
  await expect(page.locator('#m-edu-more-link')).toHaveAttribute('href', 'child.html#reading');

  // 관리자 편집기 설정(page-design.js → window.__nkEduPreviewConfig) 반영
  await page.evaluate(() => {
    window.__nkEduPreviewConfig = { showPreview: true, defaultCode: 'korean', previewCount: 2, quoteVisible: false, quoteText: '', moreText: '{과목} 교재 모두 보기' };
    window.dispatchEvent(new CustomEvent('nk-edu-preview-config'));
  });
  await expect(page.locator('#m-edu-preview-title')).toHaveText('독서');
  await expect(page.locator('#m-edu-more-link')).toHaveText('독서 교재 모두 보기');
  await expect(page.locator('#m-edu-quote-link')).toBeHidden();
  await page.evaluate(() => {
    window.__nkEduPreviewConfig = { ...window.__nkEduPreviewConfig, showPreview: false };
    window.dispatchEvent(new CustomEvent('nk-edu-preview-config'));
  });
  await expect(page.locator('#m-edu-preview')).toBeHidden();
  await page.evaluate(() => { delete window.__nkEduPreviewConfig; window.dispatchEvent(new CustomEvent('nk-edu-preview-config')); });
  await expect(page.locator('#m-edu-preview')).toBeVisible();
  await expect(page.locator('#m-edu-quote-link')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.removeItem('hide_main_popup_date'));
  await page.reload();
  await expect(page.locator('#m-quick-sec')).toBeVisible();
  await expect(page.locator('#m-edu-preview')).toBeVisible();
  await expect(page.locator('#popup-layer')).toBeVisible();
  const boxMetrics = await page.evaluate(() => {
    const rect = document.getElementById('popup-layer').getBoundingClientRect();
    return { bottom: rect.bottom, top: rect.top, vh: window.innerHeight, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  expect(boxMetrics.bottom).toBeLessThanOrEqual(boxMetrics.vh);
  expect(boxMetrics.top).toBeGreaterThan(150);
  expect(boxMetrics.overflow).toBe(false);
});

test('5. mobile slide drawer opens/closes with aria-expanded and view page stacks attachment actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/view.html?id=302');
  await expect(page.locator('#v-title')).toContainText('연간교육계획안');
  await expect(page.locator('.nk-file-row .nk-file-actions button')).toHaveCount(2);

  const actionsStacked = await page.evaluate(() => {
    const main = document.querySelector('.nk-file-main').getBoundingClientRect();
    const actions = document.querySelector('.nk-file-actions').getBoundingClientRect();
    return actions.top >= main.bottom - 1;
  });
  expect(actionsStacked).toBe(true);

  const menuBtn = page.locator('#nkMobileMenuBtn');
  await menuBtn.click();
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#navMenu')).toHaveClass(/active/);
  await page.locator('#nk-nav-backdrop').click({ position: { x: 20, y: 200 } });
  await expect(menuBtn).toHaveAttribute('aria-expanded', 'false');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('6. proposal, main notices, and write.html enforce public visibility and edit password guards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('#m-notices')).toContainText('2027학년도 교재 OT');
  await expect(page.locator('#m-notices')).not.toContainText('비공개 임시저장 공지');

  await page.goto('/proposal.html');
  await expect(page.locator('#proposal-grid-area')).toContainText('쏙쏙 깨치는 뉴키즈 한글 1단계');
  await expect(page.locator('#proposal-grid-area')).toContainText('그림책과 함께하는 생각 독서 5세');
  await expect(page.locator('#proposal-grid-area')).not.toContainText('숨김 처리된 한글 교재');
  await expect(page.locator('#proposal-grid-area')).not.toContainText('임시저장 초안 한글 교재');
  await expect(page.locator('#proposal-grid-area')).not.toContainText('예약 공개 예정 한글 교재');
  await expect(page.locator('#proposal-grid-area')).not.toContainText('뉴키즈 한글 1단계 (상/하)');

  // 1) write.html?edit=401 with wrong password blocks access and redirects away without leaking password/body
  page.removeAllListeners('dialog');
  const dialogs = [];
  let promptReply = 'wrong-pw';
  page.on('dialog', async d => {
    dialogs.push(d.message());
    if (d.type() === 'prompt') await d.accept(promptReply);
    else await d.accept();
  });
  await page.goto('/write.html?edit=401#qna');
  await page.waitForURL(/view\.html\?id=401/);
  expect(dialogs.some(m => m.includes('비밀번호가 일치하지'))).toBe(true);

  // 2) write.html?edit=401 with matching password opens edit form and strips <script> XSS
  promptReply = 'secret-pw';
  await page.goto('/write.html?edit=401#qna');
  await expect(page.locator('#write-title')).toHaveValue('비밀 문의글 제목');
  const hasXss = await page.evaluate(() => Boolean(window.__xss) || document.querySelector('#editor-container script') !== null);
  expect(hasXss).toBe(false);
});
