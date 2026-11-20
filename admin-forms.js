/* =========================================
   뉴키즈 관리자 폼/투표 통합 모듈 (admin-forms.js)
   - 생성 · 수정 · 복제 · 드래그 정렬 · 6종 문항 · 응답자 설정 · 완료/알림 설정
   - 실시간 응답 현황 · 정원 진행률 · 검색/상태 필터 · 공유/QR · 발행 전 미리보기
   - 결과 모달 (통계/숫자집계/주관식 모아보기 · 표/필터 · 개별 응답 삭제 · 안전 CSV)
   ========================================= */
(function (global) {
    'use strict';

    const F = () => global.NKForms;
    const esc = (v) => F().escapeHtml(v);
    const toast = (msg, type) => {
        if (typeof global.showToast === 'function') global.showToast(msg, type);
        else alert(msg);
    };
    const loading = (show) => {
        if (typeof global.showLoading === 'function') global.showLoading(show);
    };
    const logAct = async (action, details) => {
        if (typeof global.logAdminActivity === 'function') {
            try { await global.logAdminActivity(action, details); } catch (_) {}
        }
    };

    let formsCache = [];
    let responseCountMap = {};
    let currentFilter = 'all';
    let editingFormId = null;
    let builderQuestions = [];
    let dragSrcIdx = null;
    let previewModalBaseUrl = '';

    // 결과 모달 상태
    let resState = {
        formId: null,
        form: null,
        parsed: null,
        responses: [],
        tab: 'summary'
    };

    function getSb() {
        return global.sb;
    }

    function makeQuestionId(idx) {
        return 'q_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).slice(2, 6);
    }

    async function copyToClipboard(text, successMsg) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                toast(successMsg || '복사되었습니다.', 'success');
                return;
            }
        } catch (_) {}
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            toast(successMsg || '복사되었습니다.', 'success');
        } catch (_) {
            toast('복사에 실패했습니다. 직접 선택해 복사해 주세요.', 'error');
        }
        ta.remove();
    }

    // =========================================================================
    // 1. 폼 빌더 (신규 · 수정 · 복제 · 드래그 정렬 · 6종 문항)
    // =========================================================================
    function syncRespondentFieldState() {
        const anonEl = document.getElementById('builder-anonymous');
        const gridEl = document.getElementById('builder-respondent-grid');
        if (!anonEl || !gridEl) return;
        const anon = anonEl.checked;
        gridEl.style.opacity = anon ? '0.45' : '1';
        gridEl.style.pointerEvents = anon ? 'none' : 'auto';
    }

    function updateBuilderHeaderUI(mode, respCount) {
        const heading = document.getElementById('form-builder-heading');
        const badge = document.getElementById('builder-mode-badge');
        const cancelBtn = document.getElementById('btn-cancel-form-edit');
        const saveBtn = document.getElementById('btn-save-custom-form');
        const warnBox = document.getElementById('builder-edit-warning');
        const warnTitle = document.getElementById('builder-edit-warning-title');

        if (mode === 'edit') {
            if (heading) heading.innerHTML = '<svg class="ic"><use href="#i-pencil"/></svg> 기존 폼 / 투표 수정';
            if (badge) { badge.textContent = '수정 모드'; badge.style.display = 'inline-flex'; }
            if (cancelBtn) cancelBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.textContent = '수정 내용 저장';
            if (warnBox && warnTitle) {
                if (respCount > 0) {
                    warnTitle.textContent = `이미 ${respCount}건의 응답이 수집된 폼을 수정하고 있습니다.`;
                    warnBox.style.display = 'flex';
                } else {
                    warnBox.style.display = 'none';
                }
            }
        } else if (mode === 'clone') {
            if (heading) heading.innerHTML = '<svg class="ic"><use href="#i-copy"/></svg> 폼 복제하여 새로 만들기';
            if (badge) { badge.textContent = '복제 초안'; badge.style.display = 'inline-flex'; }
            if (cancelBtn) cancelBtn.style.display = 'inline-flex';
            if (saveBtn) saveBtn.textContent = '복제 폼 저장 및 발행';
            if (warnBox) warnBox.style.display = 'none';
        } else {
            if (heading) heading.innerHTML = '<svg class="ic"><use href="#i-clipboard"/></svg> 폼 / 투표 생성기';
            if (badge) badge.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
            if (saveBtn) saveBtn.textContent = '폼 저장 및 발행';
            if (warnBox) warnBox.style.display = 'none';
        }
    }

    function resetFormBuilder(silent) {
        editingFormId = null;
        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

        setVal('builder-title', '');
        setVal('builder-desc', '');
        setVal('builder-max', '');
        setVal('builder-end-date', '');
        setChk('builder-prevent-duplicate', true);
        setChk('builder-anonymous', false);
        setVal('builder-field-name', 'required');
        setVal('builder-field-aff', 'required');
        setVal('builder-field-contact', 'optional');
        setVal('builder-thanks-msg', F().DEFAULT_SETTINGS.completion_message);
        setVal('builder-thanks-link', '');
        setChk('builder-show-results', false);
        setChk('builder-notify-each', false);
        setChk('builder-notify-full', false);
        syncRespondentFieldState();

        builderQuestions = [];
        renderBuilderQuestions();
        updateBuilderHeaderUI('new', 0);
        if (!silent) toast('작성 내용을 초기화했습니다.', 'info');
    }

    function addQuestionBlock(type) {
        const qType = ['text', 'textarea', 'radio', 'checkbox', 'number', 'date'].includes(type) ? type : 'radio';
        builderQuestions.push({
            id: makeQuestionId(builderQuestions.length),
            title: '',
            type: qType,
            required: false,
            allowOther: false,
            options: (qType === 'radio' || qType === 'checkbox') ? ['', ''] : [],
            unit: qType === 'number' ? '명' : '',
            placeholder: ''
        });
        renderBuilderQuestions();
    }

    function moveQuestionBlock(idx, dir) {
        const next = idx + dir;
        if (next < 0 || next >= builderQuestions.length) return;
        const [item] = builderQuestions.splice(idx, 1);
        builderQuestions.splice(next, 0, item);
        renderBuilderQuestions();
    }

    function duplicateQuestionBlock(idx) {
        const src = builderQuestions[idx];
        if (!src) return;
        builderQuestions.splice(idx + 1, 0, {
            ...src,
            id: makeQuestionId(idx + 1),
            options: Array.isArray(src.options) ? [...src.options] : []
        });
        renderBuilderQuestions();
    }

    function removeQuestionBlock(idx) {
        builderQuestions.splice(idx, 1);
        renderBuilderQuestions();
    }

    function updateQuestionField(idx, field, value) {
        const q = builderQuestions[idx];
        if (!q) return;
        q[field] = value;
        if (field === 'type') {
            if ((value === 'radio' || value === 'checkbox') && (!q.options || q.options.length === 0)) {
                q.options = ['', ''];
            }
            if (value === 'number' && !q.unit) q.unit = '명';
            renderBuilderQuestions();
        }
    }

    function addOptionRow(qIdx) {
        if (!builderQuestions[qIdx]) return;
        builderQuestions[qIdx].options.push('');
        renderBuilderQuestions();
    }

    function removeOptionRow(qIdx, optIdx) {
        if (!builderQuestions[qIdx] || builderQuestions[qIdx].options.length <= 1) return;
        builderQuestions[qIdx].options.splice(optIdx, 1);
        renderBuilderQuestions();
    }

    function bulkPasteOptions(qIdx) {
        if (!builderQuestions[qIdx]) return;
        const raw = prompt('선택지를 한 줄에 하나씩 입력(또는 붙여넣기)하세요.\n선택지 안에 쉼표(,)가 들어가도 그대로 유지됩니다.');
        if (raw === null) return;
        const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) return toast('유효한 선택지가 없습니다.', 'error');
        builderQuestions[qIdx].options = lines;
        renderBuilderQuestions();
        toast(`${lines.length}개의 선택지를 반영했습니다.`, 'success');
    }

    function renderBuilderQuestions() {
        const container = document.getElementById('question-list');
        if (!container) return;

        if (!builderQuestions.length) {
            container.innerHTML = '<div class="nk-form-empty-q">아직 추가된 질문이 없습니다. 아래 버튼으로 질문을 추가해 주세요.</div>';
            return;
        }

        container.innerHTML = builderQuestions.map((q, idx) => {
            const isChoice = q.type === 'radio' || q.type === 'checkbox';
            return `
                <div class="nk-q-card" draggable="true" data-q-idx="${idx}">
                    <div class="nk-q-card-head">
                        <div class="nk-q-head-left">
                            <span class="nk-q-drag-handle" title="드래그하여 순서 변경"><svg class="ic"><use href="#i-grip"/></svg></span>
                            <strong class="nk-q-num">질문 ${idx + 1}</strong>
                            <label class="nk-inline-chk">
                                <input type="checkbox" ${q.required ? 'checked' : ''} onchange="nkFormUpdateQ(${idx}, 'required', this.checked)">
                                <span style="${q.required ? 'color:#b3261e; font-weight:700;' : 'color:#5c6b7a;'}">필수 응답</span>
                            </label>
                        </div>
                        <div class="nk-q-head-actions">
                            <button type="button" class="btn-mini c-soft" onclick="nkFormMoveQ(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="위로 이동"><svg class="ic"><use href="#i-arrow-up"/></svg></button>
                            <button type="button" class="btn-mini c-soft" onclick="nkFormMoveQ(${idx}, 1)" ${idx === builderQuestions.length - 1 ? 'disabled' : ''} title="아래로 이동"><svg class="ic"><use href="#i-arrow-down"/></svg></button>
                            <button type="button" class="btn-mini c-soft" onclick="nkFormDupQ(${idx})" title="질문 복제"><svg class="ic"><use href="#i-copy"/></svg></button>
                            <button type="button" class="btn-mini c-solid-danger" onclick="nkFormDelQ(${idx})" title="질문 삭제"><svg class="ic"><use href="#i-x"/></svg></button>
                        </div>
                    </div>

                    <div class="nk-q-main-row">
                        <input type="text" class="form-input q-title" value="${esc(q.title)}" placeholder="질문 내용을 입력하세요"
                               oninput="nkFormUpdateQ(${idx}, 'title', this.value)">
                        <select class="form-input q-type" onchange="nkFormUpdateQ(${idx}, 'type', this.value)">
                            <option value="radio" ${q.type === 'radio' ? 'selected' : ''}>객관식 (단일선택/투표)</option>
                            <option value="checkbox" ${q.type === 'checkbox' ? 'selected' : ''}>객관식 (다중선택)</option>
                            <option value="text" ${q.type === 'text' ? 'selected' : ''}>주관식 (단답형)</option>
                            <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>주관식 (장문형)</option>
                            <option value="number" ${q.type === 'number' ? 'selected' : ''}>숫자 입력 (인원/수량)</option>
                            <option value="date" ${q.type === 'date' ? 'selected' : ''}>날짜 선택</option>
                        </select>
                    </div>

                    ${isChoice ? `
                        <div class="nk-q-options-box">
                            <div class="nk-q-options-head">
                                <span>선택지 항목 (쉼표 포함 가능)</span>
                                <button type="button" class="nk-link-btn" onclick="nkFormBulkOpts(${idx})">줄바꿈 일괄 입력</button>
                            </div>
                            <div class="nk-q-options-list">
                                ${(q.options || []).map((opt, oIdx) => `
                                    <div class="nk-q-opt-row">
                                        <span class="nk-q-opt-num">${oIdx + 1}.</span>
                                        <input type="text" class="form-input" value="${esc(opt)}" placeholder="선택지 내용 (예: 코딩놀이(유아, 6-7세))"
                                               oninput="nkFormUpdateOpt(${idx}, ${oIdx}, this.value)">
                                        <button type="button" class="btn-mini c-soft" onclick="nkFormDelOpt(${idx}, ${oIdx})" ${q.options.length <= 1 ? 'disabled' : ''} title="선택지 삭제"><svg class="ic"><use href="#i-x"/></svg></button>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="nk-q-options-foot">
                                <button type="button" class="btn-mini c-soft" onclick="nkFormAddOpt(${idx})"><svg class="ic"><use href="#i-plus"/></svg> 선택지 추가</button>
                                <label class="nk-inline-chk">
                                    <input type="checkbox" ${q.allowOther ? 'checked' : ''} onchange="nkFormUpdateQ(${idx}, 'allowOther', this.checked)">
                                    <span>"기타 (직접 입력)" 항목 허용</span>
                                </label>
                            </div>
                        </div>
                    ` : q.type === 'number' ? `
                        <div class="nk-q-sub-row">
                            <input type="text" class="form-input" value="${esc(q.unit || '')}" placeholder="단위 표시 (예: 명, 세트)"
                                   oninput="nkFormUpdateQ(${idx}, 'unit', this.value)">
                            <input type="text" class="form-input" value="${esc(q.placeholder || '')}" placeholder="입력 안내 문구 (선택)"
                                   oninput="nkFormUpdateQ(${idx}, 'placeholder', this.value)">
                        </div>
                    ` : (q.type === 'text' || q.type === 'textarea') ? `
                        <div style="margin-top:10px;">
                            <input type="text" class="form-input" value="${esc(q.placeholder || '')}" placeholder="입력 안내 문구 (선택사항)"
                                   oninput="nkFormUpdateQ(${idx}, 'placeholder', this.value)">
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // 드래그 앤 드롭 바인딩
        container.querySelectorAll('.nk-q-card').forEach(card => {
            const idx = Number(card.dataset.qIdx);
            card.addEventListener('dragstart', (e) => {
                dragSrcIdx = idx;
                card.classList.add('is-dragging');
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                card.classList.add('is-drag-over');
            });
            card.addEventListener('dragleave', () => card.classList.remove('is-drag-over'));
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('is-drag-over');
                if (dragSrcIdx === null || dragSrcIdx === idx) return;
                const [moved] = builderQuestions.splice(dragSrcIdx, 1);
                builderQuestions.splice(idx, 0, moved);
                dragSrcIdx = null;
                renderBuilderQuestions();
                toast('질문 순서를 변경했습니다.', 'info');
            });
            card.addEventListener('dragend', () => {
                dragSrcIdx = null;
                card.classList.remove('is-dragging');
                container.querySelectorAll('.nk-q-card').forEach(c => c.classList.remove('is-drag-over'));
            });
        });
    }

    function collectBuilderPayload() {
        const title = (document.getElementById('builder-title')?.value || '').trim();
        const desc = (document.getElementById('builder-desc')?.value || '').trim();
        const maxRaw = parseInt(document.getElementById('builder-max')?.value || '', 10);
        const maxParticipants = (!isNaN(maxRaw) && maxRaw > 0) ? maxRaw : null;
        const endDateInput = document.getElementById('builder-end-date')?.value || '';
        const endDate = endDateInput ? new Date(endDateInput).toISOString() : null;
        const preventDuplicate = Boolean(document.getElementById('builder-prevent-duplicate')?.checked);

        const anonymous = Boolean(document.getElementById('builder-anonymous')?.checked);
        const settings = {
            respondent: {
                anonymous: anonymous,
                name: anonymous ? 'hidden' : (document.getElementById('builder-field-name')?.value || 'required'),
                affiliation: anonymous ? 'hidden' : (document.getElementById('builder-field-aff')?.value || 'required'),
                contact: anonymous ? 'hidden' : (document.getElementById('builder-field-contact')?.value || 'optional')
            },
            completion_message: (document.getElementById('builder-thanks-msg')?.value || '').trim() || F().DEFAULT_SETTINGS.completion_message,
            completion_link: (document.getElementById('builder-thanks-link')?.value || '').trim(),
            show_results_after_submit: Boolean(document.getElementById('builder-show-results')?.checked),
            notify_works_each: Boolean(document.getElementById('builder-notify-each')?.checked),
            notify_works_full: Boolean(document.getElementById('builder-notify-full')?.checked)
        };

        const questions = builderQuestions.map((q, idx) => ({
            id: q.id || makeQuestionId(idx),
            title: String(q.title || '').trim(),
            type: q.type,
            required: Boolean(q.required),
            allowOther: Boolean(q.allowOther),
            options: (q.type === 'radio' || q.type === 'checkbox')
                ? (q.options || []).map(o => String(o || '').trim()).filter(Boolean)
                : [],
            unit: String(q.unit || '').trim(),
            placeholder: String(q.placeholder || '').trim()
        }));

        return {
            title: title,
            description: desc,
            max_participants: maxParticipants,
            end_date: endDate,
            prevent_duplicate: preventDuplicate,
            form_schema: F().packSchema(questions, settings),
            _rawLink: settings.completion_link,
            _questions: questions
        };
    }

    async function saveCustomForm() {
        const payload = collectBuilderPayload();
        if (!payload.title) return toast('폼 제목을 입력해주세요.', 'error');
        if (!payload._questions.length) return toast('최소 1개의 질문을 추가해주세요.', 'error');
        for (let i = 0; i < payload._questions.length; i++) {
            const q = payload._questions[i];
            if (!q.title) return toast(`${i + 1}번 질문 내용을 입력해주세요.`, 'error');
            if ((q.type === 'radio' || q.type === 'checkbox') && q.options.length === 0) {
                return toast(`${i + 1}번 객관식 질문의 선택지를 1개 이상 입력해주세요.`, 'error');
            }
        }
        if (payload._rawLink && !F().safeExternalUrl(payload._rawLink)) {
            return toast('완료 안내 링크는 http:// 또는 https://로 시작해야 합니다.', 'error');
        }

        const isEdit = Boolean(editingFormId);
        if (!confirm(isEdit ? '수정된 폼 내용을 저장하시겠습니까?' : '이 폼을 저장하고 발행하시겠습니까?')) return;

        const dbRow = {
            title: payload.title,
            description: payload.description,
            form_schema: payload.form_schema,
            max_participants: payload.max_participants,
            end_date: payload.end_date,
            prevent_duplicate: payload.prevent_duplicate
        };

        loading(true); try {
        let res;
        if (isEdit) {
            res = await getSb().from('custom_forms').update(dbRow).eq('id', editingFormId);
        } else {
            dbRow.is_active = true;
            res = await getSb().from('custom_forms').insert([dbRow]);
        }
   

        if (res.error) {
            return toast('저장 실패: ' + res.error.message, 'error');
        }

        await logAct(isEdit ? 'UPDATE_FORM' : 'CREATE_FORM', { id: editingFormId || null, title: payload.title });
        toast(isEdit ? '폼 수정 내용이 저장되었습니다!' : '폼이 성공적으로 발행되었습니다!', 'success');
        resetFormBuilder(true);
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
    } catch (err) { toast('저장 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error'); } finally { loading(false); }
    }
   
    function loadFormIntoBuilder(formId, isClone) {
        const form = formsCache.find(f => String(f.id) === String(formId));
        if (!form) return toast('폼 정보를 찾지 못했습니다.', 'error');

        const parsed = F().parseSchema(form.form_schema);
        const s = parsed.settings;
        const count = responseCountMap[String(form.id)] || 0;

        editingFormId = isClone ? null : form.id;

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = Boolean(val); };

        setVal('builder-title', isClone ? `${form.title} (복사본)` : form.title);
        setVal('builder-desc', form.description || '');
        setVal('builder-max', form.max_participants || '');
        setVal('builder-end-date', F().toDateTimeLocalValue(form.end_date));
        setChk('builder-prevent-duplicate', form.prevent_duplicate !== false);

        setChk('builder-anonymous', s.respondent.anonymous);
        setVal('builder-field-name', s.respondent.anonymous ? 'required' : s.respondent.name);
        setVal('builder-field-aff', s.respondent.anonymous ? 'required' : s.respondent.affiliation);
        setVal('builder-field-contact', s.respondent.anonymous ? 'optional' : s.respondent.contact);
        syncRespondentFieldState();

        setVal('builder-thanks-msg', s.completion_message);
        setVal('builder-thanks-link', s.completion_link);
        setChk('builder-show-results', s.show_results_after_submit);
        setChk('builder-notify-each', s.notify_works_each);
        setChk('builder-notify-full', s.notify_works_full);

        builderQuestions = parsed.questions.map((q, idx) => ({
            ...q,
            id: isClone ? makeQuestionId(idx) : q.id,
            options: Array.isArray(q.options) ? [...q.options] : []
        }));

        renderBuilderQuestions();
        updateBuilderHeaderUI(isClone ? 'clone' : 'edit', count);

        const tabEl = document.getElementById('tab-forms');
        if (tabEl) tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast(isClone ? '폼을 복제해 불러왔습니다. 수정 후 발행하세요.' : '수정 모드로 불러왔습니다.', 'info');
    }

    // =========================================================================
    // 2. 발행 전 미리보기 & 저장된 폼 미리보기 (실제 form.html iframe)
    // =========================================================================
    function openPreviewModal(url, heading) {
        const modal = document.getElementById('preview-form-modal');
        const frame = document.getElementById('preview-form-iframe');
        const titleEl = document.getElementById('preview-form-modal-title');
        if (!modal || !frame) return;

        previewModalBaseUrl = url;
        if (titleEl) titleEl.textContent = heading || '폼 미리보기';
        setPreviewModalMode('page');
        modal.style.display = 'flex';
    }

    function setPreviewModalMode(mode) {
        const frame = document.getElementById('preview-form-iframe');
        const wrap = document.getElementById('preview-form-frame-wrap');
        const btnPage = document.getElementById('btn-preview-mode-page');
        const btnEmbed = document.getElementById('btn-preview-mode-embed');
        if (!frame || !previewModalBaseUrl) return;

        const isEmbed = mode === 'embed';
        if (btnPage) btnPage.classList.toggle('is-active', !isEmbed);
        if (btnEmbed) btnEmbed.classList.toggle('is-active', isEmbed);
        if (wrap) wrap.classList.toggle('is-embed-preview', isEmbed);

        const sep = previewModalBaseUrl.includes('?') ? '&' : '?';
        frame.src = previewModalBaseUrl + (isEmbed ? sep + 'embed=1' : sep + 'standalone=1');
    }

    function previewBuilderForm() {
        const payload = collectBuilderPayload();
        const draft = {
            id: editingFormId || 'preview_draft',
            title: payload.title || '(제목 미입력 초안 미리보기)',
            description: payload.description,
            is_active: true,
            max_participants: payload.max_participants,
            end_date: payload.end_date,
            prevent_duplicate: payload.prevent_duplicate,
            form_schema: payload.form_schema
        };
        try {
            sessionStorage.setItem('nk_form_preview_draft', JSON.stringify(draft));
        } catch (e) {
            return toast('브라우저 저장소 제한으로 미리보기를 열 수 없습니다.', 'error');
        }
        openPreviewModal('form.html?preview=1', '발행 전 미리보기 (초안)');
    }

    function previewSavedForm(formId) {
        const form = formsCache.find(f => String(f.id) === String(formId));
        openPreviewModal(`form.html?id=${encodeURIComponent(formId)}`, form ? `미리보기: ${form.title}` : '폼 미리보기');
    }

    // =========================================================================
    // 3. 등록된 폼 목록 (실시간 응답 수 · 진행률 · 검색/상태 필터 · 공유/QR)
    // =========================================================================
    async function loadAdminForms() {
        const listDiv = document.getElementById('admin-form-list');
        if (!listDiv) return;
        const sb = getSb();
        if (!sb) return;

       const formsRes = await sb.from('custom_forms').select('*').order('created_at', { ascending: false });

        if (formsRes.error) {
            listDiv.innerHTML = `<div style="color:#b3261e; padding:16px;">오류 발생: ${esc(formsRes.error.message)}</div>`;
            return;
        }

        formsCache = formsRes.data || [];
        responseCountMap = {};
       let offset = 0; const pageSize = 1000; let countError = null; while (true) { const { data, error } = await sb.from('form_responses').select('id, form_id, created_at').range(offset, offset + 999); if (error) { countError = error; break; } if (!Array.isArray(data) || data.length === 0) break; data.forEach(r => { const k = String(r.form_id); responseCountMap[k] = (responseCountMap[k] || 0) + 1; }); if (data.length < pageSize) break; offset += pageSize; } if (countError) toast('응답 수 집계 조회 오류: ' + countError.message, 'error');

        updateEditorFormInsertDropdown();
        renderFormsList();
    }

    function updateEditorFormInsertDropdown() {
        const selectEl = document.getElementById('form-insert-select');
        if (!selectEl) return;
        if (!formsCache.length) {
            selectEl.innerHTML = '<option value="">등록된 투표가 없습니다.</option>';
            return;
        }
        let html = '<option value="">삽입할 투표/신청서를 선택하세요</option>';
        const total = formsCache.length;
        formsCache.forEach((form, index) => {
            const st = F().getFormStatus(form, responseCountMap[String(form.id)] || 0);
            if (st.canSubmit) {
                html += `<option value="${esc(form.id)}">[No.${total - index}] ${esc(form.title)}</option>`;
            }
        });
        selectEl.innerHTML = html;
    }

    function renderFormsList() {
        const listDiv = document.getElementById('admin-form-list');
        const chipsDiv = document.getElementById('form-filter-chips');
        if (!listDiv) return;

        const counts = { all: formsCache.length, active: 0, urgent: 0, full: 0, expired: 0, manual_closed: 0 };
        formsCache.forEach(form => {
            const st = F().getFormStatus(form, responseCountMap[String(form.id)] || 0);
            if (counts[st.code] !== undefined) counts[st.code]++;
            if (st.isUrgent) counts.urgent++;
        });

        if (chipsDiv) {
            const filters = [
                ['all', '전체'],
                ['active', '진행중'],
                ['urgent', '마감·정원 임박'],
                ['full', '정원 마감'],
                ['expired', '기간 만료'],
                ['manual_closed', '수동 마감']
            ];
            chipsDiv.innerHTML = filters.map(([key, label]) => `
                <button type="button" class="nk-filter-chip ${currentFilter === key ? 'is-active' : ''}"
                        onclick="nkSetFormFilter('${key}')">
                    ${label} <span>${counts[key]}</span>
                </button>
            `).join('');
        }

        if (!formsCache.length) {
            listDiv.innerHTML = '<div style="text-align:center; padding:24px; color:#616161;">등록된 폼이 없습니다.</div>';
            return;
        }

        const query = (document.getElementById('form-search-input')?.value || '').trim().toLowerCase();
        const totalForms = formsCache.length;

        const filtered = formsCache
            .map((form, idx) => ({ form, displayNum: totalForms - idx, st: F().getFormStatus(form, responseCountMap[String(form.id)] || 0) }))
            .filter(({ form, st }) => {
                if (currentFilter === 'urgent' && !st.isUrgent) return false;
                if (currentFilter !== 'all' && currentFilter !== 'urgent' && st.code !== currentFilter) return false;
                if (query) {
                    const hay = `${form.title || ''} ${form.description || ''}`.toLowerCase();
                    if (!hay.includes(query)) return false;
                }
                return true;
            });

        if (!filtered.length) {
            listDiv.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b;">조건에 맞는 폼/투표가 없습니다.</div>';
            return;
        }

        const badgeColor = {
            active: '#15803d',
            full: '#b45309',
            expired: '#b3261e',
            manual_closed: '#64748b'
        };

        listDiv.innerHTML = filtered.map(({ form, displayNum, st }) => {
            const parsed = F().parseSchema(form.form_schema);
            const s = parsed.settings;
            const dateStr = form.created_at ? new Date(form.created_at).toISOString().split('T')[0] : '';
            const pct = st.max ? Math.min(100, Math.round((st.count / st.max) * 100)) : null;
            const barColor = st.code === 'full' ? '#b3261e' : st.isUrgent ? '#d97706' : '#1a3c6e';
            const fid = esc(String(form.id));

            return `
                <div class="nk-form-card">
                    <div class="nk-form-card-top">
                        <div class="nk-form-card-info">
                            <div class="nk-form-badges">
                                <span style="font-weight:700; color:#1a3c6e;">No.${displayNum}</span>
                                <span class="badge" style="background:${badgeColor[st.code] || '#64748b'}; color:#fff;">${st.label}</span>
                                ${st.isUrgent ? `<span class="badge" style="background:#fef3c7; color:#92400e;">${esc(st.urgentNote)}</span>` : ''}
                                <span class="nk-meta-pill">${s.respondent.anonymous ? '익명' : '실명'}</span>
                                ${form.prevent_duplicate ? '<span class="nk-meta-pill">중복방지</span>' : ''}
                                ${s.show_results_after_submit ? '<span class="nk-meta-pill is-blue">결과공개</span>' : ''}
                                ${(s.notify_works_each || s.notify_works_full) ? '<span class="nk-meta-pill is-purple">웍스알림</span>' : ''}
                                <span style="color:#64748b; font-size:0.82rem;">${dateStr}</span>
                            </div>
                            <div class="nk-form-card-title">${esc(form.title)}</div>
                            ${form.description ? `<div class="nk-form-card-desc">${esc(form.description)}</div>` : ''}
                        </div>

                        <div class="nk-form-progress-box">
                            <div class="nk-form-progress-head">
                                <span>응답 현황</span>
                                <strong>${st.count}명${st.max ? ` <small>/ ${st.max}명</small>` : ''}</strong>
                            </div>
                            ${pct !== null ? `
                                <div class="poll-progress-bg" style="height:8px; margin:6px 0;">
                                    <div class="poll-progress-bar" style="width:${pct}%; background:${barColor};"></div>
                                </div>
                                <div class="nk-form-progress-sub">
                                    <span>달성률 ${pct}%</span>
                                    <span>${st.seatsLeft > 0 ? `잔여 ${st.seatsLeft}자리` : '정원 도달'}</span>
                                </div>
                            ` : `<div class="nk-form-progress-sub"><span>정원 제한 없음 · 문항 ${parsed.questions.length}개</span></div>`}
                            ${form.end_date ? `<div class="nk-form-progress-deadline">마감: ${F().formatDateShort(form.end_date)}</div>` : ''}
                        </div>
                    </div>

                    <div class="nk-form-card-actions">
                        <div class="nk-form-action-group">
                            <button type="button" onclick="viewFormResults('${fid}')" class="btn-mini c-solid-primary"><svg class="ic"><use href="#i-chart"/></svg> 결과 확인 (${st.count})</button>
                            <button type="button" onclick="nkPreviewSavedForm('${fid}')" class="btn-mini c-soft"><svg class="ic"><use href="#i-eye"/></svg> 미리보기</button>
                            <button type="button" onclick="nkOpenShareForm('${fid}')" class="btn-mini c-soft"><svg class="ic"><use href="#i-qr"/></svg> 공유 · QR</button>
                        </div>
                        <div class="nk-form-action-group">
                            <button type="button" onclick="nkEditForm('${fid}')" class="btn-mini c-soft"><svg class="ic"><use href="#i-pencil"/></svg> 수정</button>
                            <button type="button" onclick="nkCloneForm('${fid}')" class="btn-mini c-soft"><svg class="ic"><use href="#i-copy"/></svg> 복제</button>
                            <button type="button" onclick="toggleFormStatus('${fid}', ${!form.is_active})" class="btn-mini c-soft">${form.is_active ? '마감하기' : '다시 열기'}</button>
                            <button type="button" onclick="deleteForm('${fid}')" class="btn-mini c-solid-danger">삭제</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function toggleFormStatus(id, newStatus) {
        loading(true);
        const { error } = await getSb().from('custom_forms').update({ is_active: newStatus }).eq('id', id);
        loading(false);
        if (error) return toast('상태 변경 실패: ' + error.message, 'error');
        toast(newStatus ? '폼을 다시 열었습니다.' : '폼을 마감했습니다.', 'success');
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
    }

    async function deleteForm(id) {
        if (!confirm('이 폼과 사용자들이 응답한 모든 결과 데이터가 함께 영구 삭제됩니다.\n정말 삭제하시겠습니까?')) return;
        loading(true); try {
        const { error } = await getSb().from('custom_forms').delete().eq('id', id);
   
        if (error) return toast('삭제 실패: ' + error.message, 'error');
        await logAct('DELETE_FORM', { id });
        toast('폼이 삭제되었습니다.', 'info');
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks(); } catch (err) { toast('삭제 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error'); } finally { loading(false); }
    }

    // =========================================================================
    // 4. 공유 · QR 코드 모달
    // =========================================================================
    function openShareFormModal(formId) {
        const form = formsCache.find(f => String(f.id) === String(formId));
        if (!form) return;
        const modal = document.getElementById('share-form-modal');
        const body = document.getElementById('share-form-modal-body');
        if (!modal || !body) return;

        const shareUrl = new URL(`form.html?id=${encodeURIComponent(form.id)}`, location.href).href;
        const shortcode = `[투표:${form.id}]`;
        const qrSvg = F().QR.toSVG(shareUrl, 200);
        const fid = esc(String(form.id));

        body.innerHTML = `
            <div style="font-weight:700; color:#1a3c6e; font-size:1.05rem; margin-bottom:14px;">${esc(form.title)}</div>
            <div class="nk-qr-box">
                <div id="nk-share-qr-svg" class="nk-qr-frame">${qrSvg}</div>
                <p style="font-size:0.82rem; color:#5c6b7a; margin:8px 0 12px; text-align:center;">안내문·가정통신문에 인쇄하거나 스마트폰 카메라로 바로 스캔할 수 있습니다.</p>
                <button type="button" class="adm-btn adm-btn-secondary adm-btn-sm" onclick="nkDownloadFormQr('${fid}')"><svg class="ic"><use href="#i-download"/></svg> QR 이미지(PNG) 저장</button>
            </div>
            <div class="form-group" style="margin-top:16px; margin-bottom:12px;">
                <label class="form-label" style="font-size:0.86rem;">참여 링크 (카톡 · 문자 안내용)</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" readonly class="form-input" id="nk-share-url-input" value="${esc(shareUrl)}" style="font-size:0.85rem;">
                    <button type="button" class="adm-btn adm-btn-primary adm-btn-sm" onclick="nkCopyInput('nk-share-url-input', '참여 링크를 복사했습니다.')">복사</button>
                </div>
            </div>
            <div class="form-group" style="margin-bottom:0;">
                <label class="form-label" style="font-size:0.86rem;">게시글 본문 삽입 코드</label>
                <div style="display:flex; gap:8px;">
                    <input type="text" readonly class="form-input" id="nk-share-code-input" value="${esc(shortcode)}" style="font-size:0.85rem;">
                    <button type="button" class="adm-btn adm-btn-secondary adm-btn-sm" onclick="nkCopyInput('nk-share-code-input', '게시글 삽입 코드를 복사했습니다.')">복사</button>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    }

    function downloadFormQrPng(formId) {
        const form = formsCache.find(f => String(f.id) === String(formId));
        const title = (form && form.title) ? form.title : 'form';
        const svgEl = document.querySelector('#nk-share-qr-svg svg');
        if (!svgEl) return;
        const svgStr = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, 480, 480);
            URL.revokeObjectURL(url);
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = `${title}_QR.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('QR 코드 PNG 이미지를 저장했습니다.', 'success');
        };
        img.src = url;
    }

    // =========================================================================
    // 5. 결과 모달 (통계/숫자집계/주관식 모아보기 · 표/필터 · 개별삭제 · 안전CSV)
    // =========================================================================
    async function viewFormResults(formId) {
        const modal = document.getElementById('result-modal');
        const contentDiv = document.getElementById('result-content');
        const statsSummaryDiv = document.getElementById('result-stats-summary');
        const titleEl = document.getElementById('form-result-modal-title');
        const subEl = document.getElementById('form-result-modal-sub');
        if (!modal || !contentDiv) return;

        modal.style.display = 'flex';
        contentDiv.innerHTML = '<div style="text-align:center; padding:40px; color:#616161;">응답 결과를 불러오는 중입니다...</div>';
        if (statsSummaryDiv) statsSummaryDiv.innerHTML = '';

        const sb = getSb();
        const [formRes, respRes] = await Promise.all([
            sb.from('custom_forms').select('*').eq('id', formId).single(),
            sb.from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false })
        ]);

        if (formRes.error || !formRes.data) {
            contentDiv.innerHTML = '<div style="color:#b3261e; text-align:center; padding:30px;">폼 정보를 불러오지 못했습니다.</div>';
            return;
        }
        if (respRes.error) {
            contentDiv.innerHTML = `<div style="color:#b3261e; text-align:center; padding:30px;">오류 발생: ${esc(respRes.error.message)}</div>`;
            return;
        }

        const formData = formRes.data;
        const responses = respRes.data || [];
        const parsed = F().parseSchema(formData.form_schema);

        resState = {
            formId: formId,
            form: formData,
            parsed: parsed,
            responses: responses,
            tab: 'summary'
        };

        // 기존 전역 Export 변수 호환 유지
        global.currentFormIdForExport = formId;
        global.currentFormTitleForExport = formData.title || '폼응답';

        const st = F().getFormStatus(formData, responses.length);
        if (titleEl) titleEl.innerHTML = `<svg class="ic"><use href="#i-chart"/></svg> ${esc(formData.title)}`;
        if (subEl) {
            const parts = [`상태: ${st.label}`, `총 ${responses.length}명`];
            if (st.max) parts.push(`정원 ${st.max}명`);
            if (formData.end_date) parts.push(`마감 ${F().formatDateShort(formData.end_date)}`);
            subEl.textContent = parts.join(' · ');
        }

        const searchEl = document.getElementById('res-search-input');
        if (searchEl) searchEl.value = '';
        populateResultFilters();
        setResultsTab('summary');
    }

    function populateResultFilters() {
        const qSel = document.getElementById('res-q-filter');
        const optSel = document.getElementById('res-opt-filter');
        if (!qSel || !optSel || !resState.parsed) return;
        const choiceQs = resState.parsed.questions.filter(q => q.type === 'radio' || q.type === 'checkbox');
        qSel.innerHTML = '<option value="">문항 필터 (전체)</option>' +
            choiceQs.map(q => `<option value="${esc(q.id)}">${esc(q.title)}</option>`).join('');
        optSel.style.display = 'none';
        optSel.innerHTML = '';
    }

    function onResultQuestionFilterChange() {
        const qSel = document.getElementById('res-q-filter');
        const optSel = document.getElementById('res-opt-filter');
        if (!qSel || !optSel || !resState.parsed) return;
        const qId = qSel.value;
        if (!qId) {
            optSel.style.display = 'none';
            optSel.innerHTML = '';
            renderResultsBody();
            return;
        }
        const q = resState.parsed.questions.find(x => x.id === qId);
        const opts = [...((q && q.options) || [])];
        if (q && q.allowOther) opts.push('__other__');
        optSel.innerHTML = '<option value="">선택지 전체</option>' +
            opts.map(o => `<option value="${esc(o)}">${o === '__other__' ? '기타(직접 입력)' : esc(o)}</option>`).join('');
        optSel.style.display = 'inline-block';
        renderResultsBody();
    }

    function setResultsTab(tab) {
        resState.tab = tab;
        document.querySelectorAll('.nk-res-tab-btn').forEach(btn => {
            btn.classList.toggle('is-active', btn.dataset.tab === tab);
        });
        const filterBar = document.getElementById('res-filter-bar');
        if (filterBar) filterBar.style.display = (tab === 'summary') ? 'none' : 'flex';
        renderResultsBody();
    }

    function getFilteredResponses() {
        const list = resState.responses || [];
        const qText = (document.getElementById('res-search-input')?.value || '').trim().toLowerCase();
        const filterQId = document.getElementById('res-q-filter')?.value || '';
        const filterOpt = document.getElementById('res-opt-filter')?.value || '';

        return list.filter(r => {
            if (filterQId && filterOpt) {
                const ans = r.answers ? r.answers[filterQId] : null;
                const vals = Array.isArray(ans) ? ans : (ans ? [ans] : []);
                if (filterOpt === '__other__') {
                    if (!vals.some(v => String(v).startsWith('기타:'))) return false;
                } else {
                    if (!vals.includes(filterOpt)) return false;
                }
            }
            if (qText) {
                const resp = F().parseRespondent(r);
                const ansText = Object.entries(r.answers || {})
                    .filter(([k]) => !k.startsWith('__'))
                    .map(([, v]) => Array.isArray(v) ? v.join(' ') : String(v || ''))
                    .join(' ');
                const hay = `${resp.affiliation} ${resp.name} ${resp.contact} ${r.respondent_info || ''} ${ansText}`.toLowerCase();
                if (!hay.includes(qText)) return false;
            }
            return true;
        });
    }

    function renderResultsBody() {
        const statsDiv = document.getElementById('result-stats-summary');
        const contentDiv = document.getElementById('result-content');
        if (!contentDiv || !resState.parsed) return;

        const responses = resState.responses || [];
        const questions = resState.parsed.questions || [];
        const isAnon = resState.parsed.settings.respondent.anonymous;

        if (!responses.length) {
            if (statsDiv) statsDiv.innerHTML = '';
            contentDiv.innerHTML = '<div style="text-align:center; padding:40px; color:#616161;">아직 제출된 투표/응답이 없습니다.</div>';
            return;
        }

        if (resState.tab === 'summary') {
            const choiceStats = F().computeChoiceStats(questions, responses);
            let html = '';

            questions.forEach((q, idx) => {
                if (q.type === 'radio' || q.type === 'checkbox') {
                    const st = choiceStats[q.id] || { counts: {}, others: [], totalVotes: 0 };
                    const rows = Object.entries(st.counts);
                    if (st.others.length) rows.push(['기타(직접 입력)', st.others.length]);

                    html += `<div class="poll-stat-box">`;
                    html += `<div style="font-weight:700; color:#1a3c6e; margin-bottom:10px;">Q${idx + 1}. ${esc(q.title)} <span style="font-size:0.82rem; font-weight:normal; color:#5c6b7a;">(총 ${st.totalVotes}표)</span></div>`;
                    rows.forEach(([opt, count]) => {
                        const pct = st.totalVotes > 0 ? Math.round((count / st.totalVotes) * 100) : 0;
                        html += `
                            <div class="poll-option-row">
                                <div class="poll-option-info">
                                    <span>${esc(opt)}</span>
                                    <span>${count}표 (${pct}%)</span>
                                </div>
                                <div class="poll-progress-bg"><div class="poll-progress-bar" style="width:${pct}%;"></div></div>
                            </div>`;
                    });
                    if (st.others.length) {
                        html += `<div class="nk-other-list"><div style="font-size:0.8rem; font-weight:700; color:#5c6b7a; margin-bottom:4px;">기타 직접 입력 상세</div>`;
                        st.others.forEach(o => {
                            html += `<div style="font-size:0.85rem; margin-bottom:2px;"><strong style="color:#1a3c6e;">[${esc(o.who)}]</strong> ${esc(o.text)}</div>`;
                        });
                        html += `</div>`;
                    }
                    html += `</div>`;
                } else if (q.type === 'number') {
                    const nums = responses
                        .map(r => r.answers ? r.answers[q.id] : null)
                        .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
                        .map(v => Number(v))
                        .filter(n => !isNaN(n));
                    const sum = nums.reduce((a, b) => a + b, 0);
                    const avg = nums.length ? (sum / nums.length).toFixed(1) : '0';
                    const min = nums.length ? Math.min(...nums) : 0;
                    const max = nums.length ? Math.max(...nums) : 0;
                    const u = q.unit || '';
                    html += `
                        <div class="poll-stat-box">
                            <div style="font-weight:700; color:#1a3c6e; margin-bottom:10px;">Q${idx + 1}. ${esc(q.title)} <span style="font-size:0.82rem; font-weight:normal; color:#5c6b7a;">(숫자 자동 집계 · ${nums.length}건)</span></div>
                            <div class="nk-num-grid">
                                <div class="nk-num-card"><span>합계</span><strong>${sum}${esc(u)}</strong></div>
                                <div class="nk-num-card"><span>평균</span><strong>${avg}${esc(u)}</strong></div>
                                <div class="nk-num-card"><span>최소</span><strong>${min}${esc(u)}</strong></div>
                                <div class="nk-num-card"><span>최대</span><strong>${max}${esc(u)}</strong></div>
                            </div>
                        </div>`;
                } else {
                    const textItems = responses
                        .map(r => ({
                            who: F().formatRespondentDisplay(F().parseRespondent(r)),
                            val: String((r.answers && r.answers[q.id]) || '').trim(),
                            at: r.created_at
                        }))
                        .filter(x => x.val);
                    html += `<div class="poll-stat-box">`;
                    html += `<div style="font-weight:700; color:#1a3c6e; margin-bottom:10px;">Q${idx + 1}. ${esc(q.title)} <span style="font-size:0.82rem; font-weight:normal; color:#5c6b7a;">(주관식/날짜 모아보기 · ${textItems.length}건)</span></div>`;
                    if (!textItems.length) {
                        html += '<div style="font-size:0.85rem; color:#64748b;">작성된 답변이 없습니다.</div>';
                    } else {
                        html += '<div class="nk-text-collect">';
                        textItems.forEach(item => {
                            html += `<div class="nk-text-collect-row"><div><strong style="color:#b85a17;">[${esc(item.who)}]</strong> ${esc(item.val)}</div><small>${F().formatDateShort(item.at)}</small></div>`;
                        });
                        html += '</div>';
                    }
                    html += `</div>`;
                }
            });

            if (statsDiv) statsDiv.innerHTML = html;
            contentDiv.innerHTML = '';
            return;
        }

        if (statsDiv) statsDiv.innerHTML = '';
        const filtered = getFilteredResponses();

        if (resState.tab === 'table') {
            let html = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                    <span style="font-size:0.88rem; color:#475569;">검색/필터 결과: <strong style="color:#1a3c6e;">${filtered.length}건</strong> (전체 ${responses.length}건)</span>
                    <button type="button" class="btn-mini c-soft" onclick="nkCopyFilteredList()"><svg class="ic"><use href="#i-copy"/></svg> 필터된 명단 복사</button>
                </div>`;
            if (!filtered.length) {
                contentDiv.innerHTML = html + '<div style="text-align:center; padding:30px; color:#64748b;">조건에 맞는 응답이 없습니다.</div>';
                return;
            }
            html += `<div class="nk-res-table-wrap"><table class="nk-res-table"><thead><tr><th>응답일시</th>`;
            if (isAnon) html += `<th>응답자</th>`;
            else html += `<th>소속</th><th>이름</th><th>연락처</th>`;
            questions.forEach((q, i) => { html += `<th>Q${i + 1}. ${esc(q.title)}</th>`; });
            html += `<th>관리</th></tr></thead><tbody>`;

            filtered.forEach(r => {
                const resp = F().parseRespondent(r);
                const rid = esc(String(r.id));
                html += `<tr><td style="white-space:nowrap;">${F().formatDateShort(r.created_at)}</td>`;
                if (isAnon) html += `<td>익명</td>`;
                else {
                    html += `<td style="white-space:nowrap; font-weight:600;">${esc(resp.affiliation || '-')}</td>`;
                    html += `<td style="white-space:nowrap;">${esc(resp.name || '-')}</td>`;
                    html += `<td style="white-space:nowrap;">${esc(resp.contact || '-')}</td>`;
                }
                questions.forEach(q => {
                    const ans = r.answers ? r.answers[q.id] : '';
                    const txt = Array.isArray(ans) ? ans.join(', ') : (ans !== null && ans !== undefined ? String(ans) : '');
                    html += `<td>${txt !== '' ? esc(txt) : '<span style="color:#94a3b8;">-</span>'}</td>`;
                });
                html += `<td style="text-align:center; white-space:nowrap;"><button type="button" class="btn-mini c-solid-danger" onclick="nkDeleteFormResponse('${rid}')">삭제</button></td></tr>`;
            });
            html += `</tbody></table></div>`;
            contentDiv.innerHTML = html;
            return;
        }

        // 개별 카드 보기
        let html = `<div style="margin-bottom:12px; font-size:0.9rem; font-weight:700; color:#1a3c6e;">검색/필터 결과: ${filtered.length}건</div>`;
        if (!filtered.length) {
            contentDiv.innerHTML = html + '<div style="text-align:center; padding:30px; color:#64748b;">조건에 맞는 응답이 없습니다.</div>';
            return;
        }
        filtered.forEach((res, idx) => {
            const resp = F().parseRespondent(res);
            const label = F().formatRespondentDisplay(resp);
            const rid = esc(String(res.id));
            html += `
                <div class="nk-res-card">
                    <div class="nk-res-card-head">
                        <div>
                            <strong>응답 #${filtered.length - idx}</strong>
                            <span style="color:#b85a17; font-weight:700; margin-left:6px;">[${esc(label)}]</span>
                            ${resp.contact ? `<span style="color:#475569; margin-left:6px;">${esc(resp.contact)}</span>` : ''}
                            <span style="color:#64748b; margin-left:8px; font-size:0.84rem;">${F().formatDateShort(res.created_at)}</span>
                        </div>
                        <button type="button" class="btn-mini c-solid-danger" onclick="nkDeleteFormResponse('${rid}')"><svg class="ic"><use href="#i-trash"/></svg> 삭제</button>
                    </div>`;
            questions.forEach((q, qi) => {
                const ans = res.answers ? res.answers[q.id] : '';
                let displayAns = '<span style="color:#94a3b8;">(미응답)</span>';
                if (Array.isArray(ans) && ans.length) displayAns = esc(ans.join(', '));
                else if (ans !== null && ans !== undefined && String(ans).trim() !== '') displayAns = esc(String(ans));
                html += `
                    <div style="margin-bottom:8px;">
                        <div style="font-size:0.83rem; color:#5c6b7a;">Q${qi + 1}. ${esc(q.title)}</div>
                        <div style="font-weight:600; color:#222; white-space:pre-line;">A. ${displayAns}</div>
                    </div>`;
            });
            html += `</div>`;
        });
        contentDiv.innerHTML = html;
    }

    async function deleteSingleFormResponse(responseId) {
        if (!confirm('이 개별 응답 1건을 영구 삭제하시겠습니까?\n삭제 시 통계와 정원 현황이 즉시 재계산됩니다.')) return;
        loading(true); try {
        const { data, error } = await getSb().from('form_responses').delete().eq('id', responseId).select('id');
   
        if (error) {
            return toast('응답 삭제 실패: ' + error.message, 'error');
        }
        if (!data || !data.length) {
            return toast('삭제 권한(RLS 정책)이 없어 삭제되지 않았습니다. supabase 마이그레이션을 적용해 주세요.', 'error');
        }
        await logAct('DELETE_FORM_RESPONSE', { form_id: resState.formId, response_id: responseId });
        toast('개별 응답 1건을 삭제했습니다.', 'success');
        resState.responses = resState.responses.filter(r => String(r.id) !== String(responseId));
        if (resState.form) {
            const st = F().getFormStatus(resState.form, resState.responses.length);
            const subEl = document.getElementById('form-result-modal-sub');
            if (subEl) {
                const parts = [`상태: ${st.label}`, `총 ${resState.responses.length}명`];
                if (st.max) parts.push(`정원 ${st.max}명`);
                if (resState.form.end_date) parts.push(`마감 ${F().formatDateShort(resState.form.end_date)}`);
                subEl.textContent = parts.join(' · ');
            }
        }
        renderResultsBody();
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks(); } catch (err) { console.error(err); toast('응답 삭제 중 오류가 발생했습니다.', 'error'); } finally { loading(false); }
    }

    function copyResultsSummary() {
        if (!resState.form || !resState.parsed) return;
        const responses = resState.responses || [];
        const questions = resState.parsed.questions || [];
        const isAnon = resState.parsed.settings.respondent.anonymous;
        const choiceStats = F().computeChoiceStats(questions, responses);

        const lines = [`[${resState.form.title}] 응답 요약 (총 ${responses.length}명)`, ''];
        questions.forEach((q, idx) => {
            if (q.type === 'radio' || q.type === 'checkbox') {
                const st = choiceStats[q.id] || { counts: {}, others: [], totalVotes: 0 };
                lines.push(`${idx + 1}. ${q.title}`);
                Object.entries(st.counts).forEach(([opt, c]) => {
                    const pct = st.totalVotes ? Math.round((c / st.totalVotes) * 100) : 0;
                    lines.push(` - ${opt}: ${c}표 (${pct}%)`);
                });
                if (st.others.length) lines.push(` - 기타(직접 입력): ${st.others.length}표`);
                lines.push('');
            }
        });
        if (!isAnon && responses.length) {
            lines.push('■ 참여 명단');
            responses.forEach((r, i) => {
                const resp = F().parseRespondent(r);
                const label = F().formatRespondentDisplay(resp);
                const contact = resp.contact ? ` (${resp.contact})` : '';
                lines.push(`${i + 1}. ${label}${contact}`);
            });
        }
        copyToClipboard(lines.join('\n'), '결과 요약 및 명단을 복사했습니다.');
    }

    function copyFilteredList() {
        const filtered = getFilteredResponses();
        if (!filtered.length) return toast('복사할 명단이 없습니다.', 'error');
        const lines = filtered.map((r, i) => {
            const resp = F().parseRespondent(r);
            const label = F().formatRespondentDisplay(resp);
            const contact = resp.contact ? ` (${resp.contact})` : '';
            return `${i + 1}. ${label}${contact}`;
        });
        copyToClipboard(lines.join('\n'), `필터된 명단 ${filtered.length}건을 복사했습니다.`);
    }

    async function exportFormResultsToCSV(formId, formTitle) { try {
        const sb = getSb();
        let formData = (resState.form && String(resState.formId) === String(formId)) ? resState.form : null;
        let responses = (resState.form && String(resState.formId) === String(formId)) ? resState.responses : null;

        if (!formData || !responses) {
            const [fRes, rRes] = await Promise.all([
                sb.from('custom_forms').select('*').eq('id', formId).single(),
                sb.from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false })
            ]); if (fRes.error || !fRes.data) return toast('폼 정보를 불러오지 못해 CSV를 추출할 수 없습니다.', 'error');
            if (rRes.error || !rRes.data || !rRes.data.length) return toast('추출할 데이터가 없습니다.', 'error');
            formData = fRes.data;
            responses = rRes.data;
        }
        if (!responses.length) return toast('추출할 데이터가 없습니다.', 'error');

        const parsed = F().parseSchema(formData.form_schema);
        const questions = parsed.questions;
        const isAnon = parsed.settings.respondent.anonymous;

        const headers = isAnon
            ? ['응답일시', '응답자', ...questions.map(q => q.title)]
            : ['응답일시', '소속', '이름', '연락처', ...questions.map(q => q.title)];

        const lines = [headers.map(F().csvCell).join(',')];
        responses.forEach(res => {
            const resp = F().parseRespondent(res);
            const base = isAnon
                ? [F().formatDateShort(res.created_at), '익명']
                : [F().formatDateShort(res.created_at), resp.affiliation, resp.name, resp.contact];
            const cols = questions.map(q => {
                const ans = res.answers ? res.answers[q.id] : '';
                return Array.isArray(ans) ? ans.join(', ') : (ans ?? '');
            });
            lines.push([...base, ...cols].map(F().csvCell).join(','));
        });

        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${formTitle || formData.title || '폼응답'}_응답결과.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('소속/이름/연락처 분리 및 수식 방지 적용 CSV를 다운로드했습니다.', 'success'); } catch (err) { toast('CSV 추출 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error'); }
    }

    // =========================================================================
    // 전역 바인딩
    // =========================================================================
    global.addQuestionBlock = addQuestionBlock;
    global.saveCustomForm = saveCustomForm;
    global.loadAdminForms = loadAdminForms;
    global.toggleFormStatus = toggleFormStatus;
    global.deleteForm = deleteForm;
    global.viewFormResults = viewFormResults;
    global.exportFormResultsToCSV = exportFormResultsToCSV;

    global.nkResetFormBuilder = resetFormBuilder;
    global.nkSyncRespondentFieldState = syncRespondentFieldState;
    global.nkFormUpdateQ = updateQuestionField;
    global.nkFormMoveQ = moveQuestionBlock;
    global.nkFormDupQ = duplicateQuestionBlock;
    global.nkFormDelQ = removeQuestionBlock;
    global.nkFormAddOpt = addOptionRow;
    global.nkFormDelOpt = removeOptionRow;
    global.nkFormBulkOpts = bulkPasteOptions;
    global.nkFormUpdateOpt = (qIdx, oIdx, val) => {
        if (builderQuestions[qIdx] && Array.isArray(builderQuestions[qIdx].options)) {
            builderQuestions[qIdx].options[oIdx] = val;
        }
    };
    global.nkSetFormFilter = (key) => { currentFilter = key; renderFormsList(); };
    global.nkRenderFormsList = renderFormsList;
    global.nkEditForm = (id) => loadFormIntoBuilder(id, false);
    global.nkCloneForm = (id) => loadFormIntoBuilder(id, true);
    global.nkPreviewBuilderForm = previewBuilderForm;
    global.nkPreviewSavedForm = previewSavedForm;
    global.nkSetPreviewModalMode = setPreviewModalMode;
    global.nkOpenShareForm = openShareFormModal;
    global.nkDownloadFormQr = downloadFormQrPng;
    global.nkCopyInput = (inputId, msg) => {
        const el = document.getElementById(inputId);
        if (el) copyToClipboard(el.value, msg);
    };
    global.nkSetResultsTab = setResultsTab;
    global.nkOnResultQFilter = onResultQuestionFilterChange;
    global.nkRenderResultsBody = renderResultsBody;
    global.nkDeleteFormResponse = deleteSingleFormResponse;
    global.nkCopyResultsSummary = copyResultsSummary;
    global.nkCopyFilteredList = copyFilteredList;

    global.nkOpenFormsFiltered = function (filterKey) {
        currentFilter = filterKey || 'all';
        const nav = document.querySelector('.nav-item[onclick*="\'forms\'"]');
        if (typeof global.switchTab === 'function') global.switchTab('forms', nav);
        loadAdminForms();
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (!builderQuestions.length) renderBuilderQuestions();
        syncRespondentFieldState();
    });
})(window);
