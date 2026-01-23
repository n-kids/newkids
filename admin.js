async function savePost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;

    // [추가 1] URL 입력칸의 값을 가져옵니다.
    const linkUrl = document.getElementById('post-link').value;

    // 유효성 검사 (제목/내용 없으면 중단)
    if (!title || !content) {
        alert("제목과 내용을 입력해주세요.");
        return;
    }

    try {
        // Supabase에 데이터 저장
        const { data, error } = await supabase
            .from('notice_board') // 게시판 테이블 이름
            .insert([
                {
                    title: title,
                    content: content,
                    // [추가 2] 데이터베이스의 'link_url' 컬럼에 위에서 가져온 값을 넣습니다.
                    link_url: linkUrl
                }
            ]);

        if (error) throw error;
        alert("저장되었습니다!");
        window.location.reload(); // 새로고침

    } catch (error) {
        console.error("에러 발생:", error);
        alert("저장 실패: " + error.message);
    }
}// JavaScript source code
