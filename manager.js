/* =========================================
   뉴키즈(New Kids) 프로젝트 코어 관리 파일 (manager.js)
   ========================================= */

// 1. 페이지 새로고침 시 스크롤 최상단 고정
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);
window.addEventListener('beforeunload', () => window.scrollTo(0, 0));

// 1-2. 같은 페이지 내 카테고리(해시) 전환은 히스토리에 새 항목을 만들지 않고 현재 항목을 교체
//      (게시판을 여러 번 바꿔도 뒤로가기 시 직전 페이지로 바로 돌아가도록 하기 위함)
document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    // 대상: notice/program/child 페이지 + 해시 조합 링크(카테고리 전환)
    if (!/^(notice|program|child)\.html#.+/.test(href)) return;
    try {
        const target = new URL(href, location.href);
        if (target.pathname !== location.pathname) return; // 다른 페이지로의 이동은 정상 처리
        if (target.hash === location.hash) return;
        e.preventDefault();
        history.replaceState(null, '', target.href);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { /* URL 파싱 실패 시 기본 동작 유지 */ }
});

// 2. 전역 변수 및 기본 카테고리 정의
window.GLOBAL_CATEGORIES = [];
window.NO_IMAGE_URL = "https://placehold.co/400x300/e0e0e0/666666?text=No+Image";

const DEFAULT_CATEGORIES = [
    { code: 'korean', name: '🇰🇷 한글', type: 'EDU' },
    { code: 'reading', name: '📖 독서', type: 'EDU' },
    { code: 'english', name: '🔤 영어', type: 'EDU' },
    { code: 'math', name: '🔢 수학', type: 'EDU' },
    { code: 'science', name: '🔬 과학', type: 'EDU' },
    { code: 'art', name: '🎨 미술', type: 'EDU' },
    { code: 'coding', name: '💻 코딩', type: 'EDU' },
    { code: 'environment', name: '🌱 환경', type: 'EDU' },
    { code: 'nuri', name: '👶 누리과정', type: 'EDU' },
    { code: 'infant', name: '🧸 영아', type: 'EDU' },
    { code: 'special', name: '⭐ 기타(특색)', type: 'EDU' },
    { code: 'season', name: '🎉 시즌 테마 행사', type: 'EVENT' },
    { code: 'culture', name: '🌍 원어민 행사', type: 'EVENT' },
    { code: 'performance', name: '👨‍👩‍👧‍👦 부모 참여 행사', type: 'EVENT' },
    { code: 'proposal', name: '견적 요청', type: 'PAGE' },
    { code: 'order', name: '교재 발주', type: 'PAGE' }
];

