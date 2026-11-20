#!/usr/bin/env python3
"""
뉴키즈(n-kids/newkids) 폼/투표 1·2번 버그 자동 패치 스크립트
사용법: 로컬 newkids 저장소 루트 폴더에서 `python3 apply_forms_bugfix.py` 실행
- 각 원본 파일의 .bak 백업을 자동 생성한 뒤 정확한 블록만 안전하게 교체합니다.
"""
import os
import shutil
import sys


def patch_file(path, replacements):
    if not os.path.exists(path):
        print(f"[SKIP] 파일 없음: {path}")
        return False
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    # 줄바꿈 정규화(CRLF 지원)
    eol = "\r\n" if "\r\n" in src else "\n"
    norm = src.replace("\r\n", "\n")

    for label, old, new in replacements:
        if old not in norm:
            print(f"[WARN] {path} -> '{label}' 대상 블록을 찾지 못했습니다 (이미 수정되었거나 버전이 다름).")
            return False
        norm = norm.replace(old, new, 1)
        print(f"[OK] {path} -> {label}")

    shutil.copy2(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(norm.replace("\n", eol))
    return True


def main():
    # 1. form.html
    patch_file("form.html", [
        (
            "정원 초과 우회 방지 (count null 체크)",
            """            if (currentFormData.max_participants || currentFormData.end_date) {
                const latestStats = await fetchPublicStats(currentFormId, false);
                const checkCount = typeof latestStats.count === 'number' ? latestStats.count : 0;
                const liveSt = window.NKForms.getFormStatus(currentFormData, checkCount);
                if (!liveSt.canSubmit) {
                    renderClosedScreen(`${liveSt.label}된 폼입니다.`, liveSt.reason, settings.show_results_after_submit);
                    return;
                }
            }""",
            """            if (currentFormData.max_participants || currentFormData.end_date) {
                const latestStats = await fetchPublicStats(currentFormId, false);
                if (currentFormData.max_participants && typeof latestStats.count !== 'number') {
                    alert('현재 참여 인원을 확인할 수 없어 제출을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.');
                    return;
                }
                const liveSt = window.NKForms.getFormStatus(currentFormData, latestStats.count);
                if (!liveSt.canSubmit) {
                    renderClosedScreen(`${liveSt.label}된 폼입니다.`, liveSt.reason, settings.show_results_after_submit);
                    return;
                }
            }""",
        )
    ])

    # 2. form-shared.js
    patch_file("form-shared.js", [
        (
            "getFormStatus null 오판 방지",
            """    function getFormStatus(form, responseCount) {
        const count = Number.isFinite(Number(responseCount)) ? Number(responseCount) : 0;
        const max = form && form.max_participants ? Number(form.max_participants) : null;
        const endTs = form && form.end_date ? new Date(form.end_date).getTime() : null;
        const now = Date.now();

        if (!form || !form.is_active) {
            return {
                code: 'manual_closed',
                label: '수동 마감',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: max ? Math.max(0, max - count) : null,
                hoursLeft: null,
                isUrgent: false,
                urgentNote: '',
                reason: '현재 응답 접수가 마감되었습니다.'
            };
        }

        if (endTs && !isNaN(endTs) && endTs <= now) {
            return {
                code: 'expired',
                label: '기간 만료',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: max ? Math.max(0, max - count) : null,
                hoursLeft: 0,
                isUrgent: false,
                urgentNote: '',
                reason: `신청 마감 일시(${formatDateShort(form.end_date)})가 지났습니다.`
            };
        }

        if (max && max > 0 && count >= max) {
            return {
                code: 'full',
                label: '정원 마감',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: 0,
                hoursLeft: endTs ? Math.max(0, (endTs - now) / 3600000) : null,
                isUrgent: false,
                urgentNote: '',
                reason: `선착순 정원(${max}명)이 모두 마감되었습니다.`
            };
        }""",
            """    function getFormStatus(form, responseCount) {
        const hasCount = responseCount !== null && responseCount !== undefined && responseCount !== '' && Number.isFinite(Number(responseCount));
        const count = hasCount ? Number(responseCount) : 0;
        const max = form && form.max_participants ? Number(form.max_participants) : null;
        const endTs = form && form.end_date ? new Date(form.end_date).getTime() : null;
        const now = Date.now();

        if (!form || !form.is_active) {
            return {
                code: 'manual_closed',
                label: '수동 마감',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: (max && hasCount) ? Math.max(0, max - count) : null,
                hoursLeft: null,
                isUrgent: false,
                urgentNote: '',
                reason: '현재 응답 접수가 마감되었습니다.'
            };
        }

        if (endTs && !isNaN(endTs) && endTs <= now) {
            return {
                code: 'expired',
                label: '기간 만료',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: (max && hasCount) ? Math.max(0, max - count) : null,
                hoursLeft: 0,
                isUrgent: false,
                urgentNote: '',
                reason: `신청 마감 일시(${formatDateShort(form.end_date)})가 지났습니다.`
            };
        }

        if (max && max > 0 && !hasCount) {
            return {
                code: 'count_unavailable',
                label: '인원 확인 불가',
                canSubmit: false,
                count: null,
                max: max,
                seatsLeft: null,
                hoursLeft: endTs ? Math.max(0, (endTs - now) / 3600000) : null,
                isUrgent: false,
                urgentNote: '',
                reason: '현재 참여 인원을 불러오지 못해 제출을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.'
            };
        }

        if (max && max > 0 && count >= max) {
            return {
                code: 'full',
                label: '정원 마감',
                canSubmit: false,
                count: count,
                max: max,
                seatsLeft: 0,
                hoursLeft: endTs ? Math.max(0, (endTs - now) / 3600000) : null,
                isUrgent: false,
                urgentNote: '',
                reason: `선착순 정원(${max}명)이 모두 마감되었습니다.`
            };
        }""",
        ),
        (
            "QR URL 조용한 잘림 방지",
            """        function encode(text) {
            const bytes = new TextEncoder().encode(String(text || ''));
            let ver = 1;
            while (ver <= 5 && bytes.length + 2 > SPECS[ver].dataCw) ver++;
            if (ver > 5) ver = 5;
            const spec = SPECS[ver];
            const payload = bytes.slice(0, spec.dataCw - 2);""",
            """        function encode(text) {
            const bytes = new TextEncoder().encode(String(text || ''));
            let ver = 1;
            while (ver <= 5 && bytes.length + 2 > SPECS[ver].dataCw) ver++;
            if (ver > 5) {
                throw new RangeError(`QR 코드로 인코딩할 URL이 너무 깁니다 (${bytes.length} bytes, 최대 ${SPECS[5].dataCw - 2} bytes).`);
            }
            const spec = SPECS[ver];
            const payload = bytes;""",
        ),
    ])

    # 3. admin-forms.js
    patch_file("admin-forms.js", [
        (
            "saveCustomForm try/catch/finally",
            """        loading(true);
        let res;
        if (isEdit) {
            res = await getSb().from('custom_forms').update(dbRow).eq('id', editingFormId);
        } else {
            dbRow.is_active = true;
            res = await getSb().from('custom_forms').insert([dbRow]);
        }
        loading(false);

        if (res.error) {
            return toast('저장 실패: ' + res.error.message, 'error');
        }

        await logAct(isEdit ? 'UPDATE_FORM' : 'CREATE_FORM', { id: editingFormId || null, title: payload.title });
        toast(isEdit ? '폼 수정 내용이 저장되었습니다!' : '폼이 성공적으로 발행되었습니다!', 'success');
        resetFormBuilder(true);
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();""",
            """        loading(true);
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
        }""",
        ),
        (
            "loadAdminForms 1000행 페이지네이션 및 에러 체크",
            """        const [formsRes, respRes] = await Promise.all([
            sb.from('custom_forms').select('*').order('created_at', { ascending: false }),
            sb.from('form_responses').select('id, form_id, created_at')
        ]);

        if (formsRes.error) {
            listDiv.innerHTML = `<div style="color:#b3261e; padding:16px;">오류 발생: ${esc(formsRes.error.message)}</div>`;
            return;
        }

        formsCache = formsRes.data || [];
        responseCountMap = {};
        if (!respRes.error && Array.isArray(respRes.data)) {
            respRes.data.forEach(r => {
                const k = String(r.form_id);
                responseCountMap[k] = (responseCountMap[k] || 0) + 1;
            });
        }""",
            """        const formsRes = await sb.from('custom_forms').select('*').order('created_at', { ascending: false });

        if (formsRes.error) {
            listDiv.innerHTML = `<div style="color:#b3261e; padding:16px;">오류 발생: ${esc(formsRes.error.message)}</div>`;
            return;
        }

        formsCache = formsRes.data || [];
        responseCountMap = {};
        const PAGE_SIZE = 1000;
        let offset = 0;
        let countError = null;
        while (true) {
            const { data, error } = await sb
                .from('form_responses')
                .select('id, form_id')
                .range(offset, offset + PAGE_SIZE - 1);
            if (error) { countError = error; break; }
            if (!Array.isArray(data) || !data.length) break;
            data.forEach(r => {
                const k = String(r.form_id);
                responseCountMap[k] = (responseCountMap[k] || 0) + 1;
            });
            if (data.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }
        if (countError) {
            toast('응답 수 집계 조회 오류: ' + countError.message, 'error');
        }""",
        ),
        (
            "deleteForm try/catch/finally",
            """        loading(true);
        const { error } = await getSb().from('custom_forms').delete().eq('id', id);
        loading(false);
        if (error) return toast('삭제 실패: ' + error.message, 'error');
        await logAct('DELETE_FORM', { id });
        toast('폼이 삭제되었습니다.', 'info');
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();""",
            """        loading(true);
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
        }""",
        ),
        (
            "renderResultsBody 테이블 보기 숫자 0 표시 수정",
            """                questions.forEach(q => {
                    const ans = r.answers ? r.answers[q.id] : '';
                    const txt = Array.isArray(ans) ? ans.join(', ') : String(ans || '');
                    html += `<td>${txt ? esc(txt) : '<span style="color:#94a3b8;">-</span>'}</td>`;
                });""",
            """                questions.forEach(q => {
                    const ans = r.answers ? r.answers[q.id] : null;
                    const txt = Array.isArray(ans) ? ans.join(', ') : (ans !== null && ans !== undefined ? String(ans) : '');
                    html += `<td>${txt !== '' ? esc(txt) : '<span style="color:#94a3b8;">-</span>'}</td>`;
                });""",
        ),
        (
            "deleteSingleFormResponse try/catch/finally",
            """        loading(true);
        const { data, error } = await getSb().from('form_responses').delete().eq('id', responseId).select('id');
        loading(false);

        if (error) {
            return toast('응답 삭제 실패: ' + error.message, 'error');
        }
        if (!data || !data.length) {
            return toast('삭제 권한(RLS 정책)이 없어 삭제되지 않았습니다. supabase 마이그레이션을 적용해 주세요.', 'error');
        }""",
            """        loading(true);
        try {
            const { data, error } = await getSb().from('form_responses').delete().eq('id', responseId).select('id');
            if (error) {
                return toast('응답 삭제 실패: ' + error.message, 'error');
            }
            if (!data || !data.length) {
                return toast('삭제 권한(RLS 정책)이 없어 삭제되지 않았습니다. supabase 마이그레이션을 적용해 주세요.', 'error');
            }""",
        ),
        (
            "deleteSingleFormResponse finally 닫기",
            """        renderResultsBody();
        await loadAdminForms();
        if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
    }""",
            """            renderResultsBody();
            await loadAdminForms();
            if (typeof global.nkRefreshDashboardTasks === 'function') global.nkRefreshDashboardTasks();
        } catch (err) {
            toast('응답 삭제 중 오류가 발생했습니다: ' + (err && err.message ? err.message : String(err)), 'error');
        } finally {
            loading(false);
        }
    }""",
        ),
        (
            "exportFormResultsToCSV fRes 검증 추가",
            """            if (rRes.error || !rRes.data || !rRes.data.length) return toast('추출할 데이터가 없습니다.', 'error');
            formData = fRes.data;
            responses = rRes.data;""",
            """            if (fRes.error || !fRes.data) return toast('폼 정보를 불러오지 못해 CSV를 추출할 수 없습니다.', 'error');
            if (rRes.error || !rRes.data || !rRes.data.length) return toast('추출할 데이터가 없습니다.', 'error');
            formData = fRes.data;
            responses = rRes.data;""",
        ),
    ])


if __name__ == "__main__":
    main()
