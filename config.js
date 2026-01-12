const CONFIG = {
    // [1] Google Apps Script 웹 앱 URL (용도별 분리)
    // 배포한 스크립트 주소를 아래에 각각 넣어주세요. (같은 주소를 써도 됩니다)

    // ① 교재 발주용 (order.html에서 사용)
    ORDER_SHEET_URL: "https://script.google.com/macros/s/AKfycby_NbJIjiV9JQ_weDcdzcmFpcX9eD5xyas1qKxAbY2wqRjf_y1TvBX58ksUNjpRE_4ipQ/exec",

    // ② 제안서/견적용 (proposal.html에서 사용)
    PROPOSAL_SHEET_URL: "https://script.google.com/macros/s/AKfycby_NbJIjiV9JQ_weDcdzcmFpcX9eD5xyas1qKxAbY2wqRjf_y1TvBX58ksUNjpRE_4ipQ/exec",

    // [2] Supabase 설정
    SUPABASE_URL: "https://jmdyqdckclgfyimqpqce.supabase.co",
    SUPABASE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZHlxZGNrY2xnZnlpbXFwcWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5NTA5NzksImV4cCI6MjA4MzUyNjk3OX0.hcYPN3Iz5es4Ksye5QMF83yVQVzRHQUw0cxFCAvMVrw",

    // [3] 공통 이미지 경로 (로고)
    LOGO_URL: "https://n-kids.github.io/newkids/logo.png",

    // [4] 회사 정보 (푸터 등에서 사용)
    COMPANY: {
        NAME: "(주)뉴키즈",
        CEO: "박홍기",
        ADDRESS: "경기도 김포시 태장로 765 금광테크노밸리 627호",
        PHONE: "010-2333-2563 / 010-5522-8109"
    }
};