// 3. 유틸리티 함수 (색상 변환, HTML 이스케이프)
function hexToRgba(hex, opacity) {
    if (!hex) return `rgba(26, 60, 110, ${opacity})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

window.escapeHtml = function (text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};
window.loadPostCustomFonts = function (html) {
    const str = String(html || "");
    const m = str.match(/<!--\s*NK_CUSTOM_FONTS_V1:([\s\S]*?)\s*-->/);
    if (!m) return;
    let list = [];
    try {
        const parsed = JSON.parse(decodeURIComponent(m[1].trim()));
        if (Array.isArray(parsed)) list = parsed;
    } catch (_) {
        return;
    }
    const loaded = new Set(
        Array.from(document.querySelectorAll("[data-nk-font-url]")).map(el => el.getAttribute("data-nk-font-url"))
    );
    list.forEach(item => {
        if (!item || !item.url) return;
        let parsedUrl;
        try {
            parsedUrl = new URL(String(item.url).trim());
        } catch (_) {
            return;
        }
        if (parsedUrl.protocol !== "https:") return;
        const safeHref = parsedUrl.href;
        if (loaded.has(safeHref)) return;
        loaded.add(safeHref);

        if (/\.(?:woff2|woff|ttf|otf)(?:[?#].*)?$/i.test(safeHref)) {
            const rawName = String(item.cssName || item.family || "")
                .split(",")[0]
                .replace(/['"\\;{}<>\r\n]/g, "")
                .trim();
            if (!rawName) return;
            const style = document.createElement("style");
            style.setAttribute("data-nk-font-url", safeHref);
            style.textContent = `@font-face { font-family: '${rawName}'; src: url('${safeHref}'); font-display: swap; }`;
            document.head.appendChild(style);
        } else {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = safeHref;
            link.setAttribute("data-nk-font-url", safeHref);
            document.head.appendChild(link);
        }
    });
};

window.sanitizeHtml = function (html) {
    if (typeof window.loadPostCustomFonts === "function") { window.loadPostCustomFonts(html); }
    const allowedTags = new Set(["A","B","BLOCKQUOTE","BR","CODE","DIV","EM","H1","H2","H3","H4","H5","H6","HR","I","IFRAME","IMG","LI","OL","P","PRE","S","SPAN","STRONG","SUB","SUP","TABLE","TBODY","TD","TFOOT","TH","THEAD","TR","U","UL"]);
    const allowedAttrs = new Set(["alt","colspan","height","href","src","title","width","rowspan","class","style"]);
    const safeUrl = (value, image) => {
        const v = String(value || "").trim();
        if (/^\s*(?:javascript|data|vbscript):/i.test(v)) return false;
        if (/^(?:https?:|mailto:|tel:)/i.test(v)) return !image || /^https?:/i.test(v);
        return !/^[a-z][a-z0-9+.-]*:/i.test(v) && !v.startsWith("//");
    };
    const clean = node => {
        if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
        if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
        if (!allowedTags.has(node.tagName)) {
            const fragment = document.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => fragment.appendChild(clean(child)));
            return fragment;
        }
        if (node.tagName === "IFRAME") {
            const src = node.getAttribute("src") || "";
            const match = src.match(/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})(?:[?#][A-Za-z0-9_=&%-]*)?$/i);
            if (!match) return document.createDocumentFragment();
            const iframe = document.createElement("iframe");
            iframe.setAttribute("src", "https://www.youtube.com/embed/" + match[1]);
            iframe.setAttribute("title", "YouTube 동영상");
            iframe.setAttribute("loading", "lazy");
            iframe.setAttribute("allowfullscreen", "");
            iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
            iframe.setAttribute("class", "ql-video");
            return iframe;
        }
        const out = document.createElement(node.tagName.toLowerCase());
        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase(), value = attr.value;
            if (name === "target") {
                if (out.tagName === "A" && value === "_blank") {
                    out.setAttribute("target", "_blank");
                    out.setAttribute("rel", "noopener noreferrer");
                }
                return;
            }
            if (!allowedAttrs.has(name) || name.startsWith("on")) return;
            if ((name === "href" || name === "src") && !safeUrl(value, name === "src")) return;
            if (name === "style") {
                const declarations = value.split(";").map(x => x.trim()).filter(Boolean).filter(x =>
                    /^(?:color|background-color|text-align|font-size|font-family|font-weight|font-style|text-decoration|margin(?:-top|-right|-bottom|-left)?|padding(?:-top|-right|-bottom|-left)?|width|max-width|height|border(?:-radius|-[a-z-]+)?|display|list-style-type|background|line-height|letter-spacing|gap|row-gap|column-gap|grid-template-columns|grid-column|flex|flex-direction|flex-wrap|justify-content|align-items|box-shadow|overflow|overflow-x|object-fit|box-sizing|min-width|min-height|vertical-align|white-space|word-break|opacity|border-collapse)\s*:\s*[^;<>]+$/i.test(x) &&
                    !/(?:url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:)/i.test(x));
                if (declarations.length) out.setAttribute("style", declarations.join("; "));
                return;
            }
            out.setAttribute(name, value);
        });
        Array.from(node.childNodes).forEach(child => out.appendChild(clean(child)));
        if (out.tagName === "A" && out.getAttribute("target") === "_blank") out.setAttribute("rel", "noopener noreferrer");
        return out;
    };
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const fragment = document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach(child => fragment.appendChild(clean(child)));
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    return holder.innerHTML;
};
window.sanitizeRichText = function (text) { return window.escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br>"); };
window.safeCategoryCode = function (code) {
    const value = String(code || "");
    return /^[a-z0-9_-]+$/i.test(value) ? value : "";
};
window.safeColor = function (value) {
    return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value || "")) ? value : "";
};

// ★ 유튜브 쇼츠(shorts/) 및 다양한 URL 형식을 완벽하게 지원하도록 개선된 파싱 함수 ★
window.getYoutubeId = function (url) {
    if (!url) return null;
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
};

window.formatDate = function (dateStr) {
    return dateStr ? dateStr.split('T')[0] : '';
};

// 4. Supabase 초기화 및 설정/카테고리 로드
(function initSystem() {
    let attempts = 0;
    const waitForReady = setInterval(() => {
        if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
            clearInterval(waitForReady);
            startSupabase();
        } else {
            attempts++;
            if (attempts > 50) {
                clearInterval(waitForReady);
                console.error("Supabase 로드 실패: CDN 또는 config.js 확인 필요");
                document.querySelectorAll('.hero, .sub-hero').forEach(el => el.classList.add('loaded'));
            }
        }
    }, 50);
})();

function startSupabase() {
    try {
        window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
            auth: { persistSession: true, storage: window.ADMIN_PERSIST_SESSION ? window.localStorage : window.sessionStorage }
        });
        loadSiteConfig();
        loadCategories();
    } catch (e) {
        console.error("Supabase Init Error:", e);
    }
}

function isValidHeroImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed || /^data:image\/(gif|svg\+xml)/i.test(trimmed) || /^blob:/i.test(trimmed)) return false;
    if (/via\.placeholder\.com/i.test(trimmed)) return false;
    return /^(https?:\/\/|\/|\.\/)/i.test(trimmed);
}
window.isValidHeroImageUrl = isValidHeroImageUrl;

window.parseNkHeroExtraStyle = function (raw) {
    if (!raw || typeof raw !== 'string') return {};
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{')) return {};
    try {
        const parsed = JSON.parse(trimmed);
        return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
        return {};
    }
};

window.deriveNkHeroCircleColor = function (bgHex) {
    const s = String(bgHex || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(s) || s === '#fbf6ee' || s === '#f7f0e4') return '#f3eadb';
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const adjust = (c) => lum > 0.5
        ? Math.max(0, Math.round(c * 0.93))
        : Math.min(255, Math.round(c + (255 - c) * 0.14));
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return '#' + toHex(adjust(r)) + toHex(adjust(g)) + toHex(adjust(b));
};

window.applyNkHeroVisuals = function (mainHero, data) {
    if (!mainHero || !data) return;
    const fixedHero = mainHero.hasAttribute('data-fixed-design');
    const titleEl = mainHero.querySelector('h1');
    const descEl = mainHero.querySelector('p');
    if (titleEl && data.main_hero_title) titleEl.innerHTML = window.sanitizeRichText(data.main_hero_title);
    if (descEl && data.main_hero_desc) descEl.innerHTML = window.sanitizeRichText(data.main_hero_desc);

    const hasHeroImage = isValidHeroImageUrl(data.main_hero_image);
    const bg = window.safeColor(String(data.main_hero_bg_color || '').trim().toLowerCase());
    const tc = window.safeColor(String(data.main_hero_title_color || '').trim().toLowerCase());
    const dc = window.safeColor(String(data.main_hero_desc_color || '').trim().toLowerCase());
    const extra = window.parseNkHeroExtraStyle(data.popup_link);

    const isLegacyUntouchedV1 = !hasHeroImage && !extra.nkHeroStyleV1 && (!bg || bg === '#1a3c6e') && (!tc || tc === '#ffffff') && (!dc || dc === '#ffffff');
    const shouldApplyCustomVisuals = !fixedHero || hasHeroImage || !isLegacyUntouchedV1;

    if (shouldApplyCustomVisuals) {
        if (hasHeroImage) {
            const overlayColor = data.main_hero_overlay_color || '#1a3c6e';
            const overlayOpacity = data.main_hero_overlay_opacity !== undefined ? data.main_hero_overlay_opacity : 0.4;
            const rgba = hexToRgba(overlayColor, overlayOpacity);
            const bgValue = `linear-gradient(${rgba}, ${rgba}), url('${data.main_hero_image}') center / cover no-repeat`;
            mainHero.style.setProperty('background', bgValue, 'important');
        } else if (bg) {
            mainHero.style.setProperty('background', bg, 'important');
        }
        if (titleEl && tc) titleEl.style.setProperty('color', tc, 'important');
        if (descEl && dc) descEl.style.setProperty('color', dc, 'important');
    }

    const eyebrowEl = mainHero.querySelector('.hero-eyebrow');
    const badgeBg = window.safeColor(extra.badgeBgColor);
    const badgeTxt = window.safeColor(extra.badgeTextColor);
    if (eyebrowEl) {
        if (badgeBg) eyebrowEl.style.setProperty('background', badgeBg, 'important');
        if (badgeTxt) {
            eyebrowEl.style.setProperty('color', badgeTxt, 'important');
            eyebrowEl.style.setProperty('border-color', hexToRgba(badgeTxt, 0.28), 'important');
        }
    }

    const btnEl = mainHero.querySelector('.hero-v2-actions .btn');
    const ghostBtnEl = mainHero.querySelector('.hero-v2-actions .btn-ghost');
    const btnBg = window.safeColor(extra.btnBgColor);
    const btnTxt = window.safeColor(extra.btnTextColor);
    if (btnEl) {
        if (btnBg) btnEl.style.setProperty('background', btnBg, 'important');
        if (btnTxt) btnEl.style.setProperty('color', btnTxt, 'important');
    }
    if (ghostBtnEl && btnBg) {
        ghostBtnEl.style.setProperty('border-color', btnBg, 'important');
        ghostBtnEl.style.setProperty('color', btnBg, 'important');
    }

    const tagsEl = mainHero.querySelector('.hero-v2-tags');
    const tagCol = window.safeColor(extra.tagColor);
    if (tagsEl && tagCol) {
        tagsEl.style.setProperty('color', tagCol, 'important');
    }

    const circleEl = mainHero.querySelector('.hero-v2-art svg circle');
    if (circleEl) {
        const rawCircle = window.safeColor(extra.circleColor);
        let circleCol = rawCircle;
        if (!circleCol || (circleCol.toLowerCase() === '#f3eadb' && !extra.circleCustom && bg && bg !== '#fbf6ee' && bg !== '#f7f0e4' && shouldApplyCustomVisuals)) {
            circleCol = (bg && shouldApplyCustomVisuals) ? window.deriveNkHeroCircleColor(bg) : '#f3eadb';
        }
        if (circleCol) {
            circleEl.setAttribute('fill', circleCol);
            circleEl.style.setProperty('fill', circleCol, 'important');
        }
    }

    // 메인 A안(.m-hero) 히어로 카드도 site_config 설정과 동기화
    const mHero = document.querySelector('#m-home .m-hero');
    if (mHero) {
        const mTitle = mHero.querySelector('.m-hero-body h1');
        const mDesc = mHero.querySelector('.m-hero-body p');
        const mEyebrow = mHero.querySelector('.m-hero-body > span');
        const mImg = mHero.querySelector('img');
        if (mTitle && data.main_hero_title) mTitle.innerHTML = window.sanitizeRichText(data.main_hero_title);
        if (mDesc && data.main_hero_desc) mDesc.innerHTML = window.sanitizeRichText(data.main_hero_desc);
        if (shouldApplyCustomVisuals) {
            if (bg) mHero.style.setProperty('background', bg, 'important');
            if (mTitle && tc) mTitle.style.setProperty('color', tc, 'important');
            if (mDesc && dc) mDesc.style.setProperty('color', dc, 'important');
        }
        if (mEyebrow) {
            if (badgeTxt) mEyebrow.style.setProperty('color', badgeTxt, 'important');
            if (badgeBg) {
                mEyebrow.style.setProperty('background', badgeBg, 'important');
                mEyebrow.style.setProperty('padding', '3px 10px', 'important');
                mEyebrow.style.setProperty('border-radius', '99px', 'important');
                mEyebrow.style.setProperty('width', 'fit-content', 'important');
            }
        }
        if (mImg && hasHeroImage) {
            if (!mImg.dataset.origSrc) mImg.dataset.origSrc = mImg.getAttribute('src') || 'm-hero.jpg';
            mImg.setAttribute('src', data.main_hero_image);
        }
    }
};

async function loadSiteConfig() {
    if (!window.sb) return;
    const mainHero = document.querySelector('.hero');

    try {
        const { data } = await window.sb.from('site_config').select('*').eq('id', 1).single();
        if (data) {
            window.__nkSiteConfig = data;
            if (data.company_name) CONFIG.COMPANY.NAME = data.company_name;
            if (data.ceo_name) CONFIG.COMPANY.CEO = data.ceo_name;
            if (data.address) CONFIG.COMPANY.ADDRESS = data.address;
            if (data.phone) CONFIG.COMPANY.PHONE = data.phone;

            const root = document.documentElement;
            if (data.primary_color) root.style.setProperty('--primary-color', data.primary_color);
            if (data.accent_color) root.style.setProperty('--accent-color', data.accent_color);

            const isPreviewOrVerify = (window.parent !== window && new URLSearchParams(location.search).get('nkpreview') === '1') || new URLSearchParams(location.search).has('nk_verify');
            if (mainHero && !isPreviewOrVerify) {
                if (window.NKPageDesign && typeof window.NKPageDesign.refreshFromSiteConfig === 'function') {
                    window.NKPageDesign.refreshFromSiteConfig();
                } else {
                    window.applyNkHeroVisuals(mainHero, data);
                }
            }
            loadFooter();
        }
    } catch (e) { console.error("사이트 설정 로드 실패:", e); }
    if (mainHero) mainHero.classList.add('loaded');
}

async function loadCategories() {
    if (!window.sb) return;
    try {
        const { data } = await window.sb.from('program_categories').select('*').eq('is_visible', true).order('order_num', { ascending: true });
        window.GLOBAL_CATEGORIES = (data && data.length > 0) ? data : DEFAULT_CATEGORIES;
    } catch (e) {
        window.GLOBAL_CATEGORIES = DEFAULT_CATEGORIES;
    }
    loadHeader();
    if (typeof window.applySubPageHero === 'function') window.applySubPageHero();
}

// 5. 컴포넌트 렌더링 함수 (헤더, 푸터, 히어로 배너)
window.applySubPageHero = function () {
    const hero = document.getElementById('view-hero') || document.querySelector('.sub-hero');
    if (!hero) return;

    let currentCode = '';
    const pathname = location.pathname;
    const hash = location.hash.replace('#', '');

    if (pathname.includes('child.html')) currentCode = hash || 'korean';
    else if (pathname.includes('program.html')) currentCode = hash;
    else if (pathname.includes('proposal.html')) currentCode = 'proposal';
    else if (pathname.includes('order.html')) currentCode = 'order';
    else if (pathname.includes('page.html')) {
        currentCode = new URLSearchParams(window.location.search).get('id') || new URLSearchParams(window.location.search).get('c');
    } else {
        currentCode = pathname.split('/').pop().replace('.html', '');
    }

    const category = window.GLOBAL_CATEGORIES.find(c => c.code === currentCode);
    if (category) {
        if (category.hero_image) {
            const overlayColor = category.hero_overlay_color || '#1a3c6e';
            const overlayOpacity = category.hero_overlay_opacity !== undefined ? category.hero_overlay_opacity : 0.8;
            const rgba = hexToRgba(overlayColor, overlayOpacity);
            hero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba}), url('${category.hero_image}')`;
            hero.style.backgroundSize = 'cover';
            hero.style.backgroundPosition = 'center';
            hero.style.backgroundColor = 'transparent';
        } else {
            hero.style.backgroundImage = 'none';
            hero.style.backgroundColor = category.hero_bg_color || '#1a3c6e';
        }

        if (category.hero_title_color) hero.querySelector('h1').style.color = category.hero_title_color;
        if (category.hero_desc_color) hero.querySelector('p').style.color = category.hero_desc_color;

        const titleEl = hero.querySelector('h1');
        const descEl = hero.querySelector('p');
        if (titleEl && category.hero_title) titleEl.innerHTML = window.sanitizeRichText(category.hero_title);
        if (descEl && category.hero_desc) descEl.innerHTML = window.sanitizeRichText(category.hero_desc);
    }
    hero.classList.add('loaded');
};

