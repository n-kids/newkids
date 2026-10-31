(function boot() {
  'use strict';
  const sb = window.sb;
  if (!sb) { window.__nkConvenienceWaits = (window.__nkConvenienceWaits || 0) + 1; if (window.__nkConvenienceWaits < 100) setTimeout(boot, 100); return; }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const modalBase = 'position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:10050;display:flex;align-items:center;justify-content:center;padding:18px;';
  function makeModal(id, title, body) {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div'); modal.id = id; modal.style.cssText = modalBase;
      modal.innerHTML = '<div style="background:#fff;border-radius:12px;width:min(980px,96vw);max-height:90vh;overflow:auto;padding:20px;box-shadow:0 12px 40px #0004"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #ddd;padding-bottom:12px"><h2 data-modal-title style="margin:0;color:#1a3c6e"></h2><button type="button" data-modal-close style="border:0;background:#eee;border-radius:6px;padding:8px 12px;cursor:pointer">닫기 ✕</button></div><div data-modal-body style="padding-top:16px"></div></div>';
      modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-modal-close]')) modal.style.display = 'none'; });
      document.body.appendChild(modal);
    }
    modal.querySelector('[data-modal-title]').textContent = title;
    modal.querySelector('[data-modal-body]').innerHTML = body;
    modal.style.display = 'flex';
    return modal;
  }

  window.previewPost = function () {
    const title = document.getElementById('post-title')?.value || '(제목 없음)';
    const content = quill?.root?.innerHTML || '<p>본문이 없습니다.</p>';
    const safeTitle = esc(title);
    const body = '<iframe title="게시글 미리보기" sandbox style="width:100%;height:68vh;border:1px solid #ddd;border-radius:8px;background:white"></iframe>';
    const modal = makeModal('nk-preview-modal', '게시글 미리보기', body);
    const frame = modal.querySelector('iframe');
    frame.srcdoc = '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px/1.75 Arial,sans-serif;max-width:820px;margin:30px auto;padding:0 20px;color:#333}img,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #ddd;padding:6px}</style><h1>' + safeTitle + '</h1><main>' + content + '</main></html>';
  };

  window.savePostRevision = async function (post, action) {
    if (!post?.id) return false;
    const { data: { session } = {} } = await sb.auth.getSession();
    const { error } = await sb.from('post_revisions').insert({
      post_id: post.id, post_title: post.title || '', snapshot: post,
      action: action || 'update', changed_by: session?.user?.email || null
    });
    if (error) { console.error('Post history save failed', error); return false; }
    return true;
  };

  window.showPostHistory = async function (postId) {
    const modal = makeModal('nk-history-modal', '게시글 변경 이력', '<p>이력을 불러오는 중...</p>');
    const { data, error } = await sb.from('post_revisions').select('*').eq('post_id', postId).order('created_at', {ascending:false}).limit(50);
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
      const snapshot = {...row.snapshot};
      delete snapshot.created_at;
      const { data: current } = await sb.from('total_posts').select('*').eq('id', row.post_id).maybeSingle();
      if (current && !await window.savePostRevision(current, 'update')) return alert('현재 상태를 이력으로 저장하지 못해 복구를 중단했습니다.');
      const result = current
        ? await sb.from('total_posts').update(snapshot).eq('id', row.post_id)
        : await sb.from('total_posts').insert(snapshot);
      if (result.error) return alert('복구 실패: ' + result.error.message);
      modal.style.display = 'none'; alert('게시글을 복구했습니다.'); window.loadManageList?.(1);
    }));
  };

  window.openMediaLibrary = async function (target) {
    const modal = makeModal('nk-media-modal', '미디어 라이브러리', '<p>파일 목록을 불러오는 중...</p>');
    try {
      const all = [];
      async function scan(prefix, depth) {
        if (depth > 5) return;
        for (let offset = 0; offset < 5000; offset += 100) {
          const {data, error} = await sb.storage.from('images').list(prefix, {limit:100, offset, sortBy:{column:'created_at',order:'desc'}});
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
        body.innerHTML = '<input id="nk-media-search" class="form-input" placeholder="파일명 검색..." style="margin-bottom:12px"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;max-height:65vh;overflow:auto">' + filtered.map((item, idx) => {
          const url = sb.storage.from('images').getPublicUrl(item.path).data.publicUrl;
          const image = (item.metadata?.mimetype || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(item.name);
          return '<button type="button" data-media="' + idx + '" style="text-align:left;border:1px solid #ddd;border-radius:8px;background:white;padding:8px;cursor:pointer;overflow:hidden">' + (image ? '<img src="' + esc(url) + '" alt="" style="width:100%;height:110px;object-fit:cover;border-radius:4px">' : '<div style="height:110px;display:grid;place-items:center;font-size:36px">📄</div>') + '<div style="font-size:.82rem;overflow-wrap:anywhere;margin-top:6px">' + esc(item.name) + '</div><div style="font-size:.76rem;color:#1a3c6e">선택하여 삽입</div></button>';
        }).join('') + '</div>';
        body.querySelector('#nk-media-search').value = filter;
        body.querySelector('#nk-media-search').addEventListener('input', e => render(e.target.value));
        body.querySelectorAll('[data-media]').forEach(btn => btn.addEventListener('click', () => {
          const item = filtered[Number(btn.dataset.media)];
          const url = sb.storage.from('images').getPublicUrl(item.path).data.publicUrl;
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
    if (!box) return;
    const [postsResult, commentsResult] = await Promise.all([
      sb.from('total_posts').select('id,title,is_draft,is_visible,publish_at'),
      sb.from('post_comments').select('post_id')
    ]);
    if (postsResult.error) { box.innerHTML = '<div style="color:#a33">운영 알림을 불러오지 못했습니다: ' + esc(postsResult.error.message) + '</div>'; return; }
    const posts = postsResult.data || [], comments = commentsResult.data || [];
    const answered = new Set(comments.map(x => x.post_id));
    const now = Date.now(), week = now + 7 * 86400000;
    const drafts = posts.filter(x => x.is_draft).length;
    const scheduled = posts.filter(x => !x.is_draft && x.publish_at && new Date(x.publish_at).getTime() > now && new Date(x.publish_at).getTime() <= week).length;
    const unanswered = posts.filter(x => !x.is_draft && !answered.has(x.id)).length;
    const cards = [
      ['draft','💾','저장된 초안',drafts,'#8e44ad'],
      ['scheduled','⏰','7일 내 예약 발행',scheduled,'#d68910'],
      ['unanswered','💬','답변 대기 게시글',unanswered,'#1a3c6e']
    ];
    box.innerHTML = cards.map(([key,icon,label,count,color]) => '<button type="button" onclick="nkFilterTasks(\'' + key + '\')" style="text-align:left;background:#fff;border:1px solid #e4e8ef;border-left:5px solid ' + color + ';border-radius:9px;padding:15px;cursor:pointer;box-shadow:0 2px 8px #0000000a"><div style="font-weight:700;color:#667">' + icon + ' ' + label + '</div><strong style="display:block;font-size:1.7rem;color:' + color + ';margin-top:4px">' + count + '</strong><small style="color:#888">눌러서 목록 보기</small></button>').join('');
  }

  // 게시글 변경 전 스냅샷을 남겨 되돌릴 수 있게 함
  const originalUpload = window.uploadPost;
  if (originalUpload) window.uploadPost = async function (saveAsDraft) {
    if (editingId) {
      const {data, error} = await sb.from('total_posts').select('*').eq('id', editingId).single();
      if (error) return alert('현재 글을 읽지 못해 이력을 남길 수 없습니다: ' + error.message);
      if (!await window.savePostRevision(data, 'update')) return alert('변경 이력을 저장하지 못했습니다. 저장을 취소했습니다.');
    }
    return originalUpload.call(this, saveAsDraft);
  };

  const originalCopy = window.copyPost;
  if (originalCopy) window.copyPost = function (item) {
    originalCopy.call(this, item);
    document.getElementById('post-password').value = '';
    document.getElementById('post-dl-password').value = '';
    document.getElementById('chk-is-notice').checked = false;
    document.getElementById('post-publish-at').value = '';
  };

  window.deletePost = async function (id) {
    if (!confirm('정말 이 게시글을 삭제하시겠습니까? 변경 이력으로 복구할 수 있도록 업로드 파일은 보존됩니다.')) return;
    showLoading(true);
    try {
      const {data, error} = await sb.from('total_posts').select('*').eq('id', id).single();
      if (error) throw error;
      if (!await window.savePostRevision(data, 'delete')) throw new Error('삭제 전 이력 저장 실패');
      const result = await sb.from('total_posts').delete().eq('id', id);
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
      const {data, error} = await sb.from('total_posts').select('*').in('id', ids);
      if (error) throw error;
      for (const post of data || []) if (!await window.savePostRevision(post, action === 'delete' ? 'delete' : action === 'password' ? 'password' : 'bulk')) throw new Error('변경 이력 저장 실패');
      let result;
      if (action === 'delete') result = await sb.from('total_posts').delete().in('id', ids);
      else if (action === 'hide') result = await sb.from('total_posts').update({is_visible:false}).in('id', ids);
      else if (action === 'show') result = await sb.from('total_posts').update({is_visible:true}).in('id', ids);
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
    const {data,error} = await sb.from('total_posts').select('*').eq('id',id).single();
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
      const {data,error} = await sb.from('total_posts').select('*').in('id',ids);
      if(error) throw error;
      for(const post of data||[]) if(!await window.savePostRevision(post,'password')) throw new Error('이력 저장 실패');
      const update = type === 'dl' ? {download_password:value.trim()} : {password:value.trim()};
      const result = await sb.from('total_posts').update(update).in('id',ids);
      if(result.error) throw result.error;
      window.loadManageList?.(currentPage||1);
    } catch(e) { alert('비밀번호 변경 오류: ' + e.message); }
    finally { showLoading(false); }
  };

  function installTaskFilters() {
    const area = document.getElementById('btn-unanswered')?.parentElement;
    if (!area || document.getElementById('nk-draft-filter')) return;
    const button = (id,text,kind,color) => {
      const b = document.createElement('button'); b.id=id; b.type='button'; b.className='btn-action'; b.textContent=text;
      b.style.cssText='background:#fff;color:'+color+';border:1px solid '+color+';padding:8px 12px;border-radius:6px;font-size:.9rem';
      b.onclick=()=>window.nkFilterTasks(kind);
      area.insertBefore(b,area.firstChild); return b;
    };
    button('nk-draft-filter','💾 초안','draft','#8e44ad');
    button('nk-schedule-filter','⏰ 예약 발행','scheduled','#d68910');
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
      const isDraft = serialized.includes('"is_draft":true');
      const body = card.querySelector('.pm-body > div');
      if (isDraft && body && !body.querySelector('[data-draft-label]')) {
        const tag=document.createElement('span');tag.dataset.draftLabel='1';tag.className='badge';tag.textContent='💾 초안';
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
  sb.auth.onAuthStateChange((_event, session) => { if (session) loadDashboardTasks(); });
  setInterval(() => { if (document.getElementById('dashboard-tasks')) loadDashboardTasks(); }, 60000);
})();