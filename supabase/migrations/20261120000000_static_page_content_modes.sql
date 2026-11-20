-- ============================================================================
-- 뉴키즈(n-kids/newkids) 고정 페이지 콘텐츠 연결 방식 확장 마이그레이션
-- 적용 대상: Supabase SQL Editor (1회 실행)
-- 하위 호환성: 기존 행은 자동으로 content_mode = 'post' 로 유지됨
-- ============================================================================

ALTER TABLE public.program_categories
  ADD COLUMN IF NOT EXISTS content_mode text NOT NULL DEFAULT 'post'
    CHECK (content_mode IN ('post', 'url', 'custom')),
  ADD COLUMN IF NOT EXISTS target_url text,
  ADD COLUMN IF NOT EXISTS url_display text NOT NULL DEFAULT 'embed'
    CHECK (url_display IN ('embed', 'redirect')),
  ADD COLUMN IF NOT EXISTS custom_html text;

COMMENT ON COLUMN public.program_categories.content_mode IS
  '고정 페이지(PAGE) 콘텐츠 방식: post(기존 total_posts 연동) | url(폼/투표·URL 연결) | custom(본문 직접 디자인 HTML)';

COMMENT ON COLUMN public.program_categories.target_url IS
  'content_mode = url 일 때 연결할 폼/투표(form.html?id=...) 또는 외부 URL';

COMMENT ON COLUMN public.program_categories.url_display IS
  'content_mode = url 일 때 표시 방식: embed(page.html 본문 iframe 삽입) | redirect(해당 URL로 즉시 이동)';

COMMENT ON COLUMN public.program_categories.custom_html IS
  'content_mode = custom 일 때 서브 페이지 관리 에디터에서 직접 작성한 본문 HTML';
