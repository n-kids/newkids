const { test, expect } = require('@playwright/test');

const STORAGE_KEY = '__nk_forms_test_db_v1';

function buildSupabaseFormsMockScript(seedJson) {
  return `(() => {
    const KEY = ${JSON.stringify(STORAGE_KEY)};
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
      let op = 'select';
      let payload = null;
      let wantSingle = false;
      let selectOpts = {};
      let orderCol = null;
      let orderAsc = true;

      const chain = {
        select(_cols, opts) {
          if (op === 'select') selectOpts = opts || {};
          return chain;
        },
        insert(rows) {
          op = 'insert';
          payload = Array.isArray(rows) ? rows : [rows];
          return chain;
        },
        update(patch) {
          op = 'update';
          payload = patch;
          return chain;
        },
        delete() {
          op = 'delete';
          return chain;
        },
        eq(k, v) { filters.push(row => String(row[k]) === String(v)); return chain; },
        neq(k, v) { filters.push(row => String(row[k]) !== String(v)); return chain; },
        in(k, vals) { filters.push(row => vals.map(String).includes(String(row[k]))); return chain; },
        order(col, opts) { orderCol = col; orderAsc = !opts || opts.ascending !== false; return chain; },
        limit() { return chain; },
        range() { return chain; },
        or() { return chain; },
        ilike() { return chain; },
        gte() { return chain; },
        lte() { return chain; },
        gt() { return chain; },
        lt() { return chain; },
        is() { return chain; },
        not() { return chain; },
        single() { wantSingle = true; return chain; },
        maybeSingle() { wantSingle = true; return chain; },
        then(resolve, reject) {
          const db = readDb();
          if (table === 'custom_forms' || table === 'form_responses') {
            const arr = db[table] || [];
            if (op === 'insert') {
              const inserted = payload.map(item => {
                db.seq = (db.seq || 100) + 1;
                return {
                  id: item.id || (table === 'custom_forms' ? 'form_' + db.seq : 'resp_' + db.seq),
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
              if (table === 'custom_forms') {
                const delIds = new Set(deleted.map(d => String(d.id)));
                db.form_responses = (db.form_responses || []).filter(r => !delIds.has(String(r.form_id)));
              }
              writeDb(db);
              return Promise.resolve({ data: copy(deleted), error: null }).then(resolve, reject);
            }
            let matched = arr.filter(row => filters.every(fn => fn(row)));
            if (orderCol) {
              matched.sort((a, b) => {
                const av = a[orderCol] || '';
                const bv = b[orderCol] || '';
                return orderAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
              });
            }
            if (selectOpts && selectOpts.head) {
              return Promise.resolve({ data: null, count: matched.length, error: null }).then(resolve, reject);
            }
            return Promise.resolve({
              data: copy(wantSingle ? (matched[0] || null) : matched),
              count: matched.length,
              error: wantSingle && !matched.length ? { message: 'Row not found' } : null
            }).then(resolve, reject);
          }

          if (table === 'site_config') {
            return Promise.resolve({ data: wantSingle ? { id: 1, company_name: '뉴키즈' } : [{ id: 1, company_name: '뉴키즈' }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: wantSingle ? null : [], count: 0, error: null }).then(resolve, reject);
        }
      };
      return chain;
    }

    const session = { user: { id: 'admin-1', email: 'admin@example.invalid' } };
    const client = {
      from: query,
      storage: {
        from: () => ({
          list: async () => ({ data: [], error: null }),
          getPublicUrl: (p) => ({ data: { publicUrl: 'https://example.invalid/' + p } }),
          remove: async () => ({ data: [], error: null })
        })
      },
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        signInWithPassword: async () => ({ data: { session }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
      },
      rpc: async (name, args = {}) => {
        if (name === 'get_form_public_stats') {
          const db = readDb();
          const form = (db.custom_forms || []).find(f => String(f.id) === String(args.p_form_id));
          if (!form) return { data: { count: 0, tallies: {} }, error: null };
          const resps = (db.form_responses || []).filter(r => String(r.form_id) === String(args.p_form_id));
          const schema = form.form_schema;
          const show = schema && !Array.isArray(schema) && schema.settings && schema.settings.show_results_after_submit;
          const questions = Array.isArray(schema) ? schema : (schema?.questions || []);
          const tallies = {};
          if (show) {
            questions.forEach(q => {
              if (q.type !== 'radio' && q.type !== 'checkbox') return;
              const map = {};
              resps.forEach(r => {
                const ans = r.answers ? r.answers[q.id] : null;
                const vals = Array.isArray(ans) ? ans : (ans ? [ans] : []);
                vals.forEach(v => {
                  const s = String(v || '').trim();
                  if (!s) return;
                  const lbl = s.startsWith('기타:') ? '기타(직접 입력)' : s;
                  map[lbl] = (map[lbl] || 0) + 1;
                });
              });
              tallies[q.id] = map;
            });
          }
          return { data: { count: resps.length, tallies }, error: null };
        }
        return { data: null, error: { message: 'Unknown RPC: ' + name } };
      }
    };
    window.supabase = { createClient: () => client };
  })();`;
}

