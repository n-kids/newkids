const CONFIG = {
    // [1] Google Apps Script 웹 앱 URL (용도별 분리)
    // 배포한 스크립트 주소를 아래에 각각 넣어주세요. (같은 주소를 써도 됩니다)

    // ① 교재 발주용 (order.html에서 사용)
    ORDER_SHEET_URL: "https://script.google.com/macros/s/AKfycbx4rQRtKIKtays9oWz2UbJY9OWtQAULvVyaa9Sb3Mr8Dh6hiSdfkIbFKAZWQpJxGXAi/exec",

    // ② 제안서/견적용 (proposal.html에서 사용)
    PROPOSAL_SHEET_URL: "https://script.google.com/macros/s/AKfycbx4rQRtKIKtays9oWz2UbJY9OWtQAULvVyaa9Sb3Mr8Dh6hiSdfkIbFKAZWQpJxGXAi/exec",

    // [2] Supabase 설정
    SUPABASE_URL: "https://jmdyqdckclgfyimqpqce.supabase.co",
    SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZHlxZGNrY2xnZnlpbXFwcWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTA5NzksImV4cCI6MjA4MzUyNjk3OX0.hcYPN3Iz5es4Ksye5QMF83yVQVzRHQUw0cxFCAvMVrw",

    // [3] 공통 이미지 경로 (로고)
    LOGO_URL: "https://n-kids.github.io/newkids/logo-n.png",

    // [4] 회사 정보 (푸터 등에서 사용)
    COMPANY: {
        NAME: "(주)뉴키즈",
        CEO: "박홍기",
        ADDRESS: "경기도 김포시 태장로 765 금광테크노밸리 627호",
        PHONE: "010-2333-2563 / 010-5522-8109"
    }
};

// Apply the homepage visual language to public website subpages only.
(() => {
    const script = document.currentScript;
    if (!script || !script.src) return;
    const base = new URL('.', script.src);
    const page = new URL(window.location.href);
    if (page.origin !== base.origin || !page.pathname.startsWith(base.pathname)) return;
    const relative = page.pathname.slice(base.pathname.length);
    const publicPages = new Set(['child.html','program.html','notice.html','view.html','write.html','order.html','proposal.html','form.html','page.html','cert.html','confetti.html','culture.html','performance.html','season.html','app-install.html']);
    if (!publicPages.has(relative)) return;
    document.body.classList.add('nk-subpage');
    if (document.getElementById('nk-subpage-theme')) return;
    const link = document.createElement('link');
    link.id = 'nk-subpage-theme';
    link.rel = 'stylesheet';
    link.href = new URL('subpage-theme.css?v=20261108', base).href;
    document.head.appendChild(link);
})();

// Published page design and administrator editor entry point.
(() => {
    const source = document.currentScript;
    if (!source || !source.src) return;
    const base = new URL('.', source.src);
    if (location.origin !== base.origin || !location.pathname.startsWith(base.pathname)) return;
    const path = location.pathname.slice(base.pathname.length);
    if (!['','index.html','admin.html','notice.html','child.html','program.html','page.html','order.html','proposal.html'].includes(path)) return;
    const script = document.createElement('script');
    script.src = new URL('page-design.js?v=1', base).href;
    document.head.appendChild(script);
})();
