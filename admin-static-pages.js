/**
 * ============================================================================
 * 뉴키즈 관리자(admin.html) — 고정 페이지(PAGE) 확장 모듈
 * 파일명: admin-static-pages.js
 * 적용 방법: admin.html 하단 <script src="admin-forms.js..."> 아래에 아래 1줄 추가
 *   <script src="admin-static-pages.js?v=20261120"></script>
 *
 * 기능:
 * 1) 서브 페이지 관리(#tab-category)에서 고정 페이지(PAGE) 추가·편집 시
 *    - 폼/투표(custom_forms) 선택 또는 URL 직접 입력 (embed / redirect 선택)
 *    - Quill 1.3.6 모달 에디터로 본문 직접 디자인 (Supabase images 버킷 업로드 지원)
 *    - 기존 게시글 연동(post) 100% 유지
 * 2) 기존 addNewCategory(), saveAllCategories()를 안전하게 감싸 새 컬럼 4개를 함께 저장
 * ============================================================================
 */
(function() {
  'use strict';

  const STATE = {
    forms: [],
    newCustomHtml: '',
    rowDrafts: {}, // { [code]: { content_mode, target_url, url_display, custom_html } }
    modalQuill: null,
    modalTarget: null, // { kind: 'new' } | { kind: 'row', code }
    isHtmlMode: false
  };

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function(m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function injectStyles() {
    if (document.getElementById('nk-static-page-ext-style')) return;
    const style = document.createElement('style');
    style.id = 'nk-static-page-ext-style';
    style.textContent = `
      .nk-sp-box {
        margin-top: 14px;
        padding: 14px 16px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
      }
      .nk-sp-title {
        font-size: 13px;
        font-weight: 700;
        color: #1c355e;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 8px;
      }
      .nk-sp-modes {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .nk-sp-mode-btn {
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        cursor: pointer;
      }
      .nk-sp-mode-btn.active {
        background: #1c355e;
        color: #ffffff;
        border-color: #1c355e;
      }
      .nk-sp-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 10px;
        align-items: end;
      }
      .nk-sp-field label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        color: #475569;
        margin-bottom: 4px;
      }
      .nk-sp-field input,
      .nk-sp-field select {
        width: 100%;
        padding: 7px 10px;
        font-size: 13px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        box-sizing: border-box;
      }
      .nk-sp-btn {
        padding: 7px 13px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        background: #059669;
        color: #fff;
      }
      .nk-sp-btn:hover { background: #047857; }
      .nk-sp-btn-outline {
        padding: 6px 11px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid #1c355e;
        background: #fff;
        color: #1c355e;
        text-decoration: none;
        cursor: pointer;
      }
      .nk-sp-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(15, 23, 42, 0.65);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .nk-sp-modal-backdrop.open { display: flex; }
      .nk-sp-modal {
        background: #fff;
        border-radius: 14px;
        width: 100%;
        max-width: 900px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
      }
      .nk-sp-modal-head {
        background: #1c355e;
        color: #fff;
        padding: 14px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .nk-sp-modal-tools {
        padding: 10px 16px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .nk-sp-modal-body {
        padding: 16px;
        overflow-y: auto;
        flex: 1;
      }
      .nk-sp-modal-body .ql-container { min-height: 300px; font-size: 15px; }
      .nk-sp-modal-foot {
        padding: 12px 20px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .nk-sp-row-ext {
        width: 100%;
        margin-top: 10px;
        padding: 12px;
        background: #f8fafc;
        border: 1px dashed #94a3b8;
        border-radius: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  async function loadCustomForms() {
    if (!window.sb) return;
    try {
      const { data, error } = await window.sb
        .from('custom_forms')
        .select('id, title')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        STATE.forms = data;
      }
    } catch (e) {
      console.warn('[admin-static-pages] custom_forms 로드 실패:', e);
    }
  }

  function buildFormOptionsHtml(selectedUrl) {
    const match = String(selectedUrl || '').match(/id=([a-zA-Z0-9_-]+)/);
    const currentId = match ? match[1] : '';
    let html = '<option value="">-- 등록된 폼/투표에서 선택 (URL 자동 입력) --</option>';
    STATE.forms.forEach(function(f) {
      const sel = currentId === f.id ? 'selected' : '';
      html += `<option value="${esc(f.id)}" ${sel}>${esc(f.title || f.id)} (${esc(f.id)})</option>`;
    });
    return html;
  }

  function ensureEditorModal() {
    if (document.getElementById('nk-sp-editor-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'nk-sp-editor-modal';
    wrap.className = 'nk-sp-modal-backdrop';
    wrap.innerHTML = `
      <div class="nk-sp-modal">
        <div class="nk-sp-modal-head">
          <strong id="nk-sp-modal-title" style="font-size:15px;">고정 페이지 본문 직접 디자인</strong>
          <button type="button" id="nk-sp-modal-close" style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">&times;</button>
        </div>
        <div class="nk-sp-modal-tools">
          <button type="button" id="nk-sp-insert-callout" class="nk-sp-btn-outline">+ 안내 박스</button>
          <button type="button" id="nk-sp-insert-cta" class="nk-sp-btn-outline">+ 강조 버튼</button>
          <button type="button" id="nk-sp-toggle-html" class="nk-sp-btn-outline" style="margin-left:auto;">HTML 소스 보기</button>
        </div>
        <div class="nk-sp-modal-body">
          <div id="nk-sp-quill-wrap"><div id="nk-sp-quill-editor"></div></div>
          <textarea id="nk-sp-html-source" style="display:none;width:100%;min-height:320px;font-family:monospace;font-size:13px;padding:12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;"></textarea>
          <input type="file" id="nk-sp-quill-image-input" accept="image/*" style="display:none;">
        </div>
        <div class="nk-sp-modal-foot">
          <button type="button" id="nk-sp-modal-cancel" class="nk-sp-btn-outline">취소</button>
          <button type="button" id="nk-sp-modal-apply" class="nk-sp-btn">본문 적용</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    if (typeof window.Quill === 'function') {
      STATE.modalQuill = new window.Quill('#nk-sp-quill-editor', {
        theme: 'snow',
        placeholder: '고정 페이지 본문 내용을 직접 작성하고 디자인하세요...',
        modules: {
          toolbar: {
            container: [
              [{ header: [1, 2, 3, false] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ color: [] }, { background: [] }],
              [{ align: [] }],
              [{ list: 'ordered' }, { list: 'bullet' }],
              ['link', 'image', 'clean']
            ],
            handlers: {
              image: function() {
                document.getElementById('nk-sp-quill-image-input').click();
              }
            }
          }
        }
      });
    }

    document.getElementById('nk-sp-quill-image-input').addEventListener('change', async function(e) {
      const file = e.target.files && e.target.files[0];
      if (!file || !window.sb || !STATE.modalQuill) return;
      try {
        const uploadFile = typeof window.compressImageToWebP === 'function'
          ? await window.compressImageToWebP(file, 1600, 0.8)
          : file;
        const fileName = `static_${Date.now()}.webp`;
        const { data, error } = await window.sb.storage.from('images').upload(fileName, uploadFile);
        if (error) throw error;
        const pub = window.sb.storage.from('images').getPublicUrl(data.path).data.publicUrl;
        const range = STATE.modalQuill.getSelection(true);
        STATE.modalQuill.insertEmbed(range.index, 'image', pub);
        STATE.modalQuill.setSelection(range.index + 1);
      } catch (err) {
        alert('이미지 업로드 중 오류가 발생했습니다: ' + (err.message || err));
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('nk-sp-insert-callout').addEventListener('click', function() {
      const snippet = '<div style="background:#eff6ff;border-left:4px solid #1c355e;border-radius:8px;padding:14px 16px;margin:12px 0;"><strong>안내 사항:</strong> 여기에 주요 내용을 입력하세요.</div><p><br></p>';
      appendHtmlToEditor(snippet);
    });

    document.getElementById('nk-sp-insert-cta').addEventListener('click', function() {
      const snippet = '<p style="margin:16px 0;"><a href="https://n-kids.github.io/newkids/form.html" target="_blank" style="display:inline-block;background:#1c355e;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;">바로 신청하기</a></p>';
      appendHtmlToEditor(snippet);
    });

    document.getElementById('nk-sp-toggle-html').addEventListener('click', function() {
      const qWrap = document.getElementById('nk-sp-quill-wrap');
      const raw = document.getElementById('nk-sp-html-source');
      const btn = document.getElementById('nk-sp-toggle-html');
      STATE.isHtmlMode = !STATE.isHtmlMode;
      if (STATE.isHtmlMode) {
        raw.value = STATE.modalQuill ? STATE.modalQuill.root.innerHTML : raw.value;
        qWrap.style.display = 'none';
        raw.style.display = 'block';
        btn.textContent = '에디터로 돌아가기';
      } else {
        if (STATE.modalQuill) STATE.modalQuill.root.innerHTML = raw.value;
        raw.style.display = 'none';
        qWrap.style.display = 'block';
        btn.textContent = 'HTML 소스 보기';
      }
    });

    function closeModal() {
      wrap.classList.remove('open');
      STATE.modalTarget = null;
    }

    document.getElementById('nk-sp-modal-close').addEventListener('click', closeModal);
    document.getElementById('nk-sp-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('nk-sp-modal-apply').addEventListener('click', function() {
      const html = STATE.isHtmlMode
        ? document.getElementById('nk-sp-html-source').value
        : (STATE.modalQuill ? STATE.modalQuill.root.innerHTML : document.getElementById('nk-sp-html-source').value);

      if (STATE.modalTarget && STATE.modalTarget.kind === 'new') {
        STATE.newCustomHtml = html;
        const summary = document.getElementById('nk-sp-new-custom-status');
        if (summary) summary.textContent = '직접 디자인 본문이 작성되었습니다. [카테고리 생성] 시 함께 저장됩니다.';
      } else if (STATE.modalTarget && STATE.modalTarget.kind === 'row') {
        const code = STATE.modalTarget.code;
        if (!STATE.rowDrafts[code]) STATE.rowDrafts[code] = { content_mode: 'custom', target_url: '', url_display: 'embed', custom_html: '' };
        STATE.rowDrafts[code].custom_html = html;
        const badge = document.getElementById('nk-sp-row-custom-status-' + code);
        if (badge) badge.textContent = '본문 수정됨 (일괄 저장 버튼을 눌러 반영하세요)';
      }
      closeModal();
    });
  }

  function appendHtmlToEditor(snippet) {
    if (STATE.isHtmlMode || !STATE.modalQuill) {
      document.getElementById('nk-sp-html-source').value += '\n' + snippet;
    } else {
      STATE.modalQuill.root.innerHTML += snippet;
    }
  }

  function openEditorModal(target, title, initialHtml) {
    ensureEditorModal();
    STATE.modalTarget = target;
    STATE.isHtmlMode = false;
    document.getElementById('nk-sp-modal-title').textContent = title;
    document.getElementById('nk-sp-quill-wrap').style.display = 'block';
    document.getElementById('nk-sp-html-source').style.display = 'none';
    document.getElementById('nk-sp-toggle-html').textContent = 'HTML 소스 보기';
    if (STATE.modalQuill) {
      STATE.modalQuill.root.innerHTML = initialHtml || '';
    } else {
      document.getElementById('nk-sp-html-source').value = initialHtml || '';
      document.getElementById('nk-sp-quill-wrap').style.display = 'none';
      document.getElementById('nk-sp-html-source').style.display = 'block';
    }
    document.getElementById('nk-sp-editor-modal').classList.add('open');
  }

  // 1) "새 카테고리(메뉴) 추가" 패널에 고정 페이지 확장 UI 삽입
  function mountNewCategoryPanel() {
    const typeSelect = document.getElementById('new-cat-type');
    if (!typeSelect || document.getElementById('nk-sp-new-box')) return;
    const panelBox = typeSelect.closest('.panel-box');
    if (!panelBox) return;

    const box = document.createElement('div');
    box.id = 'nk-sp-new-box';
    box.className = 'nk-sp-box';
    box.style.display = typeSelect.value === 'PAGE' ? 'block' : 'none';
    box.innerHTML = `
      <div class="nk-sp-title">
        <span>고정 페이지 콘텐츠 연결 방식</span>
        <span style="font-size:11px;font-weight:400;color:#64748b;">게시글 관리로 이동하지 않고 바로 연결·작성할 수 있습니다</span>
      </div>
      <div class="nk-sp-modes">
        <button type="button" class="nk-sp-mode-btn active" data-new-mode="url">폼/투표 · URL 연결</button>
        <button type="button" class="nk-sp-mode-btn" data-new-mode="custom">본문 직접 디자인</button>
        <button type="button" class="nk-sp-mode-btn" data-new-mode="post">기존 게시글 연동</button>
      </div>
      <input type="hidden" id="nk-sp-new-mode" value="url">

      <div id="nk-sp-new-url-panel" class="nk-sp-grid">
        <div class="nk-sp-field">
          <label for="nk-sp-new-form-select">등록된 폼/투표 선택</label>
          <select id="nk-sp-new-form-select">${buildFormOptionsHtml('')}</select>
        </div>
        <div class="nk-sp-field">
          <label for="nk-sp-new-target-url">연결할 URL (직접 입력 가능)</label>
          <input type="text" id="nk-sp-new-target-url" placeholder="form.html?id=... 또는 https://...">
        </div>
        <div class="nk-sp-field">
          <label for="nk-sp-new-url-display">표시 방식</label>
          <select id="nk-sp-new-url-display">
            <option value="embed">페이지 본문 안에 삽입 (iframe)</option>
            <option value="redirect">메뉴 클릭 시 해당 URL로 바로 이동</option>
          </select>
        </div>
      </div>

      <div id="nk-sp-new-custom-panel" style="display:none;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <span id="nk-sp-new-custom-status" style="font-size:12px;color:#475569;">아직 작성된 본문이 없습니다. 에디터를 열어 직접 작성해 주세요.</span>
        <button type="button" id="nk-sp-new-open-editor" class="nk-sp-btn">본문 디자인 에디터 열기</button>
      </div>

      <div id="nk-sp-new-post-panel" style="display:none;font-size:12px;color:#475569;">
        기존 방식대로 <b>게시글 관리</b>에서 이 카테고리 코드로 글을 작성하면 자동으로 표시됩니다.
      </div>
    `;

    const submitBtn = panelBox.querySelector('button[onclick*="addNewCategory"]');
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.parentNode.insertBefore(box, submitBtn);
    } else {
      panelBox.appendChild(box);
    }

    typeSelect.addEventListener('change', function() {
      box.style.display = typeSelect.value === 'PAGE' ? 'block' : 'none';
    });

    box.querySelectorAll('[data-new-mode]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const mode = btn.dataset.newMode;
        document.getElementById('nk-sp-new-mode').value = mode;
        box.querySelectorAll('[data-new-mode]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
        document.getElementById('nk-sp-new-url-panel').style.display = mode === 'url' ? 'grid' : 'none';
        document.getElementById('nk-sp-new-custom-panel').style.display = mode === 'custom' ? 'flex' : 'none';
        document.getElementById('nk-sp-new-post-panel').style.display = mode === 'post' ? 'block' : 'none';
      });
    });

    document.getElementById('nk-sp-new-form-select').addEventListener('change', function(e) {
      if (e.target.value) {
        document.getElementById('nk-sp-new-target-url').value = 'form.html?id=' + e.target.value;
      }
    });

    document.getElementById('nk-sp-new-open-editor').addEventListener('click', function() {
      openEditorModal({ kind: 'new' }, '새 고정 페이지 본문 작성', STATE.newCustomHtml);
    });
  }

  // 2) 기존 고정 페이지 목록(#sortable-list-PAGE)의 각 .cm-row에 편집 UI 자동 주입
  function enhanceStaticPageRows() {
    const pageList = document.getElementById('sortable-list-PAGE');
    if (!pageList) return;
    const catList = typeof window.categoryList !== 'undefined' ? window.categoryList : [];

    pageList.querySelectorAll('.cm-row').forEach(function(row) {
      const code = row.dataset.code;
      if (!code || row.querySelector('.nk-sp-row-ext')) return;

      const cat = catList.find(function(c) { return c.code === code; }) || {};
      const draft = STATE.rowDrafts[code] || {
        content_mode: cat.content_mode || 'post',
        target_url: cat.target_url || '',
        url_display: cat.url_display || 'embed',
        custom_html: cat.custom_html || ''
      };
      STATE.rowDrafts[code] = draft;

      const ext = document.createElement('div');
      ext.className = 'nk-sp-row-ext';
      ext.innerHTML = `
        <div class="nk-sp-title">
          <span>콘텐츠 연결 방식 (${esc(code)})</span>
          <a href="page.html?id=${encodeURIComponent(code)}" target="_blank" rel="noopener noreferrer" class="nk-sp-btn-outline">페이지 열기 ↗</a>
        </div>
        <div class="nk-sp-modes">
          <button type="button" class="nk-sp-mode-btn ${draft.content_mode === 'url' ? 'active' : ''}" data-row-mode="url">폼/투표 · URL 연결</button>
          <button type="button" class="nk-sp-mode-btn ${draft.content_mode === 'custom' ? 'active' : ''}" data-row-mode="custom">본문 직접 디자인</button>
          <button type="button" class="nk-sp-mode-btn ${draft.content_mode === 'post' ? 'active' : ''}" data-row-mode="post">기존 게시글 연동</button>
        </div>

        <div class="nk-sp-row-url-panel nk-sp-grid" style="display:${draft.content_mode === 'url' ? 'grid' : 'none'};">
          <div class="nk-sp-field">
            <label>등록된 폼/투표 선택</label>
            <select class="nk-sp-row-form-select">${buildFormOptionsHtml(draft.target_url)}</select>
          </div>
          <div class="nk-sp-field">
            <label>연결할 URL</label>
            <input type="text" class="nk-sp-row-target-url" value="${esc(draft.target_url)}" placeholder="form.html?id=... 또는 https://...">
          </div>
          <div class="nk-sp-field">
            <label>표시 방식</label>
            <select class="nk-sp-row-url-display">
              <option value="embed" ${draft.url_display !== 'redirect' ? 'selected' : ''}>본문 삽입 (iframe)</option>
              <option value="redirect" ${draft.url_display === 'redirect' ? 'selected' : ''}>바로 이동 (redirect)</option>
            </select>
          </div>
        </div>

        <div class="nk-sp-row-custom-panel" style="display:${draft.content_mode === 'custom' ? 'flex' : 'none'};align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span id="nk-sp-row-custom-status-${esc(code)}" style="font-size:12px;color:#475569;">
            ${draft.custom_html ? '직접 디자인한 본문이 저장되어 있습니다.' : '작성된 본문이 없습니다.'}
          </span>
          <button type="button" class="nk-sp-btn nk-sp-row-edit-btn">본문 직접 편집</button>
        </div>

        <div class="nk-sp-row-post-panel" style="display:${draft.content_mode === 'post' ? 'block' : 'none'};font-size:12px;color:#64748b;">
          기존 <b>게시글 관리</b>에 등록된 글이 표시됩니다.
        </div>
      `;

      row.appendChild(ext);

      ext.querySelectorAll('[data-row-mode]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const mode = btn.dataset.rowMode;
          STATE.rowDrafts[code].content_mode = mode;
          ext.querySelectorAll('[data-row-mode]').forEach(function(b) { b.classList.toggle('active', b === btn); });
          ext.querySelector('.nk-sp-row-url-panel').style.display = mode === 'url' ? 'grid' : 'none';
          ext.querySelector('.nk-sp-row-custom-panel').style.display = mode === 'custom' ? 'flex' : 'none';
          ext.querySelector('.nk-sp-row-post-panel').style.display = mode === 'post' ? 'block' : 'none';
        });
      });

      const formSel = ext.querySelector('.nk-sp-row-form-select');
      const urlInp = ext.querySelector('.nk-sp-row-target-url');
      const dispSel = ext.querySelector('.nk-sp-row-url-display');

      formSel.addEventListener('change', function() {
        if (formSel.value) {
          const nextUrl = 'form.html?id=' + formSel.value;
          urlInp.value = nextUrl;
          STATE.rowDrafts[code].target_url = nextUrl;
        }
      });
      urlInp.addEventListener('input', function() {
        STATE.rowDrafts[code].target_url = urlInp.value.trim();
      });
      dispSel.addEventListener('change', function() {
        STATE.rowDrafts[code].url_display = dispSel.value;
      });
      ext.querySelector('.nk-sp-row-edit-btn').addEventListener('click', function() {
        openEditorModal({ kind: 'row', code: code }, `"${cat.name || code}" 본문 직접 편집`, STATE.rowDrafts[code].custom_html);
      });
    });
  }

  // 3) 기존 addNewCategory / saveAllCategories 안전 래핑
  function wrapAdminFunctions() {
    if (typeof window.addNewCategory === 'function' && !window.addNewCategory.__nkWrapped) {
      const origAdd = window.addNewCategory;
      const wrappedAdd = async function() {
        const typeEl = document.getElementById('new-cat-type');
        const codeEl = document.getElementById('new-cat-code');
        const isPage = typeEl && typeEl.value === 'PAGE';
        const code = codeEl ? codeEl.value.trim().toLowerCase() : '';
        const mode = document.getElementById('nk-sp-new-mode')?.value || 'post';
        const targetUrl = document.getElementById('nk-sp-new-target-url')?.value.trim() || '';
        const urlDisplay = document.getElementById('nk-sp-new-url-display')?.value || 'embed';
        const customHtml = mode === 'custom' ? STATE.newCustomHtml : '';

        const res = await origAdd.apply(this, arguments);

        if (isPage && code && window.sb) {
          try {
            await window.sb
              .from('program_categories')
              .update({
                content_mode: mode,
                target_url: targetUrl || null,
                url_display: urlDisplay,
                custom_html: customHtml || null
              })
              .eq('code', code);

            STATE.newCustomHtml = '';
            const urlField = document.getElementById('nk-sp-new-target-url');
            if (urlField) urlField.value = '';
            const statusEl = document.getElementById('nk-sp-new-custom-status');
            if (statusEl) statusEl.textContent = '아직 작성된 본문이 없습니다. 에디터를 열어 직접 작성해 주세요.';
            if (typeof window.loadAdminCategories === 'function') {
              await window.loadAdminCategories();
            }
          } catch (err) {
            console.error('[admin-static-pages] 고정 페이지 확장 필드 저장 오류:', err);
          }
        }
        return res;
      };
      wrappedAdd.__nkWrapped = true;
      window.addNewCategory = wrappedAdd;
    }

    if (typeof window.saveAllCategories === 'function' && !window.saveAllCategories.__nkWrapped) {
      const origSave = window.saveAllCategories;
      const wrappedSave = async function() {
        const draftsCopy = JSON.parse(JSON.stringify(STATE.rowDrafts));
        const res = await origSave.apply(this, arguments);
        if (window.sb) {
          const codes = Object.keys(draftsCopy);
          await Promise.all(codes.map(function(code) {
            const d = draftsCopy[code];
            return window.sb
              .from('program_categories')
              .update({
                content_mode: d.content_mode || 'post',
                target_url: d.target_url || null,
                url_display: d.url_display || 'embed',
                custom_html: d.custom_html || null
              })
              .eq('code', code);
          }));
        }
        return res;
      };
      wrappedSave.__nkWrapped = true;
      window.saveAllCategories = wrappedSave;
    }
  }

  function observeCategoryContainer() {
    const container = document.getElementById('category-list-container');
    if (!container) return;
    const observer = new MutationObserver(function() {
      enhanceStaticPageRows();
    });
    observer.observe(container, { childList: true, subtree: true });
    enhanceStaticPageRows();
  }

  async function init() {
    injectStyles();
    await loadCustomForms();
    mountNewCategoryPanel();
    wrapAdminFunctions();
    observeCategoryContainer();
  }

  document.addEventListener('DOMContentLoaded', function() {
    const timer = setInterval(function() {
      if (window.sb && document.getElementById('new-cat-type')) {
        clearInterval(timer);
        init();
      }
    }, 150);
  });
})();