function makeSeedDb() {
  const now = Date.now();
  const inTwoDays = new Date(now + 2 * 86400000).toISOString();
  const inTwoWeeks = new Date(now + 14 * 86400000).toISOString();
  const yesterday = new Date(now - 86400000).toISOString();
  const recent1 = new Date(now - 3600000).toISOString();
  const recent2 = new Date(now - 7200000).toISOString();
  const oldTime = new Date(now - 5 * 86400000).toISOString();

  return {
    seq: 200,
    custom_forms: [
      {
        id: 'form_live',
        title: '2026 코딩 체험 신청',
        description: '선착순 2명 신청 폼입니다.',
        is_active: true,
        max_participants: 2,
        end_date: inTwoDays,
        prevent_duplicate: true,
        created_at: recent2,
        form_schema: {
          version: 2,
          questions: [
            { id: 'q_prog', title: '희망 프로그램', type: 'radio', required: true, allowOther: true, options: ['코딩놀이(유아, 6-7세)', '로봇탐험'] },
            { id: 'q_qty', title: '참여 인원', type: 'number', required: true, unit: '명' },
            { id: 'q_memo', title: '요청사항', type: 'text', required: false }
          ],
          settings: {
            respondent: { anonymous: false, name: 'required', affiliation: 'required', contact: 'optional' },
            completion_message: '체험 신청이 접수되었습니다. 담당자가 연락드리겠습니다.',
            completion_link: 'https://n-kids.github.io/newkids/',
            show_results_after_submit: true,
            notify_works_each: true,
            notify_works_full: true
          }
        }
      },
      {
        id: 'form_stats',
        title: '교구 만족도 및 수량 조사',
        description: '숫자 0 포함 집계 및 CSV 수식 방지 검증용',
        is_active: true,
        max_participants: null,
        end_date: inTwoWeeks,
        prevent_duplicate: false,
        created_at: recent1,
        form_schema: {
          version: 2,
          questions: [
            { id: 'q_choice', title: '선호 교구', type: 'radio', required: true, allowOther: true, options: ['블록, 기초세트', '센서키트'] },
            { id: 'q_cnt', title: '추가 수량', type: 'number', required: true, unit: '명' },
            { id: 'q_note', title: '자유 의견', type: 'text', required: false }
          ],
          settings: {
            respondent: { anonymous: false, name: 'required', affiliation: 'required', contact: 'optional' },
            completion_message: '감사합니다.',
            completion_link: '',
            show_results_after_submit: false,
            notify_works_each: false,
            notify_works_full: false
          }
        }
      },
      {
        id: 'form_expired',
        title: '지난 행사 마감 테스트',
        description: '마감일 경과 자동 차단 확인',
        is_active: true,
        max_participants: 10,
        end_date: yesterday,
        prevent_duplicate: false,
        created_at: oldTime,
        form_schema: [{ id: 'q_old', title: '구버전 질문', type: 'text', options: [] }]
      },
      {
        id: 'form_anon',
        title: '익명 임베드 설문',
        description: '게시글 삽입형 + 익명 모드',
        is_active: true,
        max_participants: null,
        end_date: null,
        prevent_duplicate: false,
        created_at: oldTime,
        form_schema: {
          version: 2,
          questions: [{ id: 'q_anon_1', title: '한 줄 의견', type: 'textarea', required: true }],
          settings: {
            respondent: { anonymous: true, name: 'hidden', affiliation: 'hidden', contact: 'hidden' },
            completion_message: '익명 의견이 등록되었습니다.',
            completion_link: '',
            show_results_after_submit: false,
            notify_works_each: false,
            notify_works_full: false
          }
        }
      }
    ],
    form_responses: [
      {
        id: 'r_live_1',
        form_id: 'form_live',
        respondent_info: '해바라기원 - 김선생 (010-1111-2222)',
        answers: {
          __respondent: { anonymous: false, affiliation: '해바라기원', name: '김선생', contact: '010-1111-2222' },
          q_prog: '코딩놀이(유아, 6-7세)',
          q_qty: '3',
          q_memo: '오전 희망'
        },
        created_at: recent1
      },
      {
        id: 'r_stats_1',
        form_id: 'form_stats',
        respondent_info: '별빛유치원 - 이원장 (010-2222-3333)',
        answers: {
          __respondent: { anonymous: false, affiliation: '별빛유치원', name: '이원장', contact: '010-2222-3333' },
          q_choice: '블록, 기초세트',
          q_cnt: '0',
          q_note: "=CMD|' /C calc'!A0"
        },
        created_at: recent1
      },
      {
        id: 'r_stats_2',
        form_id: 'form_stats',
        respondent_info: '푸른어린이집 - 박교사 (010-3333-4444)',
        answers: {
          __respondent: { anonymous: false, affiliation: '푸른어린이집', name: '박교사', contact: '010-3333-4444' },
          q_choice: '기타: 목재 교구 희망',
          q_cnt: '10',
          q_note: '친절한 안내 감사합니다'
        },
        created_at: recent2
      },
      {
        id: 'r_stats_3',
        form_id: 'form_stats',
        respondent_info: '소망원 - 최담당',
        answers: {
          __respondent: { anonymous: false, affiliation: '소망원', name: '최담당', contact: '' },
          q_choice: '센서키트',
          q_cnt: '20',
          q_note: ''
        },
        created_at: oldTime
      }
    ]
  };
}

