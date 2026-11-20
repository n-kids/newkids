// ============================================================================
// [form-shared.js] 1) getFormStatus (197~278행) 교체 코드
// 수정 내용: responseCount가 null/undefined일 때 Number(null) === 0으로 오판하지 않도록 보완
// ============================================================================
    function getFormStatus(form, responseCount) {
        const hasCount = responseCount !== null && responseCount !== undefined && responseCount !== '' && Number.isFinite(Number(responseCount));
        const count = hasCount ? Number(responseCount) : null;
        const safeCount = hasCount ? count : 0;
        const max = form && form.max_participants ? Number(form.max_participants) : null;
        const endTs = form && form.end_date ? new Date(form.end_date).getTime() : null;
        const now = Date.now();

        if (!form || !form.is_active) {
            return {
                code: 'manual_closed',
                label: '수동 마감',
                canSubmit: false,
                count: safeCount,
                max: max,
                seatsLeft: (max && hasCount) ? Math.max(0, max - safeCount) : null,
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
                count: safeCount,
                max: max,
                seatsLeft: (max && hasCount) ? Math.max(0, max - safeCount) : null,
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

        if (max && max > 0 && safeCount >= max) {
            return {
                code: 'full',
                label: '정원 마감',
                canSubmit: false,
                count: safeCount,
                max: max,
                seatsLeft: 0,
                hoursLeft: endTs ? Math.max(0, (endTs - now) / 3600000) : null,
                isUrgent: false,
                urgentNote: '',
                reason: `선착순 정원(${max}명)이 모두 마감되었습니다.`
            };
        }

        const seatsLeft = (max && max > 0) ? (max - safeCount) : null;
        const hoursLeft = (endTs && !isNaN(endTs)) ? (endTs - now) / 3600000 : null;
        const nearQuota = Boolean(max && max > 0 && (seatsLeft <= 3 || (safeCount / max) >= 0.8));
        const nearDeadline = Boolean(hoursLeft !== null && hoursLeft <= 72);
        const isUrgent = nearQuota || nearDeadline;
        let urgentNote = '';
        if (nearQuota && nearDeadline) {
            urgentNote = `잔여 ${seatsLeft}자리 · 마감 ${Math.max(1, Math.round(hoursLeft))}시간 전`;
        } else if (nearQuota) {
            urgentNote = `잔여 ${seatsLeft}자리`;
        } else if (nearDeadline) {
            urgentNote = `마감 ${Math.max(1, Math.round(hoursLeft))}시간 전`;
        }

        return {
            code: 'active',
            label: '진행중',
            canSubmit: true,
            count: safeCount,
            max: max,
            seatsLeft: seatsLeft,
            hoursLeft: hoursLeft,
            isUrgent: isUrgent,
            urgentNote: urgentNote,
            reason: ''
        };
    }

// ============================================================================
// [form-shared.js] 2) QR 코드 encode(text) (381~398행) 교체 코드
// 수정 내용: 최대 용량(106바이트) 초과 시 조용히 URL을 잘라내지 않고 명시적 오류를 발생시켜
// 깨진 QR 코드가 생성되는 것을 방지합니다.
// ============================================================================
        function encode(text) {
            const bytes = new TextEncoder().encode(String(text || ''));
            let ver = 1;
            while (ver <= 5 && bytes.length + 2 > SPECS[ver].dataCw) ver++;
            if (ver > 5) {
                throw new RangeError(
                    `QR 코드로 인코딩할 URL이 너무 깁니다 (${bytes.length} bytes, 최대 ${SPECS[5].dataCw - 2} bytes). 짧은 URL을 사용해 주세요.`
                );
            }
            const spec = SPECS[ver];
            const payload = bytes;
            const bits = [];
            const pushBits = (val, len) => {
                for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
            };
            pushBits(0b0100, 4);
            pushBits(payload.length, 8);
            payload.forEach(b => pushBits(b, 8));
            const capBits = spec.dataCw * 8;
            pushBits(0, Math.min(4, capBits - bits.length));
            while (bits.length % 8 !== 0) bits.push(0);
