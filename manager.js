// manager.js - 통합 관리자 (최적화 및 중복 코드 제거 완료)

// ============================================================
// [0] 새로고침 시 스크롤 최상단 고정
// ============================================================
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

window.addEventListener('beforeunload', function () {
    window.scrollTo(0, 0);
});

// ============================================================
// [1] 전역 설정 및 유틸리티
// ============================================================
window.GLOBAL_CATEGORIES = [];
window.NO_IMAGE_URL = "https://placehold.co/400x300/e0e0e0/666666?text=No+Image"; // 공통 기본 이미지

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

function hexToRgba(hex, opacity) {
    if (!hex) return `rgba(26, 60, 110, ${opacity})`;
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// 텍스트 HTML 이스케이프 (공통)
window.escapeHtml = function (text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
};

// ============================================================
// [2] Supabase 초기화 및 설정 로드
// ============================================================
(function initSystem() {
    if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
        startSupabase();
    } else {
        let attempts = 0;
        const waitForSupabase = setInterval(() => {
            if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
                clearInterval(waitForSupabase);
                startSupabase();
            } else {
                attempts++;
                if (attempts > 50) {
                    clearInterval(waitForSupabase);
                    console.error("Supabase 로드 실패: CDN 또는 config.js 확인 필요");
                    document.querySelectorAll('.hero, .sub-hero').forEach(el => el.classList.add('loaded'));
                }
            }
        }, 50);
    }
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

            if (mainHero) {
                // 👇 메인 페이지 필터 항상 적용 로직
                const overlayColor = data.main_hero_overlay_color || '#1a3c6e';
                const overlayOpacity = data.main_hero_overlay_opacity !== undefined ? data.main_hero_overlay_opacity : 0.4;
                const rgba = hexToRgba(overlayColor, overlayOpacity);

                if (data.main_hero_image) {
                    mainHero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba}), url('${data.main_hero_image}')`;
                    mainHero.style.backgroundColor = 'transparent';
                } else {
                    mainHero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba})`;
                    mainHero.style.backgroundColor = data.main_hero_bg_color || '#1a3c6e';
                }

                if (data.main_hero_title_color) mainHero.querySelector('h1').style.color = data.main_hero_title_color;
                if (data.main_hero_desc_color) mainHero.querySelector('p').style.color = data.main_hero_desc_color;

                const titleEl = mainHero.querySelector('h1');
                const descEl = mainHero.querySelector('p');
                if (titleEl && data.main_hero_title) titleEl.innerHTML = data.main_hero_title;
                if (descEl && data.main_hero_desc) descEl.innerHTML = data.main_hero_desc;
            }
            loadFooter();
        }
    } catch (e) { console.error("설정 로드 실패:", e); }
    if (mainHero) mainHero.classList.add('loaded');
}

async function loadCategories() {
    if (!window.sb) return;
    try {
        const { data } = await window.sb.from('program_categories').select('*').eq('is_visible', true).order('order_num', { ascending: true });
        window.GLOBAL_CATEGORIES = (data && data.length > 0) ? data : DEFAULT_CATEGORIES;
    } catch (e) { window.GLOBAL_CATEGORIES = DEFAULT_CATEGORIES; }
    loadHeader();
    window.applySubPageHero();
}

