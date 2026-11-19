(function boot() {
  'use strict';
  const getSb = () => window.sb;
  if (!getSb()) { window.__nkConvenienceWaits = (window.__nkConvenienceWaits || 0) + 1; if (window.__nkConvenienceWaits < 100) setTimeout(boot, 100); return; }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  // 작성자 표시 규칙과 동일하게 관리자 게시글을 판별합니다.
  window.nkIsAdminAuthoredPost = function (post) {
    const author = String(post?.link_url || '').trim();
    return post?.category === 'notice' || !author || author === '관리자' || author === '익명' || /^https?:\/\//i.test(author);
  };
  const modalBase = 'position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10050;display:flex;align-items:center;justify-content:center;padding:18px;';
  function makeModal(id, title, body) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div'); modal.id = id; modal.className = 'nk-modal'; modal.style.cssText = modalBase;
      modal.innerHTML = '<div class="nk-modal-box" style="background:#fff;border-radius:12px;width:100%;max-width:980px;max-height:calc(100vh - 36px);max-height:calc(100dvh - 36px);overflow:auto;padding:20px;box-sizing:border-box;box-shadow:0 12px 40px #0004"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #ddd;padding-bottom:12px"><h2 data-modal-title style="margin:0;color:#1a3c6e;font-size:1.4rem;min-width:0;overflow-wrap:anywhere"></h2><button type="button" data-modal-close style="border:0;background:#eee;border-radius:6px;padding:8px 12px;cursor:pointer;flex-shrink:0">닫기</button></div><div data-modal-body style="padding-top:16px"></div></div>';
      modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-modal-close]')) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.querySelector('[data-modal-title]').textContent = title;
    modal.querySelector('[data-modal-body]').innerHTML = body;
    modal.style.display = 'flex';
    return modal;
  }

  window.previewPost = function () {
    const title = document.getElementById('post-title')?.value?.trim() || '(제목 없음)';
    const catCode = document.getElementById('post-category')?.value || '';
    const catLabel = catCode ? (document.getElementById('custom-cat-text')?.innerText || catCode) : '카테고리 미선택';
    const isIntro = !!document.getElementById('chk-intro')?.checked;
    const isOrder = !!document.getElementById('chk-order')?.checked;
    const isNotice = !!document.getElementById('chk-is-notice')?.checked;
    const publishAt = document.getElementById('post-publish-at')?.value || '';
    const ytUrl = isIntro ? (document.getElementById('youtube-url')?.value?.trim() || '') : '';
    const linkUrl = document.getElementById('post-link')?.value?.trim() || '';
    const dlPw = document.getElementById('post-dl-password')?.value?.trim() || '';

    const rawContent = (typeof quill !== 'undefined' && quill && quill.root) ? quill.root.innerHTML : '<p>본문이 없습니다.</p>';
    let sanitized = typeof window.sanitizeHtml === 'function' ? window.sanitizeHtml(rawContent) : rawContent;

    const formTitleMap = {};
    const formSelect = document.getElementById('form-insert-select');
    if (formSelect) {
      Array.from(formSelect.options).forEach(opt => {
        if (opt.value) formTitleMap[String(opt.value)] = opt.textContent || opt.value;
      });
    }
    sanitized = sanitized.replace(/\[투표:([a-zA-Z0-9_-]+)\]/g, (_m, fid) => {
      const fLabel = formTitleMap[String(fid)] || ('폼/투표 ID: ' + fid);
      return '<div class="pv-poll-card"><div class="pv-poll-tag">임베드 폼 / 투표</div><div class="pv-poll-title">' + esc(fLabel) + '</div><div class="pv-poll-desc">실제 공개 페이지에서는 이 위치에 대화형 설문·투표 폼이 표시됩니다.</div></div>';
    });

    const badges = [];
    badges.push('<span class="pv-badge pv-cat">' + esc(catLabel) + '</span>');
    if (isOrder && isIntro) badges.push('<span class="pv-badge pv-both">소개 + 발주 통합</span>');
    else if (isOrder && !isIntro) badges.push('<span class="pv-badge pv-order">발주 전용</span>');
    else badges.push('<span class="pv-badge pv-intro">소개 페이지</span>');
    if (isNotice) badges.push('<span class="pv-badge pv-notice">상단 고정</span>');
    if (publishAt) {
      const d = new Date(publishAt);
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) {
        badges.push('<span class="pv-badge pv-sched">예약: ' + esc(d.toLocaleString('ko-KR')) + '</span>');
      }
    }

    const ytId = ytUrl ? (window.getYoutubeId ? window.getYoutubeId(ytUrl) : null) : null;
    const ytHtml = ytId
      ? '<div class="pv-video"><iframe src="https://www.youtube.com/embed/' + esc(ytId) + '" title="YouTube 동영상" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>'
      : '';

    const linkHtml = /^https?:\/\//i.test(linkUrl)
      ? '<div class="pv-link-banner"><span>관련 링크</span><a href="' + esc(linkUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(linkUrl) + '</a></div>'
      : '';

    let attachHtml = '';
    if (typeof fileItems !== 'undefined' && Array.isArray(fileItems) && fileItems.length > 0) {
      const itemsHtml = fileItems.map(item => {
        let name = '';
        if (item.type === 'server') {
          const val = String(item.value || '');
          if (val.includes('@@')) name = val.split('@@')[1];
          else {
            let raw = val.split('/').pop().split('?')[0];
            try { raw = decodeURIComponent(raw); } catch (_) {}
            name = raw.includes('___') ? raw.split('___').pop() : raw;
          }
        } else {
          name = item.value?.name || '첨부파일';
        }
        return '<li>' + esc(name) + '</li>';
      }).join('');
      const lockBadge = dlPw ? '<span class="pv-lock">다운로드 비밀번호 보호됨</span>' : '';
      attachHtml = '<section class="pv-attach"><h3>첨부파일 (' + fileItems.length + '개) ' + lockBadge + '</h3><ul>' + itemsHtml + '</ul></section>';
    }

    const body = '<iframe title="게시글 미리보기" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" style="width:100%;height:70vh;border:1px solid #ddd;border-radius:8px;background:white"></iframe>';
    const modal = makeModal('nk-preview-modal', '게시글 미리보기', body);
    const frame = modal.querySelector('iframe');
    frame.srcdoc = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Do+Hyeon&family=Gugi&family=Jua&family=Poor+Story&family=Song+Myung&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700;900&family=Noto+Serif+KR:wght@400;500;700;900&display=swap">'
      + '<style>'
      + 'body{font:16px/1.75 "Noto Sans KR",Arial,sans-serif;max-width:820px;margin:26px auto;padding:0 20px 40px;color:#222}'
      + '.pv-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
      + '.pv-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;background:#eef2f7;color:#334155}'
      + '.pv-cat{background:#eef6ff;color:#1a3c6e}.pv-both{background:#d4edda;color:#155724}.pv-order{background:#fff3cd;color:#856404}.pv-notice{background:#fee2e2;color:#b91c1c}.pv-sched{background:#f3e8ff;color:#6c3483}'
      + 'h1{margin:0 0 18px;padding-bottom:14px;border-bottom:2px solid #1a3c6e;font-size:1.7rem;color:#111}'
      + '.pv-link-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:18px;font-size:14px}'
      + '.pv-link-banner span{font-weight:700;color:#1a3c6e;flex-shrink:0}.pv-link-banner a{color:#0369a1;word-break:break-all}'
      + '.pv-video{position:relative;width:100%;aspect-ratio:16/9;margin:0 0 22px;border-radius:10px;overflow:hidden;background:#000}'
      + '.pv-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}'
      + '.pv-poll-card{margin:18px 0;padding:16px 18px;border:1px solid #bfdbfe;border-left:4px solid #1a3c6e;border-radius:10px;background:#f8fbff}'
      + '.pv-poll-tag{font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:4px}.pv-poll-title{font-size:16px;font-weight:700;color:#0f172a}.pv-poll-desc{font-size:13px;color:#475569;margin-top:4px}'
      + '.pv-attach{margin-top:26px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px}'
      + '.pv-attach h3{margin:0 0 10px;font-size:15px;color:#1a3c6e;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
      + '.pv-lock{font-size:12px;padding:2px 8px;border-radius:999px;background:#e0f2fe;color:#0369a1}'
      + '.pv-attach ul{margin:0;padding-left:20px;font-size:14px;color:#334155}'
      + '.ql-align-center{text-align:center}.ql-align-right{text-align:right}.ql-align-justify{text-align:justify}'
      + '.ql-font-sans-serif{font-family:Arial,sans-serif}.ql-font-nanum-gothic{font-family:"Nanum Gothic","Malgun Gothic",sans-serif}.ql-font-nanum-myeongjo{font-family:"Nanum Myeongjo",serif}.ql-font-gowun-dodum{font-family:"Gowun Dodum",sans-serif}.ql-font-gowun-batang{font-family:"Gowun Batang",serif}.ql-font-noto-sans-kr{font-family:"Noto Sans KR",sans-serif}.ql-font-noto-serif-kr{font-family:"Noto Serif KR",serif}.ql-font-black-han-sans{font-family:"Black Han Sans",sans-serif}.ql-font-do-hyeon{font-family:"Do Hyeon",sans-serif}.ql-font-jua{font-family:"Jua",sans-serif}.ql-font-gugi{font-family:"Gugi",sans-serif}.ql-font-poor-story{font-family:"Poor Story",sans-serif}.ql-font-song-myung{font-family:"Song Myung",sans-serif}'
      + '.ql-size-small{font-size:.75em}.ql-size-large{font-size:1.5em}.ql-size-huge{font-size:2.5em}'
      + '.ql-indent-1{padding-left:3em}.ql-indent-2{padding-left:6em}.ql-indent-3{padding-left:9em}.ql-indent-4{padding-left:12em}.ql-indent-5{padding-left:15em}.ql-indent-6{padding-left:18em}.ql-indent-7{padding-left:21em}.ql-indent-8{padding-left:24em}'
      + 'blockquote{border-left:4px solid #cbd5e1;margin:1em 0;padding:6px 14px;color:#475569;background:#f8fafc}'
      + 'img,video{max-width:100%;height:auto}iframe.ql-video{display:block;width:100%;aspect-ratio:16/9;border:0;margin:1em auto}'
      + 'table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ddd;padding:6px}'
      + '</style>'
      + '<div class="pv-meta">' + badges.join('') + '</div>'
      + '<h1>' + esc(title) + '</h1>'
      + linkHtml + ytHtml
      + '<main>' + sanitized + '</main>'
      + attachHtml
      + '</html>';
  };

  window.savePostRevision = async function (post, action) {
    if (!post?.id) return false;
    const client = getSb();
    const { data: { session } = {} } = await client.auth.getSession();
    const { error } = await client.from('post_revisions').insert({
      post_id: post.id, post_title: post.title || '', snapshot: post,
      action: action || 'update', changed_by: session?.user?.email || null
    });
    if (error) { console.error('Post history save failed', error); return false; }
    return true;
  };

  window.showPostHistory = async function (postId) {
    const client = getSb();
    const modal = makeModal('nk-history-modal', '게시글 변경 이력', '<p>이력을 불러오는 중...</p>');
    const { data, error } = await client.from('post_revisions').select('*').eq('post_id', postId).order('created_at', {ascending:false}).limit(50);
    if (error) { modal.querySelector('[data-modal-body]').textContent = '이력 조회 실패: ' + error.message; return; }
    if (!data?.length) { modal.querySelector('[data-modal-body]').innerHTML = '<p>저장된 변경 이력이 없습니다. 첫 변경 후부터 이력이 쌓입니다.</p>'; return; }
    modal.querySelector('[data-modal-body]').innerHTML = data.map(row => {
      const time = new Date(row.created_at).toLocaleString('ko-KR');
      const label = ({update:'수정 전',delete:'삭제 전',visibility:'노출 상태 변경 전',bulk:'일괄 처리 전',password:'비밀번호 변경 전'})[row.action] || row.action;
      return '<article style="border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0;display:flex;justify-content:space-between;gap:12px;align-items:center"><div><b>' + esc(row.post_title || row.snapshot?.title || '(제목 없음)') + '</b><div style="color:#777;font-size:.88rem">' + esc(label) + ' · ' + esc(time) + ' · ' + esc(row.changed_by || '관리자') + '</div></div><button type="button" class="btn-mini" data-revision="' + Number(row.id) + '">이 시점으로 복구</button></article>';
    }).join('');
    modal.querySelectorAll('[data-revision]').forEach(btn => btn.addEventListener('click', async () => {
      const row = data.find(v => Number(v.id) === Number(btn.dataset.revision));
      if (!row || !confirm('선택한 이력으로 게시글 내용을 복구할까요?')) return;
      const c = getSb();
      const snapshot = {...row.snapshot};
      delete snapshot.created_at;
      const { data: current } = await c.from('total_posts').select('*').eq('id', row.post_id).maybeSingle();
      if (current && !await window.savePostRevision(current, 'update')) return alert('현재 상태를 이력으로 저장하지 못해 복구를 중단했습니다.');
      const result = current
        ? await c.from('total_posts').update(snapshot).eq('id', row.post_id)
        : await c.from('total_posts').insert(snapshot);
      if (result.error) return alert('복구 실패: ' + result.error.message);
      modal.style.display = 'none'; alert('게시글을 복구했습니다.'); window.loadManageList?.(1);
    }));
  };

  window.openMediaLibrary = async function (target) {
    const client = getSb();
    const modal = makeModal('nk-media-modal', '미디어 라이브러리', '<p>파일 목록을 불러오는 중...</p>');
    try {
      const all = [];
      async function scan(prefix, depth) {
        if (depth > 5) return;
        for (let offset = 0; offset < 5000; offset += 100) {
          const {data, error} = await client.storage.from('images').list(prefix, {limit:100, offset, sortBy:{column:'created_at',order:'desc'}});
          if (error) throw error;
          const entries = data || [];
          for (const item of entries) {
            if (item.id) all.push({path:prefix ? prefix + '/' + item.name : item.name, name:item.name, metadata:item.metadata || {}});
            else await scan(prefix ? prefix + '/' + item.name : item.name, depth + 1);
          }
          if (entries.length < 100) break;
        }
      }
      await scan('', 0);
      const body = modal.querySelector('[data-modal-body]');
      if (!all.length) { body.innerHTML = '<p>저장된 파일이 없습니다.</p>'; return; }
      const render = (filter='') => {
        const filtered = all.filter(x => x.name.toLowerCase().includes(filter.toLowerCase()));
        body.innerHTML = '<input id="nk-media-search" class="form-input" placeholder="파일명 검색..." style="margin-bottom:12px"><div class="nk-media-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">' + filtered.map((item, idx) => {
          const url = getSb().storage.from('images').getPublicUrl(item.path).data.publicUrl;
          const image = (item.metadata?.mimetype || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
          return '<button type="button" class="nk-media-item" data-media="' + idx + '" style="min-width:0;text-align:left;border:1px solid #ddd;border-radius:8px;background:white;padding:8px;cursor:pointer;overflow:hidden">' + (image ? '<img src="' + esc(url) + '" alt="" class="nk-media-thumb" style="width:100%;height:110px;object-fit:cover;border-radius:4px">' : '<div class="nk-media-thumb" style="height:110px;display:grid;place-items:center;font-size:36px"><svg class="ic" style="width:36px;height:36px;color:#94a3b8"><use href="#i-file-text"/></svg></div>') + '<div style="font-size:.82rem;overflow-wrap:anywhere;margin-top:6px">' + esc(item.name) + '</div><div style="font-size:.76rem;color:#1a3c6e">선택하여 삽입</div></button>';
        }).join('') + '</div>';
        body.querySelector('#nk-media-search').value = filter;
        body.querySelector('#nk-media-search').addEventListener('input', e => render(e.target.value));
        body.querySelectorAll('[data-media]').forEach(btn => btn.addEventListener('click', () => {
          const item = filtered[Number(btn.dataset.media)];
          const url = getSb().storage.from('images').getPublicUrl(item.path).data.publicUrl;
          if (target === 'editor') {
            const range = quill?.getSelection(true);
            quill?.insertEmbed(range?.index ?? quill.getLength(), 'image', url, 'user');
          } else {
            fileItems.push({type:'server', value:url + '@@' + item.name});
            window.renderFileList?.();
          }
          isFormDirty = true;
          modal.style.display = 'none';
        }));
      };
      render();
    } catch (e) {
      modal.querySelector('[data-modal-body]').innerHTML = '<p style="color:#c0392b">파일 목록을 불러오지 못했습니다: ' + esc(e.message) + '<br>관리자 계정으로 로그인되어 있는지 확인해 주세요.</p>';
    }
  };

  window.nkFilterTasks = function (kind) {
    if (typeof isDraftFilter !== 'undefined') isDraftFilter = kind === 'draft';
    if (typeof isScheduledFilter !== 'undefined') isScheduledFilter = kind === 'scheduled';
    if (typeof isUnansweredFilter !== 'undefined') isUnansweredFilter = kind === 'unanswered';
    const nav = document.querySelectorAll('.nav-item')[1];
    if (typeof window.switchTab === 'function') window.switchTab('posts', nav);
    window.loadManageList?.(1);
  };

  async function loadDashboardTasks() {
    const box = document.getElementById('dashboard-tasks');
    const client = getSb();
    if (!box || !client) return;
    const [postsResult, commentsResult] = await Promise.all([
      client.from('total_posts').select('id,title,category,link_url,is_draft,is_visible,publish_at'),
      client.from('post_comments').select('post_id')
    ]);
    if (postsResult.error) { box.innerHTML = '<div style="color:#a33">운영 알림을 불러오지 못했습니다: ' + esc(postsResult.error.message) + '</div>'; return; }
    const posts = postsResult.data || [], comments = commentsResult.data || [];
    const answered = new Set(comments.map(x => x.post_id));
    const now = Date.now(), week = now + 7 * 86400000, dayAgo = now - 86400000;
    const drafts = posts.filter(x => x.is_draft).length;
    const scheduled = posts.filter(x => !x.is_draft && x.publish_at && new Date(x.publish_at).getTime() > now && new Date(x.publish_at).getTime() <= week).length;
    const unanswered = posts.filter(x => !x.is_draft && !answered.has(x.id) && !window.nkIsAdminAuthoredPost(x)).length;

    const cards = [
      { onclick: "nkFilterTasks('draft')", icon: '<svg class="ic"><use href="#i-save"/></svg>', label: '저장된 초안', count: drafts, color: '#8e44ad', sub: '눌러서 목록 보기' },
      { onclick: "nkFilterTasks('scheduled')", icon: '<svg class="ic"><use href="#i-clock"/></svg>', label: '7일 내 예약 발행', count: scheduled, color: '#d68910', sub: '눌러서 목록 보기' },
      { onclick: "nkFilterTasks('unanswered')", icon: '<svg class="ic"><use href="#i-message"/></svg>', label: '답변 대기 게시글', count: unanswered, color: '#1a3c6e', sub: '눌러서 목록 보기' }
    ];

    try {
      const [formsRes, respRes] = await Promise.all([
        client.from('custom_forms').select('id,title,is_active,max_participants,end_date'),
        client.from('form_responses').select('id,form_id,created_at')
      ]);
      if (!formsRes.error && Array.isArray(formsRes.data)) {
        const forms = formsRes.data;
        const responses = (!respRes.error && Array.isArray(respRes.data)) ? respRes.data : [];
        const countByForm = {};
        let recent24h = 0;
        responses.forEach(r => {
          const fid = String(r.form_id);
          countByForm[fid] = (countByForm[fid] || 0) + 1;
          if (r.created_at && new Date(r.created_at).getTime() >= dayAgo) recent24h++;
        });
        let activeForms = 0;
        let urgentForms = 0;
        forms.forEach(f => {
          if (window.NKForms && typeof window.NKForms.getFormStatus === 'function') {
            const st = window.NKForms.getFormStatus(f, countByForm[String(f.id)] || 0);
            if (st.canSubmit) activeForms++;
            if (st.isUrgent) urgentForms++;
          } else if (f.is_active) {
            activeForms++;
          }
        });
        cards.push(
          { onclick: "nkOpenFormsFiltered('active')", icon: '<svg class="ic"><use href="#i-clipboard"/></svg>', label: '진행 중인 폼/투표', count: activeForms, color: '#15803d', sub: '폼/투표 관리로 이동' },
          { onclick: "nkOpenFormsFiltered('all')", icon: '<svg class="ic"><use href="#i-chart"/></svg>', label: '최근 24시간 신규 응답', count: recent24h, color: '#0369a1', sub: '전체 응답 현황 보기' },
          { onclick: "nkOpenFormsFiltered('urgent')", icon: '<svg class="ic"><use href="#i-bell"/></svg>', label: '마감·정원 임박 폼', count: urgentForms, color: '#b45309', sub: '임박 항목만 보기' }
        );
      }
    } catch (_) {}

    box.innerHTML = cards.map(c => '<button type="button" onclick="' + c.onclick + '" style="text-align:left;background:#fff;border:1px solid #e4e8ef;border-left:5px solid ' + c.color + ';border-radius:9px;padding:15px;cursor:pointer;box-shadow:0 2px 8px #0000000a"><div style="font-weight:700;color:#667">' + c.icon + ' ' + c.label + '</div><strong style="display:block;font-size:1.7rem;color:' + c.color + ';margin-top:4px">' + c.count + '</strong><small style="color:#888">' + c.sub + '</small></button>').join('');
  }
  window.nkRefreshDashboardTasks = loadDashboardTasks;

  // 게시글 변경 전 스냅샷을 남겨 되돌릴 수 있게 함
  let uploadWrapperBusy = false;
  const originalUpload = window.uploadPost;
  if (originalUpload) window.uploadPost = async function (saveAsDraft) {
    if (uploadWrapperBusy || window.__nkPostSubmitting) return;
    if (typeof window.validatePostForm === 'function' && !window.validatePostForm()) return;
    uploadWrapperBusy = true;
    try {
      if (editingId) {
        const client = getSb();
        const {data, error} = await client.from('total_posts').select('*').eq('id', editingId).single();
        if (error) {
          if (typeof showToast === 'function') showToast('현재 글을 읽지 못해 이력을 남길 수 없습니다: ' + error.message, 'error');
          else alert('현재 글을 읽지 못해 이력을 남길 수 없습니다: ' + error.message);
          return;
        }
        if (!await window.savePostRevision(data, 'update')) {
          if (typeof showToast === 'function') showToast('변경 이력을 저장하지 못했습니다. 저장을 취소했습니다.', 'error');
          else alert('변경 이력을 저장하지 못했습니다. 저장을 취소했습니다.');
          return;
        }
      }
      return await originalUpload.call(this, saveAsDraft);
    } finally {
      uploadWrapperBusy = false;
    }
  };

  const originalCopy = window.copyPost;
  if (originalCopy) window.copyPost = function (item) {
    if (originalCopy.call(this, item) === false) return false;
    document.getElementById('post-password').value = '';
    document.getElementById('post-dl-password').value = '';
    document.getElementById('chk-is-notice').checked = false;
    document.getElementById('post-publish-at').value = '';
    return true;
  };

  window.deletePost = async function (id) {
    if (!confirm('정말 이 게시글을 삭제하시겠습니까? 변경 이력으로 복구할 수 있도록 업로드 파일은 보존됩니다.')) return;
    showLoading(true);
    try {
      const client = getSb();
      const {data, error} = await client.from('total_posts').select('*').eq('id', id).single();
      if (error) throw error;
      if (!await window.savePostRevision(data, 'delete')) throw new Error('삭제 전 이력 저장 실패');
      const result = await client.from('total_posts').delete().eq('id', id);
      if (result.error) throw result.error;
      await window.logAdminActivity?.('DELETE_POST', {id});
      window.loadManageList?.(currentPage || 1);
    } catch(e) { alert('삭제 중 오류: ' + e.message); }
    finally { showLoading(false); }
  };

  window.executeBulkAction = async function (action) {
    const ids = Array.from(document.querySelectorAll('.post-check:checked')).map(x => Number(x.value));
    if (!ids.length) return alert('선택된 게시글이 없습니다.');
    const label = action === 'delete' ? '삭제' : action === 'hide' ? '숨김' : '노출';
    if (!confirm('선택한 ' + ids.length + '개의 게시글을 일괄 ' + label + ' 처리할까요? (삭제 시 복구용 미디어 파일은 보존됩니다.)')) return;
    showLoading(true);
    try {
      const client = getSb();
      const {data, error} = await client.from('total_posts').select('*').in('id', ids);
      if (error) throw error;
      for (const post of data || []) if (!await window.savePostRevision(post, action === 'delete' ? 'delete' : action === 'password' ? 'password' : 'bulk')) throw new Error('변경 이력 저장 실패');
      let result;
      if (action === 'delete') result = await client.from('total_posts').delete().in('id', ids);
      else if (action === 'hide') result = await client.from('total_posts').update({is_visible:false}).in('id', ids);
      else if (action === 'show') result = await client.from('total_posts').update({is_visible:true}).in('id', ids);
      else return;
      if (result.error) throw result.error;
      await window.logAdminActivity?.('BULK_' + action.toUpperCase(), {count:ids.length,ids});
      document.getElementById('check-all').checked = false;
      window.loadManageList?.(currentPage || 1);
    } catch(e) { alert('일괄 처리 오류: ' + e.message); }
    finally { showLoading(false); }
  };

  const originalToggle = window.togglePostVisibility;
  if (originalToggle) window.togglePostVisibility = async function (id, status) {
    const client = getSb();
    const {data,error} = await client.from('total_posts').select('*').eq('id',id).single();
    if (error) return alert('게시글을 읽지 못했습니다: ' + error.message);
    if (!await window.savePostRevision(data,'visibility')) return alert('이력 저장 실패로 상태를 변경하지 않았습니다.');
    return originalToggle.call(this,id,status);
  };

  window.executeBulkPasswordChange = async function (type) {
    const ids = Array.from(document.querySelectorAll('.post-check:checked')).map(x => Number(x.value));
    if (!ids.length) return alert('비밀번호를 변경할 게시글을 먼저 선택해주세요.');
    const label = type === 'dl' ? '다운로드 전용 비밀번호' : '자체 비밀번호';
    const value = prompt('선택한 ' + ids.length + '개 게시글의 [' + label + '] 새 값 (빈칸은 삭제)');
    if (value === null || !confirm('선택한 게시글의 비밀번호를 변경할까요?')) return;
    showLoading(true);
    try {
      const client = getSb();
      const {data,error} = await client.from('total_posts').select('*').in('id',ids);
      if(error) throw error;
      for(const post of data||[]) if(!await window.savePostRevision(post,'password')) throw new Error('이력 저장 실패');
      const update = type === 'dl' ? {download_password:value.trim()} : {password:value.trim()};
      const result = await client.from('total_posts').update(update).in('id',ids);
      if(result.error) throw result.error;
      window.loadManageList?.(currentPage||1);
    } catch(e) { alert('비밀번호 변경 오류: ' + e.message); }
    finally { showLoading(false); }
  };

  function installTaskFilters() {
    const area = document.getElementById('btn-unanswered')?.parentElement;
    if (!area || document.getElementById('nk-draft-filter')) return;
    const button = (id,text,kind,color) => {
      const b = document.createElement('button'); b.id=id; b.type='button'; b.className='btn-action'; b.innerHTML=text;
      b.style.cssText='background:#fff;color:'+color+';border:1px solid '+color+';padding:8px 12px;border-radius:6px;font-size:.9rem';
      b.onclick=()=>window.nkFilterTasks(kind);
      area.insertBefore(b,area.firstChild); return b;
    };
    button('nk-draft-filter','<svg class="ic"><use href="#i-save"/></svg> 초안','draft','#7d3c98');
    button('nk-schedule-filter','<svg class="ic"><use href="#i-clock"/></svg> 예약 발행','scheduled','#8a5a00');
    const reset=document.createElement('button'); reset.type='button'; reset.textContent='전체 목록';
    reset.className='btn-action'; reset.style.cssText='background:#eee;color:#444;padding:8px 12px;border-radius:6px;font-size:.9rem';
    reset.onclick=()=>{isDraftFilter=false;isScheduledFilter=false;isUnansweredFilter=false;window.loadManageList?.(1);};
    area.insertBefore(reset,area.firstChild);
  }

  const originalLoad = window.loadManageList;
  if (originalLoad) window.loadManageList = async function (page) {
    installTaskFilters();
    const result = await originalLoad.call(this,page);
    const cards = document.querySelectorAll('.post-manage-card');
    cards.forEach(card => {
      const id = Number(card.dataset.id);
      const editButton = card.querySelector('.pm-title');
      if (!editButton) return;
      const serialized = editButton.getAttribute('onclick') || '';
      const isDraft = card.dataset.draft === '1' || serialized.includes('"is_draft":true');
      const body = card.querySelector('.pm-body > div');
      if (isDraft && body && !body.querySelector('[data-draft-label]')) {
        const tag=document.createElement('span');tag.dataset.draftLabel='1';tag.className='badge';tag.innerHTML='<svg class="ic"><use href="#i-save"/></svg> 초안';
        tag.style.cssText='background:#8e44ad;color:white;margin-right:5px';body.insertBefore(tag,body.firstChild);
      }
      const actions=card.querySelector('.pm-actions');
      if(actions && !actions.querySelector('[data-history-button]')){
        const b=document.createElement('button');b.type='button';b.dataset.historyButton='1';b.className='pm-btn';
        b.style.cssText='background:#3498db;color:white;border:0';b.textContent='이력';b.onclick=()=>window.showPostHistory(id);actions.insertBefore(b,actions.firstChild);
      }
    });
    return result;
  };

  installTaskFilters();
  loadDashboardTasks();
  getSb().auth.onAuthStateChange((_event, session) => { if (session) loadDashboardTasks(); });
  setInterval(() => { if (document.getElementById('dashboard-tasks')) loadDashboardTasks(); }, 60000);
})();