function loadHeader() {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const categories = (window.GLOBAL_CATEGORIES && window.GLOBAL_CATEGORIES.length > 0) ? window.GLOBAL_CATEGORIES : DEFAULT_CATEGORIES;
    const groupNames = { 'EDU': '📚 교재소개', 'EVENT': '🎉 행사프로그램', 'BOARD': '📢 알림/소식' };
    const groupHtml = {};

    categories.forEach(c => {
        if (!groupHtml[c.type]) groupHtml[c.type] = '';
        const menuColor = window.safeColor(c.menu_text_color);
        const colorStyle = menuColor ? `style="color:${menuColor}"` : '';

        if (c.type === 'EDU') {
            const code = window.safeCategoryCode(c.code);
            if (code) groupHtml[c.type] += `<li><a href="child.html#${code}" ${colorStyle}>${window.escapeHtml(c.name)}</a></li>`;
        } else if (c.type === 'EVENT') {
            const code = window.safeCategoryCode(c.code);
            if (code) {
                groupHtml[c.type] += `<li><a href="program.html#${code}" ${colorStyle}>${window.escapeHtml(c.name)}</a></li>`;
            }
        } else if (c.type === 'BOARD') {
            const code = window.safeCategoryCode(c.code);
            if (code) groupHtml[c.type] += `<li><a href="notice.html#${code}" ${colorStyle}>${window.escapeHtml(c.name)}</a></li>`;
        } else if (c.type === 'PAGE') {
            const isCta = (c.code === 'proposal') ? 'class="cta-menu"' : '';
            const weight = (c.code === 'order') ? 'style="font-weight:bold;"' : '';
            const code = window.safeCategoryCode(c.code);
            if (code) {
                const href = (code === 'order' || code === 'proposal') ? `${code}.html` : `page.html?id=${encodeURIComponent(code)}`;
                groupHtml[c.type] += `<li><a href="${href}" ${isCta} ${weight}>${window.escapeHtml(c.name)}</a></li>`;
            }
        }
    });

    const mainOrder = [];
    categories.forEach(c => { if (!mainOrder.includes(c.type)) mainOrder.push(c.type); });

    let navHtml = '';
    mainOrder.forEach(type => {
        if (type === 'PAGE') {
            navHtml += groupHtml[type];
        } else if (groupHtml[type]) {
            const isDouble = (type === 'EDU') ? 'double-col' : '';
            navHtml += `
                <li class="has-sub">
                    <a href="javascript:void(0)" onclick="window.toggleSubMenu(this)">${groupNames[type]} <span class="arrow">▼</span></a>
                    <ul class="dropdown ${isDouble}">${groupHtml[type]}</ul>
                </li>`;
        }
    });

    headerEl.innerHTML = `
        <div class="header-inner">
            <a href="index.html" class="logo-link"><img src="${CONFIG.LOGO_URL}" alt="" class="logo-img logo-mark"><span class="logo-text"><strong>뉴키즈</strong><small>어린이집 · 유치원 파트너</small></span></a>
            <button class="mobile-btn" onclick="window.toggleMenu()">☰</button>
            <ul class="nav-menu" id="navMenu">
                ${navHtml}
                <li><a href="https://www.kookminbooks.co.kr/" target="_blank">국민서관</a></li>
            </ul>
        </div>`;
}