// ============================================================
// [3] UI 및 페이지 제어 함수
// ============================================================
window.applySubPageHero = function () {
    const hero = document.getElementById('view-hero') || document.querySelector('.sub-hero');
    if (!hero) return;

    let currentCode = '';
    if (location.pathname.includes('child.html')) currentCode = location.hash.replace('#', '') || 'korean';
    else if (location.pathname.includes('program.html')) currentCode = location.hash.replace('#', '');
    else if (location.pathname.includes('proposal.html')) currentCode = 'proposal';
    else if (location.pathname.includes('order.html')) currentCode = 'order';
    else if (location.pathname.includes('page.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        currentCode = urlParams.get('id');
    }
    else currentCode = location.pathname.split('/').pop().replace('.html', '');

    const category = window.GLOBAL_CATEGORIES.find(c => c.code === currentCode);
    if (category) {
        // 👇 서브 페이지 필터 항상 적용 로직
        const overlayColor = category.hero_overlay_color || '#1a3c6e';
        const overlayOpacity = category.hero_overlay_opacity !== undefined ? category.hero_overlay_opacity : 0.8;
        const rgba = hexToRgba(overlayColor, overlayOpacity);

        if (category.hero_image) {
            hero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba}), url('${category.hero_image}')`;
            hero.style.backgroundSize = 'cover';
            hero.style.backgroundPosition = 'center';
            hero.style.backgroundColor = 'transparent';
        } else {
            hero.style.backgroundImage = `linear-gradient(${rgba}, ${rgba})`;
            hero.style.backgroundColor = category.hero_bg_color || '#1a3c6e';
        }

        if (category.hero_title_color) hero.querySelector('h1').style.color = category.hero_title_color;
        if (category.hero_desc_color) hero.querySelector('p').style.color = category.hero_desc_color;

        const titleEl = hero.querySelector('h1');
        const descEl = hero.querySelector('p');
        if (titleEl && category.hero_title) titleEl.innerHTML = category.hero_title;
        if (descEl && category.hero_desc) descEl.innerHTML = category.hero_desc;
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
        const colorStyle = c.menu_text_color ? `style="color:${c.menu_text_color}"` : '';

        if (c.type === 'EDU') {
            groupHtml[c.type] += `<li><a href="child.html#${c.code}" ${colorStyle}>${c.name}</a></li>`;
        } else if (c.type === 'EVENT') {
            const legacyFiles = ['season', 'culture', 'performance'];
            const href = legacyFiles.includes(c.code) ? `${c.code}.html` : `program.html#${c.code}`;
            groupHtml[c.type] += `<li><a href="${href}" ${colorStyle}>${c.name}</a></li>`;
        } else if (c.type === 'BOARD') {
            groupHtml[c.type] += `<li><a href="notice.html#${c.code}" ${colorStyle}>${c.name}</a></li>`;
        } else if (c.type === 'PAGE') {
            const isCta = (c.code === 'proposal') ? 'class="cta-menu"' : '';
            const weight = (c.code === 'order') ? 'style="font-weight:bold;"' : '';
            const href = (c.code === 'order' || c.code === 'proposal') ? `${c.code}.html` : `page.html?id=${c.code}`;
            groupHtml[c.type] += `<li><a href="${href}" ${isCta} ${weight}>${c.name}</a></li>`;
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
                    <a href="javascript:void(0)" onclick="toggleSubMenu(this)">${groupNames[type]} <span class="arrow">▼</span></a>
                    <ul class="dropdown ${isDouble}">${groupHtml[type]}</ul>
                </li>`;
        }
    });

    headerEl.innerHTML = `
        <div class="header-inner">
            <a href="index.html" class="logo-link"><img src="${CONFIG.LOGO_URL}" alt="NEW KIDS" class="logo-img"></a>
            <button class="mobile-btn" onclick="window.toggleMenu()">☰</button>
            <ul class="nav-menu" id="navMenu">
                ${navHtml}
                <li><a href="https://www.kookminbooks.co.kr/" target="_blank">국민서관</a></li>
            </ul>
        </div>`;
}

function loadFooter() {
    const footerEl = document.querySelector('footer');
    if (footerEl) footerEl.innerHTML = `<div class="container"><p>${CONFIG.COMPANY.NAME} | 대표: <span>${CONFIG.COMPANY.CEO}</span></p><p>주소: <span>${CONFIG.COMPANY.ADDRESS}</span></p><p>문의: <span>${CONFIG.COMPANY.PHONE}</span></p><br><p><a href="admin.html" style="color:inherit; text-decoration:none;">&copy; 2026 New Kids. All rights reserved.</a></p></div>`;
}

// ============================================================
// [4] 이벤트 리스너 및 헬퍼 함수
// ============================================================
window.toggleMenu = function () { document.getElementById('navMenu').classList.toggle('active'); };
window.toggleSubMenu = function (el) { if (window.innerWidth <= 768) { const p = el.parentElement; const o = p.classList.contains('sub-open'); document.querySelectorAll('.nav-menu li.has-sub').forEach(li => li.classList.remove('sub-open')); if (!o) p.classList.add('sub-open'); } };
function addScrollButtons() { if (document.querySelector('.scroll-btns')) return; document.body.insertAdjacentHTML('beforeend', `<div class="scroll-btns"><button class="btn-scroll" onclick="scrollToTop()">▲</button><button class="btn-scroll" onclick="scrollToBottom()">▼</button></div>`); }
window.scrollToTop = () => { window.scrollTo({ top: 0, behavior: 'smooth' }) };
window.scrollToBottom = () => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) };
window.getYoutubeId = (u) => { if (!u) return null; const m = u.match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/); return (m && m[7].length === 11) ? m[7] : null; };
window.formatDate = (d) => { return d ? d.split('T')[0] : ''; };
function enableAutoResizeTextarea() { document.querySelectorAll('textarea.form-input').forEach(t => { t.style.minHeight = '120px'; t.style.height = 'auto'; t.style.height = (t.scrollHeight) + 'px'; t.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; }); }); }

// ============================================================
// [5] DOMContentLoaded
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
    loadHeader();
    loadFooter();
    addScrollButtons();
    enableAutoResizeTextarea();

    // 폼 전화번호 자동 하이픈 (공통 적용)
    document.querySelectorAll('input[name="phone"]').forEach(input => {
        input.addEventListener('input', function (e) {
            let number = e.target.value.replace(/[^0-9]/g, "");
            let tel = "";
            if (number.startsWith('02')) {
                if (number.length < 3) tel = number; else if (number.length < 6) tel = number.substr(0, 2) + "-" + number.substr(2); else tel = number.substr(0, 2) + "-" + number.substr(2, 4) + "-" + number.substr(6);
            } else {
                if (number.length < 4) tel = number; else if (number.length < 7) tel = number.substr(0, 3) + "-" + number.substr(3); else tel = number.substr(0, 3) + "-" + number.substr(3, 4) + "-" + number.substr(7);
            }
            e.target.value = tel;
        });
    });

    // 모바일 메뉴 제어 로직 통합
    const mobileBtn = document.querySelector('.mobile-btn');
    const navMenu = document.getElementById('navMenu');

    if (mobileBtn && navMenu) {
        mobileBtn.addEventListener('click', function (e) { e.stopPropagation(); navMenu.classList.toggle('active'); });
    }

    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', () => { if (navMenu && navMenu.classList.contains('active')) navMenu.classList.remove('active'); });
    });

    document.addEventListener('click', e => {
        if (navMenu && navMenu.classList.contains('active') && !navMenu.contains(e.target) && (!mobileBtn || !mobileBtn.contains(e.target))) navMenu.classList.remove('active');
    });

    window.addEventListener('hashchange', () => {
        if (location.pathname.includes('child.html') || location.pathname.includes('program.html')) window.applySubPageHero();
    });
});
