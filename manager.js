// manager.js - 통합 로직 관리자

(function initSystem() {
    // 1. Supabase 초기화 (보안 강화: 창 닫으면 자동 로그아웃)
    if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
        window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
            auth: {
                persistSession: true,       // 세션 유지 사용
                storage: window.sessionStorage // ★ 로컬 스토리지 대신 세션 스토리지 사용 (핵심)
            }
        });
    }
})();

// [공통 기능] 헤더 로드
// [manager.js] loadHeader 함수 전체 교체
function loadHeader() {
    const headerEl = document.querySelector('header');
    if (headerEl) {
        headerEl.innerHTML = `
            <div class="header-inner">
                <a href="index.html" class="logo-link">
                    <img src="${CONFIG.LOGO_URL}" alt="NEW KIDS" class="logo-img">
                </a>
                
                <button class="mobile-btn" onclick="window.toggleMenu()">☰</button>
                
                <ul class="nav-menu" id="navMenu">
                    <li class="has-sub">
                        <a href="javascript:void(0)" onclick="toggleSubMenu(this)">📚 교재소개 <span class="arrow">▼</span></a>
                        <ul class="dropdown double-col">
                            <li><a href="child.html#korean">🇰🇷 한글</a></li> <li><a href="child.html#reading">📖 독서</a></li>
                            <li><a href="child.html#english">🔤 영어</a></li>
                            <li><a href="child.html#math">🔢 수학</a></li>
                            <li><a href="child.html#science">🔬 과학</a></li>
                            <li><a href="child.html#art">🎨 미술</a></li>
                            <li><a href="child.html#coding">💻 코딩</a></li>
                            <li><a href="child.html#environment">🌱 환경</a></li>
                            <li><a href="child.html#nuri">👶 누리과정</a></li>
                            <li><a href="child.html#infant">🧸 영아</a></li> <li><a href="child.html#special">⭐ 기타(특색)</a></li>
                        </ul>
                    </li>

                    <li class="has-sub">
                        <a href="javascript:void(0)" onclick="toggleSubMenu(this)">🎉 행사프로그램 <span class="arrow">▼</span></a>
                        <ul class="dropdown">
                            <li><a href="season.html">🎉 시즌 테마 행사</a></li>
                            <li><a href="culture.html">🌍 원어민 행사</a></li>
                            <li><a href="performance.html">👨‍👩‍👧‍👦 부모 참여 행사</a></li>
                        </ul>
                    </li>
                    

                    <li><a href="order.html" style="font-weight:bold;">교재 발주</a></li>
                    <li><a href="proposal.html" class="cta-menu">견적요청</a></li>
                    <li><a href="https://www.kookminbooks.co.kr/" target ="_blank">국민서관</a></li>
                </ul>
            </div>
        `;
    }
}
// [공통 기능] 모바일 메뉴 토글 (햄버거 버튼)
window.toggleMenu = function () {
    const nav = document.getElementById('navMenu');
    nav.classList.toggle('active');
};

// [모바일 전용] 서브메뉴 토글 (아코디언 효과 적용: 하나 열면 다른 건 닫힘)
window.toggleSubMenu = function (element) {
    if (window.innerWidth <= 768) {
        const parentLi = element.parentElement;

        // 1. 현재 클릭한 메뉴가 이미 열려있는지 상태 확인
        const wasOpen = parentLi.classList.contains('sub-open');

        // 2. 다른 모든 열려있는 서브메뉴 닫기
        const allSubMenus = document.querySelectorAll('.nav-menu li.has-sub');
        allSubMenus.forEach(li => {
            li.classList.remove('sub-open');
        });

        // 3. 클릭한 메뉴가 닫혀있던 상태였다면 열기 (이미 열려있었다면 닫힌 채로 유지)
        if (!wasOpen) {
            parentLi.classList.add('sub-open');
        }
    }
};

// [공통 기능] 푸터 로드
function loadFooter() {
    const footerEl = document.querySelector('footer');
    if (footerEl) {
        footerEl.innerHTML = `
            <div class="container">
                <p>${CONFIG.COMPANY.NAME} | 대표: <span>${CONFIG.COMPANY.CEO}</span></p>
                <p>주소: <span>${CONFIG.COMPANY.ADDRESS}</span></p>
                <p>문의: <span>${CONFIG.COMPANY.PHONE}</span></p>
                <br>
                <p>
                    <a href="admin.html" style="color:inherit; text-decoration:none; cursor:pointer;" title="관리자 로그인">
                        &copy; 2026 New Kids. All rights reserved.
                    </a>
                </p>
            </div>
        `;
    }
}

// [신규 기능] 스크롤 버튼 생성
function addScrollButtons() {
    if (document.querySelector('.scroll-btns')) return;
    const btnHtml = `
        <div class="scroll-btns">
            <button class="btn-scroll" onclick="scrollToTop()" title="맨 위로">▲</button>
            <button class="btn-scroll" onclick="scrollToBottom()" title="맨 아래로">▼</button>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', btnHtml);
}

window.scrollToTop = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }
window.scrollToBottom = function () { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }


// [유틸리티] 유튜브 ID 추출
window.getYoutubeId = function (url) {
    if (!url) return null;
    const match = url.match(/^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/);
    return (match && match[7].length === 11) ? match[7] : null;
};

// [유틸리티] 날짜 포맷
window.formatDate = function (dateStr) {
    return dateStr ? dateStr.split('T')[0] : '';
};


// [신규 기능] 텍스트박스 높이 자동 조절
function enableAutoResizeTextarea() {
    const textareas = document.querySelectorAll('textarea.form-input');
    textareas.forEach(textarea => {
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });
    });
}

// DOM 로드 후 실행
document.addEventListener("DOMContentLoaded", function () {
    loadHeader();
    loadFooter();
    addScrollButtons();
    enableAutoResizeTextarea();

    // 1. 모바일 메뉴 외부(배경) 클릭 시 닫기
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('navMenu');
        const btn = document.querySelector('.mobile-btn');
        if (menu && menu.classList.contains('active')) {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('active');
            }
        }
    });

    // 2. 모바일 메뉴 링크 클릭 시 메뉴 닫기 (서브메뉴 토글 제외)
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('navMenu');
        if (menu && menu.classList.contains('active')) {

            // 클릭된 요소가 메뉴 내부의 <a> 태그인지 확인
            if (e.target.tagName === 'A' && menu.contains(e.target)) {

                // href가 'javascript:void(0)'인 경우(서브메뉴 토글 버튼)는 닫지 않음
                const href = e.target.getAttribute('href');
                if (href && href.includes('javascript:void(0)')) {
                    return;
                }

                // 그 외의 진짜 페이지 이동 링크들은 메뉴를 닫음
                menu.classList.remove('active');
            }
        }
    });
});