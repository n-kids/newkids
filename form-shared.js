/* =========================================
   뉴키즈 폼/투표 공용 모듈 (form-shared.js)
   admin.html · form.html · admin-convenience.js 공용
   ========================================= */
(function (global) {
    'use strict';

    const WORKS_BOT_URL = 'https://newkids-bot.onrender.com';

    const DEFAULT_SETTINGS = {
        respondent: {
            anonymous: false,
            name: 'required',
            affiliation: 'required',
            contact: 'optional'
        },
        completion_message: '응답이 성공적으로 제출되었습니다. 참여해 주셔서 감사합니다!',
        completion_link: '',
        show_results_after_submit: false,
        notify_works_each: false,
        notify_works_full: false
    };

    function escapeHtml(text) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(text);
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeQuestion(q, idx) {
        const type = ['text', 'textarea', 'radio', 'checkbox', 'number', 'date'].includes(q && q.type)
            ? q.type
            : 'text';
        return {
            id: (q && q.id) ? String(q.id) : ('q_' + idx),
            title: String((q && q.title) || '').trim(),
            type: type,
            required: Boolean(q && q.required),
            allowOther: Boolean(q && q.allowOther),
            options: Array.isArray(q && q.options)
                ? q.options.map(o => String(o || '').trim()).filter(Boolean)
                : [],
            unit: String((q && q.unit) || '').trim(),
            placeholder: String((q && q.placeholder) || '').trim()
        };
    }

    function mergeSettings(rawSettings) {
        const s = (rawSettings && typeof rawSettings === 'object') ? rawSettings : {};
        const r = (s.respondent && typeof s.respondent === 'object') ? s.respondent : {};
        const validMode = (v, fb) => (v === 'required' || v === 'optional' || v === 'hidden') ? v : fb;
        const anonymous = Boolean(r.anonymous);
        return {
            respondent: {
                anonymous: anonymous,
                name: anonymous ? 'hidden' : validMode(r.name, DEFAULT_SETTINGS.respondent.name),
                affiliation: anonymous ? 'hidden' : validMode(r.affiliation, DEFAULT_SETTINGS.respondent.affiliation),
                contact: anonymous ? 'hidden' : validMode(r.contact, DEFAULT_SETTINGS.respondent.contact)
            },
            completion_message: typeof s.completion_message === 'string' && s.completion_message.trim()
                ? s.completion_message.trim()
                : DEFAULT_SETTINGS.completion_message,
            completion_link: safeExternalUrl(s.completion_link || ''),
            show_results_after_submit: Boolean(s.show_results_after_submit),
            notify_works_each: Boolean(s.notify_works_each),
            notify_works_full: Boolean(s.notify_works_full)
        };
    }

    /**
     * 구버전(배열)과 신버전({ version: 2, questions, settings }) form_schema를 모두 호환 파싱합니다.
     */
    function parseSchema(rawSchema) {
        if (Array.isArray(rawSchema)) {
            return {
                version: 1,
                questions: rawSchema.map(normalizeQuestion),
                settings: mergeSettings(null)
            };
        }
        if (rawSchema && typeof rawSchema === 'object' && Array.isArray(rawSchema.questions)) {
            return {
                version: rawSchema.version || 2,
                questions: rawSchema.questions.map(normalizeQuestion),
                settings: mergeSettings(rawSchema.settings)
            };
        }
        return {
            version: 1,
            questions: [],
            settings: mergeSettings(null)
        };
    }

    function packSchema(questions, settings) {
        return {
            version: 2,
            questions: (Array.isArray(questions) ? questions : []).map(normalizeQuestion),
            settings: mergeSettings(settings)
        };
    }

    function safeExternalUrl(url) {
        const v = String(url || '').trim();
        if (!v) return '';
        if (/^https?:\/\//i.test(v)) return v;
        return '';
    }

    function autoHyphenPhone(str) {
        str = String(str || '').replace(/[^0-9]/g, '');
        if (str.startsWith('02')) {
            if (str.length < 3) return str;
            if (str.length < 6) return str.slice(0, 2) + '-' + str.slice(2);
            if (str.length < 10) return str.slice(0, 2) + '-' + str.slice(2, 5) + '-' + str.slice(5);
            return str.slice(0, 2) + '-' + str.slice(2, 6) + '-' + str.slice(6, 10);
        }
        if (str.length < 4) return str;
        if (str.length < 7) return str.slice(0, 3) + '-' + str.slice(3);
        if (str.length < 11) return str.slice(0, 3) + '-' + str.slice(3, 6) + '-' + str.slice(6);
        return str.slice(0, 3) + '-' + str.slice(3, 7) + '-' + str.slice(7, 11);
    }

    /**
     * 신버전(answers.__respondent)과 구버전(respondent_info 문자열)에서 소속·이름·연락처를 일관되게 분리합니다.
     */
    function parseRespondent(responseRow) {
        const answers = responseRow && responseRow.answers && typeof responseRow.answers === 'object'
            ? responseRow.answers
            : {};
        if (answers.__respondent && typeof answers.__respondent === 'object') {
            const r = answers.__respondent;
            return {
                anonymous: Boolean(r.anonymous),
                affiliation: String(r.affiliation || '').trim(),
                name: String(r.name || '').trim(),
                contact: String(r.contact || '').trim()
            };
        }
        const raw = String((responseRow && responseRow.respondent_info) || '').trim();
        if (!raw || raw === '익명') {
            return { anonymous: true, affiliation: '', name: '', contact: '' };
        }
        let contact = '';
        let base = raw;
        const phoneMatch = base.match(/\s*\(([^()]+)\)\s*$/);
        if (phoneMatch) {
            contact = phoneMatch[1].trim();
            base = base.slice(0, phoneMatch.index).trim();
        }
        const dashIdx = base.indexOf(' - ');
        if (dashIdx !== -1) {
            return {
                anonymous: false,
                affiliation: base.slice(0, dashIdx).trim(),
                name: base.slice(dashIdx + 3).trim(),
                contact: contact
            };
        }
        return {
            anonymous: false,
            affiliation: '',
            name: base,
            contact: contact
        };
    }

    function formatRespondentDisplay(resp) {
        if (!resp || resp.anonymous) return '익명';
        const parts = [];
        if (resp.affiliation) parts.push(resp.affiliation);
        if (resp.name) parts.push(resp.name);
        return parts.join(' - ') || '익명';
    }

    function formatDateShort(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function toDateTimeLocalValue(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    /**
     * 수동 마감 / 마감 일시 경과 / 선착순 정원 마감 / 임박 상태를 통합 판정합니다.
     */
    function getFormStatus(form, responseCount) {
        const hasCount = responseCount !== null && responseCount !== undefined && responseCount !== '' && Number.isFinite(Number(responseCount)); const count = hasCount ? Number(responseCount) : null;
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

        if (max && max > 0 && !hasCount) { return { code: 'count_unavailable', label: '인원 확인 불가', canSubmit: false, count: null, max: max, seatsLeft: null, hoursLeft: (endTs && !isNaN(endTs)) ? Math.max(0, (endTs - now) / 3600000) : null, isUrgent: false, urgentNote: '', reason: '현재 참여 인원을 불러오지 못해 제출을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.' }; } if (max && max > 0 && count >= max) {
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
        }

        const seatsLeft = (max && max > 0) ? (max - count) : null;
        const hoursLeft = (endTs && !isNaN(endTs)) ? (endTs - now) / 3600000 : null;
        const nearQuota = Boolean(max && max > 0 && (seatsLeft <= 3 || (count / max) >= 0.8));
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
            count: count,
            max: max,
            seatsLeft: seatsLeft,
            hoursLeft: hoursLeft,
            isUrgent: isUrgent,
            urgentNote: urgentNote,
            reason: ''
        };
    }

    /**
     * 객관식(radio/checkbox) 득표 집계 (기타 직접 입력 포함)
     */
    function computeChoiceStats(questions, responses) {
        const result = {};
        (questions || []).forEach(q => {
            if (q.type !== 'radio' && q.type !== 'checkbox') return;
            const counts = {};
            (q.options || []).forEach(opt => { counts[opt] = 0; });
            const others = [];
            let totalVotes = 0;

            (responses || []).forEach(res => {
                const ans = res && res.answers ? res.answers[q.id] : null;
                const list = Array.isArray(ans) ? ans : (ans ? [ans] : []);
                list.forEach(v => {
                    const str = String(v || '').trim();
                    if (!str) return;
                    if (Object.prototype.hasOwnProperty.call(counts, str)) {
                        counts[str]++;
                        totalVotes++;
                    } else if (str.startsWith('기타:')) {
                        const resp = parseRespondent(res);
                        others.push({
                            who: formatRespondentDisplay(resp),
                            text: str.replace(/^기타:\s*/, '')
                        });
                        totalVotes++;
                    } else {
                        // 과거 문구 수정으로 기존 선택지가 사라진 응답도 누락 없이 표시
                        counts[str] = (counts[str] || 0) + 1;
                        totalVotes++;
                    }
                });
            });

            result[q.id] = { counts, others, totalVotes };
        });
        return result;
    }

    /**
     * CSV 셀 안전 인코딩 (=, +, -, @ 수식 인젝션 방어 + 따옴표 이스케이프)
     */
    function csvCell(val) {
        let s = String(val === null || val === undefined ? '' : val);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }

    /**
     * 외부 CDN 의존성 없는 표준 QR Code 생성기 (ISO/IEC 18004, Byte Mode, Version 1~5, EC-L, Mask 0)
     */
    const QR = (function () {
        const EXP = new Uint8Array(512);
        const LOG = new Uint8Array(256);
        for (let i = 0, x = 1; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

        function gfMul(a, b) {
            return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
        }

        function rsGenPoly(deg) {
            let poly = [1];
            for (let i = 0; i < deg; i++) {
                const next = new Array(poly.length + 1).fill(0);
                for (let j = 0; j < poly.length; j++) {
                    next[j] ^= poly[j];
                    next[j + 1] ^= gfMul(poly[j], EXP[i]);
                }
                poly = next;
            }
            return poly;
        }

        function rsEncode(data, ecCount) {
            const gen = rsGenPoly(ecCount);
            const rem = new Uint8Array(ecCount);
            for (let i = 0; i < data.length; i++) {
                const factor = data[i] ^ rem[0];
                for (let j = 0; j < ecCount - 1; j++) rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
                rem[ecCount - 1] = gfMul(gen[ecCount], factor);
            }
            return rem;
        }

        const SPECS = [
            null,
            { size: 21, dataCw: 19, ecCw: 7, align: [] },
            { size: 25, dataCw: 34, ecCw: 10, align: [6, 18] },
            { size: 29, dataCw: 55, ecCw: 15, align: [6, 22] },
            { size: 33, dataCw: 80, ecCw: 20, align: [6, 26] },
            { size: 37, dataCw: 108, ecCw: 26, align: [6, 30] }
        ];

        function encode(text) {
            const bytes = new TextEncoder().encode(String(text || ''));
            let ver = 1;
            while (ver <= 5 && bytes.length + 2 > SPECS[ver].dataCw) ver++;
            if (ver > 5) { throw new RangeError(`QR 코드로 인코딩할 URL이 너무 깁니다 (${bytes.length} bytes, 최대 ${SPECS[5].dataCw - 2} bytes).`); }
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

            const data = new Uint8Array(spec.dataCw);
            for (let i = 0; i < bits.length / 8; i++) {
                let v = 0;
                for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
                data[i] = v;
            }
            const pads = [0xec, 0x11];
            for (let i = bits.length / 8, p = 0; i < spec.dataCw; i++, p ^= 1) data[i] = pads[p];

            const ec = rsEncode(data, spec.ecCw);
            const allCw = new Uint8Array(spec.dataCw + spec.ecCw);
            allCw.set(data, 0);
            allCw.set(ec, spec.dataCw);

            const N = spec.size;
            const mat = Array.from({ length: N }, () => new Int8Array(N).fill(-1));
            const isFunc = Array.from({ length: N }, () => new Uint8Array(N));

            const setMod = (r, c, val, fn) => {
                if (r >= 0 && r < N && c >= 0 && c < N) {
                    mat[r][c] = val ? 1 : 0;
                    if (fn) isFunc[r][c] = 1;
                }
            };

            const placeFinder = (tr, tc) => {
                for (let r = -1; r <= 7; r++) {
                    for (let c = -1; c <= 7; c++) {
                        const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                        const dark = inBox && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
                        setMod(tr + r, tc + c, dark, true);
                    }
                }
            };
            placeFinder(0, 0);
            placeFinder(0, N - 7);
            placeFinder(N - 7, 0);

            for (let i = 8; i < N - 8; i++) {
                setMod(6, i, i % 2 === 0, true);
                setMod(i, 6, i % 2 === 0, true);
            }

            for (const r of spec.align) {
                for (const c of spec.align) {
                    if ((r === 6 && c === 6) || (r === 6 && c === N - 7) || (r === N - 7 && c === 6)) continue;
                    for (let dr = -2; dr <= 2; dr++) {
                        for (let dc = -2; dc <= 2; dc++) {
                            setMod(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1, true);
                        }
                    }
                }
            }

            setMod(4 * ver + 9, 8, 1, true);

            for (let i = 0; i < 9; i++) {
                if (i !== 6) { setMod(8, i, 0, true); setMod(i, 8, 0, true); }
            }
            for (let i = 0; i < 8; i++) {
                setMod(8, N - 1 - i, 0, true);
                setMod(N - 1 - i, 8, 0, true);
            }

            let bitIdx = 0;
            const totalBits = allCw.length * 8;
            for (let col = N - 1; col > 0; col -= 2) {
                if (col === 6) col--;
                const upward = ((N - 1 - col) >> 1) % 2 === 0;
                for (let i = 0; i < N; i++) {
                    const r = upward ? (N - 1 - i) : i;
                    for (let dc = 0; dc < 2; dc++) {
                        const c = col - dc;
                        if (isFunc[r][c]) continue;
                        const rawBit = bitIdx < totalBits ? ((allCw[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) : 0;
                        bitIdx++;
                        mat[r][c] = ((r + c) % 2 === 0) ? (rawBit ^ 1) : rawBit;
                    }
                }
            }

            const fmt = 0b111011111000100; // EC-L + Mask 0
            const fbit = i => (fmt >> i) & 1;
            const topLeftCols = [0, 1, 2, 3, 4, 5, 7, 8];
            for (let i = 0; i < 8; i++) setMod(8, topLeftCols[i], fbit(14 - i), true);
            const topLeftRows = [7, 5, 4, 3, 2, 1, 0];
            for (let i = 0; i < 7; i++) setMod(topLeftRows[i], 8, fbit(6 - i), true);
            for (let i = 0; i < 7; i++) setMod(N - 1 - i, 8, fbit(14 - i), true);
            for (let i = 0; i < 8; i++) setMod(8, N - 8 + i, fbit(7 - i), true);

            return { size: N, matrix: mat };
        }

        function toSVG(text, px) {
            const dim = px || 210;
            const { size, matrix } = encode(text);
            const quiet = 4;
            const total = size + quiet * 2;
            let rects = '';
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (matrix[r][c] === 1) {
                        rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1"/>`;
                    }
                }
            }
            return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><g fill="#111827">${rects}</g></svg>`;
        }

        return { toSVG };
    })();

    global.NKForms = {
        WORKS_BOT_URL: WORKS_BOT_URL,
        DEFAULT_SETTINGS: DEFAULT_SETTINGS,
        escapeHtml: escapeHtml,
        parseSchema: parseSchema,
        packSchema: packSchema,
        safeExternalUrl: safeExternalUrl,
        autoHyphenPhone: autoHyphenPhone,
        parseRespondent: parseRespondent,
        formatRespondentDisplay: formatRespondentDisplay,
        formatDateShort: formatDateShort,
        toDateTimeLocalValue: toDateTimeLocalValue,
        getFormStatus: getFormStatus,
        computeChoiceStats: computeChoiceStats,
        csvCell: csvCell,
        QR: QR
    };
})(window);
