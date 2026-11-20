// ============================================================================
// [admin-forms.js] 수정 블록 모음
// 1) loadAdminForms: 1,000행 제한 해결(페이지네이션) + respRes.error 검증
// 2) saveCustomForm / deleteForm / deleteSingleFormResponse: try/catch/finally로 로딩 멈춤 방지
// 3) renderResultsBody(테이블 보기): 숫자 0이 '-'로 표시되는 버그 수정
// 4) exportFormResultsToCSV: fRes.error / !fRes.data 검증 추가 + 예외 처리
// ============================================================================

// [1] loadAdminForms (539~566행 교체)
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

        // Supabase 기본 1,000행 제한을 우회하기 위해 페이지네이션으로 전체 응답 집계
        const PAGE_SIZE = 1000;
        let offset = 0;
        let countError = null;
        while (true) {
            const { data, error } = await sb
                .from('form_responses')
                .select('id, form_id')
                .range(offset, offset + PAGE_SIZE - 1);
            if (error) {
                countError = error;
                break;
            }
            if (!Array.isArray(data) || data.length === 0) break;
            data.forEach(r => {
                const k = String(r.form_id);
                responseCountMap[k] = (responseCountMap[k] || 0) + 1;
            });
            if (data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        if (countError) {
            toast('응답 수 집계 조회 중 오류가 발생했습니다: ' + countError.message, 'error');
        }

        updateEditorFormInsertDropdown();
        renderFormsList();
    }

// [2] saveCustomForm (387~433행 교체)
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

        loading(true);
        try {
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
        } catch (err) {
            toast('저장 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
            loading(false);
        }
    }

// [3] deleteForm (719~729행 교체)
    async function deleteForm(id) {
        if (!confirm('이 폼과 사용자들이 응답한 모든 결과 데이터가 함께 영구 삭제됩니다.\n정말 삭제하시겠습니까?')) return;
        loading(true);
        try {
            const { error } = await getSb().from('custom_forms').delete().eq('id', id);
            if (error) return toast('삭제 실패: ' + error.message, 'error');
            await logAct('DELETE_FORM', { id });
            toast('폼이 삭제되었습니다.', 'info');
            await loadAdminForms();
            if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
        } catch (err) {
            toast('삭제 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
            loading(false);
        }
    }

// [4] deleteSingleFormResponse (1103~1130행 교체)
    async function deleteSingleFormResponse(responseId) {
        if (!confirm('이 개별 응답 1건을 영구 삭제하시겠습니까?\n삭제 시 통계와 정원 현황이 즉시 재계산됩니다.')) return;
        loading(true);
        try {
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
            if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
        } catch (err) {
            toast('응답 삭제 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
            loading(false);
        }
    }

// [5] renderResultsBody 테이블 보기 (1056~1060행 교체)
                questions.forEach(q => {
                    const ans = r.answers ? r.answers[q.id] : null;
                    const txt = Array.isArray(ans)
                        ? ans.join(', ')
                        : (ans !== null && ans !== undefined ? String(ans) : '');
                    html += `<td>${txt !== '' ? esc(txt) : '<span style="color:#94a3b8;">-</span>'}</td>`;
                });

// [6] exportFormResultsToCSV (1176~1223행 교체)
    async function exportFormResultsToCSV(formId, formTitle) {
        const sb = getSb();
        let formData = (resState.form && String(resState.formId) === String(formId)) ? resState.form : null;
        let responses = (resState.form && String(resState.formId) === String(formId)) ? resState.responses : null;

        try {
            if (!formData || !responses) {
                const [fRes, rRes] = await Promise.all([
                    sb.from('custom_forms').select('*').eq('id', formId).single(),
                    sb.from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false })
                ]);
                if (fRes.error || !fRes.data) {
                    return toast('폼 정보를 불러오지 못해 CSV를 추출할 수 없습니다.', 'error');
                }
                if (rRes.error || !rRes.data || !rRes.data.length) {
                    return toast('추출할 데이터가 없습니다.', 'error');
                }
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
            toast('소속/이름/연락처 분리 및 수식 방지 적용 CSV를 다운로드했습니다.', 'success');
        } catch (err) {
            toast('CSV 추출 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error');
        }
    }
