// manager.js - 통합 로직 관리자

(function initSystem() {
    // 1. Supabase 초기화 (Config 사용)
    if (typeof supabase !== 'undefined' && typeof CONFIG !== 'undefined') {
        window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    }
})();

// [공통 기능] 헤더 로드 (Hover 방식 복구 + 모바일 개별 토글)
function loadHeader() {
    const headerEl = document.querySelector('header');
    if (headerEl) {
        // 1. 새로운 헤더 HTML 주입 (모바일용 onclick 이벤트 추가됨)
        headerEl.innerHTML = `
            <div class="header-inner">
                <a href="index.html" class="logo-link">
                    <img src="${CONFIG.LOGO_URL}" alt="NEW KIDS" class="logo-img">
                </a>
                
                <button class="mobile-btn" onclick="window.toggleMenu()">☰</button>
                
                <ul class="nav-menu" id="navMenu">
                    <li class="has-sub">
                        <a href="javascript:void(0)" onclick="toggleSubMenu(this)">📚 교재소개 <span class="arrow">▼</span></a>
                        <ul class="dropdown">
                            <li><a href="child.html#korean">📚 한글 & 독서</a></li>
                            <li><a href="child.html#art">🎨 미술 & 자연 환경</a></li>
                            <li><a href="child.html#science">🔬 수학 & 과학</a></li>
                            <li><a href="child.html#coding">💻 코딩 & 직업교육</a></li>
                            <li><a href="child.html#english">🔤 영어 & 지도</a></li>
                            <li><a href="child.html#integrated">👶 통합보육 & 누리과정</a></li>
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

// [핵심] 모바일 서브메뉴 토글 (아코디언 기능 삭제됨: 개별 작동)
window.toggleSubMenu = function (element) {
    // 화면 너비가 768px 이하(모바일)일 때만 클릭 작동
    if (window.innerWidth <= 768) {
        const parentLi = element.parentElement;
        parentLi.classList.toggle('sub-open');
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

// [신규 기능] 스크롤 버튼 생성 (맨위로/맨밑으로)
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


// [신규 기능] 텍스트박스(textarea) 내용에 따라 높이 자동 조절
function enableAutoResizeTextarea() {
    const textareas = document.querySelectorAll('textarea.form-input');

    textareas.forEach(textarea => {
        // 1. 초기 높이 설정 (내용이 있으면 맞춰줌)
        textarea.style.height = 'auto';
        textarea.style.height = (textarea.scrollHeight) + 'px';

        // 2. 입력할 때마다 높이 조절 이벤트 연결
        textarea.addEventListener('input', function () {
            this.style.height = 'auto'; // 높이를 초기화해야 줄어들었을 때도 감지함
            this.style.height = (this.scrollHeight) + 'px'; // 스크롤 높이만큼 강제로 늘림
        });
    });
}

// DOM 로드 후 실행
document.addEventListener("DOMContentLoaded", function () {
    loadHeader();
    loadFooter();
    addScrollButtons();
    enableAutoResizeTextarea(); // 텍스트박스 자동 조절 실행

    // 모바일 메뉴 외부 클릭 시 닫기
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('navMenu');
        const btn = document.querySelector('.mobile-btn');
        // 메뉴가 열려있는데, 메뉴 영역이나 버튼이 아닌 곳을 클릭했을 때
        if (menu && menu.classList.contains('active')) {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('active');
            }
        }
    });
});