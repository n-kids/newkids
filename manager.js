// manager.js - 통합 관리자 (최적화 및 중복 코드 제거)

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
                if (titleEl && data.main_hero_title) titleEl.innerHTML = data.main_hero_title;
                if (descEl && data.main_hero_desc) descEl.innerHTML = data.main_hero_desc;
            }
            loadFooter();
        }
    } catch (e) { console.error("설정 로드 실패:", e); }
    if (mainHero) mainHero.classList.add('loaded');
}

// [1] 카테고리 생성 함수 수정 (이미지 없어도 고정 페이지 생성 가능하게 변경)
async function addNewCategory() {
    const code = document.getElementById('new-cat-code').value.trim().toLowerCase();
    const name = document.getElementById('new-cat-name').value.trim();
    const type = document.getElementById('new-cat-type').value;
    const desc = document.getElementById('new-cat-desc').value.trim();

    if (!code || !name) return alert("코드와 메뉴 이름은 필수 입력입니다.");

    showLoading(true);
    let u = null;
    const f = document.getElementById('new-cat-file').files[0];
    let uploadData = croppedNewCatBlob ? croppedNewCatBlob : f;

    // 이미지가 있을 때만 업로드 진행
    if (uploadData) {
        try {
            const ext = croppedNewCatBlob ? 'jpg' : (f.name.split('.').pop() || 'jpg');
            const { data } = await window.sb.storage.from('images').upload(`h_${Date.now()}.${ext}`, uploadData);
            u = window.sb.storage.from('images').getPublicUrl(data.path).data.publicUrl;
        } catch (e) {
            console.error("이미지 업로드 실패:", e);
        }
    }

    // 데이터 삽입
    const { error } = await window.sb.from('program_categories').insert([{
        code,
        name,
        type,
        hero_desc: desc,
        hero_image: u,
        order_num: 999,
        is_visible: true
    }]);

    showLoading(false);
    if (error) {
        alert("생성 실패: " + error.message);
    } else {
        alert("카테고리가 생성되었습니다.");
        croppedNewCatBlob = null;
        document.getElementById('new-cat-code').value = '';
        document.getElementById('new-cat-name').value = '';
        loadAdminCategories();
        populateCategorySelects();
    }
}

// [2] 삭제 기능이 포함된 목록 로드 함수 (기존 코드와 교체)
async function loadAdminCategories() {
    const listDiv = document.getElementById('category-list-container');
    try {
        const { data, error } = await window.sb.from('program_categories').select('*').order('order_num', { ascending: true });
        if (error) throw error;

        categoryList = data || [];
        let html = `<div style="text-align:right; margin-bottom:10px;"><button onclick="saveAllCategories()" class="btn-action" style="background:#2ecc71; border:none; padding:10px 20px;">💾 변경사항 일괄 저장</button></div>`;
        const gridStyle = "grid-template-columns: 60px 40px 70px 100px 100px 45px 45px 45px 45px 50px 1fr 120px 50px 60px;";

        html += `<div class="cat-manage-layout cat-manage-header" style="${gridStyle}"><div>유형</div><div>순서</div><div>코드</div><div>메뉴명</div><div>제목</div><div>메뉴색</div><div>제목색</div><div>설명색</div><div>필터색</div><div>투명도</div><div>설명글</div><div>이미지</div><div>노출</div><div>삭제</div></div>`;
        html += `<div id="sortable-category-list">`;

        categoryList.forEach((cat, index) => {
            const thumb = cat.hero_image || 'https://via.placeholder.com/50?text=None';
            const visBtn = cat.is_visible !== false ? `<button class="btn-mini" style="background:#27ae60; color:#fff;" onclick="toggleVisibility('${cat.code}', false)">ON</button>` : `<button class="btn-mini" style="background:#999; color:#fff;" onclick="toggleVisibility('${cat.code}', true)">OFF</button>`;

            html += `<div class="cat-manage-layout cat-manage-row" data-code="${cat.code}" style="${gridStyle}">
                        <div class="cat-cell-center"><span class="type-badge" style="background:${cat.type === 'PAGE' ? '#e67e22' : '#1a3c6e'}">${cat.type}</span></div>
                        <div class="cat-cell-center"><span class="drag-handle" style="cursor:grab; font-size:1.2rem;">↕️</span></div>
                        <div class="cat-cell-center" style="font-weight:bold; font-size:0.8rem;">${cat.code}</div>
                        <div class="cat-cell-input"><input type="text" id="name-${cat.code}" value="${cat.name}"></div>
                        <div class="cat-cell-input"><input type="text" id="title-${cat.code}" value="${cat.hero_title || ''}"></div>
                        <div class="cat-cell-center"><input type="color" id="m-color-${cat.code}" value="${cat.menu_text_color || '#333333'}" style="width:25px; border:none;" title="메뉴 글자색"></div>
                        <div class="cat-cell-center"><input type="color" id="t-color-${cat.code}" value="${cat.hero_title_color || '#ffffff'}" style="width:25px; border:none;" title="배경 큰 제목 색상"></div>
                        <div class="cat-cell-center"><input type="color" id="d-color-${cat.code}" value="${cat.hero_desc_color || '#ffffff'}" style="width:25px; border:none;" title="배경 설명글 색상"></div>
                        <div class="cat-cell-center"><input type="color" id="o-color-${cat.code}" value="${cat.hero_overlay_color || '#1a3c6e'}" style="width:25px; border:none;" title="배경 이미지 덮는 필터 색상"></div>
                        <div class="cat-cell-center"><input type="number" id="o-op-${cat.code}" value="${cat.hero_overlay_opacity !== undefined ? cat.hero_overlay_opacity : 0.8}" step="0.1" style="width:40px;"></div>
                        <div class="cat-cell-input"><input type="text" id="desc-${cat.code}" value="${cat.hero_desc || ''}"></div>
                        <div class="cat-cell-center" style="display:flex; flex-direction:column; align-items:center; gap:5px;"><img src="${thumb}" style="width:50px; height:50px; object-fit:cover; cursor:pointer;" onclick="document.getElementById('file-${cat.code}').click()"><input type="file" id="file-${cat.code}" class="cat-file-input" data-code="${cat.code}" style="display:none;" accept="image/*"><button class="btn-mini" style="font-size:0.6rem; color:red;" onclick="deleteSubHeroImage('${cat.code}')">삭제</button></div>
                        <div class="cat-cell-center">${visBtn}</div>
                        <div class="cat-cell-center"><button onclick="deleteCategory('${cat.code}')" class="btn-mini" style="background:#ff6b6b; color:#fff; width:100%;">삭제</button></div>
                    </div>`;
        });
        html += `</div>`;
        listDiv.innerHTML = html;

        // 드래그 앤 드롭 및 이벤트 초기화 로직 유지...
    } catch (e) {
        console.error(e);
    }
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
    else currentCode = location.pathname.split('/').pop().replace('.html', '');

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
        if (titleEl && category.hero_title) titleEl.innerHTML = category.hero_title;
        if (descEl && category.hero_desc) descEl.innerHTML = category.hero_desc;
    }
    hero.classList.add('loaded');
};

