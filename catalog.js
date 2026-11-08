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

    function state(error) {
        const box = element('div', 'catalog-state' + (error ? ' catalog-state-error' : ''));
        if (error) {
            box.textContent = '데이터를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해 주세요.';
        } else {
            box.append(element('div', 'catalog-state-icon', '📭'), element('h3', '', '현재 준비 중인 프로그램입니다.'), element('p', '', '새로운 콘텐츠가 곧 업데이트될 예정입니다. 조금만 기다려주세요!'));
        }
        list.replaceChildren(box);
    }

    function syncPage(code) {
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
        if (!isEvents) {
            const description = item.content ? String(item.content).replace(/<[^>]*>?/gm, '').substring(0, 50) + '...' : '';
            body.appendChild(element('p', 'card-text post-desc', description));
        }
        link.append(frame, body);
        return link;
    }

    async function load() {
        if (!ready) return;
        const request = ++revision;
        const code = categoryCode();
        syncPage(code);
        loading.classList.add('is-loading');
        list.setAttribute('aria-busy', 'true');
        list.replaceChildren();
        try {
            let query = window.sb.from('total_posts')
                .select(isEvents ? '*' : 'id, title, thumbnail_url, content, created_at, video_url')
                .eq('category', code).eq('is_visible', true);
            if (!isEvents) query = query.or('video_url.neq.ORDER_ITEM,video_url.is.null');
            const { data, error } = await query.order('order_num', { ascending: true }).order('created_at', { ascending: false });
            if (request !== revision) return;
            if (error) throw error;
            if (!data || !data.length) { state(false); return; }
            const fragment = document.createDocumentFragment();
            data.forEach(item => fragment.appendChild(card(item)));
            list.replaceChildren(fragment);
        } catch (error) {
            if (request === revision) { console.error('목록 로드 오류:', error); state(true); }
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
                clearInterval(timer); loading.classList.remove('is-loading'); state(true);
            }
        }, 100);
        window.addEventListener('hashchange', load);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
