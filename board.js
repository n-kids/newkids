/* notice.html controller. No global page functions or inline event handlers. */
(() => {
    'use strict';
    if (!document.body.classList.contains('board-page')) return;
    const $ = id => document.getElementById(id);
    const pageSize = 10;
    const list = $('board-list-wrapper');
    const more = $('load-more-box');
    const search = $('search-input');
    const modal = $('download-guide-modal');
    let categories = [];
    let category = '';
    let keyword = '';
    let mode = '';
    let page = 1;
    let generation = 0;
    let tagGeneration = 0;
    let busy = false;
    let ready = false;
    let returnFocus = null;

    function node(tag, className, text) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }
    function readIds(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || '[]');
            return Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'number' || typeof id === 'string').map(String))] : [];
        } catch (_) { return []; }
    }
    function saveIds(key, ids) {
        try {
            localStorage.setItem(key, JSON.stringify(ids.map(id => /^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id)) ? Number(id) : id)));
            return true;
        } catch (_) { alert('브라우저 저장 공간에 기록을 저장할 수 없습니다.'); return false; }
    }
    function message(text) { list.replaceChildren(node('p', 'board-state', text)); }
    function syncButtons() {
        [['btn-scrap-mode','scraps','⭐ 찜한 자료'], ['btn-recent-mode','recent','🕒 최근 본 자료']].forEach(([id, value, label]) => {
            $(id).setAttribute('aria-pressed', String(mode === value));
            $(id).textContent = label + (mode === value ? ' 보는 중' : '');
        });
        document.querySelectorAll('#hashtag-area button').forEach(button => button.classList.toggle('active', button.dataset.keyword === keyword));
    }
    function updateHeader() {
        const info = categories.find(item => item.code === category);
        if (info) { $('board-title').textContent = info.name; $('board-desc').textContent = info.hero_desc || '뉴키즈의 게시판입니다.'; document.title = '뉴키즈 - ' + info.name; }
        $('btn-user-write').hidden = category === 'notice';
        const resource = category === 'reference';
        document.body.classList.toggle('is-resource-board', resource);
        $('reference-help-panel').hidden = !resource;
        $('mobile-resource-actions').hidden = !resource;
    }
    async function tags() {
        const request = ++tagGeneration;
        const area = $('hashtag-area');
        area.replaceChildren();
        try {
            const { data, error } = await window.sb.from('total_posts').select('title').eq('category', category).neq('is_visible', false);
            if (request !== tagGeneration || error) return;
            const values = new Set();
            (data || []).forEach(item => {
                const match = String(item.title || '').match(/\[(.*?)\]/);
                if (match) match[1].split(/[,-]/).forEach(value => { if (value.trim()) values.add(value.trim()); });
            });
            if (!values.size) return;
            ['', ...Array.from(values).sort()].forEach(value => {
                const button = node('button', 'hashtag-btn', value ? '#' + value : '#전체보기');
                button.type = 'button'; button.dataset.action = 'tag'; button.dataset.keyword = value;
                area.appendChild(button);
            });
            syncButtons();
        } catch (error) { console.error('태그 로드 오류:', error); }
    }
    function row(item, index, count, offset, answered, scraps) {
        const id = String(item.id);
        const pinned = item.is_notice === true;
        const el = node('div', 'board-list-row' + (pinned ? ' board-notice-row' : ''));
        const number = node('div', 'board-col-number');
        if (mode === 'recent') {
            const info = categories.find(c => c.code === item.category);
            number.appendChild(node('span', 'badge board-category', info ? info.name : item.category));
        } else if (pinned) number.appendChild(node('span', 'board-notice-label', '공지'));
        else number.textContent = Math.max(0, count - offset - index);
        let author = typeof item.link_url === 'string' ? item.link_url.trim() : '';
        if (category === 'notice' || !author || author === '익명' || /^https?:\/\//.test(author)) author = '관리자';
        const authorCell = node('div', 'board-col-author');
        authorCell.appendChild(node('span', 'badge board-author', author));
        const title = node('div', 'board-col-title');
        const star = node('button', 'scrap-btn', scraps.includes(id) ? '⭐' : '☆');
        star.type = 'button'; star.dataset.action = 'scrap'; star.dataset.id = id;
        star.setAttribute('aria-label', '찜하기: ' + String(item.title || ''));
        star.setAttribute('aria-pressed', String(scraps.includes(id)));
        title.appendChild(star);
        const link = node('a', 'board-post-link');
        link.href = 'view.html?id=' + encodeURIComponent(id); link.dataset.postId = id;
        if (author !== '관리자') link.appendChild(node('span', 'badge board-status ' + (answered.has(id) ? 'board-status-done' : 'board-status-wait'), answered.has(id) ? '답변완료' : '답변대기'));
        const prefix = (String(item.is_secret) === 'true' ? '🔒 ' : '') + (pinned ? '📌 ' : '');
        link.appendChild(node('span', 'board-post-text', prefix + String(item.title || '')));
        title.appendChild(link);
        const meta = node('div', 'board-col-meta');
        const date = new Date(item.created_at);
        meta.append(node('span', 'board-date', Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0]), node('span', 'board-downloads', '📥 ' + (item.download_count || 0)));
        el.append(number, authorCell, title, meta);
        return el;
    }
    async function load(nextPage = 1, append = false) {
        if (!ready || (append && busy)) return;
        const request = ++generation;
        busy = true; more.hidden = true; list.setAttribute('aria-busy', 'true');
        if (!append) message('데이터를 불러오는 중입니다...');
        try {
            const scraps = readIds('nk_scraps');
            const recent = readIds('nk_recent').slice(0, 20);
            if ((mode === 'scraps' && !scraps.length) || (mode === 'recent' && !recent.length)) {
                message(mode === 'scraps' ? '찜해둔 자료가 없습니다.' : '최근 본 자료가 없습니다.'); page = 1; return;
            }
            const offset = (nextPage - 1) * pageSize;
            let query = window.sb.from('total_posts').select('id, title, category, created_at, link_url, is_secret, download_count, is_notice, image_url', { count: 'exact' }).neq('is_visible', false);
            query = mode === 'recent' ? query.in('id', recent) : query.eq('category', category);
            if (keyword) query = query.ilike('title', '%' + keyword + '%');
            if (mode === 'scraps') query = query.in('id', scraps);
            query = query.order('is_notice', { ascending: false, nullsFirst: false });
            query = category === 'reference' ? query.order('title', { ascending: true }).order('created_at', { ascending: false }) : query.order('created_at', { ascending: false });
            const result = await query.range(mode === 'recent' ? 0 : offset, mode === 'recent' ? 19 : offset + pageSize - 1);
            if (request !== generation) return;
            if (result.error) throw result.error;
            let data = result.data || [];
            const count = result.count || 0;
            if (mode === 'recent') data = data.sort((a,b) => recent.indexOf(String(a.id)) - recent.indexOf(String(b.id))).slice(offset, offset + pageSize);
            if (!data.length) { if (!append) message('등록되거나 조건에 맞는 글이 없습니다.'); return; }
            const answered = new Set();
            const comments = await window.sb.from('post_comments').select('post_id').in('post_id', data.map(item => item.id));
            if (request !== generation) return;
            (comments.data || []).forEach(item => answered.add(String(item.post_id)));
            const fragment = document.createDocumentFragment();
            data.forEach((item,index) => fragment.appendChild(row(item,index,count,offset,answered,scraps)));
            if (!append) list.replaceChildren();
            list.appendChild(fragment); page = nextPage;
            more.hidden = count <= offset + pageSize;
        } catch (error) {
            if (request === generation) {
                console.error('게시판 로드 오류:', error);
                if (append) { more.hidden = false; alert('목록을 더 불러오지 못했습니다. 다시 시도해 주세요.'); }
                else message('데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
            }
        } finally { if (request === generation) { busy = false; list.setAttribute('aria-busy', 'false'); } }
    }
    function selectCategory() {
        if (!ready) return;
        const code = location.hash.slice(1);
        category = categories.some(c => c.code === code) ? code : categories[0].code;
        mode = ''; keyword = ''; search.value = ''; page = 1;
        updateHeader(); syncButtons(); tags(); load();
    }
    function guide(open) {
        if (open) { returnFocus = document.activeElement; modal.hidden = false; modal.querySelector('button').focus(); }
        else { modal.hidden = true; if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
    }
    async function share() {
        const data = { title: '뉴키즈 자료실', text: '뉴키즈 자료실에서 교육 자료를 확인해 보세요.', url: location.href };
        if (navigator.share) { try { await navigator.share(data); return; } catch (error) { if (error.name === 'AbortError') return; } }
        try { if (!navigator.clipboard || !window.isSecureContext) throw new Error('clipboard unavailable'); await navigator.clipboard.writeText(location.href); alert('자료실 주소를 복사했습니다.'); }
        catch (_) { prompt('아래 주소를 복사해 주세요.', location.href); }
    }
    document.addEventListener('click', event => {
        const link = event.target.closest('a[data-post-id]');
        if (link) { const id = link.dataset.postId; saveIds('nk_recent', [id, ...readIds('nk_recent').filter(value => value !== id)].slice(0,20)); return; }
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'guide-open') { guide(true); return; }
        if (action === 'guide-close') { guide(false); return; }
        if (action === 'share') { share(); return; }
        if (!ready) return;
        if (action === 'write') location.href = 'write.html#' + encodeURIComponent(category);
        else if (action === 'scraps' || action === 'recent') { mode = mode === action ? '' : action; syncButtons(); load(); }
        else if (action === 'tag') { keyword = button.dataset.keyword; search.value = keyword; syncButtons(); load(); }
        else if (action === 'more') load(page + 1, true);
        else if (action === 'scrap') {
            const id = button.dataset.id; const ids = readIds('nk_scraps'); const selected = !ids.includes(id);
            if (saveIds('nk_scraps', selected ? [...ids,id] : ids.filter(value => value !== id))) {
                button.textContent = selected ? '⭐' : '☆'; button.setAttribute('aria-pressed', String(selected));
                if (mode === 'scraps') load();
            }
        }
    });
    $('board-search-form').addEventListener('submit', event => { event.preventDefault(); if (!ready) return; keyword = search.value.trim(); syncButtons(); load(); });
    window.addEventListener('hashchange', selectCategory);
    document.addEventListener('keydown', event => {
        if (modal.hidden) return;
        if (event.key === 'Escape') guide(false);
        if (event.key === 'Tab') {
            const items = [...modal.querySelectorAll('button,a[href]')]; const first = items[0]; const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    function start() {
        const deadline = Date.now() + 10000;
        const timer = setInterval(() => {
            if (window.sb && Array.isArray(window.GLOBAL_CATEGORIES) && window.GLOBAL_CATEGORIES.length) {
                clearInterval(timer); categories = window.GLOBAL_CATEGORIES.filter(item => item.type === 'BOARD');
                if (!categories.length) { message('생성된 게시판이 없습니다.'); return; }
                ready = true; selectCategory();
            } else if (Date.now() >= deadline) { clearInterval(timer); message('게시판 초기화가 지연되고 있습니다. 페이지를 새로고침해 주세요.'); }
        }, 100);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
