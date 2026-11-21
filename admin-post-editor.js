/**
 * ============================================================================
 * 뉴키즈 관리자(admin.html) — 게시글 관리(#tab-posts) 자유 작성 강화 모듈
 * 파일명: admin-post-editor.js
 * 적용 방법: admin.html 하단 <script src="admin-static-pages.js..."></script> 아래에 1줄 추가
 *   <script src="admin-post-editor.js?v=20261121"></script>
 *
 * 포함 기능 (6종):
 * 1) 일반 글쓰기(Quill) ↔ 블록 디자인 모드 전환 (기본값: Quill, 기존 기능·테스트 100% 호환)
 * 2) 표(Table) 간편 편집기 (열 제목, 행 추가/삭제, 헤더 색상)
 * 3) 다중 이미지 2~3열 갤러리 + 단일 이미지 크기/정렬/캡션 (Supabase images WebP 업로드)
 * 4) 게시글 유형별 원클릭 템플릿 4종 (교재소개 / 행사 안내+폼 / 자료실 배포 / 일반 공지)
 * 5) 유튜브 영상 임베드 · CTA 강조 버튼 · 폼/투표([투표:ID]) 1클릭 삽입
 * 6) PC / 모바일(390px) 실시간 미리보기 + 20초 자동 임시저장 및 복구 배너
 * ============================================================================
 */