function loadFooter() {
    const footerEl = document.querySelector('footer');
    if (footerEl) {
        footerEl.innerHTML = `
            <div class="container">
                <p>${window.escapeHtml(CONFIG.COMPANY.NAME)} | 대표: <span>${window.escapeHtml(CONFIG.COMPANY.CEO)}</span></p>
                <p>주소: <span>${window.escapeHtml(CONFIG.COMPANY.ADDRESS)}</span></p>
                <p>문의: <span>${window.escapeHtml(CONFIG.COMPANY.PHONE)}</span></p>
                <br>
                <p><a href="admin.html" style="color:inherit; text-decoration:none;">&copy; 2026 New Kids. All rights reserved.</a></p>
            </div>`;
    }
}

// 6. 전역 네비게이션 및 스크롤 헬퍼
window.toggleMenu = function () {
    const navMenu = document.getElementById('navMenu');
    if (navMenu) navMenu.classList.toggle('active');
};

window.toggleSubMenu = function (el) {
    if (window.innerWidth <= 768) {
        const parent = el.parentElement;
        const isOpen = parent.classList.contains('sub-open');
        document.querySelectorAll('.nav-menu li.has-sub').forEach(li => li.classList.remove('sub-open'));
        if (!isOpen) parent.classList.add('sub-open');
    }
};

