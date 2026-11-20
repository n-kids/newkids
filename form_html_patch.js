// ============================================================================
// [form.html] 764~772행 교체 코드
// 수정 내용: max_participants가 설정된 폼에서 fetchPublicStats가 실패(count: null)하면
// 0으로 폴백하지 않고 제출을 차단해 정원 초과 우회를 방지합니다.
// ============================================================================

            if (currentFormData.max_participants || currentFormData.end_date) {
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
            }