function loadHeader() {
    const headerEl = document.querySelector('header');
    if (!headerEl) return;

    const categories = (window.GLOBAL_CATEGORIES && window.GLOBAL_CATEGORIES.length > 0) ? window.GLOBAL_CATEGORIES : DEFAULT_CATEGORIES;

    // 1. 대분류 메뉴 그룹의 이름을 정의합니다.
    const groupNames = {
        'EDU': '📚 교재소개',
        'EVENT': '🎉 행사프로그램',
        'BOARD': '📢 알림/소식'
    };

    // 2. 각 유형(Type)별로 묶어줄 HTML 보관함을 만듭니다.
    const groupHtml = {};

    // 카테고리 목록을 순서대로 돌면서 하위 메뉴(li)들을 생성합니다.
    categories.forEach(c => {
        if (!groupHtml[c.type]) groupHtml[c.type] = ''; // 처음 나오는 유형이면 빈 칸 생성

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
            groupHtml[c.type] += `<li><a href="${c.code}.html" ${isCta} ${weight}>${c.name}</a></li>`;
        }
    });

    // 💡 3. 핵심 로직: 관리자 페이지에 등록된 '순서'에서 먼저 등장하는 유형을 기록합니다.
    // 이렇게 하면 목록 맨 위에 있는 유형이 메인 메뉴의 맨 앞으로 오게 됩니다!
    const mainOrder = [];
    categories.forEach(c => {
        if (!mainOrder.includes(c.type)) {
            mainOrder.push(c.type);
        }
    });

    // 4. 파악된 순서대로 메인 메뉴(대분류) HTML을 조립합니다.
    let navHtml = '';
    mainOrder.forEach(type => {
        if (type === 'PAGE') {
            // 고정 페이지(PAGE)는 드롭다운 없이 단일 버튼으로 꺼냅니다.
            navHtml += groupHtml[type];
        } else if (groupHtml[type]) {
            // 자식 메뉴가 여러 개인 경우 (EDU, EVENT, BOARD)
            // EDU(교재소개)는 항목이 많으므로 2줄로 보여주는 'double-col' 클래스를 유지합니다.
            const isDouble = (type === 'EDU') ? 'double-col' : '';
            navHtml += `
                <li class="has-sub">
                    <a href="javascript:void(0)" onclick="toggleSubMenu(this)">${groupNames[type]} <span class="arrow">▼</span></a>
                    <ul class="dropdown ${isDouble}">${groupHtml[type]}</ul>
                </li>`;
        }
    });

    // 5. 완성된 메뉴를 헤더에 쏙 넣습니다.
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
/* * 업데이트 된 내용:**
    1. ** 알림 / 소식 그룹 추가:** `BOARD` 유형으로 추가된 카테고리가 있다면 상단에 '📢 알림/소식' 드롭다운이 자동으로 생기며 그 안에 들어갑니다.
2. ** 페이지 자동 확장:** `PAGE` 유형으로 '회사소개' 등을 추가하면 상단 메뉴에 자동으로 버튼이 추가됩니다.
3. ** 코드 안정성:** 특정 유형의 카테고리가 하나도 없을 때는 메뉴 자체가 나타나지 않도록 처리하여 깔끔한 UI를 유지합니다.

이제 관리자 페이지에서 마음껏 카테고리를 추가하고 관리해 보세요! 추가로 궁금한 점이 있으시면 언제든 말씀해 주세요. */

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
function enableAutoResizeTextarea() { document.querySelectorAll('textarea.form-input').forEach(t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight) + 'px'; t.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; }); }); }

// ============================================================
// [5] DOMContentLoaded (중복 병합 완료)
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