async function setupRoutes(context, seedDb, notifyCaptures) {
  const mockBody = buildSupabaseFormsMockScript(JSON.stringify(seedDb));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@supabase/supabase-js')) {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: mockBody });
    }
    if (url.hostname === 'newkids-bot.onrender.com' && url.pathname === '/app/forms/notify') {
      try {
        notifyCaptures.push(route.request().postDataJSON());
      } catch (_) {}
      return route.fulfill({
        status: 200,
        headers: { 'access-control-allow-origin': '*' },
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, queued: true })
      });
    }
    if (url.hostname.endsWith('supabase.co')) {
      throw new Error('Production database request blocked: ' + url.pathname);
    }
    return route.abort();
  });
}

test('admin forms workflow: dashboard KPIs, v2 builder, reorder, draft preview, edit/clone, share QR', async ({ context, page }) => {
  const notifyCaptures = [];
  await setupRoutes(context, makeSeedDb(), notifyCaptures);
  page.on('dialog', d => d.accept());

  await page.goto('/admin.html');
  await expect(page.locator('#admin-layout')).toBeVisible();

  // Dashboard KPI cards for forms
  await expect(page.locator('#dashboard-tasks')).toContainText('진행 중인 폼/투표');
  await expect(page.locator('#dashboard-tasks')).toContainText('최근 24시간 신규 응답');
  await expect(page.locator('#dashboard-tasks')).toContainText('마감·정원 임박 폼');

  // Click urgent KPI card -> switches to #tab-forms filtered by urgent
  await page.locator('#dashboard-tasks button', { hasText: '마감·정원 임박 폼' }).click();
  await expect(page.locator('#tab-forms')).toHaveClass(/active/);
  await expect(page.locator('#admin-form-list')).toContainText('2026 코딩 체험 신청');
  await expect(page.locator('#admin-form-list')).not.toContainText('익명 임베드 설문');

  // Switch back to all forms and search
  await page.locator('#form-filter-chips button', { hasText: '전체' }).click();
  await expect(page.locator('#admin-form-list .nk-form-card')).toHaveCount(4);
  await page.locator('#form-search-input').fill('만족도');
  await expect(page.locator('#admin-form-list .nk-form-card')).toHaveCount(1);
  await page.locator('#form-search-input').fill('');

  // Build new v2 form with multiple question types + reorder
  await page.locator('#builder-title').fill('신규 캠프 수요조사');
  await page.locator('#builder-desc').fill('여름방학 캠프 희망 일정을 선택해 주세요.');
  await page.locator('#builder-max').fill('15');
  await page.locator('#builder-show-results').check();
  await page.locator('#builder-notify-each').check();

  await page.locator('.nk-q-quick-add button', { hasText: '객관식(단일)' }).click();
  await page.locator('.nk-q-quick-add button', { hasText: '숫자' }).click();

  const qCards = page.locator('#question-list .nk-q-card');
  await expect(qCards).toHaveCount(2);
  await qCards.nth(0).locator('.q-title').fill('희망 세션');
  await qCards.nth(0).locator('.nk-q-opt-row input').nth(0).fill('오전(9시, 기초)');
  await qCards.nth(0).locator('.nk-q-opt-row input').nth(1).fill('오후(2시, 심화)');
  await qCards.nth(0).locator('input[type="checkbox"]').nth(0).check(); // required
  await qCards.nth(0).locator('input[type="checkbox"]').nth(1).check(); // allowOther

  await qCards.nth(1).locator('.q-title').fill('참가 아동 수');

  // Reorder: move 2nd question up
  await qCards.nth(1).locator('button[title="위로 이동"]').click();
  await expect(qCards.nth(0).locator('.q-title')).toHaveValue('참가 아동 수');
  await expect(qCards.nth(1).locator('.q-title')).toHaveValue('희망 세션');

  // Pre-publish draft preview modal + embed mode toggle
  await page.locator('#tab-forms button', { hasText: '발행 전 미리보기' }).click();
  await expect(page.locator('#preview-form-modal')).toBeVisible();
  const previewFrame = page.frameLocator('#preview-form-iframe');
  await expect(previewFrame.locator('#preview-notice')).toBeVisible();
  await expect(previewFrame.locator('#form-title')).toContainText('신규 캠프 수요조사');
  await page.locator('#btn-preview-mode-embed').click();
  await expect(page.locator('#preview-form-frame-wrap')).toHaveClass(/is-embed-preview/);
  await expect(previewFrame.locator('#form-info-title')).toContainText('신규 캠프 수요조사');
  await page.locator('#preview-form-modal button[aria-label="닫기"]').click();
  await expect(page.locator('#preview-form-modal')).toBeHidden();

  // Save & publish
  await page.locator('#btn-save-custom-form').click();
  await expect(page.locator('#admin-form-list')).toContainText('신규 캠프 수요조사');
  await expect(page.locator('#admin-form-list .nk-form-card').first()).toContainText('결과공개');
  await expect(page.locator('#admin-form-list .nk-form-card').first()).toContainText('웍스알림');

  // Edit existing form with responses -> shows warning banner
  const statsCard = page.locator('#admin-form-list .nk-form-card', { hasText: '교구 만족도 및 수량 조사' });
  await statsCard.locator('button', { hasText: '수정' }).click();
  await expect(page.locator('#builder-edit-warning')).toBeVisible();
  await expect(page.locator('#builder-edit-warning-title')).toContainText('이미 3건의 응답');
  await page.locator('#btn-cancel-form-edit').click();
  await expect(page.locator('#builder-edit-warning')).toBeHidden();

  // Clone form
  await statsCard.locator('button', { hasText: '복제' }).click();
  await expect(page.locator('#builder-title')).toHaveValue('교구 만족도 및 수량 조사 (복사본)');
  await expect(page.locator('#builder-mode-badge')).toContainText('복제 초안');
  await page.locator('#btn-cancel-form-edit').click();

  // Share & QR modal
  await statsCard.locator('button', { hasText: '공유 · QR' }).click();
  await expect(page.locator('#share-form-modal')).toBeVisible();
  await expect(page.locator('#nk-share-qr-svg svg')).toBeVisible();
  await expect(page.locator('#nk-share-code-input')).toHaveValue('[투표:form_stats]');
  await page.locator('#share-form-modal button[aria-label="닫기"]').click();
});