function addScrollButtons() {
    if (document.querySelector('.scroll-btns')) return;
    document.body.insertAdjacentHTML('beforeend', `
        <div class="scroll-btns">
            <button type="button" class="btn-scroll" aria-label="맨 위로 이동" title="맨 위로" onclick="window.scrollToTop()">▲</button>
            <button type="button" class="btn-scroll" aria-label="맨 아래로 이동" title="맨 아래로" onclick="window.scrollToBottom()">▼</button>
        </div>`);
}

window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
window.scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });


// 8. [2026.11] A안 공통 디자인: 공개 페이지 body에 nk-a 클래스 + 휴대폰 아래 메뉴
const NK_A_PAGES = ['', 'index.html', 'child.html', 'program.html', 'notice.html', 'view.html', 'proposal.html', 'page.html', 'order.html', 'app-install.html'];
const NK_TABBAR_PAGES = ['child.html', 'program.html', 'notice.html', 'proposal.html', 'page.html', 'order.html', 'app-install.html'];
const NK_TAB_ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    edu: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    event: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    ref: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    qna: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'
};
function nkMarkTab() {
    const page = location.pathname.split('/').pop();
    const hash = location.hash.replace('#', '');
    let current = '';
    if (page === 'child.html') current = 'edu';
    else if (page === 'program.html') current = 'event';
    else if (page === 'notice.html' && hash === 'reference') current = 'ref';
    else if (page === 'notice.html' && hash === 'qna') current = 'qna';
    document.querySelectorAll('.m-tabbar a[data-tab]').forEach(a => {
        if (a.dataset.tab === current) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
}
function applyThemeA() {
    if (window !== window.parent) return; // 다른 글 안에 끼워 넣은 화면(투표 등)은 제외
    const page = location.pathname.split('/').pop();
    if (!NK_A_PAGES.includes(page)) return;
    document.body.classList.add('nk-a');
    if (!NK_TABBAR_PAGES.includes(page) || document.querySelector('.m-tabbar')) return;
    const tabs = [
        ['home', 'index.html', '홈'], ['edu', 'child.html', '교재'], ['event', 'program.html#culture', '행사'],
        ['ref', 'notice.html#reference', '자료실'], ['qna', 'notice.html#qna', '문의']
    ];
    const links = tabs.map(([key, href, label]) => `<a href="${href}" data-tab="${key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NK_TAB_ICONS[key]}</svg>${label}</a>`).join('');
    document.body.insertAdjacentHTML('beforeend', `<nav class="m-tabbar" aria-label="아래 메뉴">${links}</nav>`);
    document.body.classList.add('nk-has-tabbar');
    nkMarkTab();
    window.addEventListener('hashchange', nkMarkTab);
}

// 7. 페이지 초기화 및 보안 이벤트
document.addEventListener("DOMContentLoaded", function () {
    loadHeader();
    loadFooter();
    addScrollButtons();
    applyThemeA();

    // 연락처 자동 하이픈 포맷팅 공통 적용
    document.querySelectorAll('input[name="phone"]').forEach(input => {
        input.addEventListener('input', function (e) {
            let num = e.target.value.replace(/[^0-9]/g, "");
            let tel = "";
            if (num.startsWith('02')) {
                if (num.length < 3) tel = num;
                else if (num.length < 6) tel = num.substr(0, 2) + "-" + num.substr(2);
                else tel = num.substr(0, 2) + "-" + num.substr(2, 4) + "-" + num.substr(6, 4);
            } else {
                if (num.length < 4) tel = num;
                else if (num.length < 7) tel = num.substr(0, 3) + "-" + num.substr(3);
                else tel = num.substr(0, 3) + "-" + num.substr(3, 4) + "-" + num.substr(7, 4);
            }
            e.target.value = tel;
        });
    });

    // ★ 모바일 환경에서 드롭다운(하위 메뉴) 링크를 클릭했을 때 메뉴 창 자동 닫기 처리 ★
    document.addEventListener('click', e => {
        const navMenu = document.getElementById('navMenu');
        const mobileBtn = document.querySelector('.mobile-btn');

        // 하위 메뉴 항목(dropdown 안의 a 태그)을 클릭한 경우
        if (e.target.closest('.dropdown a')) {
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
            }
            document.querySelectorAll('.nav-menu li.has-sub').forEach(li => {
                li.classList.remove('sub-open');
            });
            return;
        }

        // 모바일 외부 영역 클릭 시 메뉴 닫기
        if (navMenu && navMenu.classList.contains('active') && !navMenu.contains(e.target) && (!mobileBtn || !mobileBtn.contains(e.target))) {
            navMenu.classList.remove('active');
        }
    });

    window.addEventListener('hashchange', () => {
        if (location.pathname.includes('child.html') || location.pathname.includes('program.html')) {
            window.applySubPageHero();
        }
    });

});
