/* =========================================
   뉴키즈(New Kids) 프로젝트 코어 관리 파일 (manager.js)
   ========================================= */

// 1. 페이지 새로고침 시 스크롤 최상단 고정
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);
window.addEventListener('beforeunload', () => window.scrollTo(0, 0));

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
window.sanitizeRichText = function (text) {
    return window.escapeHtml(text).replace(/&lt;br\s*\/?&gt;/gi, "<br>");
};
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
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|shorts\/)([^#&?]*).*/;
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
            auth: { persistSession: true, storage: window.sessionStorage }
        });
        loadSiteConfig();
        loadCategories();
    } catch (e) {
        console.error("Supabase Init Error:", e);
    }
}

async function loadSiteConfig() {
    if (!window.sb) return;
    const mainHero = document.querySelector('.hero');

    try {
        const { data } = await window.sb.from('site_config').select('*').eq('id', 1).single();
        if (data) {
            if (data.company_name) CONFIG.COMPANY.NAME = data.company_name;
            if (data.ceo_name) CONFIG.COMPANY.CEO = data.ceo_name;
            if (data.address) CONFIG.COMPANY.ADDRESS = data.address;
            if (data.phone) CONFIG.COMPANY.PHONE = data.phone;

            const root = document.documentElement;
            if (data.primary_color) root.style.setProperty('--primary-color', data.primary_color);
            if (data.accent_color) root.style.setProperty('--accent-color', data.accent_color);

            // 고정 디자인 히어로(data-fixed-design)는 배경/글자색 설정을 덮어쓰지 않고 문구만 반영
            const fixedHero = mainHero && mainHero.hasAttribute('data-fixed-design');
            if (mainHero && fixedHero) {
                const titleEl = mainHero.querySelector('h1');
                const descEl = mainHero.querySelector('p');
                if (titleEl && data.main_hero_title) titleEl.innerHTML = window.sanitizeRichText(data.main_hero_title);
                if (descEl && data.main_hero_desc) descEl.innerHTML = window.sanitizeRichText(data.main_hero_desc);
            } else if (mainHero) {
                if (data.main_hero_image) {
                    const overlayColor = data.main_hero_overlay_color || '#1a3c6e';
                    const overlayOpacity = data.main_hero_overlay_opacity !== undefined ? data.main_hero_overlay_opacity : 0.4;
                    const rgba = hexToRgba(overlayColor, overlayOpacity);
                    mainHero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba}), url('${data.main_hero_image}')`;
                    mainHero.style.backgroundColor = 'transparent';
                } else {
                    mainHero.style.backgroundImage = 'none';
                    mainHero.style.backgroundColor = data.main_hero_bg_color || '#1a3c6e';
                }

                if (data.main_hero_title_color) mainHero.querySelector('h1').style.color = data.main_hero_title_color;
                if (data.main_hero_desc_color) mainHero.querySelector('p').style.color = data.main_hero_desc_color;

                const titleEl = mainHero.querySelector('h1');
                const descEl = mainHero.querySelector('p');
                if (titleEl && data.main_hero_title) titleEl.innerHTML = window.sanitizeRichText(data.main_hero_title);
                if (descEl && data.main_hero_desc) descEl.innerHTML = window.sanitizeRichText(data.main_hero_desc);
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
        currentCode = new URLSearchParams(window.location.search).get('id');
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
            const legacyFiles = ['season', 'culture', 'performance'];
            const code = window.safeCategoryCode(c.code);
            if (code) {
                const href = legacyFiles.includes(code) ? `${code}.html` : `program.html#${code}`;
                groupHtml[c.type] += `<li><a href="${href}" ${colorStyle}>${window.escapeHtml(c.name)}</a></li>`;
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
            <button class="btn-scroll" onclick="window.scrollToTop()">▲</button>
            <button class="btn-scroll" onclick="window.scrollToBottom()">▼</button>
        </div>`);
}

window.scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
window.scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

// 7. 페이지 초기화 및 보안 이벤트
document.addEventListener("DOMContentLoaded", function () {
    loadHeader();
    loadFooter();
    addScrollButtons();

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

    // 8. 페이지 복사 및 우클릭 방지 이벤트 등록
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault(); // 마우스 우클릭 방지
    });

    document.addEventListener('selectstart', function (e) {
        e.preventDefault(); // 텍스트 선택 방지
    });

    document.addEventListener('dragstart', function (e) {
        e.preventDefault(); // 이미지 및 텍스트 드래그 방지
    });

    document.addEventListener('keydown', function (e) {
        // F12, Ctrl+Shift+I, Ctrl+U, Ctrl+C 방지
        if (
            e.keyCode === 123 || 
            (e.ctrlKey && e.shiftKey && e.keyCode === 73) || 
            (e.ctrlKey && e.keyCode === 85) || 
            (e.ctrlKey && e.keyCode === 67)
        ) {
            e.preventDefault();
        }
    });
});