test('admin results modal: summary stats including 0, table filter, safe CSV export, and single response deletion', async ({ context, page }) => {
  await setupRoutes(context, makeSeedDb(), []);
  page.on('dialog', d => d.accept());

  await page.goto('/admin.html');
  await expect(page.locator('#admin-layout')).toBeVisible();
  await page.locator('.nav-item', { hasText: '폼/투표 관리' }).click();

  const statsCard = page.locator('#admin-form-list .nk-form-card', { hasText: '교구 만족도 및 수량 조사' });
  await statsCard.locator('button', { hasText: '결과 확인' }).click();
  await expect(page.locator('#result-modal')).toBeVisible();

  // Summary tab: choice + 기타 + numeric stats (including 0 -> sum 30, avg 10.0, min 0, max 20) + subjective
  await expect(page.locator('#result-stats-summary')).toContainText('목재 교구 희망');
  await expect(page.locator('#result-stats-summary')).toContainText('30명');
  await expect(page.locator('#result-stats-summary')).toContainText('10.0명');
  await expect(page.locator('#result-stats-summary')).toContainText('0명');
  await expect(page.locator('#result-stats-summary')).toContainText('20명');
  await expect(page.locator('#result-stats-summary')).toContainText('친절한 안내 감사합니다');

  // Table tab + question/option filter
  await page.locator('.nk-res-tab-btn[data-tab="table"]').click();
  await expect(page.locator('.nk-res-table thead')).toContainText('소속');
  await expect(page.locator('.nk-res-table thead')).toContainText('이름');
  await expect(page.locator('.nk-res-table thead')).toContainText('연락처');
  await expect(page.locator('.nk-res-table tbody tr')).toHaveCount(3);

  await page.locator('#res-q-filter').selectOption('q_choice');
  await page.locator('#res-opt-filter').selectOption('__other__');
  await expect(page.locator('.nk-res-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.nk-res-table tbody')).toContainText('푸른어린이집');
  await page.locator('#res-q-filter').selectOption('');
  await expect(page.locator('.nk-res-table tbody tr')).toHaveCount(3);

  // Intercept Blob CSV content to verify BOM, split columns, and formula-injection escaping
  await page.evaluate(() => {
    window.__capturedCsv = '';
    const OrigBlob = window.Blob;
    window.Blob = function (parts, opts) {
      if (opts && String(opts.type || '').includes('text/csv')) {
        window.__capturedCsv = parts.join('');
      }
      return new OrigBlob(parts, opts);
    };
  });
  await page.locator('#btn-export-csv').click();
  const csv = await page.evaluate(() => window.__capturedCsv);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"응답일시","소속","이름","연락처"');
  expect(csv).toContain('"\'=CMD|');

  // Individual response deletion recalculates count immediately
  await page.locator('.nk-res-table tbody tr').first().locator('button', { hasText: '삭제' }).click();
  await expect(page.locator('.nk-res-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#form-result-modal-sub')).toContainText('총 2명');
});