(function () {
  'use strict';

  const AUTOSAVE_KEY = 'nk_post_block_draft_v1';
  const CUSTOM_FONTS_KEY = 'nk_post_custom_fonts_v1';
  const BUILTIN_FONTS = [
    { label: '기본 폰트', family: '' },
    { label: '나눔고딕', family: "'Nanum Gothic', sans-serif" },
    { label: '나눔명조', family: "'Nanum Myeongjo', serif" },
    { label: '고운돋움', family: "'Gowun Dodum', sans-serif" },
    { label: '고운바탕', family: "'Gowun Batang', serif" },
    { label: '본고딕', family: "'Noto Sans KR', sans-serif" },
    { label: '본명조', family: "'Noto Serif KR', serif" },
    { label: '블랙한산스', family: "'Black Han Sans', sans-serif" },
    { label: '도현체', family: "'Do Hyeon', sans-serif" },
    { label: '주아체', family: "'Jua', sans-serif" },
    { label: '구기체', family: "'Gugi', sans-serif" },
    { label: '서툰이야기', family: "'Poor Story', sans-serif" },
    { label: '송명조', family: "'Song Myung', serif" }
  ];

  function sanitizeFontFamily(val) {
    return String(val || '').replace(/["<>;{}\r\n]/g, '').trim();
  }

  function loadCustomFonts() {
    try {
      const raw = localStorage.getItem(CUSTOM_FONTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(f => f && f.label && f.family && f.url) : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomFonts(list) {
    try {
      localStorage.setItem(CUSTOM_FONTS_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  function injectFontAsset(font) {
    if (!font || !font.url) return;
    let parsedUrl;
    try {
      parsedUrl = new URL(String(font.url).trim());
    } catch (_) {
      return;
    }
    if (parsedUrl.protocol !== 'https:') return;
    const safeHref = parsedUrl.href;
    const exists = Array.from(document.querySelectorAll('[data-nk-font-url]')).some(
      el => el.getAttribute('data-nk-font-url') === safeHref
    );
    if (exists) return;

    if (/\.(?:woff2|woff|ttf|otf)(?:[?#].*)?$/i.test(safeHref)) {
      const rawName = String(font.cssName || font.family || '')
        .split(',')[0]
        .replace(/['"\\;{}<>\r\n]/g, '')
        .trim();
      if (!rawName) return;
      const style = document.createElement('style');
      style.setAttribute('data-nk-font-url', safeHref);
      style.textContent = `@font-face { font-family: '${rawName}'; src: url('${safeHref}'); font-display: swap; }`;
      document.head.appendChild(style);
    } else {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = safeHref;
      link.setAttribute('data-nk-font-url', safeHref);
      document.head.appendChild(link);
    }
  }

  function getAllFonts() {
    const custom = loadCustomFonts();
    custom.forEach(injectFontAsset);
    return BUILTIN_FONTS.concat(custom);
  }

  function buildGoogleFontUrl(googleFontName) {
    const clean = String(googleFontName || '').trim().replace(/\s+/g, '+');
    return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean).replace(/%2B/g, '+')}&display=swap`;
  }
  
  const STATE = {
    mode: 'quill', // 'quill' | 'blocks'
    blocks: [],
    forms: [],
    showPreview: true,
    previewDevice: 'pc', // 'pc' | 'mobile'
    rawHtmlMode: false,
    rawHtmlBuffer: '',
    sortable: null,
    autosaveTimer: null
  };

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  function uid() {
    return 'pblk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function parseYoutubeEmbed(url) {
    const s = String(url || '').trim();
    if (!s) return '';
    const m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : '';
  }

  // ==========================================================================
  // 1. 블록 → 안전한 HTML 직렬화 (manager.js sanitizeHtml 100% 호환)
  // ==========================================================================
  function renderBlockToHtml(b) {
    if (!b || !b.type) return '';

    if (b.type === 'heading') {
      const align = b.align || 'left';
      const color = b.color || '#1c355e';
      const sub = b.sub ? `<p style="margin:6px 0 0; font-size:15px; color:#64748b; line-height:1.6;">${esc(b.sub)}</p>` : '';
      return `<div style="text-align:${align}; margin:20px 0 14px; padding-bottom:10px; border-bottom:2px solid #e2e8f0;">
  <h2 style="margin:0; font-size:24px; font-weight:800; color:${esc(color)}; line-height:1.35;">${esc(b.title || '')}</h2>
  ${sub}
</div>`;
    }

    if (b.type === 'text') {
      const align = b.align || 'left';
      const size = b.fontSize || '15px';
      const font = sanitizeFontFamily(b.fontFamily || '');
      if (b.fontUrl && font) injectFontAsset({ family: font, url: b.fontUrl });
      const fontCss = font ? ` font-family:${font};` : '';
      const body = String(b.text || '').split('\n').map(function (line) {
        return line.trim() ? `<p style="margin:0 0 10px; font-size:${size}${fontCss}; line-height:1.75; color:#334155;">${esc(line)}</p>` : '';
      }).join('');
      return `<div style="text-align:${align}; margin:14px 0;">${body || '<p style="margin:0; color:#94a3b8;">내용을 입력하세요.</p>'}</div>`;
    }

    if (b.type === 'callout') {
      const themes = {
        navy: { bg: '#eff6ff', border: '#1c355e', title: '#1c355e' },
        green: { bg: '#ecfdf5', border: '#059669', title: '#065f46' },
        amber: { bg: '#fffbeb', border: '#d97706', title: '#92400e' },
        gray: { bg: '#f8fafc', border: '#64748b', title: '#334155' }
      };
      const t = themes[b.theme] || themes.navy;
      const lines = String(b.body || '').split('\n').map(esc).join('<br>');
      return `<div style="background-color:${t.bg}; border-left:4px solid ${t.border}; border-radius:8px; padding:16px 18px; margin:16px 0;">
  ${b.title ? `<div style="font-size:15px; font-weight:700; color:${t.title}; margin-bottom:6px;">${esc(b.title)}</div>` : ''}
  <div style="font-size:14px; line-height:1.7; color:#334155;">${lines}</div>
</div>`;
    }

    if (b.type === 'cards') {
      const items = Array.isArray(b.items) ? b.items : [];
      const cols = Number(b.cols) === 3 ? 'repeat(auto-fit, minmax(180px, 1fr))' : 'repeat(auto-fit, minmax(230px, 1fr))';
      const inner = items.map(function (it) {
        return `<div style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-sizing:border-box;">
    <div style="font-size:16px; font-weight:700; color:#1c355e; margin-bottom:8px;">${esc(it.title || '')}</div>
    <p style="margin:0; font-size:14px; line-height:1.65; color:#475569;">${esc(it.body || '').replace(/\n/g, '<br>')}</p>
  </div>`;
      }).join('\n');
      return `<div style="display:grid; grid-template-columns:${cols}; gap:14px; margin:18px 0;">${inner}</div>`;
    }

    if (b.type === 'gallery') {
      const photos = Array.isArray(b.photos) ? b.photos : [];
      if (!photos.length) {
        return `<div style="padding:26px; text-align:center; background-color:#f1f5f9; border:1px dashed #94a3b8; border-radius:10px; color:#64748b; font-size:13px; margin:16px 0;">사진을 여러 장 선택해 2~3열 갤러리로 배치해 보세요.</div>`;
      }
      const cols = Number(b.cols) === 3 ? 'repeat(auto-fit, minmax(170px, 1fr))' : 'repeat(auto-fit, minmax(240px, 1fr))';
      const inner = photos.map(function (ph) {
        const cap = ph.caption ? `<figcaption style="margin-top:6px; font-size:12px; color:#64748b; text-align:center;">${esc(ph.caption)}</figcaption>` : '';
        return `<figure style="margin:0; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:10px; padding:8px; box-sizing:border-box;">
    <img src="${esc(ph.src)}" alt="${esc(ph.caption || '갤러리 이미지')}" style="width:100%; height:200px; object-fit:cover; border-radius:6px; display:block;">
    ${cap}
  </figure>`;
      }).join('\n');
      return `<div style="display:grid; grid-template-columns:${cols}; gap:12px; margin:18px 0;">${inner}</div>`;
    }

    if (b.type === 'image') {
      if (!b.src) {
        return `<div style="padding:26px; text-align:center; background-color:#f1f5f9; border:1px dashed #94a3b8; border-radius:10px; color:#64748b; font-size:13px; margin:16px 0;">이미지를 업로드하거나 URL을 입력해 주세요.</div>`;
      }
      const width = b.width || '100%';
      const align = b.align || 'center';
      const radius = b.rounded !== false ? '12px' : '0px';
      const shadow = b.shadow ? '0 8px 24px rgba(15,23,42,0.12)' : 'none';
      const caption = b.caption ? `<figcaption style="margin-top:8px; font-size:13px; color:#64748b; text-align:${align};">${esc(b.caption)}</figcaption>` : '';
      return `<figure style="margin:18px 0; text-align:${align};">
  <img src="${esc(b.src)}" alt="${esc(b.caption || '이미지')}" style="width:${width}; max-width:100%; height:auto; border-radius:${radius}; box-shadow:${shadow}; display:inline-block;">
  ${caption}
</figure>`;
    }

    if (b.type === 'table') {
      const headers = Array.isArray(b.headers) ? b.headers : ['항목', '내용'];
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const hColor = b.headerColor || '#1c355e';
      const thHtml = headers.map(function (h) {
        return `<th style="background-color:${esc(hColor)}; color:#ffffff; padding:10px 12px; text-align:left; font-size:13px; font-weight:700; border:1px solid ${esc(hColor)};">${esc(h)}</th>`;
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
      return `<div style="text-align:${align}; margin:20px 0;">
  <a href="${esc(b.url || '#')}"${targetAttr} style="display:inline-block; background-color:${esc(bg)}; color:#ffffff; padding:12px 26px; border-radius:8px; font-size:15px; font-weight:700; text-decoration:none;">${esc(b.label || '바로가기')}</a>
</div>`;
    }

    if (b.type === 'form') {
      if (!b.formId) {
        return `<div style="padding:18px; text-align:center; background-color:#eff6ff; border:1px dashed #1c355e; border-radius:10px; color:#1c355e; font-size:13px; margin:16px 0;">삽입할 폼/투표를 선택해 주세요.</div>`;
      }
      return `<div style="margin:20px 0;">[투표:${esc(b.formId)}]</div>`;
    }

    if (b.type === 'youtube') {
      const embed = parseYoutubeEmbed(b.url);
      if (!embed) {
        return `<div style="padding:22px; text-align:center; background-color:#f8fafc; border:1px dashed #94a3b8; border-radius:10px; color:#64748b; font-size:13px; margin:16px 0;">유튜브 주소를 입력해 주세요.</div>`;
      }
      return `<div style="margin:20px 0; text-align:center;">
  <iframe src="${esc(embed)}" title="유튜브 영상" style="width:100%; max-width:720px; height:400px; border:none; border-radius:12px;" allowfullscreen></iframe>
</div>`;
    }

    if (b.type === 'divider') {
      return `<hr style="border:none; border-top:1px solid #e2e8f0; margin:22px 0;">`;
    }

    if (b.type === 'raw') {
      return String(b.html || '');
    }

    return '';
  }

  function serializeBlocks(blocks) {
    const html = blocks.map(renderBlockToHtml).join('\n');
    const meta = encodeURIComponent(JSON.stringify(blocks));
    return `<!-- NK_POST_BLOCKS_V1:${meta} -->\n${html}`;
  }

  function hasBlockMeta(html) {
    return /<!--\s*NK_POST_BLOCKS_V1:([\s\S]*?)\s*-->/.test(String(html || ''));
  }

  function deserializeBlocks(html, depth) {
    const str = String(html || '').trim();
    if (!str || (depth || 0) > 5) return [];
    const m = str.match(/<!--\s*NK_POST_BLOCKS_V1:([\s\S]*?)\s*-->/);
    if (m) {
      try {
        const parsed = JSON.parse(decodeURIComponent(m[1].trim()));
        if (Array.isArray(parsed)) {
          if (parsed.length === 1 && parsed[0] && parsed[0].type === 'raw' && /NK_POST_BLOCKS_V1:/.test(parsed[0].html || '')) {
            return deserializeBlocks(parsed[0].html, (depth || 0) + 1);
          }
          return parsed;
        }
      } catch (_) {}
    }
    return [{ id: uid(), type: 'raw', html: str }];
  }

  // ==========================================================================
  // 2. 게시글 유형별 원클릭 템플릿 4종
  // ==========================================================================
  const POST_TEMPLATES = {
    textbook: function () {
      return [
        { id: uid(), type: 'heading', title: '신규 교재 프로그램 소개', sub: '아이들의 눈높이에 맞춘 놀이 중심 통합 교육 커리큘럼', align: 'left', color: '#1c355e' },
        { id: uid(), type: 'cards', cols: 2, items: [
          { title: '핵심 학습 목표', body: '발달 단계에 맞춘 단계별 활동으로 자연스러운 흥미와 성취감을 높입니다.' },
          { title: '교사용 지원 자료', body: '연간계획안, 지도서, 가정통신문 양식까지 원 수업에 바로 적용 가능합니다.' }
        ] },
        { id: uid(), type: 'table', headerColor: '#1c355e', headers: ['단계', '대상 연령', '주요 구성'], rows: [
          ['1단계', '만 3세', '본교재 12권 + 워크북 + 교구'],
          ['2단계', '만 4세', '본교재 12권 + 활동지 + 음원'],
          ['3단계', '만 5세', '본교재 12권 + 프로젝트북 + 평가자료']
        ] },
        { id: uid(), type: 'gallery', cols: 2, photos: [] },
        { id: uid(), type: 'button', label: '샘플 교재 · 견적 요청하기', url: 'proposal.html', bg: '#1c355e', align: 'center', newTab: false }
      ];
    },
    event: function () {
      return [
        { id: uid(), type: 'heading', title: '2026 특별 행사 프로그램 안내', sub: '아이들에게 잊지 못할 하루를 선물하는 뉴키즈 방문 체험 행사', align: 'center', color: '#1c355e' },
        { id: uid(), type: 'callout', theme: 'navy', title: '행사 개요 및 신청 안내', body: '대상: 김포·고양·파주 어린이집 및 유치원\n진행 시간: 약 50분 ~ 90분 (원 일정에 맞춰 조율 가능)\n상담 문의: 010-2333-2563 / 010-5522-8109' },
        { id: uid(), type: 'gallery', cols: 3, photos: [] },
        { id: uid(), type: 'form', formId: STATE.forms[0] ? STATE.forms[0].id : '' }
      ];
    },
    archive: function () {
      return [
        { id: uid(), type: 'heading', title: '수업 자료실 배포 안내', sub: '연간계획안 · OT자료 · 가정통신문 양식을 아래 첨부파일에서 내려받으세요.', align: 'left', color: '#065f46' },
        { id: uid(), type: 'callout', theme: 'green', title: '자료 이용 방법', body: '1. 게시글 하단 첨부파일을 클릭해 다운로드하세요.\n2. 비밀번호가 설정된 자료는 담당자에게 문의해 주세요.' },
        { id: uid(), type: 'table', headerColor: '#065f46', headers: ['자료명', '형식', '비고'], rows: [
          ['연간교육계획안', 'HWP / PDF', '만 0~5세 전체'],
          ['학부모 OT 안내자료', 'PPTX / PDF', '수정 가능 양식']
        ] }
      ];
    },
    notice: function () {
      return [
        { id: uid(), type: 'heading', title: '공지사항 안내', sub: '뉴키즈에서 원장님·선생님께 전해드리는 소식입니다.', align: 'left', color: '#1c355e' },
        { id: uid(), type: 'callout', theme: 'amber', title: '핵심 요약', body: '중요 일정이나 변경 사항을 한눈에 볼 수 있게 정리해 주세요.' },
        { id: uid(), type: 'text', text: '상세한 공지 본문 내용을 여기에 작성하세요.', align: 'left', fontSize: '15px' },
        { id: uid(), type: 'button', label: '전화 문의 (010-2333-2563)', url: 'tel:010-2333-2563', bg: '#059669', align: 'center', newTab: false }
      ];
    }
  };

  // ==========================================================================
  // 3. 스타일 주입
  // ==========================================================================
  function injectStyles() {
    if (document.getElementById('nk-post-editor-ext-style')) return;
    const style = document.createElement('style');
    style.id = 'nk-post-editor-ext-style';
    style.textContent = `
      .nk-pe-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 14px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 10px 10px 0 0; margin-bottom: -1px; }
      .nk-pe-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
      .nk-pe-tab { padding: 6px 13px; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #475569; cursor: pointer; }
      .nk-pe-tab.active { background: #1c355e; color: #fff; border-color: #1c355e; }
      .nk-pe-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; }
      .nk-pe-mini { padding: 5px 10px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; }
      .nk-pe-mini.active { background: #059669; color: #fff; border-color: #059669; }
      .nk-pe-draft-banner { display: none; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: 10px; font-size: 12px; color: #92400e; }
      .nk-pe-wrap { display: none; border: 1px solid #cbd5e1; border-radius: 0 0 10px 10px; background: #f8fafc; overflow: hidden; }
      .nk-pe-wrap.active { display: block; }
      .nk-pe-toolbar { padding: 10px 12px; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .nk-pe-chip { padding: 5px 9px; font-size: 12px; font-weight: 600; border-radius: 6px; border: 1px solid #cbd5e1; background: #f8fafc; color: #1e293b; cursor: pointer; }
      .nk-pe-chip:hover { background: #eff6ff; border-color: #1c355e; color: #1c355e; }
      .nk-pe-workspace { display: grid; grid-template-columns: 1fr 1fr; min-height: 460px; }
      .nk-pe-workspace.no-preview { grid-template-columns: 1fr; }
      @media (max-width: 960px) { .nk-pe-workspace { grid-template-columns: 1fr; } }
      .nk-pe-left { padding: 12px; max-height: 640px; overflow-y: auto; background: #f1f5f9; border-right: 1px solid #e2e8f0; }
      .nk-pe-right-pane { padding: 14px; max-height: 640px; overflow-y: auto; background: #e2e8f0; display: flex; flex-direction: column; align-items: center; }
      .nk-pe-preview-box { width: 100%; max-width: 100%; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 4px 16px rgba(15,23,42,0.08); box-sizing: border-box; transition: max-width 0.2s ease; }
      .nk-pe-preview-box.mobile { max-width: 390px; padding: 14px; }
      .nk-pblk-card { background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
      .nk-pblk-head { background: #f8fafc; padding: 7px 10px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; color: #1c355e; }
      .nk-pblk-drag { cursor: grab; color: #94a3b8; margin-right: 6px; user-select: none; }
      .nk-pblk-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
      .nk-pblk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
      .nk-pblk-field label { display: block; font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 3px; }
      .nk-pblk-field input, .nk-pblk-field select, .nk-pblk-field textarea { width: 100%; padding: 6px 8px; font-size: 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box; font-family: inherit; background: #fff; }
      .nk-pblk-act { padding: 2px 6px; font-size: 11px; border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; cursor: pointer; color: #475569; }
      .nk-pblk-act.danger { color: #dc2626; border-color: #fecaca; }
      .nk-pe-gal-item { display: flex; align-items: center; gap: 8px; padding: 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
      .nk-pe-gal-item img { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; flex-shrink: 0; }
    `;
    document.head.appendChild(style);
  }

  async function loadFormsList() {
    if (!window.sb) return;
    try {
      const { data, error } = await window.sb.from('custom_forms').select('id, title').order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) STATE.forms = data;
    } catch (_) {}
  }

  async function uploadImageToSupabase(file) {
    if (!window.sb || !file) throw new Error('Supabase 또는 파일이 없습니다.');
    const uploadFile = typeof window.compressImageToWebP === 'function'
      ? await window.compressImageToWebP(file, 1600, 0.82)
      : file;
    const key = `post_blk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}.webp`;
    const { data, error } = await window.sb.storage.from('images').upload(key, uploadFile);
    if (error) throw error;
    return window.sb.storage.from('images').getPublicUrl(data.path).data.publicUrl;
  }

  // ==========================================================================
  // 4. 자동 임시저장 (localStorage)
  // ==========================================================================
  function saveAutoDraft() {
    if (STATE.mode !== 'blocks' || !STATE.blocks.length) return;
    try {
      const title = document.getElementById('post-title')?.value || '';
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
        savedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        title: title,
        blocks: STATE.blocks
      }));
      const st = document.getElementById('nk-pe-autosave-label');
      if (st) st.textContent = '임시저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch (_) {}
  }

  function clearAutoDraft() {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) {}
    const banner = document.getElementById('nk-pe-draft-banner');
    if (banner) banner.style.display = 'none';
  }

  function checkAutoDraftBanner() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || !Array.isArray(d.blocks) || !d.blocks.length) return;
      const banner = document.getElementById('nk-pe-draft-banner');
      const txt = document.getElementById('nk-pe-draft-text');
      if (banner && txt) {
        txt.textContent = `자동 임시저장된 블록 본문이 있습니다 (${d.savedAt}${d.title ? ' · ' + d.title : ''}).`;
        banner.style.display = 'flex';
      }
    } catch (_) {}
  }

  // ==========================================================================
  // 5. #editor-area UI 마운트
  // ==========================================================================
  function mountPostEditor() {
    const editorArea = document.getElementById('editor-area');
    const editorContainer = document.getElementById('editor-container');
    if (!editorArea || !editorContainer || document.getElementById('nk-pe-bar')) return;

    // 자동 임시저장 복구 배너
    const banner = document.createElement('div');
    banner.id = 'nk-pe-draft-banner';
    banner.className = 'nk-pe-draft-banner';
    banner.innerHTML = `
      <span id="nk-pe-draft-text"></span>
      <div style="display:flex;gap:6px;">
        <button type="button" id="nk-pe-restore-draft" class="nk-pe-mini active">복구하기</button>
        <button type="button" id="nk-pe-dismiss-draft" class="nk-pe-mini">삭제</button>
      </div>
    `;
    editorArea.parentNode.insertBefore(banner, editorArea);

    // 모드 전환 바
    const bar = document.createElement('div');
    bar.id = 'nk-pe-bar';
    bar.className = 'nk-pe-bar';
    bar.innerHTML = `
      <div class="nk-pe-tabs">
        <button type="button" id="nk-pe-mode-quill" class="nk-pe-tab active">일반 글쓰기 (Quill)</button>
        <button type="button" id="nk-pe-mode-blocks" class="nk-pe-tab">블록 디자인 모드 (자유 작성)</button>
      </div>
      <div class="nk-pe-right">
        <span id="nk-pe-autosave-label" style="color:#64748b;font-size:11px;"></span>
        <button type="button" id="nk-pe-toggle-preview" class="nk-pe-mini active" style="display:none;">화면 분할 ON</button>
        <button type="button" id="nk-pe-dev-pc" class="nk-pe-mini active" style="display:none;">PC</button>
        <button type="button" id="nk-pe-dev-mob" class="nk-pe-mini" style="display:none;">모바일</button>
        <button type="button" id="nk-pe-toggle-raw" class="nk-pe-mini" style="display:none;">HTML</button>
      </div>
    `;

    // 블록 워크스페이스
    const wrap = document.createElement('div');
    wrap.id = 'nk-pe-wrap';
    wrap.className = 'nk-pe-wrap';
    wrap.innerHTML = `
      <div id="nk-pe-toolbar" class="nk-pe-toolbar">
        <span style="font-size:11px;font-weight:700;color:#64748b;">+ 블록:</span>
        <button type="button" class="nk-pe-chip" data-p-add="heading">제목</button>
        <button type="button" class="nk-pe-chip" data-p-add="text">본문</button>
        <button type="button" class="nk-pe-chip" data-p-add="callout">안내 박스</button>
        <button type="button" class="nk-pe-chip" data-p-add="cards">2~3단 카드</button>
        <button type="button" class="nk-pe-chip" data-p-add="gallery" style="border-color:#059669;color:#065f46;">2~3열 사진 갤러리</button>
        <button type="button" class="nk-pe-chip" data-p-add="image">단일 이미지</button>
        <button type="button" class="nk-pe-chip" data-p-add="table">표(Table)</button>
        <button type="button" class="nk-pe-chip" data-p-add="button">강조 버튼</button>
        <button type="button" class="nk-pe-chip" data-p-add="form" style="border-color:#1c355e;color:#1c355e;">폼/투표 삽입</button>
        <button type="button" class="nk-pe-chip" data-p-add="youtube">유튜브</button>
        <button type="button" class="nk-pe-chip" data-p-add="divider">구분선</button>

        <select id="nk-pe-tpl-sel" style="margin-left:auto;padding:5px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;">
          <option value="">게시글 템플릿 불러오기...</option>
          <option value="textbook">교재소개 (카드+구성표+갤러리)</option>
          <option value="event">행사 안내 (콜아웃+갤러리+폼)</option>
          <option value="archive">자료실 배포 안내</option>
          <option value="notice">일반 공지사항</option>
        </select>
      </div>
      <div id="nk-pe-workspace" class="nk-pe-workspace">
        <div class="nk-pe-left">
          <div id="nk-pe-blocks-list"></div>
          <textarea id="nk-pe-raw-ta" style="display:none;width:100%;min-height:420px;font-family:monospace;font-size:12px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;background:#0f172a;color:#86efac;"></textarea>
        </div>
        <div id="nk-pe-right-pane" class="nk-pe-right-pane">
          <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px;">실제 게시글(view.html) 미리보기</div>
          <div id="nk-pe-preview-box" class="nk-pe-preview-box"></div>
        </div>
      </div>
    `;

    editorArea.insertBefore(bar, editorArea.firstChild);
    editorArea.appendChild(wrap);

    // 이벤트 연결
    document.getElementById('nk-pe-mode-quill').addEventListener('click', function () { setMode('quill'); });
    document.getElementById('nk-pe-mode-blocks').addEventListener('click', function () { setMode('blocks'); });

    document.getElementById('nk-pe-toggle-preview').addEventListener('click', function () {
      STATE.showPreview = !STATE.showPreview;
      const btn = document.getElementById('nk-pe-toggle-preview');
      btn.textContent = STATE.showPreview ? '화면 분할 ON' : '화면 분할 OFF';
      btn.classList.toggle('active', STATE.showPreview);
      document.getElementById('nk-pe-right-pane').style.display = STATE.showPreview ? 'flex' : 'none';
      document.getElementById('nk-pe-workspace').classList.toggle('no-preview', !STATE.showPreview);
    });

    document.getElementById('nk-pe-dev-pc').addEventListener('click', function () {
      STATE.previewDevice = 'pc';
      document.getElementById('nk-pe-dev-pc').classList.add('active');
      document.getElementById('nk-pe-dev-mob').classList.remove('active');
      document.getElementById('nk-pe-preview-box').classList.remove('mobile');
    });

    document.getElementById('nk-pe-dev-mob').addEventListener('click', function () {
      STATE.previewDevice = 'mobile';
      document.getElementById('nk-pe-dev-mob').classList.add('active');
      document.getElementById('nk-pe-dev-pc').classList.remove('active');
      document.getElementById('nk-pe-preview-box').classList.add('mobile');
    });

    document.getElementById('nk-pe-toggle-raw').addEventListener('click', function () {
      const ta = document.getElementById('nk-pe-raw-ta');
      if (!STATE.rawHtmlMode) {
        STATE.rawHtmlBuffer = serializeBlocks(STATE.blocks);
        ta.value = STATE.rawHtmlBuffer;
        STATE.rawHtmlMode = true;
      } else {
        STATE.rawHtmlBuffer = ta.value;
        STATE.blocks = deserializeBlocks(ta.value);
        STATE.rawHtmlMode = false;
      }
      syncRawModeUI();
      renderBlocks();
    });

    document.getElementById('nk-pe-raw-ta').addEventListener('input', function (e) {
      STATE.rawHtmlBuffer = e.target.value;
      updatePreview();
    });

    wrap.querySelectorAll('[data-p-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (STATE.rawHtmlMode) return;
        addBlock(btn.dataset.pAdd);
      });
    });

    document.getElementById('nk-pe-tpl-sel').addEventListener('change', function (e) {
      const key = e.target.value;
      if (!key || !POST_TEMPLATES[key]) return;
      if (STATE.blocks.length > 0 && !confirm('현재 작성 중인 블록을 선택한 템플릿으로 교체할까요?')) {
        e.target.value = '';
        return;
      }
      STATE.rawHtmlMode = false;
      STATE.blocks = POST_TEMPLATES[key]();
      syncRawModeUI();
      renderBlocks();
      saveAutoDraft();
      e.target.value = '';
    });

    document.getElementById('nk-pe-restore-draft').addEventListener('click', function () {
      try {
        const d = JSON.parse(localStorage.getItem(AUTOSAVE_KEY) || '{}');
        if (d.title && !document.getElementById('post-title').value) {
          document.getElementById('post-title').value = d.title;
        }
        if (Array.isArray(d.blocks)) {
          STATE.blocks = d.blocks;
          setMode('blocks');
          renderBlocks();
        }
      } catch (_) {}
      banner.style.display = 'none';
    });

    document.getElementById('nk-pe-dismiss-draft').addEventListener('click', clearAutoDraft);

    checkAutoDraftBanner();
    STATE.autosaveTimer = setInterval(saveAutoDraft, 20000);
  }

  function setMode(nextMode) {
    STATE.mode = nextMode;
    const isBlocks = nextMode === 'blocks';
    document.getElementById('nk-pe-mode-quill').classList.toggle('active', !isBlocks);
    document.getElementById('nk-pe-mode-blocks').classList.toggle('active', isBlocks);

    const editorArea = document.getElementById('editor-area');
    const qlToolbar = editorArea ? editorArea.querySelector('.ql-toolbar') : null;
    const editorContainer = document.getElementById('editor-container');
    if (qlToolbar) qlToolbar.style.display = isBlocks ? 'none' : '';
    if (editorContainer) editorContainer.style.display = isBlocks ? 'none' : '';

    document.getElementById('nk-pe-wrap').classList.toggle('active', isBlocks);
    ['nk-pe-toggle-preview', 'nk-pe-dev-pc', 'nk-pe-dev-mob', 'nk-pe-toggle-raw'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = isBlocks ? 'inline-block' : 'none';
    });

    if (isBlocks) {
      if (!STATE.blocks.length) {
        const qlEditor = editorContainer ? editorContainer.querySelector('.ql-editor') : null;
        const plain = qlEditor ? qlEditor.innerText.trim() : '';
        if (plain) STATE.blocks = [{ id: uid(), type: 'text', text: plain, align: 'left', fontSize: '15px' }];
      }
      renderBlocks();
    }
  }

  function syncRawModeUI() {
    document.getElementById('nk-pe-blocks-list').style.display = STATE.rawHtmlMode ? 'none' : 'block';
    document.getElementById('nk-pe-raw-ta').style.display = STATE.rawHtmlMode ? 'block' : 'none';
    const tb = document.getElementById('nk-pe-toolbar');
    tb.style.opacity = STATE.rawHtmlMode ? '0.45' : '1';
    tb.style.pointerEvents = STATE.rawHtmlMode ? 'none' : 'auto';
    document.getElementById('nk-pe-toggle-raw').classList.toggle('active', STATE.rawHtmlMode);
  }

  function addBlock(type) {
    const defaults = {
      heading: { type: 'heading', title: '섹션 제목', sub: '', align: 'left', color: '#1c355e' },
      text: { type: 'text', text: '본문 내용을 입력하세요.', align: 'left', fontSize: '15px' },
      callout: { type: 'callout', theme: 'navy', title: '안내 사항', body: '강조할 내용을 입력하세요.' },
      cards: { type: 'cards', cols: 2, items: [{ title: '특징 1', body: '설명 입력' }, { title: '특징 2', body: '설명 입력' }] },
      gallery: { type: 'gallery', cols: 2, photos: [] },
      image: { type: 'image', src: '', width: '100%', align: 'center', rounded: true, shadow: true, caption: '' },
      table: { type: 'table', headerColor: '#1c355e', headers: ['항목', '내용', '비고'], rows: [['예시 1', '상세 설명', '-']] },
      button: { type: 'button', label: '자세히 보기', url: 'proposal.html', bg: '#1c355e', align: 'center', newTab: false },
      form: { type: 'form', formId: STATE.forms[0] ? STATE.forms[0].id : '' },
      youtube: { type: 'youtube', url: '' },
      divider: { type: 'divider' }
    };
    STATE.blocks.push(Object.assign({ id: uid() }, JSON.parse(JSON.stringify(defaults[type] || defaults.text))));
    renderBlocks();
    saveAutoDraft();
  }

  function updatePreview() {
    const box = document.getElementById('nk-pe-preview-box');
    if (!box) return;
    const raw = STATE.rawHtmlMode ? STATE.rawHtmlBuffer : STATE.blocks.map(renderBlockToHtml).join('\n');
    const previewHtml = raw.replace(/\[투표:([a-zA-Z0-9_-]+)\]/g, function (_, fid) {
      const f = STATE.forms.find(function (x) { return x.id === fid; });
      return `<div style="padding:16px;border:2px dashed #1c355e;border-radius:10px;background:#eff6ff;text-align:center;color:#1c355e;font-size:13px;font-weight:700;">폼/투표 자동 삽입: ${esc(f ? f.title : fid)} ([투표:${esc(fid)}])</div>`;
    });
    box.innerHTML = previewHtml || '<p style="text-align:center;color:#94a3b8;padding:40px 0;">상단에서 블록이나 템플릿을 추가해 보세요.</p>';
  }

  function renderBlocks() {
    const listEl = document.getElementById('nk-pe-blocks-list');
    if (!listEl) return;
    if (!STATE.blocks.length) {
      listEl.innerHTML = `<div style="background:#fff;border:1px dashed #94a3b8;border-radius:10px;padding:28px;text-align:center;color:#64748b;font-size:13px;">상단 <b>+ 블록</b> 버튼이나 <b>게시글 템플릿</b>으로 자유롭게 작성해 보세요.</div>`;
      updatePreview();
      return;
    }

    const labels = {
      heading: '제목', text: '본문 글', callout: '안내 박스', cards: '2~3단 카드',
      gallery: '2~3열 사진 갤러리', image: '단일 이미지', table: '표(Table)',
      button: '강조 버튼', form: '폼/투표 삽입', youtube: '유튜브 영상', divider: '구분선', raw: '직접 HTML'
    };

    listEl.innerHTML = STATE.blocks.map(function (b, idx) {
      return `<div class="nk-pblk-card" data-pblk-id="${b.id}">
        <div class="nk-pblk-head">
          <div><span class="nk-pblk-drag" title="드래그해 순서 변경">⋮⋮</span>${labels[b.type] || b.type}</div>
          <div style="display:flex;gap:4px;">
            <button type="button" class="nk-pblk-act" data-p-up="${idx}">▲</button>
            <button type="button" class="nk-pblk-act" data-p-dn="${idx}">▼</button>
            <button type="button" class="nk-pblk-act" data-p-dup="${idx}">복제</button>
            <button type="button" class="nk-pblk-act danger" data-p-del="${idx}">삭제</button>
          </div>
        </div>
        <div class="nk-pblk-body">${renderFields(b, idx)}</div>
      </div>`;
    }).join('');

    bindBlockEvents(listEl);
    initSortable(listEl);
    updatePreview();
  }

  function renderFields(b, idx) {
    if (b.type === 'heading') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>제목</label><input type="text" data-pk="title" data-pi="${idx}" value="${esc(b.title)}"></div>
        <div class="nk-pblk-field"><label>정렬</label><select data-pk="align" data-pi="${idx}"><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option></select></div>
        <div class="nk-pblk-field"><label>색상</label><input type="color" data-pk="color" data-pi="${idx}" value="${esc(b.color || '#1c355e')}" style="height:30px;padding:2px;"></div>
      </div>
      <div class="nk-pblk-field"><label>부제목</label><input type="text" data-pk="sub" data-pi="${idx}" value="${esc(b.sub)}"></div>`;
    }
    if (b.type === 'text') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>크기</label><select data-pk="fontSize" data-pi="${idx}"><option value="14px" ${b.fontSize === '14px' ? 'selected' : ''}>14px</option><option value="15px" ${b.fontSize === '15px' ? 'selected' : ''}>15px</option><option value="17px" ${b.fontSize === '17px' ? 'selected' : ''}>17px</option></select></div>
        <div class="nk-pblk-field"><label>정렬</label><select data-pk="align" data-pi="${idx}"><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option></select></div>
      </div>
      <div class="nk-pblk-field"><label>본문</label><textarea rows="4" data-pk="text" data-pi="${idx}">${esc(b.text)}</textarea></div>`;
    }
    if (b.type === 'callout') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>제목</label><input type="text" data-pk="title" data-pi="${idx}" value="${esc(b.title)}"></div>
        <div class="nk-pblk-field"><label>테마</label><select data-pk="theme" data-pi="${idx}"><option value="navy" ${b.theme === 'navy' ? 'selected' : ''}>네이비</option><option value="green" ${b.theme === 'green' ? 'selected' : ''}>그린</option><option value="amber" ${b.theme === 'amber' ? 'selected' : ''}>앰버</option><option value="gray" ${b.theme === 'gray' ? 'selected' : ''}>그레이</option></select></div>
      </div>
      <div class="nk-pblk-field"><label>내용</label><textarea rows="3" data-pk="body" data-pi="${idx}">${esc(b.body)}</textarea></div>`;
    }
    if (b.type === 'cards') {
      const itemsHtml = (b.items || []).map(function (it, ci) {
        return `<div style="padding:7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;display:grid;gap:5px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#475569;"><span>카드 ${ci + 1}</span><button type="button" class="nk-pblk-act danger" data-p-cdel="${idx}:${ci}">제거</button></div>
          <input type="text" data-pck="title" data-pi="${idx}" data-ci="${ci}" value="${esc(it.title)}" placeholder="카드 제목" style="padding:5px 7px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;">
          <textarea rows="2" data-pck="body" data-pi="${idx}" data-ci="${ci}" placeholder="카드 내용" style="padding:5px 7px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;">${esc(it.body)}</textarea>
        </div>`;
      }).join('');
      return `<div style="display:flex;justify-content:space-between;align-items:center;">
        <select data-pk="cols" data-pi="${idx}" style="padding:4px 8px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;"><option value="2" ${Number(b.cols) !== 3 ? 'selected' : ''}>2단</option><option value="3" ${Number(b.cols) === 3 ? 'selected' : ''}>3단</option></select>
        <button type="button" class="nk-pblk-act" data-p-cadd="${idx}">+ 카드 추가</button>
      </div>${itemsHtml}`;
    }
    if (b.type === 'gallery') {
      const photosHtml = (b.photos || []).map(function (ph, pi) {
        return `<div class="nk-pe-gal-item">
          <img src="${esc(ph.src)}" alt="">
          <input type="text" data-pgcap="${idx}:${pi}" value="${esc(ph.caption || '')}" placeholder="사진 설명(선택)" style="flex:1;padding:5px 7px;font-size:12px;border:1px solid #cbd5e1;border-radius:5px;">
          <button type="button" class="nk-pblk-act danger" data-pgdel="${idx}:${pi}">삭제</button>
        </div>`;
      }).join('');
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>사진 여러 장 업로드 (다중 선택 가능)</label><input type="file" accept="image/*" multiple data-pg-upload="${idx}"></div>
        <div class="nk-pblk-field"><label>열 수</label><select data-pk="cols" data-pi="${idx}"><option value="2" ${Number(b.cols) !== 3 ? 'selected' : ''}>2열 그리드</option><option value="3" ${Number(b.cols) === 3 ? 'selected' : ''}>3열 그리드</option></select></div>
      </div>${photosHtml}`;
    }
    if (b.type === 'image') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>이미지 업로드</label><input type="file" accept="image/*" data-p-img="${idx}"></div>
        <div class="nk-pblk-field"><label>이미지 URL</label><input type="text" data-pk="src" data-pi="${idx}" value="${esc(b.src)}" placeholder="https://..."></div>
      </div>
      <div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>가로 폭</label><select data-pk="width" data-pi="${idx}"><option value="100%" ${b.width === '100%' ? 'selected' : ''}>100%</option><option value="75%" ${b.width === '75%' ? 'selected' : ''}>75%</option><option value="50%" ${b.width === '50%' ? 'selected' : ''}>50%</option></select></div>
        <div class="nk-pblk-field"><label>정렬</label><select data-pk="align" data-pi="${idx}"><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="right" ${b.align === 'right' ? 'selected' : ''}>오른쪽</option></select></div>
        <div class="nk-pblk-field"><label>캡션</label><input type="text" data-pk="caption" data-pi="${idx}" value="${esc(b.caption)}"></div>
      </div>`;
    }
    if (b.type === 'table') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>열 제목 (쉼표 구분)</label><input type="text" data-pt-h="${idx}" value="${esc((b.headers || []).join(', '))}"></div>
        <div class="nk-pblk-field"><label>헤더 색상</label><input type="color" data-pk="headerColor" data-pi="${idx}" value="${esc(b.headerColor || '#1c355e')}" style="height:30px;padding:2px;"></div>
      </div>
      <div class="nk-pblk-field"><label>행 데이터 (한 줄당 한 행, | 로 열 구분)</label><textarea rows="4" data-pt-r="${idx}">${esc((b.rows || []).map(function (r) { return r.join(' | '); }).join('\n'))}</textarea></div>`;
    }
    if (b.type === 'button') {
      return `<div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>버튼 문구</label><input type="text" data-pk="label" data-pi="${idx}" value="${esc(b.label)}"></div>
        <div class="nk-pblk-field"><label>이동 URL</label><input type="text" data-pk="url" data-pi="${idx}" value="${esc(b.url)}" placeholder="https://... 또는 tel:010-..."></div>
      </div>
      <div class="nk-pblk-grid">
        <div class="nk-pblk-field"><label>색상</label><input type="color" data-pk="bg" data-pi="${idx}" value="${esc(b.bg || '#1c355e')}" style="height:30px;padding:2px;"></div>
        <div class="nk-pblk-field"><label>정렬</label><select data-pk="align" data-pi="${idx}"><option value="center" ${b.align === 'center' ? 'selected' : ''}>가운데</option><option value="left" ${b.align === 'left' ? 'selected' : ''}>왼쪽</option><option value="right" ${b.align === 'right' ? 'selected' : ''}>오른쪽</option></select></div>
        <div class="nk-pblk-field"><label>새 탭</label><select data-pk="newTab" data-pi="${idx}"><option value="false" ${!b.newTab ? 'selected' : ''}>현재 창</option><option value="true" ${b.newTab ? 'selected' : ''}>새 탭</option></select></div>
      </div>`;
    }
    if (b.type === 'form') {
      const opts = '<option value="">-- 폼/투표 선택 --</option>' + STATE.forms.map(function (f) {
        return `<option value="${esc(f.id)}" ${b.formId === f.id ? 'selected' : ''}>${esc(f.title || f.id)} (${esc(f.id)})</option>`;
      }).join('');
      return `<div class="nk-pblk-field"><label>삽입할 폼/투표</label><select data-pk="formId" data-pi="${idx}">${opts}</select></div>`;
    }
    if (b.type === 'youtube') {
      return `<div class="nk-pblk-field"><label>유튜브 주소</label><input type="text" data-pk="url" data-pi="${idx}" value="${esc(b.url)}" placeholder="https://www.youtube.com/watch?v=..."></div>`;
    }
    if (b.type === 'divider') return `<div style="font-size:12px;color:#64748b;">가로 구분선</div>`;
    return `<div class="nk-pblk-field"><label>직접 HTML</label><textarea rows="4" data-pk="html" data-pi="${idx}" style="font-family:monospace;">${esc(b.html)}</textarea></div>`;
  }

  function bindBlockEvents(listEl) {
    listEl.querySelectorAll('[data-pk]').forEach(function (el) {
      const evt = el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        const i = Number(el.dataset.pi);
        const k = el.dataset.pk;
        let v = el.value;
        if (k === 'cols') v = Number(v);
        if (k === 'newTab') v = v === 'true';
        if (STATE.blocks[i]) STATE.blocks[i][k] = v;
        updatePreview();
      });
    });

    listEl.querySelectorAll('[data-pck]').forEach(function (el) {
      el.addEventListener('input', function () {
        const i = Number(el.dataset.pi), ci = Number(el.dataset.ci);
        if (STATE.blocks[i] && STATE.blocks[i].items[ci]) {
          STATE.blocks[i].items[ci][el.dataset.pck] = el.value;
          updatePreview();
        }
      });
    });

    listEl.querySelectorAll('[data-p-cadd]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        STATE.blocks[Number(btn.dataset.pCadd)].items.push({ title: '새 카드', body: '내용 입력' });
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-p-cdel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const p = btn.dataset.pCdel.split(':').map(Number);
        STATE.blocks[p[0]].items.splice(p[1], 1);
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-pg-upload]').forEach(function (inp) {
      inp.addEventListener('change', async function () {
        const files = Array.from(inp.files || []);
        if (!files.length) return;
        const i = Number(inp.dataset.pgUpload);
        try {
          for (let f of files) {
            const url = await uploadImageToSupabase(f);
            STATE.blocks[i].photos.push({ src: url, caption: '' });
          }
          renderBlocks();
          saveAutoDraft();
        } catch (err) {
          alert('갤러리 이미지 업로드 오류: ' + (err.message || err));
        } finally {
          inp.value = '';
        }
      });
    });

    listEl.querySelectorAll('[data-pgcap]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const p = inp.dataset.pgcap.split(':').map(Number);
        if (STATE.blocks[p[0]] && STATE.blocks[p[0]].photos[p[1]]) {
          STATE.blocks[p[0]].photos[p[1]].caption = inp.value;
          updatePreview();
        }
      });
    });

    listEl.querySelectorAll('[data-pgdel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const p = btn.dataset.pgdel.split(':').map(Number);
        STATE.blocks[p[0]].photos.splice(p[1], 1);
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-p-img]').forEach(function (inp) {
      inp.addEventListener('change', async function () {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const i = Number(inp.dataset.pImg);
        try {
          STATE.blocks[i].src = await uploadImageToSupabase(f);
          renderBlocks();
          saveAutoDraft();
        } catch (err) {
          alert('이미지 업로드 오류: ' + (err.message || err));
        } finally {
          inp.value = '';
        }
      });
    });

    listEl.querySelectorAll('[data-pt-h]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const i = Number(inp.dataset.ptH);
        STATE.blocks[i].headers = inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        updatePreview();
      });
    });

    listEl.querySelectorAll('[data-pt-r]').forEach(function (ta) {
      ta.addEventListener('input', function () {
        const i = Number(ta.dataset.ptR);
        STATE.blocks[i].rows = ta.value.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
          return l.split('|').map(function (c) { return c.trim(); });
        });
        updatePreview();
      });
    });

    listEl.querySelectorAll('[data-p-up]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.pUp);
        if (i <= 0) return;
        const t = STATE.blocks[i - 1]; STATE.blocks[i - 1] = STATE.blocks[i]; STATE.blocks[i] = t;
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-p-dn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.pDn);
        if (i >= STATE.blocks.length - 1) return;
        const t = STATE.blocks[i + 1]; STATE.blocks[i + 1] = STATE.blocks[i]; STATE.blocks[i] = t;
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-p-dup]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const i = Number(btn.dataset.pDup);
        const clone = JSON.parse(JSON.stringify(STATE.blocks[i]));
        clone.id = uid();
        STATE.blocks.splice(i + 1, 0, clone);
        renderBlocks();
      });
    });

    listEl.querySelectorAll('[data-p-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        STATE.blocks.splice(Number(btn.dataset.pDel), 1);
        renderBlocks();
      });
    });
  }

  function initSortable(listEl) {
    if (STATE.sortable) { try { STATE.sortable.destroy(); } catch (_) {} STATE.sortable = null; }
    if (typeof window.Sortable === 'function') {
      STATE.sortable = new window.Sortable(listEl, {
        handle: '.nk-pblk-drag',
        animation: 150,
        onEnd: function (evt) {
          if (evt.oldIndex === evt.newIndex) return;
          const moved = STATE.blocks.splice(evt.oldIndex, 1)[0];
          STATE.blocks.splice(evt.newIndex, 0, moved);
          renderBlocks();
        }
      });
    }
  }

  // ==========================================================================
  // 6. admin.html의 uploadPost / editPost / cancelEdit 안전 래핑
  //    (Quill 스타일 삭제를 우회해 total_posts.content에 블록 HTML을 원본 그대로 저장)
  // ==========================================================================
  function wrapPostFunctions() {
    if (typeof window.uploadPost === 'function' && !window.uploadPost.__nkPostWrapped) {
      const origUpload = window.uploadPost;
      const wrappedUpload = async function () {
        if (STATE.mode !== 'blocks') {
          return origUpload.apply(this, arguments);
        }

        const blockHtml = STATE.rawHtmlMode
          ? document.getElementById('nk-pe-raw-ta').value
          : serializeBlocks(STATE.blocks);

        // Quill 빈 내용 검증 통과용 안전 텍스트
        const qlEditor = document.querySelector('#editor-container .ql-editor');
        if (qlEditor && !qlEditor.innerText.trim()) {
          qlEditor.innerHTML = '<p>블록 디자인 본문</p>';
        }

        // uploadPost 실행 중 total_posts insert/update의 content 필드를 blockHtml로 안전 치환
        const sb = window.sb;
        const origFrom = sb ? sb.from.bind(sb) : null;
        if (sb && origFrom) {
          sb.from = function (table) {
            const builder = origFrom(table);
            if (table === 'total_posts') {
              const origInsert = builder.insert.bind(builder);
              const origUpdate = builder.update.bind(builder);
              builder.insert = function (rows, opts) {
                const patched = Array.isArray(rows)
                  ? rows.map(function (r) { return Object.assign({}, r, { content: blockHtml }); })
                  : Object.assign({}, rows, { content: blockHtml });
                return origInsert(patched, opts);
              };
              builder.update = function (vals, opts) {
                const patched = Object.assign({}, vals, { content: blockHtml });
                return origUpdate(patched, opts);
              };
            }
            return builder;
          };
        }

        try {
          const res = await origUpload.apply(this, arguments);
          clearAutoDraft();
          return res;
        } finally {
          if (sb && origFrom) sb.from = origFrom;
        }
      };
      wrappedUpload.__nkPostWrapped = true;
      window.uploadPost = wrappedUpload;
    }

    if (typeof window.editPost === 'function' && !window.editPost.__nkPostWrapped) {
      const origEdit = window.editPost;
      const wrappedEdit = function (item) {
        const res = origEdit.apply(this, arguments);
        const content = item && item.content ? item.content : '';
        if (hasBlockMeta(content)) {
          STATE.rawHtmlMode = false;
          STATE.blocks = deserializeBlocks(content);
          setMode('blocks');
          syncRawModeUI();
          renderBlocks();
        } else {
          STATE.blocks = [];
          setMode('quill');
        }
        return res;
      };
      wrappedEdit.__nkPostWrapped = true;
      window.editPost = wrappedEdit;
    }

    if (typeof window.cancelEdit === 'function' && !window.cancelEdit.__nkPostWrapped) {
      const origCancel = window.cancelEdit;
      const wrappedCancel = function () {
        const res = origCancel.apply(this, arguments);
        STATE.blocks = [];
        STATE.rawHtmlMode = false;
        STATE.rawHtmlBuffer = '';
        setMode('quill');
        return res;
      };
      wrappedCancel.__nkPostWrapped = true;
      window.cancelEdit = wrappedCancel;
    }
  }

  async function init() {
    injectStyles();
    await loadFormsList();
    mountPostEditor();
    wrapPostFunctions();
  }

  document.addEventListener('DOMContentLoaded', function () {
    const timer = setInterval(function () {
      if (window.sb && document.getElementById('editor-container') && typeof window.uploadPost === 'function') {
        clearInterval(timer);
        init();
      }
    }, 150);
  });
})();
