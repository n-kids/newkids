/* Shared catalog lifecycle; page-specific rendering stays inside this closure. */
(() => {
    'use strict';
    const mode = document.body.dataset.catalog;
    if (mode !== 'events' && mode !== 'education') return;
    const isEvents = mode === 'events';
    const list = document.getElementById('post-list');
    const loading = document.getElementById('loading');
    const fallback = 'https://placehold.co/400x300/e0e0e0/666666?text=No+Image';
    let revision = 0;
    let ready = false;
    let currentItems = [];
    let searchQuery = '';
    let chipBar = null;
    let searchInput = null;
    const extras = {
        culture: {
            heading: '📸 체험 활동 현장',
            intro: '<h3>🌍 글로벌 리더로 자라나는 첫걸음</h3><p>매달 새로운 나라의 문화를 체험하며, 아이들의 시야를 넓혀줍니다.<br>원어민 선생님과 함께하는 즐거운 놀이 활동을 통해<br>자연스럽게 영어를 접하고 다문화 감수성을 키울 수 있습니다.</p>'
        }
    };

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function categoryCode() {
        const hash = location.hash.slice(1);
        if (hash) return hash;
        if (!isEvents) return 'korean';
        const first = window.GLOBAL_CATEGORIES.find(category => category.type === 'EVENT');
        return first ? first.code : 'season';
    }

    function ensureControls() {
        if (chipBar || !list || !list.parentNode) return;
        const bar = element('div', 'catalog-controls');
        chipBar = element('nav', 'catalog-chip-bar');
        chipBar.setAttribute('aria-label', isEvents ? '행사 프로그램 분류' : '교육 프로그램 분류');

        const searchWrap = element('div', 'catalog-search-wrap');
        searchInput = element('input', 'catalog-search-input');
        searchInput.type = 'search';
        searchInput.placeholder = isEvents ? '행사명 빠른 검색...' : '교재명 빠른 검색...';
        searchInput.setAttribute('aria-label', searchInput.placeholder);
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            renderCards();
        });
        searchWrap.appendChild(searchInput);

        bar.append(chipBar, searchWrap);
        list.parentNode.insertBefore(bar, list);
    }

    function syncChips(code) {
        ensureControls();
        if (!chipBar) return;
        const targetType = isEvents ? 'EVENT' : 'EDU';
        const cats = (window.GLOBAL_CATEGORIES || []).filter(c => c.type === targetType);
        const frag = document.createDocumentFragment();
        cats.forEach(c => {
            const safeCode = typeof window.safeCategoryCode === 'function' ? window.safeCategoryCode(c.code) : String(c.code || '');
            if (!safeCode) return;
            const active = safeCode === code;
            const label = String(c.name || safeCode).replace(/^[^\p{L}\p{N}]+/u, '').trim() || String(c.name || safeCode);
            const btn = element('button', 'catalog-chip' + (active ? ' is-active' : ''), label);
            btn.type = 'button';
            btn.dataset.code = safeCode;
            btn.setAttribute('aria-pressed', String(active));
            btn.addEventListener('click', () => {
                if (categoryCode() === safeCode) return;
                if (searchInput && searchInput.value) {
                    searchInput.value = '';
                    searchQuery = '';
                }
                try {
                    const nextUrl = new URL('#' + safeCode, location.href);
                    history.replaceState(null, '', nextUrl.href);
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                } catch (_) {
                    location.hash = '#' + safeCode;
                }
            });
            frag.appendChild(btn);
        });
        chipBar.replaceChildren(frag);
        const activeBtn = chipBar.querySelector('.catalog-chip.is-active');
        if (activeBtn && chipBar.scrollWidth > chipBar.clientWidth) {
            const targetLeft = activeBtn.offsetLeft - (chipBar.clientWidth - activeBtn.offsetWidth) / 2;
            chipBar.scrollLeft = Math.max(0, targetLeft);
        }
    }

    function state(kind) {
        const box = element('div', 'catalog-state' + (kind === 'error' ? ' catalog-state-error' : ''));
        if (kind === 'error') {
            box.textContent = '데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.';
        } else if (kind === 'no-match') {
            box.append(element('div', 'catalog-state-icon', '🔍'), element('h3', '', '검색 결과가 없습니다.'), element('p', '', '다른 검색어로 다시 찾아보시거나 검색어를 지워주세요.'));
        } else {
            box.append(element('div', 'catalog-state-icon', '📭'), element('h3', '', '현재 준비 중인 프로그램입니다.'), element('p', '', '새로운 콘텐츠가 곧 업데이트될 예정입니다. 조금만 기다려주세요!'));
        }
        list.replaceChildren(box);
    }

    function syncPage(code) {
        syncChips(code);
        const category = window.GLOBAL_CATEGORIES.find(item => item.code === code);
        const hero = document.getElementById('view-hero');
        if (category && hero) {
            if (category.hero_title) hero.querySelector('h1').innerHTML = window.sanitizeRichText(category.hero_title);
            if (category.hero_desc) hero.querySelector('p').innerHTML = window.sanitizeRichText(category.hero_desc);
        }
        if (!isEvents) return;
        const extra = extras[code] || {};
        const intro = document.getElementById('intro-section');
        intro.hidden = !extra.intro;
        document.getElementById('intro-box').innerHTML = extra.intro || '';
        document.getElementById('gallery-heading').textContent = extra.heading || '📸 활동 갤러리';
    }

    function imageSource(item) {
        let raw = isEvents ? (item.thumbnail_url || item.image_url) : item.thumbnail_url;
        if (isEvents) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length) raw = parsed[0];
            } catch (_) {}
        }
        raw = typeof raw === 'string' ? raw : '';
        const youtube = isEvents ? window.getYoutubeId(raw) : null;
        if (youtube) return { src: `https://img.youtube.com/vi/${youtube}/hqdefault.jpg`, video: true };
        if (!raw) return { src: fallback, video: false };
        const src = isEvents && !/^https?:/i.test(raw) ? `${CONFIG.SUPABASE_URL}/storage/v1/object/public/post_images/${raw}` : raw;
        try {
            const url = new URL(src, location.href);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return { src: fallback, video: false };
            return { src: url.href, video: false };
        } catch (_) { return { src: fallback, video: false }; }
    }

    function card(item) {
        const link = element('a', 'card catalog-card' + (isEvents ? '' : ' post-card'));
        link.href = `view.html?id=${encodeURIComponent(item.id)}`;
        if (isEvents && typeof item.link_url === 'string' && item.link_url.trim()) {
            const raw = item.link_url.trim();
            try {
                const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw);
                if (url.protocol === 'http:' || url.protocol === 'https:') {
                    link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    const icon = element('div', 'link-icon', '🔗');
                    icon.setAttribute('aria-hidden', 'true');
                    link.appendChild(icon);
                }
            } catch (_) {}
        }
        const source = imageSource(item);
        const frame = element('div', 'card-img-wrap' + (isEvents ? '' : ' post-thumb'));
        const image = element('img', 'card-img');
        image.src = source.src; image.alt = String(item.title || ''); image.loading = 'lazy';
        image.addEventListener('error', () => { image.src = fallback; }, { once: true });
        frame.appendChild(image);
        if (source.video) {
            const play = element('span', 'catalog-play', '▶');
            play.setAttribute('aria-hidden', 'true'); frame.appendChild(play);
        }
        const body = element('div', 'card-body catalog-card-body' + (isEvents ? '' : ' post-info'));
        body.appendChild(element(isEvents ? 'div' : 'h3', 'card-title catalog-card-title' + (isEvents ? '' : ' post-title'), String(item.title || '')));
        link.append(frame, body);
        return link;
    }

    function renderCards() {
        if (!currentItems.length) { state('empty'); return; }
        const filtered = searchQuery
            ? currentItems.filter(it => String(it.title || '').toLowerCase().includes(searchQuery))
            : currentItems;
        if (!filtered.length) { state('no-match'); return; }
        const fragment = document.createDocumentFragment();
        filtered.forEach(item => fragment.appendChild(card(item)));
        list.replaceChildren(fragment);
    }

    async function load() {
        if (!ready) return;
        const request = ++revision;
        const code = categoryCode();
        syncPage(code);
        loading.classList.add('is-loading');
        list.setAttribute('aria-busy', 'true');
        list.replaceChildren();
        currentItems = [];
        try {
            const nowIso = new Date().toISOString();
            let query = window.sb.from('total_posts')
                .select(isEvents ? '*' : 'id, title, thumbnail_url, created_at, video_url, publish_at, is_draft')
                .eq('category', code).eq('is_visible', true).neq('is_draft', true);
            if (!isEvents) query = query.or('video_url.neq.ORDER_ITEM,video_url.is.null');
            else query = query.or(`publish_at.is.null,publish_at.lte.${nowIso}`);
            const { data, error } = await query.order('order_num', { ascending: true }).order('created_at', { ascending: false });
            if (request !== revision) return;
            if (error) throw error;
            const nowMs = Date.now();
            currentItems = (data || []).filter(item => item.is_draft !== true && (!item.publish_at || new Date(item.publish_at).getTime() <= nowMs));
            renderCards();
        } catch (error) {
            if (request === revision) { console.error('목록 로드 오류:', error); state('error'); }
        } finally {
            if (request === revision) { loading.classList.remove('is-loading'); list.setAttribute('aria-busy', 'false'); }
        }
    }

    function start() {
        const deadline = Date.now() + 10000;
        const timer = setInterval(() => {
            if (window.sb && Array.isArray(window.GLOBAL_CATEGORIES) && window.GLOBAL_CATEGORIES.length) {
                clearInterval(timer); ready = true; load();
            } else if (Date.now() >= deadline) {
                clearInterval(timer); loading.classList.remove('is-loading'); state('error');
            }
        }, 100);
        window.addEventListener('hashchange', load);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