test('participant form.html: live submit, Works notify, poll results, quota/duplicate/deadline blocks, anonymous embed', async ({ context, page }) => {
  const notifyCaptures = [];
  await setupRoutes(context, makeSeedDb(), notifyCaptures);
  page.on('dialog', d => d.accept());

  // 1. Live form with 1/2 quota -> fill & submit -> reaches full (2/2)
  await page.goto('/form.html?id=form_live');
  await expect(page.locator('#quota-banner')).toContainText('1 / 2명');
  await expect(page.locator('#quota-banner')).toContainText('남은 자리 1명');

  await page.locator('#res-name').fill('홍길동');
  await page.locator('#res-affiliation').fill('무지개어린이집');
  await page.locator('#res-contact').fill('01098765432');
  await expect(page.locator('#res-contact')).toHaveValue('010-9876-5432');

  // Select 기타 radio and fill custom input
  await page.locator('[data-other-for="q_prog"]').focus();
  await page.locator('[data-other-for="q_prog"]').fill('인공지능 놀이');
  await page.locator('input[name="q_qty"]').fill('4');
  await page.locator('input[name="q_memo"]').fill('주차 문의');

  await page.locator('#btn-form-submit').click();

  // Custom completion screen + external link + live poll results
  await expect(page.locator('#form-status')).toContainText('체험 신청이 접수되었습니다.');
  await expect(page.locator('#form-status a')).toHaveAttribute('href', 'https://n-kids.github.io/newkids/');
  await expect(page.locator('#form-status')).toContainText('실시간 투표 현황');
  await expect(page.locator('#form-status')).toContainText('총 2명 참여');
  await expect(page.locator('#form-status')).toContainText('기타(직접 입력)');

  // Verify Naver Works notification fired
  await expect.poll(() => notifyCaptures.length).toBe(1);
  expect(notifyCaptures[0]).toMatchObject({
    form_id: 'form_live',
    count: 2,
    is_full: true
  });

  // 2. Reload -> blocked by quota full (and/or duplicate prevention)
  await page.reload();
  await expect(page.locator('#customForm')).toBeHidden();
  await expect(page.locator('#form-status')).toContainText('정원 마감된 폼입니다.');

  // 3. Expired form -> automatically blocked
  await page.goto('/form.html?id=form_expired');
  await expect(page.locator('#customForm')).toBeHidden();
  await expect(page.locator('#form-status')).toContainText('기간 만료된 폼입니다.');

  // 4. Anonymous embedded mode -> no personal info inputs + iframe class active
  await page.goto('/form.html?id=form_anon&embed=1');
  await expect(page.locator('body')).toHaveClass(/is-iframe/);
  await expect(page.locator('#respondent-section')).toContainText('익명 참여 폼입니다.');
  await expect(page.locator('#res-name')).toHaveCount(0);
});
