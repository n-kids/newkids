// 뉴키즈 주문앱 공통 (원 어플 index.html · 관리자 admin.html 함께 사용)
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const digits = s => String(s || '').replace(/\D/g, '');
const fmtPhone = p => { const d = digits(p); return d.length === 11 ? `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}` : d; };
const fmtDate = iso => { const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

const REGIONS = ['김포','고양','파주','강화'];
const AGES = ['만0세','만1세','만2세','만3세','만4세','만5세'];
// 주문 호수: 이번 달 호만. 15일부터는 다음 달 호도 열림 (예: 11/2 → 11월호, 11/15 → 11월호·12월호)
const MONTHS = (() => { const d = new Date(), m = d.getMonth() + 1; return d.getDate() >= 15 ? [`${m}월호`, `${m % 12 + 1}월호`] : [`${m}월호`]; })();
const HO = ['1호(3월)','2호(4월)','3호(5월)','4호(6월)','5호(7월)','6호(8월)','7호(9월)','8호(10월)','9호(11월)','10호(12월)','11호(1월)','12호(2월)'];
const STATES = { book:['접수','확인','발주완료','배송중'], goods:['접수','확인','발주완료','배송중'], as:['접수','확인','업체 접수','처리완료'],
  ask:['접수','확인','답변 완료'], event:['접수','확인','안내 완료'], return:['접수','확인','업체 접수','처리완료'] };
const KIND_NAME = { book:'교재', goods:'물품', as:'A/S', ask:'문의', event:'행사', return:'반품' };
// 문의·요청 (주문이 아닌 것). 내용은 as_info·memo·photos 에 담음
const REQ = { ask:{title:'단순 문의', icon:'chat'}, event:{title:'행사 문의', icon:'party'}, return:{title:'반품 요청', icon:'undo'} };
const ASK_TOPICS = ['교재','물품','배송','결제·서류','기타'];
const RETURN_REASONS = ['파손·불량','다른 물건이 왔어요','수량이 더 왔어요','주문 실수','기타'];
const isOrder = o => o.kind === 'book' || o.kind === 'goods';
const isDone = o => o.state >= STATES[o.kind].length - 1;
const PAY_NAME = { bank:'계좌이체', invoice:'월말 청구' };
const CATALOGS = { ls:{name:'리틀스마트 카탈로그', pages:LS_PAGES}, rk:{name:'2027 라온키즈 카탈로그', pages:RK_PAGES} };
const catImg = (k, n) => `${k}/p${String(n).padStart(2,'0')}.jpg`;
const LS_FILE = {'리본':'RIBBON','타이':'TIE','교사용 앞치마':'APRON'};

const ICON = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
  tool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.3-.5-.5-2.3z"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  blocks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="12" width="8" height="8" rx="1.5"/><rect x="13" y="12" width="8" height="8" rx="1.5"/><rect x="8" y="3" width="8" height="8" rx="1.5"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="9" width="18" height="12" rx="1.5"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S10 9 12 9zm0 0c2-4 6-4 6-1.5S14 9 12 9z"/></svg>',
  shirt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c0 2-2 3-4 3S8 5 8 3z"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  party:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l5-14 9 9z"/><path d="M14 4v2M18 6l-1.5 1.5M20 10h-2"/></svg>',
  undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-4"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/></svg>',
};

// 비밀번호는 기기에서 먼저 SHA-256 으로 해시해서 보냄 (서버가 bcrypt 로 한 번 더 해시 = 2중 해시). 원래 비밀번호는 기기 밖으로 안 나감
async function pinHash(phone, pin){
  const data = new TextEncoder().encode(`nk-order|${digits(phone)}|${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Supabase 함수 호출. 실패하면 사람이 읽을 수 있는 문구로 바꿔서 던진다
async function rpc(name, args){
  let res;
  try { res = await sb.rpc(name, args); }
  catch(_) { throw new Error('인터넷 연결을 확인하고 다시 시도해 주세요.'); }
  if (res.error){
    const m = res.error.message || '';
    if (/function .* does not exist|Could not find the function/i.test(m)) throw new Error('주문 서버가 아직 준비되지 않았어요. 뉴키즈에 알려주세요.');
    if (/Failed to fetch|NetworkError/i.test(m)) throw new Error('인터넷 연결을 확인하고 다시 시도해 주세요.');
    throw new Error(m);
  }
  return res.data;
}

function toast(msg){ const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3000); }

// 검색: 띄어쓰기·대소문자 무시
const matchQ = (name, q) => { const k = String(q || '').replace(/\s+/g, '').toLowerCase(); return !k || String(name).replace(/\s+/g, '').toLowerCase().includes(k); };
const ageSummary = q => (q || []).map((n, i) => n ? `${AGES[i].replace('만','')} ${n}` : '').filter(Boolean).join(' · ');
// 교재 한 줄: q = 연령별(만0~만5) 수량, st = 단계별 수량 {단계: 수량} ('' = 단계 없이 수량)
const lineTotal = l => (l.q || []).reduce((a, b) => a + (+b || 0), 0) + Object.values(l.st || {}).reduce((a, b) => a + (+b || 0), 0);
const lineSummary = l => [ageSummary(l.q), ...Object.entries(l.st || {}).filter(([, v]) => v).map(([k, v]) => `${k === '' ? '수량' : /^\d+$/.test(k) ? k + '단계' : k} ${v}`)].filter(Boolean).join(' · ');
const orderTitle = o => o.kind === 'book' ? `교재 ${o.month || ''} 주문` : o.kind === 'goods' ? '물품 주문' : o.kind === 'as' ? 'A/S 신청' : REQ[o.kind].title;
function orderSummary(o){
  if (o.kind === 'book') return (o.lines || []).map(l => l.name).join(', ') + ` · ${(o.lines || []).reduce((a, l) => a + lineTotal(l), 0)}권`;
  if (o.kind === 'goods') return (o.lines || []).map(l => `${l.name} ${l.qty}개`).join(', ');
  const a = o.as_info || {};
  if (o.kind === 'ask') return `${a.topic ? '[' + a.topic + '] ' : ''}${o.memo || ''}`;
  if (o.kind === 'event') return [a.name, a.date].filter(Boolean).join(' · ') || o.memo || '';
  if (o.kind === 'return') return [`${a.item || ''}${a.ho ? ' ' + a.ho : ''}`, a.qty ? `${a.qty}개` : '', a.reason].filter(Boolean).join(' · ');
  return `${a.prog || ''} ${a.step && a.step !== '단계 없음' ? a.step + '단계 ' : ''}${a.ho || ''}`;
}

// 국민서관 상품(용량이 커서 따로 불러옴)
let KP = {cats:[], items:[], at:''}; let THUMBS = {}; let kpReady = false;
function loadCatalogData(onReady){
  fetch('kp.json').then(r => r.json()).then(d => {
    if (d.cats.length && !Array.isArray(d.cats[0])){ const p = []; for (let i = 0; i < d.cats.length; i += 2) p.push([d.cats[i], d.cats[i+1]]); d.cats = p; }
    KP = d; kpReady = true; onReady && onReady();
  }).catch(() => { kpReady = 'fail'; onReady && onReady(); });
  fetch('kp-thumbs.json').then(r => r.json()).then(d => { THUMBS = d; onReady && onReady(); }).catch(() => {});
}

// 사진을 줄여서 data URL로 (A/S 사진 저장용)
function shrinkPhoto(file, max, q){
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); };
      img.onerror = () => res(null); img.src = r.result; };
    r.onerror = () => res(null); r.readAsDataURL(file);
  });
}
