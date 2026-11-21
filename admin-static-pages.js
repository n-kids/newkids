/**
 * ============================================================================
 * 뉴키즈 관리자(admin.html) — 고정 페이지(PAGE) 확장 & 블록 디자인 에디터 v2
 * 파일명: admin-static-pages.js
 *
 * 주요 개선 사항 (v2):
 * 1) Quill 1.3.6의 인라인 스타일/<div> 자동 삭제 오류 완전 해결 (독립 블록 빌더)
 * 2) 10종 디자인 블록 + 드래그 정렬(Sortable.js) + PC/모바일(390px) 실시간 미리보기
 * 3) 본문 중간에 등록된 폼/투표([투표:ID]) 1클릭 삽입 지원
 * 4) 뉴키즈 맞춤 원클릭 템플릿 5종 + Supabase images 버킷 WebP 이미지 업로드
 * 5) HTML 직접 편집 모드 + 기존 addNewCategory / saveAllCategories 안전 래핑 유지
 * ============================================================================
 */
(function () {
  'use strict';

  const STATE = {
    forms: [],
    catMetaByCode: {},
    newCustomHtml: '',
    rowDrafts: {},
    modalTarget: null, // { kind: 'new' } | { kind: 'row', code }
    blocks: [],
    rawHtmlMode: false,
    rawHtmlBuffer: '',
    previewDevice: 'pc', // 'pc' | 'mobile'
    sortable: null
  };

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function uid() {
    return 'blk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function parseYoutubeEmbed(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    let m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : '';
  }
  const CUSTOM_FONTS_KEY = 'nk_post_custom_fonts_v1';
  const BUILTIN_FONTS = [{ label: '기본 (사이트 기본 폰트)', css: '', url: '' }, { label: 'Pretendard', css: "'Pretendard', sans-serif", url: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css' }, { label: 'Noto Sans KR (본고딕)', css: "'Noto Sans KR', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap' }, { label: 'Noto Serif KR (본명조)', css: "'Noto Serif KR', serif", url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;700;800&display=swap' }, { label: '나눔고딕 (Nanum Gothic)', css: "'Nanum Gothic', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&display=swap' }, { label: '나눔명조 (Nanum Myeongjo)', css: "'Nanum Myeongjo', serif", url: 'https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap' }, { label: '나눔손글씨 펜 (Nanum Pen Script)', css: "'Nanum Pen Script', cursive", url: 'https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap' }, { label: '고운돋움 (Gowun Dodum)', css: "'Gowun Dodum', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Gowun+Dodum&display=swap' }, { label: '고운바탕 (Gowun Batang)', css: "'Gowun Batang', serif", url: 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap' }, { label: '주아체 (Jua)', css: "'Jua', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Jua&display=swap' }, { label: '도현체 (Do Hyeon)', css: "'Do Hyeon', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Do+Hyeon&display=swap' }, { label: '해바라기체 (Sunflower)', css: "'Sunflower', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Sunflower:wght@500;700&display=swap' }, { label: '검은고딕 (Black Han Sans)', css: "'Black Han Sans', sans-serif", url: 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&display=swap' }];
  function sanitizeFontFamily(v) { return String(v || '').replace(/["<>`;{}]/g, '').trim(); }
  function loadCustomFonts() { try { const raw = localStorage.getItem(CUSTOM_FONTS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr.filter(f => f && f.css) : []; } catch (e) { return []; } }
  function saveCustomFonts(list) { try { localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch (e) {} }
  function injectFontAsset(fontUrl, fontFamily) { const u = String(fontUrl || '').trim(); if (!u || !/^https:\/\//i.test(u)) return; const key = u.replace(/"/g, ''); if (document.querySelector('link[data-nk-font-url="' + key + '"]')) return; const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = u; link.setAttribute('data-nk-font-url', key); if (fontFamily) link.setAttribute('data-nk-font-family', sanitizeFontFamily(fontFamily)); document.head.appendChild(link); }
  function getAllFonts() { return BUILTIN_FONTS.concat(loadCustomFonts()); }
  function buildGoogleFontUrl(familyName) { const name = String(familyName || '').trim(); if (!name) return ''; return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@400;500;700;800&display=swap'; }
  function renderSizeSelectHtml(b, idx, defaultSize) { const cur = (b && b.fontSize) || defaultSize || '15px'; const sizes = ['12px', '13px', '14px', '15px', '16px', '17px', '18px', '20px', '22px', '24px', '26px', '28px', '30px', '32px', '36px', '40px']; return '<div class="nk-blk-field"><label>글자 크기</label><select data-k="fontSize" data-i="' + idx + '">' + sizes.map(s => '<option value="' + s + '"' + (cur === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>'; }
  function renderWeightSelectHtml(b, idx, defaultWeight) { const cur = String((b && b.fontWeight) || defaultWeight || '400'); const weights = [['400', '보통 (400)'], ['500', '중간 (500)'], ['700', '굵게 (700)'], ['800', '아주 굵게 (800)']]; return '<div class="nk-blk-field"><label>글자 두께</label><select data-k="fontWeight" data-i="' + idx + '">' + weights.map(w => '<option value="' + w[0] + '"' + (cur === w[0] ? ' selected' : '') + '>' + w[1] + '</option>').join('') + '</select></div>'; }
  function renderFontSelectHtml(b, idx) { const cur = sanitizeFontFamily(b && b.fontFamily); const all = getAllFonts(); const hasCur = !cur || all.some(f => f.css === cur); const opts = all.map(f => '<option value="' + esc(f.css) + '"' + (cur === f.css ? ' selected' : '') + '>' + esc(f.label || f.css) + '</option>').join(''); const extra = !hasCur ? '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (포함된 폰트)</option>' : ''; return '<div class="nk-blk-field"><label>글꼴</label><select data-k="fontFamily" data-i="' + idx + '">' + opts + extra + '</select></div>'; }
  function renderFontMgrHtml(idx) { const custom = loadCustomFonts(); const chips = custom.length ? '<div class="nk-font-chips">' + custom.map((f, ci) => '<span class="nk-font-chip">' + esc(f.label || f.css) + '<button type="button" data-sp-font-del="' + ci + '" title="삭제">×</button></span>').join('') + '</div>' : ''; return '<details class="nk-font-mgr"><summary>+ 폰트 추가 / 관리</summary><div class="nk-font-mgr-body"><div class="nk-blk-grid"><div class="nk-blk-field"><label>추가 방식</label><select data-sp-font-mode="' + idx + '"><option value="google">Google Fonts</option><option value="url">https:// 웹폰트 URL</option></select></div><div class="nk-blk-field"><label>표시 이름</label><input type="text" data-sp-font-label="' + idx + '" placeholder="예: 나눔스퀘어" /></div><div class="nk-blk-field"><label>CSS font-family</label><input type="text" data-sp-font-css="' + idx + '" placeholder="예: \'Nanum Square\', sans-serif" /></div><div class="nk-blk-field" data-sp-font-url-wrap="' + idx + '" style="display:none;"><label>웹폰트 CSS URL (https://)</label><input type="url" data-sp-font-url="' + idx + '" placeholder="https://..." /></div></div><div class="nk-font-mgr-actions"><button type="button" class="nk-btn nk-btn-sm" data-sp-font-add="' + idx + '">폰트 추가</button></div>' + chips + '</div></details>'; }
  
  

  // ==========================================================================
  // 1. 블록 → 안전한 HTML 직렬화 (manager.js sanitizeHtml 100% 호환)
  // ==========================================================================
  function renderBlockToHtml(b) {
    if (!b || !b.type) return '';

        if (b.type === 'heading') { const align = b.align || 'left'; const color = b.color || '#1c355e'; const size = b.fontSize || '24px'; const weight = b.fontWeight || '800'; const ff = sanitizeFontFamily(b.fontFamily); if (b.fontUrl && ff) injectFontAsset(b.fontUrl, ff); const ffCss = ff ? ' font-family:' + ff + ';' : ''; const sub = b.sub ? '<p style="margin:6px 0 0; font-size:15px; color:#64748b; line-height:1.6;' + ffCss + '">' + esc(b.sub) + '</p>' : ''; return '<div style="text-align:' + align + '; margin:20px 0 14px; padding-bottom:10px; border-bottom:2px solid #e2e8f0;"><h2 style="margin:0; font-size:' + esc(size) + '; font-weight:' + esc(weight) + '; color:' + esc(color) + '; line-height:1.35;' + ffCss + '">' + esc(b.title || '제목을 입력하세요') + '</h2>' + sub + '</div>'; }

    if (b.type === 'text') { const align = b.align || 'left'; const size = b.fontSize || '15px'; const weight = b.fontWeight || '400'; const color = b.color || '#334155'; const ff = sanitizeFontFamily(b.fontFamily); if (b.fontUrl && ff) injectFontAsset(b.fontUrl, ff); const ffCss = ff ? ' font-family:' + ff + ';' : ''; const body = String(b.text || '').split('\n').map(function (line) { return line.trim() ? '<p style="margin:0 0 10px; font-size:' + esc(size) + '; font-weight:' + esc(weight) + '; line-height:1.75; color:' + esc(color) + ';' + ffCss + '">' + esc(line) + '</p>' : ''; }).join(''); return '<div style="text-align:' + align + '; margin:14px 0;">' + (body || '<p style="margin:0; color:#94a3b8;' + ffCss + '">내용을 입력하세요.</p>') + '</div>'; }

    if (b.type === 'callout') { const themes = { navy: { bg: '#eff6ff', border: '#1c355e', title: '#1c355e' }, green: { bg: '#ecfdf5', border: '#059669', title: '#065f46' }, amber: { bg: '#fffbeb', border: '#d97706', title: '#92400e' }, gray: { bg: '#f8fafc', border: '#64748b', title: '#334155' } }; const t = themes[b.theme] || themes.navy; const size = b.fontSize || '14px'; const weight = b.fontWeight || '400'; const ff = sanitizeFontFamily(b.fontFamily); if (b.fontUrl && ff) injectFontAsset(b.fontUrl, ff); const ffCss = ff ? ' font-family:' + ff + ';' : ''; const titleColor = b.color || t.title; const bodyColor = b.color || '#334155'; const lines = String(b.body || '').split('\n').map(esc).join('<br>'); return '<div style="background-color:' + t.bg + '; border-left:4px solid ' + t.border + '; border-radius:8px; padding:16px 18px; margin:16px 0;' + ffCss + '">' + (b.title ? '<div style="font-size:15px; font-weight:700; color:' + esc(titleColor) + '; margin-bottom:6px;' + ffCss + '">' + esc(b.title) + '</div>' : '') + '<div style="font-size:' + esc(size) + '; font-weight:' + esc(weight) + '; line-height:1.7; color:' + esc(bodyColor) + ';' + ffCss + '">' + lines + '</div></div>'; }

    if (b.type === 'cards') {
      const items = Array.isArray(b.items) ? b.items : [];
      const size = b.fontSize || '14px'; const weight = b.fontWeight || '400'; const ff = sanitizeFontFamily(b.fontFamily); if (b.fontUrl && ff) injectFontAsset(b.fontUrl, ff); const ffCss = ff ? ' font-family:' + ff + ';' : ''; const titleColor = b.color || '#1c355e'; const bodyColor = b.color || '#475569'; const cols = b.cols === 3 ? 'repeat(auto-fit, minmax(180px, 1fr))' : 'repeat(auto-fit, minmax(230px, 1fr))';
      const inner = items.map(function (it) {
        return `<div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-sizing:border-box;">
    <div style="font-size:16px; font-weight:700; color:${esc(titleColor)}; margin-bottom:8px;${ffCss}">${esc(it.title || '')}</div>
    <p style="margin:0; font-size:${esc(size)}; font-weight:${esc(weight)}; line-height:1.65; color:${esc(bodyColor)};${ffCss}">${esc(it.body || '').replace(/\n/g, '<br>')}</p>
  </div>`;
      }).join('\n');
      return `<div style="display:grid; grid-template-columns:${cols}; gap:14px; margin:18px 0;">${inner}</div>`;
    }

    if (b.type === 'image') {
      if (!b.src) {
        return `<div style="padding:28px; text-align:center; background-color:#f1f5f9; border:1px dashed #94a3b8; border-radius:10px; color:#64748b; font-size:13px; margin:16px 0;">이미지를 업로드하거나 이미지 URL을 입력해 주세요.</div>`;
      }
      const width = b.width || '100%';
      const align = b.align || 'center';
      const radius = b.rounded !== false ? '12px' : '0px';
      const shadow = b.shadow ? '0 8px 24px rgba(15,23,42,0.12)' : 'none';
      const caption = b.caption ? `<figcaption style="margin-top:8px; font-size:13px; color:#64748b; text-align:${align};">${esc(b.caption)}</figcaption>` : '';
      return `<figure style="margin:18px 0; text-align:${align};">
  <img src="${esc(b.src)}" alt="${esc(b.caption || '페이지 이미지')}" style="width:${width}; max-width:100%; height:auto; border-radius:${radius}; box-shadow:${shadow}; display:inline-block;">
  ${caption}
</figure>`;
    }

    if (b.type === 'split') {
      const imgHtml = b.src
        ? `<img src="${esc(b.src)}" alt="${esc(b.title || '')}" style="width:100%; max-width:100%; height:auto; border-radius:12px; display:block;">`
        : `<div style="padding:40px 16px; text-align:center; background-color:#f1f5f9; border-radius:12px; color:#64748b; font-size:13px;">이미지 미등록</div>`;
      const size = b.fontSize || '14px'; const weight = b.fontWeight || '400'; const ff = sanitizeFontFamily(b.fontFamily); if (b.fontUrl && ff) injectFontAsset(b.fontUrl, ff); const ffCss = ff ? ' font-family:' + ff + ';' : ''; const titleColor = b.color || '#1c355e'; const bodyColor = b.color || '#334155'; const textHtml = `<div style="padding:4px 0;">
  <h3 style="margin:0 0 10px; font-size:20px; font-weight:700; color:${esc(titleColor)}; line-height:1.4;${ffCss}">${esc(b.title || '')}</h3>
  <p style="margin:0; font-size:${esc(size)}; font-weight:${esc(weight)}; line-height:1.75; color:${esc(bodyColor)};${ffCss}">${esc(b.body || '').replace(/\n/g, '<br>')}</p>
</div>`;
      const first = b.reverse ? textHtml : imgHtml;
      const second = b.reverse ? imgHtml : textHtml;
      return `<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:20px; align-items:center; margin:20px 0;">
  <div>${first}</div>
  <div>${second}</div>
</div>`;
    }

    if (b.type === 'table') {
      const headers = Array.isArray(b.headers) ? b.headers : ['항목', '내용'];
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const thHtml = headers.map(function (h) {
        return `<th style="background-color:#1c355e; color:#ffffff; padding:10px 12px; text-align:left; font-size:13px; font-weight:700; border:1px solid #1c355e;">${esc(h)}</th>`;
      }).join('');
      const trHtml = rows.map(function (r) {
        const tds = headers.map(function (_, idx) {
          return `<td style="padding:10px 12px; font-size:13px; color:#334155; border:1px solid #e2e8f0; background-color:#ffffff;">${esc(r[idx] || '')}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<div style="overflow-x:auto; margin:18px 0;">
  <table style="width:100%; border-collapse:collapse;">
    <thead><tr>${thHtml}</tr></thead>
    <tbody>${trHtml}</tbody>
  </table>
</div>`;
    }

    if (b.type === 'button') {
      const align = b.align || 'center';
      const bg = b.bg || '#1c355e';
      const targetAttr = b.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const href = b.url || '#';
      return `<div style="text-align:${align}; margin:20px 0;">
  <a href="${esc(href)}"${targetAttr} style="display:inline-block; background-color:${esc(bg)}; color:#ffffff; padding:12px 26px; border-radius:8px; font-size:15px; font-weight:700; text-decoration:none;">${esc(b.label || '바로가기')}</a>
</div>`;
    }

    if (b.type === 'form') {
      if (!b.formId) {
        return `<div style="padding:20px; text-align:center; background-color:#eff6ff; border:1px dashed #1c355e; border-radius:10px; color:#1c355e; font-size:13px; margin:16px 0;">삽입할 폼/투표를 선택해 주세요.</div>`;
      }
      return `<div style="margin:20px 0;">[투표:${esc(b.formId)}]</div>`;
    }

    if (b.type === 'youtube') {
      const embed = parseYoutubeEmbed(b.url);
      if (!embed) {
        return `<div style="padding:24px; text-align:center; background-color:#f8fafc; border:1px dashed #94a3b8; border-radius:10px; color:#64748b; font-size:13px; margin:16px 0;">유튜브 영상 주소를 입력해 주세요.</div>`;
      }
      return `<div style="margin:20px 0; text-align:center;">
  <iframe src="${esc(embed)}" title="유튜브 영상" style="width:100%; max-width:720px; height:400px; border:none; border-radius:12px;" allowfullscreen></iframe>
</div>`;
    }

    if (b.type === 'divider') {
      return `<hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;">`;
    }

    if (b.type === 'raw') {
      return String(b.html || '');
    }

    return '';
  }

  function serializeBlocks(blocks) {
    const html = blocks.map(renderBlockToHtml).join('\n');
    const meta = encodeURIComponent(JSON.stringify(blocks)); const customFonts = []; const seenFonts = {}; blocks.forEach(function (b) { if (b && b.fontUrl && b.fontFamily) { const key = b.fontUrl + '|' + b.fontFamily; if (!seenFonts[key]) { seenFonts[key] = true; customFonts.push({ css: b.fontFamily, url: b.fontUrl }); } } }); const fontMeta = customFonts.length ? '<!-- NK_CUSTOM_FONTS_V1:' + encodeURIComponent(JSON.stringify(customFonts)) + ' -->\n' : ''; return fontMeta + '<!-- NK_BLOCKS_V2:' + meta + ' -->\n' + html;
  }

  function deserializeHtmlToBlocks(html, depth) {
    const str = String(html || '').trim();
    if (!str || (depth || 0) > 5) return [];
    const m = str.match(/<!--\s*NK_BLOCKS_V2:([\s\S]*?)\s*-->/);
    if (m) {
      try {
        const parsed = JSON.parse(decodeURIComponent(m[1].trim()));
        if (Array.isArray(parsed)) {
          // 이전에 잘못 감싸진 raw 블록이 있으면 자동으로 원래 블록 배열로 복구
          if (parsed.length === 1 && parsed[0] && parsed[0].type === 'raw' && /NK_BLOCKS_V2:/.test(parsed[0].html || '')) {
            return deserializeHtmlToBlocks(parsed[0].html, (depth || 0) + 1);
          }
          parsed.forEach(function (b) { if (b && b.fontUrl && b.fontFamily) injectFontAsset(b.fontUrl, b.fontFamily); }); return parsed;
        }
      } catch (_) {}
    }
    return [{ id: uid(), type: 'raw', html: str }];
  }

  // ==========================================================================
  // 2. 뉴키즈 맞춤 원클릭 템플릿 5종
  // ==========================================================================
  const TEMPLATES = {
    event: function () {
      return [
        { id: uid(), type: 'heading', title: '2026 봄 학부모 설명회 · 원어민 체험 안내', sub: '김포·고양·파주 어린이집 및 유치원 원장님·선생님을 초대합니다.', align: 'center', color: '#1c355e' },
        { id: uid(), type: 'callout', theme: 'navy', title: '행사 일시 및 장소', body: '일시: 2026년 3월 14일 (토) 오전 10:30\n장소: 뉴키즈 본사 세미나실 (경기도 김포시 태장로 765 금광테크노밸리 627호)\n문의: 010-2333-2563 / 010-5522-8109' },
        { id: uid(), type: 'cards', cols: 2, items: [
          { title: '01. 신학기 교재 시연', body: '한글·독서·영어·코딩 등 연령별 핵심 교재 커리큘럼을 직접 확인하세요.' },
          { title: '02. 원어민 · 시즌 행사 소개', body: '아이들이 가장 좋아하는 시즌 테마 행사와 부모 참여 행사 사례를 공유합니다.' }
        ] },
        { id: uid(), type: 'form', formId: STATE.forms[0] ? STATE.forms[0].id : '' }
      ];
    },
    partner: function () {
      return [
        { id: uid(), type: 'heading', title: '국민서관 공식 제휴 프로그램', sub: '영아부터 누리과정 유아까지 발달 단계에 맞춘 그림책 독서 솔루션', align: 'left', color: '#1c355e' },
        { id: uid(), type: 'text', text: '뉴키즈와 국민서관이 함께하는 영유아 독서 프로그램은 아이들의 상상력과 어휘력을 자연스럽게 키워줍니다.\n원 내 수업에 바로 활용할 수 있는 연간계획안과 교사용 활동지를 함께 제공합니다.', align: 'left', fontSize: '15px' },
        { id: uid(), type: 'cards', cols: 3, items: [
          { title: '연령별 필독 그림책', body: '만 0~5세 발달 단계에 맞춘 엄선된 도서 구성' },
          { title: '교사용 지도서 · OT자료', body: '선생님의 수업 준비 부담을 줄여주는 체계적 자료' },
          { title: '가정 연계 독후활동', body: '학부모 만족도를 높이는 가정통신문 및 워크북' }
        ] },
        { id: uid(), type: 'button', label: '도입 제안서 · 견적 요청하기', url: 'proposal.html', bg: '#1c355e', align: 'center', newTab: false }
      ];
    },
    steps: function () {
      return [
        { id: uid(), type: 'heading', title: '교재 도입 및 신청 절차 안내', sub: '간단한 3단계로 우리 원에 꼭 맞는 교육 프로그램을 시작하세요.', align: 'center', color: '#1c355e' },
        { id: uid(), type: 'cards', cols: 3, items: [
          { title: 'STEP 01. 상담 및 제안서', body: '전화 또는 온라인 견적 요청으로 희망 과목과 원아 수를 알려주세요.' },
          { title: 'STEP 02. 샘플 교재 확인', body: '담당자가 원으로 직접 방문하거나 샘플 교재를 발송해 드립니다.' },
          { title: 'STEP 03. 정기 발주 및 지원', body: '매월 정해진 일정에 맞춰 교재 배송과 행사 일정을 함께 관리합니다.' }
        ] },
        { id: uid(), type: 'table', headers: ['구분', '지원 내용', '비고'], rows: [
          ['영유아 교재', '한글, 독서, 영어, 수학, 과학, 미술, 코딩, 환경 등 11개 영역', '누리과정 연계'],
          ['방문 행사', '시즌 테마 행사, 원어민 문화체험, 부모 참여 행사', '사전 예약제'],
          ['전용 주문 앱', '교재 발주, 추가 주문, A/S 간편 신청', '거래처 무료 제공']
        ] }
      ];
    },
    poster: function () {
      return [
        { id: uid(), type: 'heading', title: '특별 안내 포스터', sub: '아래 이미지를 클릭해 안내 포스터를 업로드해 주세요.', align: 'center', color: '#1c355e' },
        { id: uid(), type: 'image', src: '', width: '100%', align: 'center', rounded: true, shadow: true, caption: '포스터 설명을 입력하세요' },
        { id: uid(), type: 'button', label: '신청서 작성하기', url: 'proposal.html', bg: '#059669', align: 'center', newTab: false }
      ];
    },
    contact: function () {
      return [
        { id: uid(), type: 'heading', title: '문의 및 오시는 길', sub: '궁금하신 점이 있으시면 언제든 편하게 연락해 주세요.', align: 'left', color: '#1c355e' },
        { id: uid(), type: 'table', headers: ['항목', '상세 정보'], rows: [
          ['회사명 / 대표', '(주)뉴키즈 / 대표 박홍기'],
          ['상담 전화', '010-2333-2563 / 010-5522-8109'],
          ['주소', '경기도 김포시 태장로 765 금광테크노밸리 627호'],
          ['운영 시간', '평일 09:00 ~ 18:00 (점심시간 12:00 ~ 13:00)']
        ] },
        { id: uid(), type: 'callout', theme: 'green', title: '빠른 전화 상담', body: '모바일에서는 아래 버튼을 누르면 바로 전화 연결이 가능합니다.' },
        { id: uid(), type: 'button', label: '전화 상담 연결 (010-2333-2563)', url: 'tel:010-2333-2563', bg: '#059669', align: 'center', newTab: false }
      ];
    }
  };

  // ==========================================================================
  // 3. 스타일 주입
  // ==========================================================================
  function injectStyles() {
    if (document.getElementById('nk-static-page-ext-style')) return;
    const style = document.createElement('style');
    style.id = 'nk-static-page-ext-style';
    style.textContent = `
      .nk-sp-box { margin-top: 14px; padding: 14px 16px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; box-sizing: border-box; }
      .nk-sp-title { font-size: 13px; font-weight: 700; color: #1c355e; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
      .nk-sp-modes { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
      .nk-sp-mode-btn { padding: 6px 12px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer; }
      .nk-sp-mode-btn.active { background: #1c355e; color: #fff; border-color: #1c355e; }
      .nk-sp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; align-items: end; }
      .nk-sp-field label { display: block; font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px; }
      .nk-sp-field input, .nk-sp-field select, .nk-sp-field textarea { width: 100%; padding: 7px 10px; font-size: 13px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; box-sizing: border-box; font-family: inherit; }
      .nk-sp-btn { padding: 7px 13px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; background: #059669; color: #fff; }
      .nk-sp-btn:hover { background: #047857; }
      .nk-sp-btn-navy { padding: 7px 13px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; background: #1c355e; color: #fff; }
      .nk-sp-btn-outline { padding: 6px 11px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #334155; text-decoration: none; cursor: pointer; }
      .nk-sp-btn-outline:hover { background: #f1f5f9; }
      .nk-sp-btn-outline.active { background: #1c355e; color: #fff; border-color: #1c355e; }
      .cm-row:has(.nk-sp-row-ext) { flex-wrap: wrap !important; }
      .nk-sp-row-ext { grid-column: 1 / -1; flex: 1 0 100%; width: 100%; min-width: 0; box-sizing: border-box; margin-top: 10px; padding: 12px 14px; background: #f8fafc; border: 1px dashed #94a3b8; border-radius: 8px; }

      /* 블록 디자인 에디터 모달 v2 */
      .nk-sp-modal-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(15, 23, 42, 0.72); display: none; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; }
      .nk-sp-modal-backdrop.open { display: flex; }
      .nk-sp-modal { background: #f8fafc; border-radius: 14px; width: 100%; max-width: 1240px; height: 92vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
      .nk-sp-modal-head { background: #1c355e; color: #fff; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-shrink: 0; }
      .nk-sp-modal-head .nk-sp-btn-outline { background: rgba(255,255,255,0.14); color: #fff; border-color: rgba(255,255,255,0.35); }
      .nk-sp-modal-head .nk-sp-btn-outline.active { background: #fff; color: #1c355e; border-color: #fff; }
      .nk-sp-modal-toolbar { padding: 10px 14px; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0; }
      .nk-sp-chip { padding: 5px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #1e293b; cursor: pointer; }
      .nk-sp-chip:hover { background: #eff6ff; border-color: #1c355e; color: #1c355e; }
      .nk-sp-workspace { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; overflow: hidden; }
      @media (max-width: 900px) { .nk-sp-workspace { grid-template-columns: 1fr; } .nk-sp-preview-pane { display: none; } }
      .nk-sp-editor-pane { overflow-y: auto; padding: 14px; border-right: 1px solid #e2e8f0; background: #f1f5f9; }
      .nk-sp-preview-pane { overflow-y: auto; padding: 16px; background: #e2e8f0; display: flex; flex-direction: column; align-items: center; }
      .nk-sp-preview-frame { background: #fff; width: 100%; max-width: 100%; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(15,23,42,0.08); box-sizing: border-box; transition: max-width 0.2s ease; }
      .nk-sp-preview-frame.mobile { max-width: 390px; padding: 16px; }
      .nk-blk-card { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; margin-bottom: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
      .nk-blk-head { background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 700; color: #1c355e; }
      .nk-blk-drag { cursor: grab; color: #94a3b8; margin-right: 6px; user-select: none; }
      .nk-blk-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .nk-blk-actions { display: flex; gap: 4px; }
      .nk-blk-mini { padding: 3px 7px; font-size: 11px; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; cursor: pointer; color: #475569; }
      .nk-blk-mini:hover { background: #f1f5f9; }
      .nk-blk-mini.danger { color: #dc2626; border-color: #fecaca; }
      .nk-sp-modal-foot { padding: 12px 18px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0; }
          .nk-font-mgr { margin-top: 8px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #f8fafc; } .nk-font-mgr summary { cursor: pointer; padding: 7px 10px; font-size: 12px; font-weight: 600; color: #334155; user-select: none; } .nk-font-mgr-body { padding: 8px 10px 10px; border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; } .nk-font-mgr-actions { display: flex; justify-content: flex-end; gap: 6px; } .nk-font-chips { display: flex; flex-wrap: wrap; gap: 6px; } .nk-font-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; font-size: 11px; border-radius: 999px; background: #e2e8f0; color: #1e293b; } .nk-font-chip button { border: none; background: transparent; cursor: pointer; color: #64748b; font-size: 12px; line-height: 1; padding: 0 2px; }
   ` ;
    document.head.appendChild(style);
  }

  async function loadCustomForms() {
    if (!window.sb) return;
    try {
      const { data, error } = await window.sb.from('custom_forms').select('id, title').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) STATE.forms = data;
    } catch (e) {
      console.warn('[admin-static-pages] custom_forms 로드 실패:', e);
    }
  }

  async function loadCategoryMeta() {
    if (!window.sb) return;
    try {
      const { data, error } = await window.sb
        .from('program_categories')
        .select('code, name, type, content_mode, target_url, url_display, custom_html')
        .eq('type', 'PAGE');
      if (!error && Array.isArray(data)) {
        const nextMap = {};
        data.forEach(function (row) {
          nextMap[row.code] = row;
        });
        STATE.catMetaByCode = nextMap;
      }
    } catch (e) {
      console.warn('[admin-static-pages] program_categories 메타 로드 실패:', e);
    }
  }

  function buildFormOptionsHtml(selectedVal, isDirectId) {
    let currentId = '';
    if (isDirectId) {
      currentId = String(selectedVal || '');
    } else {
      const m = String(selectedVal || '').match(/id=([a-zA-Z0-9_-]+)/);
      currentId = m ? m[1] : '';
    }
    let html = '<option value="">-- 등록된 폼/투표 선택 --</option>';
    STATE.forms.forEach(function (f) {
      const sel = currentId === f.id ? 'selected' : '';
      html += `<option value="${esc(f.id)}" ${sel}>${esc(f.title || f.id)} (${esc(f.id)})</option>`;
    });
    return html;
  }

  async function uploadImageToSupabase(file) {
    if (!window.sb || !file) throw new Error('Supabase 또는 파일이 없습니다.');
    const uploadFile = typeof window.compressImageToWebP === 'function'
      ? await window.compressImageToWebP(file, 1600, 0.82)
      : file;
    const key = `static_${Date.now()}_${Math.random().toString(36).slice(2, 5)}.webp`;
    const { data, error } = await window.sb.storage.from('images').upload(key, uploadFile);
    if (error) throw error;
    return window.sb.storage.from('images').getPublicUrl(data.path).data.publicUrl;
  }

  // ==========================================================================
  // 4. 블록 에디터 모달 UI 생성 및 렌더링
  // ==========================================================================
  function ensureEditorModal() {
    if (document.getElementById('nk-sp-editor-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'nk-sp-editor-modal';
    wrap.className = 'nk-sp-modal-backdrop';
    wrap.innerHTML = `
      <div class="nk-sp-modal">
        <div class="nk-sp-modal-head">
          <div>
            <strong id="nk-sp-modal-title" style="font-size:15px;">고정 페이지 블록 디자인 에디터</strong>
            <span style="font-size:11px; color:#bfdbfe; margin-left:8px;">블록 조합 · 드래그 정렬 · 실시간 PC/모바일 미리보기</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" id="nk-sp-dev-pc" class="nk-sp-btn-outline active" style="padding:4px 9px;">PC</button>
            <button type="button" id="nk-sp-dev-mob" class="nk-sp-btn-outline" style="padding:4px 9px;">모바일</button>
            <button type="button" id="nk-sp-toggle-raw" class="nk-sp-btn-outline" style="padding:4px 9px;">HTML 직접편집</button>
            <button type="button" id="nk-sp-modal-close" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;margin-left:6px;">&times;</button>
          </div>
        </div>

        <div id="nk-sp-block-toolbar" class="nk-sp-modal-toolbar">
          <span style="font-size:11px;font-weight:700;color:#64748b;margin-right:2px;">+ 블록 추가:</span>
          <button type="button" class="nk-sp-chip" data-add-blk="heading">제목</button>
          <button type="button" class="nk-sp-chip" data-add-blk="text">본문 글</button>
          <button type="button" class="nk-sp-chip" data-add-blk="callout">안내 박스</button>
          <button type="button" class="nk-sp-chip" data-add-blk="cards">2~3단 카드</button>
          <button type="button" class="nk-sp-chip" data-add-blk="image">이미지</button>
          <button type="button" class="nk-sp-chip" data-add-blk="split">이미지+글</button>
          <button type="button" class="nk-sp-chip" data-add-blk="table">표(Table)</button>
          <button type="button" class="nk-sp-chip" data-add-blk="button">강조 버튼</button>
          <button type="button" class="nk-sp-chip" data-add-blk="form" style="border-color:#1c355e;color:#1c355e;">폼/투표 삽입</button>
          <button type="button" class="nk-sp-chip" data-add-blk="youtube">유튜브</button>
          <button type="button" class="nk-sp-chip" data-add-blk="divider">구분선</button>

          <select id="nk-sp-template-sel" style="margin-left:auto;padding:5px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;">
            <option value="">뉴키즈 템플릿 불러오기...</option>
            <option value="event">행사 · 설명회 안내 (폼 포함)</option>
            <option value="partner">국민서관 · 제휴 소개</option>
            <option value="steps">도입 절차(STEP 1~3) + 표</option>
            <option value="poster">포스터형 안내 페이지</option>
            <option value="contact">문의 · 오시는 길</option>
          </select>
        </div>

        <div class="nk-sp-workspace">
          <div class="nk-sp-editor-pane">
            <div id="nk-sp-blocks-list"></div>
            <textarea id="nk-sp-raw-textarea" style="display:none;width:100%;height:100%;min-height:420px;font-family:monospace;font-size:13px;padding:12px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;background:#0f172a;color:#86efac;"></textarea>
          </div>
          <div class="nk-sp-preview-pane">
            <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px;">실제 page.html 본문 미리보기</div>
            <div id="nk-sp-preview-frame" class="nk-sp-preview-frame"></div>
          </div>
        </div>

        <div class="nk-sp-modal-foot">
          <span style="font-size:12px;color:#64748b;">적용 후 <b>변경사항 일괄 저장</b>(또는 카테고리 생성)을 누르면 DB에 저장됩니다.</span>
          <div style="display:flex;gap:8px;">
            <button type="button" id="nk-sp-modal-cancel" class="nk-sp-btn-outline">취소</button>
            <button type="button" id="nk-sp-modal-apply" class="nk-sp-btn">본문 디자인 적용</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.querySelectorAll('[data-add-blk]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (STATE.rawHtmlMode) return;
        addBlock(btn.dataset.addBlk);
      });
    });

    document.getElementById('nk-sp-template-sel').addEventListener('change', function (e) {
      const key = e.target.value;
      if (!key || !TEMPLATES[key]) return;
      if (STATE.blocks.length > 0 && !confirm('현재 작성 중인 블록을 선택한 템플릿으로 교체할까요?')) {
        e.target.value = '';
        return;
      }
      STATE.rawHtmlMode = false;
      STATE.blocks = TEMPLATES[key]();
      syncEditorModeUI();
      renderBlockEditor();
      e.target.value = '';
    });

    document.getElementById('nk-sp-dev-pc').addEventListener('click', function () {
      STATE.previewDevice = 'pc';
      document.getElementById('nk-sp-dev-pc').classList.add('active');
      document.getElementById('nk-sp-dev-mob').classList.remove('active');
      document.getElementById('nk-sp-preview-frame').classList.remove('mobile');
    });

    document.getElementById('nk-sp-dev-mob').addEventListener('click', function () {
      STATE.previewDevice = 'mobile';
      document.getElementById('nk-sp-dev-mob').classList.add('active');
      document.getElementById('nk-sp-dev-pc').classList.remove('active');
      document.getElementById('nk-sp-preview-frame').classList.add('mobile');
    });

    document.getElementById('nk-sp-toggle-raw').addEventListener('click', function () {
      const ta = document.getElementById('nk-sp-raw-textarea');
      if (!STATE.rawHtmlMode) {
        STATE.rawHtmlBuffer = serializeBlocks(STATE.blocks);
        ta.value = STATE.rawHtmlBuffer;
        STATE.rawHtmlMode = true;
      } else {
        STATE.rawHtmlBuffer = ta.value;
        STATE.blocks = deserializeHtmlToBlocks(ta.value);
        STATE.rawHtmlMode = false;
      }
      syncEditorModeUI();
      renderBlockEditor();
    });

    document.getElementById('nk-sp-raw-textarea').addEventListener('input', function (e) {
      STATE.rawHtmlBuffer = e.target.value;
      updateLivePreview();
    });

    function closeModal() {
      wrap.classList.remove('open');
      STATE.modalTarget = null;
    }

    document.getElementById('nk-sp-modal-close').addEventListener('click', closeModal);
    document.getElementById('nk-sp-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('nk-sp-modal-apply').addEventListener('click', function () {
      const finalHtml = STATE.rawHtmlMode
        ? document.getElementById('nk-sp-raw-textarea').value
        : serializeBlocks(STATE.blocks);

      if (STATE.modalTarget && STATE.modalTarget.kind === 'new') {
        STATE.newCustomHtml = finalHtml;
        const summary = document.getElementById('nk-sp-new-custom-status');
        if (summary) summary.textContent = `본문 디자인 완료 (${STATE.blocks.length}개 블록) — [카테고리 생성] 시 함께 저장됩니다.`;
      } else if (STATE.modalTarget && STATE.modalTarget.kind === 'row') {
        const code = STATE.modalTarget.code;
        if (!STATE.rowDrafts[code]) STATE.rowDrafts[code] = { content_mode: 'custom', target_url: '', url_display: 'embed', custom_html: '' };
        STATE.rowDrafts[code].custom_html = finalHtml;
        const badge = document.getElementById('nk-sp-row-custom-status-' + code);
        if (badge) badge.textContent = '본문 수정됨 — 상단/하단 [변경사항 일괄 저장]을 눌러 반영하세요.';
      }
      closeModal();
    });
  }

  function syncEditorModeUI() {
    const listEl = document.getElementById('nk-sp-blocks-list');
    const ta = document.getElementById('nk-sp-raw-textarea');
    const bar = document.getElementById('nk-sp-block-toolbar');
    const btn = document.getElementById('nk-sp-toggle-raw');
    if (STATE.rawHtmlMode) {
      listEl.style.display = 'none';
      ta.style.display = 'block';
      bar.style.opacity = '0.45';
      bar.style.pointerEvents = 'none';
      btn.textContent = '블록 편집으로';
      btn.classList.add('active');
    } else {
      listEl.style.display = 'block';
      ta.style.display = 'none';
      bar.style.opacity = '1';
      bar.style.pointerEvents = 'auto';
      btn.textContent = 'HTML 직접편집';
      btn.classList.remove('active');
    }
  }

  function addBlock(type) {
    const defaults = {
      heading: { type: 'heading', title: '새 섹션 제목', sub: '짧은 부제목을 입력하세요', align: 'left', color: '#1c355e', fontSize: '24px', fontFamily: '', fontUrl: '', fontWeight: '800' },
      text: { type: 'text', text: '여기에 본문 내용을 자유롭게 작성하세요.', align: 'left', fontSize: '15px', fontFamily: '', fontUrl: '', fontWeight: '400', color: '#334155' },
      callout: { type: 'callout', theme: 'navy', title: '안내 사항', body: '일정, 장소, 준비물 등 강조하고 싶은 내용을 입력하세요.', fontSize: '14px', fontFamily: '', fontUrl: '', fontWeight: '400', color: '' },
      cards: { type: 'cards', cols: 2, fontSize: '14px', fontFamily: '', fontUrl: '', fontWeight: '400', color: '', items: [{ title: '특징 1', body: '내용을 입력하세요.' }, { title: '특징 2', body: '내용을 입력하세요.' }] },
      image: { type: 'image', src: '', width: '100%', align: 'center', rounded: true, shadow: true, caption: '' },
      split: { type: 'split', src: '', title: '이미지 옆 제목', body: '이미지와 함께 보여줄 설명 문구를 입력하세요.', reverse: false, fontSize: '15px', fontFamily: '', fontUrl: '', fontWeight: '400', color: '' },
      table: { type: 'table', headers: ['항목', '내용', '비고'], rows: [['예시 1', '상세 설명', '-'], ['예시 2', '상세 설명', '-']] },
      button: { type: 'button', label: '자세히 보기', url: 'https://n-kids.github.io/newkids/', bg: '#1c355e', align: 'center', newTab: false },
      form: { type: 'form', formId: STATE.forms[0] ? STATE.forms[0].id : '' },
      youtube: { type: 'youtube', url: '' },
      divider: { type: 'divider' }
    };
    const item = Object.assign({ id: uid() }, JSON.parse(JSON.stringify(defaults[type] || defaults.text)));
    STATE.blocks.push(item);
    renderBlockEditor();
  }

  function updateLivePreview() {
    const frame = document.getElementById('nk-sp-preview-frame');
    if (!frame) return;
    const raw = STATE.rawHtmlMode
      ? STATE.rawHtmlBuffer
      : STATE.blocks.map(renderBlockToHtml).join('\n');
    const previewHtml = raw.replace(/\[투표:([a-zA-Z0-9_-]+)\]/g, function (_, fid) {
      const f = STATE.forms.find(function (x) { return x.id === fid; });
      return `<div style="padding:18px;border:2px dashed #1c355e;border-radius:10px;background:#eff6ff;text-align:center;color:#1c355e;font-size:13px;font-weight:700;">폼/투표 자동 삽입 영역: ${esc(f ? f.title : fid)} ([투표:${esc(fid)}])</div>`;
    });
    frame.innerHTML = previewHtml || '<p style="text-align:center;color:#94a3b8;padding:40px 0;">상단에서 블록이나 템플릿을 추가하면 여기에 실시간으로 표시됩니다.</p>';
  }

  function renderBlockEditor() {
    const listEl = document.getElementById('nk-sp-blocks-list');
    if (!listEl) return;

    if (!STATE.blocks.length) {
      listEl.innerHTML = `<div style="background:#fff;border:1px dashed #94a3b8;border-radius:10px;padding:32px;text-align:center;color:#64748b;font-size:13px;">상단의 <b>+ 블록 추가</b> 버튼이나 <b>뉴키즈 템플릿</b>을 선택해 페이지 디자인을 시작하세요.</div>`;
      updateLivePreview();
      return;
    }

    const labels = {
      heading: '제목 배너', text: '본문 글', callout: '안내 박스', cards: '2~3단 카드',
      image: '이미지', split: '이미지 + 글', table: '표(Table)', button: '강조 버튼',
      form: '폼/투표 삽입', youtube: '유튜브 영상', divider: '구분선', raw: '직접 HTML'
    };

    listEl.innerHTML = STATE.blocks.map(function (b, idx) {
      return `<div class="nk-blk-card" data-blk-id="${b.id}">
        <div class="nk-blk-head">
          <div><span class="nk-blk-drag" title="드래그해 순서 변경">⋮⋮</span>${labels[b.type] || b.type}</div>
          <div class="nk-blk-actions">
            <button type="button" class="nk-blk-mini" data-move-up="${idx}">▲</button>
            <button type="button" class="nk-blk-mini" data-move-down="${idx}">▼</button>
            <button type="button" class="nk-blk-mini" data-dup="${idx}">복제</button>
            <button type="button" class="nk-blk-mini danger" data-del="${idx}">삭제</button>
          </div>
        </div>
        <div class="nk-blk-body">${renderBlockFields(b, idx)}</div>
      </div>`;
    }).join('');

    bindBlockEditorEvents(listEl);
    initBlockSortable(listEl);
    updateLivePreview();
  }

  function renderBlockFields(b, idx) {
    if (b.type === 'heading') {
      return `
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>제목</label><input type="text" data-k="title" data-i="${idx}" value="${esc(b.title)}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}"></div>
          <div class="nk-sp-field"><label>정렬</label><select data-k="align" data-i="${idx}"><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option></select></div>
          <div class="nk-sp-field"><label>제목 색상</label><input type="color" data-k="color" data-i="${idx}" value="${esc(b.color || '#1c355e')}" style="height:34px;padding:2px;"></div>${renderSizeSelectHtml(b, idx, '24px')}${renderWeightSelectHtml(b, idx, '800')}${renderFontSelectHtml(b, idx)}
        </div>
        <div class="nk-sp-field"><label>부제목 (선택)</label><input type="text" data-k="sub" data-i="${idx}" value="${esc(b.sub)}"></div>${renderFontMgrHtml(idx)}`;
    }
    if (b.type === 'text') {
      return `
        <div class="nk-sp-grid">
          ${renderSizeSelectHtml(b, idx, '15px')}${renderWeightSelectHtml(b, idx, '400')}${renderFontSelectHtml(b, idx)}<div class="nk-blk-field"><label>글씨 색</label><input type="color" data-k="color" data-i="${idx}" value="${esc(b.color || '#334155')}"></div>
          <div class="nk-sp-field"><label>정렬</label><select data-k="align" data-i="${idx}"><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option></select></div>
        </div>
        <div class="nk-sp-field"><label>본문 내용 (줄바꿈 지원)</label><textarea rows="4" data-k="text" data-i="${idx}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}">${esc(b.text)}</textarea></div>${renderFontMgrHtml(idx)}`;
    }
    if (b.type === 'callout') {
      return `
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>제목</label><input type="text" data-k="title" data-i="${idx}" value="${esc(b.title)}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}"></div>
          <div class="nk-sp-field"><label>박스 테마</label><select data-k="theme" data-i="${idx}"><option value="navy" ${b.theme === 'navy' ? 'selected' : ''}>네이비</option><option value="green" ${b.theme === 'green' ? 'selected' : ''}>그린</option><option value="amber" ${b.theme === 'amber' ? 'selected' : ''}>앰버(강조)</option><option value="gray" ${b.theme === 'gray' ? 'selected' : ''}>그레이</option></select></div>${renderSizeSelectHtml(b, idx, '14px')}${renderWeightSelectHtml(b, idx, '400')}${renderFontSelectHtml(b, idx)}<div class="nk-blk-field"><label>글씨 색</label><input type="color" data-k="color" data-i="${idx}" value="${esc(b.color || '#1e293b')}"></div>
        </div>
        <div class="nk-sp-field"><label>내용</label><textarea rows="3" data-k="body" data-i="${idx}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}">${esc(b.body)}</textarea></div>${renderFontMgrHtml(idx)}`;
    }
    if (b.type === 'cards') {
      const cardEditors = (b.items || []).map(function (it, ci) {
        return `<div style="padding:8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;display:grid;gap:6px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:#475569;">
            <span>카드 ${ci + 1}</span>
            <button type="button" class="nk-blk-mini danger" data-card-del="${idx}:${ci}">제거</button>
          </div>
          <input type="text" placeholder="카드 제목" data-card-k="title" data-i="${idx}" data-ci="${ci}" value="${esc(it.title)}" style="padding:6px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;">
          <textarea rows="2" placeholder="카드 설명" data-card-k="body" data-i="${idx}" data-ci="${ci}" style="padding:6px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;">${esc(it.body)}</textarea>
        </div>`;
      }).join('');
      return `
        <div class="nk-sp-grid">${renderSizeSelectHtml(b, idx, '14px')}${renderWeightSelectHtml(b, idx, '400')}${renderFontSelectHtml(b, idx)}<div class="nk-blk-field"><label>글씨 색</label><input type="color" data-k="color" data-i="${idx}" value="${esc(b.color || '#334155')}"></div></div>${renderFontMgrHtml(idx)}<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <select data-k="cols" data-i="${idx}" style="padding:5px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;">
            <option value="2" ${Number(b.cols) !== 3 ? 'selected' : ''}>2단 배치</option>
            <option value="3" ${Number(b.cols) === 3 ? 'selected' : ''}>3단 배치</option>
          </select>
          <button type="button" class="nk-blk-mini" data-card-add="${idx}">+ 카드 추가</button>
        </div>
        ${cardEditors}`;
    }
    if (b.type === 'image') {
      return `
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>이미지 업로드 (WebP 자동 압축)</label><input type="file" accept="image/*" data-img-upload="${idx}"></div>
          <div class="nk-sp-field"><label>또는 이미지 URL</label><input type="text" data-k="src" data-i="${idx}" value="${esc(b.src)}" placeholder="https://..."></div>
        </div>
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>가로 크기</label><select data-k="width" data-i="${idx}"><option value="100%" ${b.width === '100%' ? 'selected' : ''}>100% (전체)</option><option value="75%" ${b.width === '75%' ? 'selected' : ''}>75%</option><option value="50%" ${b.width === '50%' ? 'selected' : ''}>50%</option></select></div>
          <div class="nk-sp-field"><label>정렬</label><select data-k="align" data-i="${idx}"><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="right" ${b.align === 'right' ? 'selected' : ''}>오른쪽</option></select></div>
          <div class="nk-sp-field"><label>캡션 (선택)</label><input type="text" data-k="caption" data-i="${idx}" value="${esc(b.caption)}"></div>
        </div>`;
    }
    if (b.type === 'split') {
      return `
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>이미지 업로드</label><input type="file" accept="image/*" data-img-upload="${idx}"></div>
          <div class="nk-sp-field"><label>배치 방향</label><select data-k="reverse" data-i="${idx}"><option value="false" ${!b.reverse ? 'selected' : ''}>이미지 왼쪽 · 글 오른쪽</option><option value="true" ${b.reverse ? 'selected' : ''}>글 왼쪽 · 이미지 오른쪽</option></select></div>
        </div>
        <div class="nk-sp-field"><label>제목</label><input type="text" data-k="title" data-i="${idx}" value="${esc(b.title)}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}"></div>
        <div class="nk-sp-field"><label>설명 내용</label><textarea rows="3" data-k="body" data-i="${idx}" style="${b.fontFamily ? 'font-family:' + esc(b.fontFamily) + ';' : ''}">${esc(b.body)}</textarea></div><div class="nk-sp-grid">${renderSizeSelectHtml(b, idx, '15px')}${renderWeightSelectHtml(b, idx, '400')}${renderFontSelectHtml(b, idx)}<div class="nk-blk-field"><label>글씨 색</label><input type="color" data-k="color" data-i="${idx}" value="${esc(b.color || '#334155')}"></div></div>${renderFontMgrHtml(idx)}`;
    }
    if (b.type === 'table') {
      const headers = b.headers || ['항목', '내용'];
      const rows = b.rows || [];
      return `
        <div class="nk-sp-field"><label>열 제목 (쉼표로 구분)</label><input type="text" data-tbl-headers="${idx}" value="${esc(headers.join(', '))}"></div>
        <div class="nk-sp-field"><label>표 행 데이터 (한 줄에 한 행, | 기호로 열 구분)</label><textarea rows="4" data-tbl-rows="${idx}">${esc(rows.map(function (r) { return r.join(' | '); }).join('\n'))}</textarea></div>`;
    }
    if (b.type === 'button') {
      return `
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>버튼 문구</label><input type="text" data-k="label" data-i="${idx}" value="${esc(b.label)}"></div>
          <div class="nk-sp-field"><label>이동 URL</label><input type="text" data-k="url" data-i="${idx}" value="${esc(b.url)}" placeholder="https://... 또는 proposal.html"></div>
        </div>
        <div class="nk-sp-grid">
          <div class="nk-sp-field"><label>버튼 색상</label><input type="color" data-k="bg" data-i="${idx}" value="${esc(b.bg || '#1c355e')}" style="height:34px;padding:2px;"></div>
          <div class="nk-sp-field"><label>정렬</label><select data-k="align" data-i="${idx}"><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="right" ${b.align === 'right' ? 'selected' : ''}>오른쪽</option></select></div>
          <div class="nk-sp-field"><label>열기 방식</label><select data-k="newTab" data-i="${idx}"><option value="false" ${!b.newTab ? 'selected' : ''}>현재 창</option><option value="true" ${b.newTab ? 'selected' : ''}>새 탭</option></select></div>
        </div>`;
    }
    if (b.type === 'form') {
      return `<div class="nk-sp-field"><label>본문 중간에 삽입할 폼/투표 선택</label><select data-k="formId" data-i="${idx}">${buildFormOptionsHtml(b.formId, true)}</select></div>`;
    }
    if (b.type === 'youtube') {
      return `<div class="nk-sp-field"><label>유튜브 영상 주소</label><input type="text" data-k="url" data-i="${idx}" value="${esc(b.url)}" placeholder="https://www.youtube.com/watch?v=..."></div>`;
    }
    if (b.type === 'divider') {
      return `<div style="font-size:12px;color:#64748b;">섹션 사이를 깔끔하게 나누는 가로 구분선입니다.</div>`;
    }
    return `<div class="nk-sp-field"><label>직접 HTML 코드</label><textarea rows="5" data-k="html" data-i="${idx}" style="font-family:monospace;font-size:12px;">${esc(b.html)}</textarea></div>`;
  }

  function bindBlockEditorEvents(listEl) {
    listEl.querySelectorAll('[data-k]').forEach(function (el) {
      const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        const i = Number(el.dataset.i);
        const k = el.dataset.k;
        let v = el.value;
        if (k === 'cols') v = Number(v);
        if (k === 'reverse' || k === 'newTab') v = v === 'true';
        if (STATE.blocks[i]) { STATE.blocks[i][k] = v; if (k === 'fontFamily') { const f = getAllFonts().find(x => x.css === v || x.family === v); STATE.blocks[i].fontUrl = f ? (f.url || '') : ''; STATE.blocks[i].fontLabel = f ? (f.label || '') : ''; if (STATE.blocks[i].fontUrl) injectFontAsset(STATE.blocks[i].fontUrl, v); listEl.querySelectorAll('input[data-k="title"][data-i="' + i + '"], textarea[data-k="text"][data-i="' + i + '"], textarea[data-k="body"][data-i="' + i + '"]').forEach(function (t) { t.style.fontFamily = v || ''; }); } }
        updateLivePreview();
      });
    });

    listEl.querySelectorAll('[data-sp-font-mode]').forEach(function (sel) { sel.addEventListener('change', function () { const idx = sel.dataset.spFontMode; const wrap = listEl.querySelector('[data-sp-font-url-wrap="' + idx + '"]'); if (wrap) wrap.style.display = sel.value === 'url' ? '' : 'none'; }); }); listEl.querySelectorAll('[data-sp-font-add]').forEach(function (btn) { btn.addEventListener('click', function () { const idx = Number(btn.dataset.spFontAdd); const modeEl = listEl.querySelector('[data-sp-font-mode="' + idx + '"]'); const labelEl = listEl.querySelector('[data-sp-font-label="' + idx + '"]'); const cssEl = listEl.querySelector('[data-sp-font-css="' + idx + '"]'); const urlEl = listEl.querySelector('[data-sp-font-url="' + idx + '"]'); const mode = modeEl ? modeEl.value : 'google'; const label = labelEl ? labelEl.value.trim() : ''; const rawCss = cssEl ? sanitizeFontFamily(cssEl.value) : ''; let css = rawCss; let url = ''; if (mode === 'url') { url = urlEl ? urlEl.value.trim() : ''; if (!/^https:\/\/\S+/i.test(url)) { alert('https:// 로 시작하는 올바른 웹폰트 CSS URL을 입력하세요.'); return; } if (!css) { alert('CSS font-family 값을 입력하세요.'); return; } } else { const familyName = (label || rawCss.replace(/['",].*$/, '')).trim(); if (!familyName) { alert('Google Fonts 이름 또는 CSS font-family를 입력하세요.'); return; } url = buildGoogleFontUrl(familyName); if (!css) css = "'" + familyName + "', sans-serif"; } const custom = loadCustomFonts(); const fontLabel = label || css; if (!custom.some(f => f.css === css && f.url === url)) { custom.push({ label: fontLabel, css: css, url: url }); saveCustomFonts(custom); } injectFontAsset(url, css); if (STATE.blocks[idx]) { STATE.blocks[idx].fontFamily = css; STATE.blocks[idx].fontUrl = url; STATE.blocks[idx].fontLabel = fontLabel; } renderBlockEditor(); updateLivePreview(); }); }); listEl.querySelectorAll('[data-sp-font-del]').forEach(function (btn) { btn.addEventListener('click', function () { const ci = Number(btn.dataset.spFontDel); const custom = loadCustomFonts(); if (ci >= 0 && ci < custom.length) { custom.splice(ci, 1); saveCustomFonts(custom); renderBlockEditor(); } }); }); listEl.querySelectorAll('[data-card-k]').forEach(function (el) {
      el.addEventListener('input', function () {
        const i = Number(el.dataset.i);
        const ci = Number(el.dataset.ci);
        if (STATE.blocks[i] && STATE.blocks[i].items[ci]) {
          STATE.blocks[i].items[ci][el.dataset.cardK] = el.value;
          updateLivePreview();
        }
      });
    });

    listEl.querySelectorAll('[data-card-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.cardAdd);
        STATE.blocks[i].items.push({ title: '새 카드', body: '내용을 입력하세요.' });
        renderBlockEditor();
      });
    });

    listEl.querySelectorAll('[data-card-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const parts = btn.dataset.cardDel.split(':').map(Number);
        STATE.blocks[parts[0]].items.splice(parts[1], 1);
        renderBlockEditor();
      });
    });

    listEl.querySelectorAll('[data-tbl-headers]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const i = Number(inp.dataset.tblHeaders);
        STATE.blocks[i].headers = inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        updateLivePreview();
      });
    });

    listEl.querySelectorAll('[data-tbl-rows]').forEach(function (ta) {
      ta.addEventListener('input', function () {
        const i = Number(ta.dataset.tblRows);
        STATE.blocks[i].rows = ta.value.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
          return l.split('|').map(function (c) { return c.trim(); });
        });
        updateLivePreview();
      });
    });

    listEl.querySelectorAll('[data-img-upload]').forEach(function (inp) {
      inp.addEventListener('change', async function () {
        const file = inp.files && inp.files[0];
        if (!file) return;
        const i = Number(inp.dataset.imgUpload);
        try {
          const url = await uploadImageToSupabase(file);
          STATE.blocks[i].src = url;
          renderBlockEditor();
        } catch (err) {
          alert('이미지 업로드 오류: ' + (err.message || err));
        } finally {
          inp.value = '';
        }
      });
    });

    listEl.querySelectorAll('[data-move-up]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.moveUp);
        if (i <= 0) return;
        const tmp = STATE.blocks[i - 1];
        STATE.blocks[i - 1] = STATE.blocks[i];
        STATE.blocks[i] = tmp;
        renderBlockEditor();
      });
    });

    listEl.querySelectorAll('[data-move-down]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.moveDown);
        if (i >= STATE.blocks.length - 1) return;
        const tmp = STATE.blocks[i + 1];
        STATE.blocks[i + 1] = STATE.blocks[i];
        STATE.blocks[i] = tmp;
        renderBlockEditor();
      });
    });

    listEl.querySelectorAll('[data-dup]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.dup);
        const clone = JSON.parse(JSON.stringify(STATE.blocks[i]));
        clone.id = uid();
        STATE.blocks.splice(i + 1, 0, clone);
        renderBlockEditor();
      });
    });

    listEl.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.del);
        STATE.blocks.splice(i, 1);
        renderBlockEditor();
      });
    });
  }

  function initBlockSortable(listEl) {
    if (STATE.sortable) {
      try { STATE.sortable.destroy(); } catch (_) {}
      STATE.sortable = null;
    }
    if (typeof window.Sortable === 'function') {
      STATE.sortable = new window.Sortable(listEl, {
        handle: '.nk-blk-drag',
        animation: 150,
        onEnd: function (evt) {
          if (evt.oldIndex === evt.newIndex) return;
          const moved = STATE.blocks.splice(evt.oldIndex, 1)[0];
          STATE.blocks.splice(evt.newIndex, 0, moved);
          renderBlockEditor();
        }
      });
    }
  }

  function openEditorModal(target, title, initialHtml) {
    ensureEditorModal();
    STATE.modalTarget = target;
    STATE.rawHtmlMode = false;
    STATE.blocks = deserializeHtmlToBlocks(initialHtml);
    STATE.rawHtmlBuffer = initialHtml || '';
    document.getElementById('nk-sp-modal-title').textContent = title;
    syncEditorModeUI();
    renderBlockEditor();
    document.getElementById('nk-sp-editor-modal').classList.add('open');
  }

  // ==========================================================================
  // 5. 서브 페이지 관리 UI 마운트 & 기존 저장 함수 안전 래핑
  // ==========================================================================
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
        <span style="font-size:11px;font-weight:400;color:#64748b;">게시글 관리로 이동하지 않고 바로 연결·디자인할 수 있습니다</span>
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
          <select id="nk-sp-new-form-select">${buildFormOptionsHtml('', false)}</select>
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
        <span id="nk-sp-new-custom-status" style="font-size:12px;color:#475569;">아직 작성된 본문이 없습니다. 블록 디자인 에디터를 열어 작성해 주세요.</span>
        <button type="button" id="nk-sp-new-open-editor" class="nk-sp-btn">블록 디자인 에디터 열기</button>
      </div>

      <div id="nk-sp-new-post-panel" style="display:none;font-size:12px;color:#475569;">
        기존 방식대로 <b>게시글 관리</b>에서 이 카테고리 코드로 글을 작성하면 자동으로 표시됩니다.
      </div>
    `;

    const submitBtn = panelBox.querySelector('button[onclick*="addNewCategory"]');
    if (submitBtn && submitBtn.parentNode) submitBtn.parentNode.insertBefore(box, submitBtn);
    else panelBox.appendChild(box);

    typeSelect.addEventListener('change', function () {
      box.style.display = typeSelect.value === 'PAGE' ? 'block' : 'none';
    });

    box.querySelectorAll('[data-new-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mode = btn.dataset.newMode;
        document.getElementById('nk-sp-new-mode').value = mode;
        box.querySelectorAll('[data-new-mode]').forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.getElementById('nk-sp-new-url-panel').style.display = mode === 'url' ? 'grid' : 'none';
        document.getElementById('nk-sp-new-custom-panel').style.display = mode === 'custom' ? 'flex' : 'none';
        document.getElementById('nk-sp-new-post-panel').style.display = mode === 'post' ? 'block' : 'none';
      });
    });

    document.getElementById('nk-sp-new-form-select').addEventListener('change', function (e) {
      if (e.target.value) document.getElementById('nk-sp-new-target-url').value = 'form.html?id=' + e.target.value;
    });

    document.getElementById('nk-sp-new-open-editor').addEventListener('click', function () {
      openEditorModal({ kind: 'new' }, '새 고정 페이지 본문 디자인', STATE.newCustomHtml);
    });
  }

  function enhanceStaticPageRows(forceRebuild) {
    const pageList = document.getElementById('sortable-list-PAGE');
    if (!pageList) return;

    pageList.querySelectorAll('.cm-row').forEach(function (row) {
      const code = row.dataset.code;
      if (!code) return;
      const existing = row.querySelector('.nk-sp-row-ext');
      if (existing) {
        if (!forceRebuild) return;
        existing.remove();
      }

      const cat = STATE.catMetaByCode[code] || {};
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
            <select class="nk-sp-row-form-select">${buildFormOptionsHtml(draft.target_url, false)}</select>
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
          <button type="button" class="nk-sp-btn nk-sp-row-edit-btn">블록 디자인 편집</button>
        </div>

        <div class="nk-sp-row-post-panel" style="display:${draft.content_mode === 'post' ? 'block' : 'none'};font-size:12px;color:#64748b;">
          기존 <b>게시글 관리</b>에 등록된 글이 표시됩니다.
        </div>
      `;

      row.appendChild(ext);

      ext.querySelectorAll('[data-row-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const mode = btn.dataset.rowMode;
          STATE.rowDrafts[code].content_mode = mode;
          ext.querySelectorAll('[data-row-mode]').forEach(function (b) { b.classList.toggle('active', b === btn); });
          ext.querySelector('.nk-sp-row-url-panel').style.display = mode === 'url' ? 'grid' : 'none';
          ext.querySelector('.nk-sp-row-custom-panel').style.display = mode === 'custom' ? 'flex' : 'none';
          ext.querySelector('.nk-sp-row-post-panel').style.display = mode === 'post' ? 'block' : 'none';
        });
      });

      const formSel = ext.querySelector('.nk-sp-row-form-select');
      const urlInp = ext.querySelector('.nk-sp-row-target-url');
      const dispSel = ext.querySelector('.nk-sp-row-url-display');

      formSel.addEventListener('change', function () {
        if (formSel.value) {
          const nextUrl = 'form.html?id=' + formSel.value;
          urlInp.value = nextUrl;
          STATE.rowDrafts[code].target_url = nextUrl;
        }
      });
      urlInp.addEventListener('input', function () { STATE.rowDrafts[code].target_url = urlInp.value.trim(); });
      dispSel.addEventListener('change', function () { STATE.rowDrafts[code].url_display = dispSel.value; });
      ext.querySelector('.nk-sp-row-edit-btn').addEventListener('click', function () {
        openEditorModal({ kind: 'row', code: code }, `"${cat.name || code}" 본문 블록 디자인`, STATE.rowDrafts[code].custom_html);
      });
    });
  }

  function wrapAdminFunctions() {
    if (typeof window.loadAdminCategories === 'function' && !window.loadAdminCategories.__nkWrapped) {
      const origLoad = window.loadAdminCategories;
      const wrappedLoad = async function () {
        await loadCategoryMeta();
        const res = await origLoad.apply(this, arguments);
        enhanceStaticPageRows(true);
        return res;
      };
      wrappedLoad.__nkWrapped = true;
      window.loadAdminCategories = wrappedLoad;
    }

    if (typeof window.addNewCategory === 'function' && !window.addNewCategory.__nkWrapped) {
      const origAdd = window.addNewCategory;
      const wrappedAdd = async function () {
        const typeEl = document.getElementById('new-cat-type');
        const codeEl = document.getElementById('new-cat-code');
        const nameEl = document.getElementById('new-cat-name');
        const isPage = typeEl && typeEl.value === 'PAGE';
        const code = codeEl ? codeEl.value.trim().toLowerCase() : '';
        const name = nameEl ? nameEl.value.trim() : '';
        const mode = document.getElementById('nk-sp-new-mode')?.value || 'post';
        const targetUrl = document.getElementById('nk-sp-new-target-url')?.value.trim() || '';
        const urlDisplay = document.getElementById('nk-sp-new-url-display')?.value || 'embed';
        const customHtml = mode === 'custom' ? STATE.newCustomHtml : '';

        // origAdd 내부의 loadAdminCategories 호출 시에도 최신 draft가 유지되도록 미리 반영
        if (isPage && code) {
          const pendingMeta = {
            code: code,
            name: name,
            type: 'PAGE',
            content_mode: mode,
            target_url: targetUrl || '',
            url_display: urlDisplay,
            custom_html: customHtml || ''
          };
          STATE.catMetaByCode[code] = pendingMeta;
          STATE.rowDrafts[code] = Object.assign({}, pendingMeta);
        }

        const res = await origAdd.apply(this, arguments);

        if (isPage && code && window.sb) {
          try {
            const { error } = await window.sb.from('program_categories').update({
              content_mode: mode,
              target_url: targetUrl || null,
              url_display: urlDisplay,
              custom_html: customHtml || null
            }).eq('code', code);

            if (error) {
              alert('고정 페이지 디자인/URL 저장 오류 (Supabase 마이그레이션 SQL 적용 여부를 확인해 주세요): ' + error.message);
            } else {
              STATE.newCustomHtml = '';
              const urlField = document.getElementById('nk-sp-new-target-url');
              if (urlField) urlField.value = '';
              const statusEl = document.getElementById('nk-sp-new-custom-status');
              if (statusEl) statusEl.textContent = '아직 작성된 본문이 없습니다. 블록 디자인 에디터를 열어 작성해 주세요.';
              await loadCategoryMeta();
              enhanceStaticPageRows(true);
            }
          } catch (err) {
            console.error('[admin-static-pages] 저장 오류:', err);
          }
        }
        return res;
      };
      wrappedAdd.__nkWrapped = true;
      window.addNewCategory = wrappedAdd;
    }

    if (typeof window.saveAllCategories === 'function' && !window.saveAllCategories.__nkWrapped) {
      const origSave = window.saveAllCategories;
      const wrappedSave = async function () {
        const draftsCopy = JSON.parse(JSON.stringify(STATE.rowDrafts));
        const res = await origSave.apply(this, arguments);
        if (window.sb) {
          const codes = Object.keys(draftsCopy);
          const results = await Promise.all(codes.map(function (code) {
            const d = draftsCopy[code];
            return window.sb.from('program_categories').update({
              content_mode: d.content_mode || 'post',
              target_url: d.target_url || null,
              url_display: d.url_display || 'embed',
              custom_html: d.custom_html || null
            }).eq('code', code);
          }));
          const firstErr = results.find(function (r) { return r && r.error; });
          if (firstErr) {
            alert('고정 페이지 연결 설정 저장 오류: ' + firstErr.error.message);
          } else {
            await loadCategoryMeta();
            enhanceStaticPageRows(true);
          }
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
    const observer = new MutationObserver(function () { enhanceStaticPageRows(); });
    observer.observe(container, { childList: true, subtree: true });
    enhanceStaticPageRows();
  }

  async function init() {
    injectStyles();
    await Promise.all([loadCustomForms(), loadCategoryMeta()]);
    mountNewCategoryPanel();
    wrapAdminFunctions();
    observeCategoryContainer();
    enhanceStaticPageRows(true);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const timer = setInterval(function () {
      if (window.sb && document.getElementById('new-cat-type')) {
        clearInterval(timer);
        init();
      }
    }, 150);
  });
})();
