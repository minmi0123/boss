/* 최소 DOM 셰임 — index.html 의 화면 블록을 브라우저 없이 구동한다.
   이 맥엔 브라우저 자동화가 없고 sim.js 는 로직 블록만 읽으므로,
   화면 전용 버그(과거 const 충돌 2회)를 잡으려면 이게 필요하다 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = __dirname;     // 이 파일이 저장소 뿌리에 있다

/* ── DOM ── */
let nid = 0;
function mkEl(tag) {
  const e = {
    tagName: tag, id: '', className: '', _text: '', children: [], parentNode: null,
    style: {}, disabled: false, onclick: null, scrollTop: 0, scrollHeight: 1000,
    _n: ++nid,
    get textContent() { return this._text || this.children.map(c => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children = []; },
    get innerHTML() { return '<html>'; },
    set innerHTML(v) { this.children = []; this._text = ''; if (v) this._text = String(v); },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    remove() { const p = this.parentNode; if (p) p.children = p.children.filter(x => x !== this); },
    classList: null,
  };
  e.classList = {
    add: c => { if (!(' '+e.className+' ').includes(' '+c+' ')) e.className = (e.className+' '+c).trim(); },
    remove: c => { e.className = e.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
    contains: c => (' '+e.className+' ').includes(' '+c+' '),
  };
  return e;
}
function walk(n, f) { f(n); for (const c of n.children) walk(c, f); }

const root = mkEl('root');
for (const id of ['app','bar','screen','tabs','overlay']) {
  const d = mkEl('div'); d.id = id; root.appendChild(d);
}
const pop = mkEl('div'); pop.id = 'pop'; pop.className = 'pop';
root.children.find(c => c.id === 'overlay').appendChild(pop);

const document = {
  createElement: mkEl,
  getElementById(id) { let r = null; walk(root, n => { if (n.id === id) r = n; }); return r; },
};

/* ── 타이머 (수동 발화) ── */
let timers = [], tid = 0;
const setTimeout_ = (fn, ms) => { timers.push({ id: ++tid, fn, ms }); return tid; };
const clearTimeout_ = id => { timers = timers.filter(t => t.id !== id); };
function pump(n) {          // 대기 중인 타이머를 순서대로 n회 발화
  for (let i = 0; i < n; i++) {
    if (!timers.length) break;
    const t = timers.shift(); t.fn();
  }
}

/* ── localStorage ── */
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const win = {};
const ctx = vm.createContext({
  document, localStorage, console, window: win,
  setTimeout: setTimeout_, clearTimeout: clearTimeout_,
  matchMedia: () => ({ matches: false }),
});
ctx.window = ctx;                     // story.js 가 window.__story 에 넣는다
Object.assign(ctx.window, { document, localStorage });

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const blocks = html.match(/<script>([\s\S]*?)<\/script>/g).map(b => b.replace(/^<script>|<\/script>$/g, ''));

vm.runInContext(fs.readFileSync(path.join(dir, 'story.js'), 'utf8'), ctx, { filename: 'story.js' });
vm.runInContext(blocks[0], ctx, { filename: 'logic' });
vm.runInContext(blocks[1], ctx, { filename: 'ui' });

/* const/let 은 vm 전역 객체에 안 올라온다 (function 선언만 올라온다).
   대화형·옵션·V 는 const/let 이므로 컨텍스트 안에서 평가해야 닿는다 */
const ev = expr => vm.runInContext(expr, ctx);

/* ── 검사 ── */
let 실패 = 0;
const ck = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) 실패++; };
const 텍스트 = n => { const a = []; walk(n, x => { if (x._text) a.push(x._text); }); return a; };
const 클래스들 = (n, cls) => { const a = []; walk(n, x => { if ((' '+x.className+' ').includes(' '+cls+' ')) a.push(x); }); return a; };

console.log('\n[UI] 대화형 이벤트 — 이벤트1');

ctx.새게임();
const 이벤트1 = ctx.window.__story.find(e => e.id === 1);
const 대화형 = ev('대화형');
ck(ctx.window.__story.every(대화형), '이벤트 15개가 전부 대화형이다');
ck(ctx.window.__story.every(e => e.글.every(l => typeof l.말 === 'string' && l.말)),
   '모든 줄에 말이 있다');
ck(ctx.window.__story.every(e => e.글.every(l => l.화자 === undefined || (typeof l.화자 === 'string' && l.화자))),
   '화자는 없거나 문자열이다 (빈 문자열이면 나레이션으로 조용히 떨어진다)');
/* 통째로 따옴표에 싸인 결과문 = 순수한 상대 대사다. 그건 결과화자를 붙여 말풍선으로 가야 한다.
   '"…" 어쩌고 했다' 처럼 대사+나레이션이 섞인 건 가운데 나레이션이 맞다 (이벤트10·15) */
const 순대사 = c => !!c.결과 && c.결과.startsWith('"') && c.결과.trim().endsWith('"');
ck(ctx.window.__story.every(e => e.선택.every(c => !순대사(c))),
   '통째로 따옴표에 싸인 채 남은 결과문이 없다');

let 끝났나 = false;
ctx.이벤트팝업(이벤트1, () => { 끝났나 = true; });

ck(클래스들(pop, 'chat').length === 1, '.chat 컨테이너가 생긴다');
let 줄 = () => 클래스들(pop, 'ln');
ck(줄().length === 1, '애니메이션 켬: 첫 줄만 먼저 뜬다 (실제 ' + 줄().length + ')');
ck(클래스들(pop, 'opts').length === 0, '아직 선택지가 안 붙어 있다');

pump(10);
ck(줄().length === 5, '5줄이 다 뜬다 (실제 ' + 줄().length + ')');

const cls = 줄().map(n => n.className);
ck(cls[0] === 'ln me',  '1줄 내 속마음 → 오른쪽 (' + cls[0] + ')');
ck(cls[1] === 'ln nar', '2줄 똑똑똑 → 나레이션 (' + cls[1] + ')');
ck(cls[2] === 'ln you', '3줄 후임 대사 → 왼쪽 (' + cls[2] + ')');
ck(cls[3] === 'ln nar', '4줄 나레이션 (' + cls[3] + ')');
ck(cls[4] === 'ln me',  '5줄 내 속마음 → 오른쪽 (' + cls[4] + ')');
ck(텍스트(줄()[2]).includes('후임'), '왼쪽 말풍선에 이름표가 붙는다');
ck(!텍스트(줄()[0]).includes('나'), '오른쪽 말풍선엔 이름표가 없다');

const 선택박스 = 클래스들(pop, 'opts');
ck(선택박스.length === 1, '마지막 줄 뒤에 선택지가 붙는다');
/* ★ 개수·문구를 하드코딩하지 않는다. 이벤트1 은 story.js 의 초안이라 자주 바뀐다
   (T/F 2지선다+중립 → E/I·S/N 사분면 4지선다, 2026-09-15). 데이터에서 유도한다 */
ck(선택박스[0].children.length === 이벤트1.선택.length,
   `선택지 ${이벤트1.선택.length}개 (실제 ` + (선택박스[0].children.length||0) + ')');
ck(pop.scrollTop === pop.scrollHeight, '팝업이 맨 아래로 따라 내려간다');

/* ★ 선택지 순서는 판마다 섞인다 (기획 §14 함정 16) — 인덱스로 집으면 안 된다.
   문구로 찾는다. 이게 화면에 실제로 보이는 것과도 맞다 */
const 버튼찾기 = (box, 조각) =>
  [...box.children].find(b => 텍스트(b).some(t => t.includes(조각)));

/* 실력을 올리는 선택지를 데이터에서 찾아 그걸 누른다 — 문구가 바뀌어도 안 깨진다 */
const 실력선택 = 이벤트1.선택.find(c => c.실력 > 0);
ck(!!실력선택, '이벤트1 에 실력을 올리는 선택지가 있다');
const 실력전 = ctx.__ui.S.실력;
const 고를버튼 = 버튼찾기(선택박스[0], 실력선택.글);
ck(!!고를버튼, `「${실력선택.글}」 버튼이 화면에 있다`);
고를버튼.onclick();
ck(선택박스[0].children.length === 0, '선택하면 선택지가 사라진다');
ck(줄().length === 6, '고른 선택지가 내 말풍선으로 붙는다 (실제 ' + 줄().length + ')');
ck(줄()[5].className === 'ln me', '고른 선택지는 오른쪽 (' + 줄()[5].className + ')');

pump(10);
ck(줄().length === 7, '결과 답장이 붙는다 (실제 ' + 줄().length + ')');
ck(줄()[6].className === 'ln you', '결과화자:후임 → 왼쪽 (' + 줄()[6].className + ')');
ck(텍스트(줄()[6]).some(t => t.includes(실력선택.결과.slice(0, 8))),
   '결과 문구가 들어 있다');
ck(ctx.__ui.S.실력 === 실력전 + 실력선택.실력, '지표가 실제로 적용된다 (실력 ' + 실력전 + '→' + ctx.__ui.S.실력 + ')');
ck(클래스들(pop, 'deltas').length === 1, '지표 변화줄이 붙는다');

const 확인 = 클래스들(pop, 'btnrow')[0].children[0];
확인.onclick();
ck(끝났나, '확인을 누르면 done() 이 불린다');
ck(!(' '+document.getElementById('overlay').className+' ').includes(' on '), '팝업이 닫힌다');

/* ── 애니메이션 끔 ── */
console.log('\n[UI] 애니메이션 끔');
ev('옵션').톡애니 = false;
ctx.새게임();
ctx.이벤트팝업(이벤트1, () => {});
ck(줄().length === 5, '끄면 5줄이 한 번에 (실제 ' + 줄().length + ')');
ck(클래스들(pop, 'opts').length === 1, '선택지도 바로 붙는다');
ck(timers.length === 0, '타이머가 안 쌓인다 (실제 ' + timers.length + ')');

/* ── 설정 화면 ── */
console.log('\n[UI] 설정 토글');
ev('옵션 = {}');
ctx.__ui.V.화면 = 'play'; ctx.__ui.V.탭 = '설정';
ctx.drawSettings();
const sc = document.getElementById('screen');
let 토글 = 클래스들(sc, 'opt')[0].children[1];
ck(토글.className === 'on', '기본값은 켬 (' + 토글.className + ')');
토글.onclick();
ck(ev('옵션').톡애니 === false, '누르면 꺼진다');
ck(store['boss_opt'] === '{"톡애니":false}', 'boss_opt 에 따로 저장된다 (' + store['boss_opt'] + ')');
토글 = 클래스들(document.getElementById('screen'), 'opt')[0].children[1];
ck(토글.className === '', '화면이 끔 상태로 다시 그려진다');
토글.onclick();
ck(ev('옵션').톡애니 === true, '다시 누르면 켜진다');

ctx.저장삭제();
ck(store['boss_opt'] !== undefined, '진행을 지워도 설정은 남는다');

/* ── 평문 경로가 아직 살아 있나 ──
   story.js 는 전부 대화형으로 갔지만, 위기 이벤트를 급히 문자열로 적어도
   화면이 죽지 않아야 한다. 가짜 이벤트로 그 경로를 찍어둔다 */
console.log('\n[UI] 예전 평문 경로 (하위호환)');
ctx.새게임();
const 평문이벤트 = { id: 99, 종류:'이야기', 단계:'스타트업', 진입후: 1,
  글: ['문자열로 적은 이벤트다.', '두 줄째.'],
  선택: [{ 글:'가', 실력:+3, 결과:'갔다.' }, { 글:'나', 분위기:+3, 결과:'왔다.' }] };
ck(!대화형(평문이벤트), '문자열 배열은 평문으로 판정된다');
ctx.이벤트팝업(평문이벤트, () => {});
ck(클래스들(pop, 'chat').length === 0, '평문 이벤트엔 .chat 이 없다');
ck(클래스들(pop, 'desc').length >= 1, '예전 .desc 로 그려진다');
ck(클래스들(pop, 'opts')[0].children.length === 2, '선택지 2개');

/* ── 모든 이벤트를 한 번씩 끝까지 돌려본다 ── */
console.log('\n[UI] 이벤트 15개 × 선택지 전부');
let 돈판 = 0, 탈 = null;
for (const e of ctx.window.__story) {
  for (let i = 0; i < e.선택.length; i++) {
    ctx.새게임();
    /* 조건부 선택지(규칙 §4-2)는 지표가 모자라면 잠긴다. 열어놓고 본다 */
    Object.assign(ctx.__ui.S, { 평판: 80, 분위기: 80, 실력: 80, 직원: 30, 돈: 90000 });
    let 닫힘 = false;
    try {
      ctx.이벤트팝업(e, () => { 닫힘 = true; });
      pump(30);
      const btn = 클래스들(pop, 'opts')[0].children[i];
      if (btn.disabled) continue;
      btn.onclick();
      pump(30);
      클래스들(pop, 'btnrow')[0].children[0].onclick();
      if (!닫힘) throw new Error('done() 이 안 불렸다');
      돈판++;
    } catch (err) { 탈 = '이벤트' + e.id + ' 선택' + (i + 1) + ' — ' + err.message; break; }
  }
  if (탈) break;
}
ck(!탈, '전부 끝까지 돌아간다' + (탈 ? ' — ' + 탈 : ' (' + 돈판 + '가지)'));

/* ── 인력관리 트리거 ──
   과거에 여기서 choose 가 늘 0 을 돌려줘 F 가 통째로 0 이 된 적이 있다.
   대화형으로 바꾸면서 또 깨지기 쉬운 자리라 끝까지 눌러본다 */
console.log('\n[UI] 인력관리 트리거');
const 트리거상황 = ev('G.트리거상황');
ck(['채용','해고','교육','휴가'].every(k =>
     트리거상황[k].every(l => typeof l === 'object' && typeof l.말 === 'string')),
   '트리거 4종이 전부 { 화자, 말 } 로 바뀌었다');
ck(트리거상황.채용.length === 3 && !트리거상황.채용[0].화자
   && 트리거상황.채용[1].화자 === '경력' && 트리거상황.채용[2].화자 === '신입',
   '채용 — 나레이션 1 + 경력/신입 말풍선 2');
ck(트리거상황.해고[1].화자 === '직원' && !트리거상황.해고[1].말.startsWith('"'),
   '해고 — 직원 말풍선, 따옴표 벗김');

function 트리거열기(slot) {
  ctx.새게임();
  Object.assign(ctx.__ui.S, { 돈: 90000, 직원: 40 });
  ctx.__ui.S.해금['인력관리'] = true;
  let 받은 = undefined;
  ctx.트리거묻기(slot, choose => { 받은 = choose; });
  pump(30);
  return () => 받은;
}

/* 채용 — 두 번 묻는다 */
let 받기 = 트리거열기('채용');
ck(클래스들(pop, 'chat').length === 1, '채용 트리거가 대화로 열린다');
ck(줄().length === 3, '상황 3줄이 다 뜬다 (실제 ' + 줄().length + ')');
ck(줄().map(n => n.className).join('|') === 'ln nar|ln you|ln you',
   '나레이션 1 + 왼쪽 말풍선 2 (' + 줄().map(n => n.className).join('|') + ')');
ck(텍스트(줄()[1]).includes('경력') && 텍스트(줄()[2]).includes('신입'),
   '말풍선에 경력·신입 이름표가 붙는다');
let 선택 = 클래스들(pop, 'opts');
ck(선택.length === 1 && 선택[0].children.length === 2, '1차 선택지 2개 (경력/신입)');
ck(!받기(), '아직 done 이 안 불렸다');

선택[0].children[1].onclick();            // 신입을 뽑는다 = F = index 1
/* 톡뿌리기 는 첫 줄을 동기로 붙인다 — 클릭 직후 이미 4번째(내 답) + 5번째(다음 질문)가 서 있다 */
ck(줄()[3] && 줄()[3].className === 'ln me', '고른 답이 내 말풍선으로 붙는다');
pump(30);
ck(줄().length === 5, '"어떤 사람을 뽑을까?" 가 이어진다 (실제 ' + 줄().length + ')');
ck(줄()[4].className === 'ln me', '다음 질문도 내 말풍선이다 (' + 줄()[4].className + ')');
ck(텍스트(줄()[4]).some(t => t.includes('어떤 사람')), '두 번째 질문 문구');
const 방침 = 클래스들(pop, 'opts').filter(b => b.children.length === 2).pop();
ck(방침 && 방침.children.length === 2, '2차 선택지 2개 (실력/인성)');
ck(텍스트(방침.children[0]).some(t => t.includes('실력 위주'))
   && 텍스트(방침.children[1]).some(t => t.includes('인성 위주')),
   '실력 위주 / 인성 위주 로 바뀌었다');

방침.children[0].onclick();               // 실력 위주 = 0
const choose = 받기();
ck(typeof choose === 'function', '채용을 끝내면 choose 가 넘어온다');
/* ★ 과거 버그 자리 — 두 물음의 답이 서로 안 섞여야 한다 */
ck(choose('채용방침') === 0, "choose('채용방침') 이 방침 답(0)을 준다");
ck(choose('아무거나') === 1, 'choose(그 외) 가 트리거 답(1=신입=F)을 준다');

/* 해고·교육·휴가 — 한 번만 묻는다 */
/* ★ 개수를 하드코딩하지 않는다 — 트리거 선택지는 축 배분을 바꿀 때마다 늘었다 줄었다 한다
   (교육은 T/F 2개 → 사분면 4개 → 다시 2개로 돌아왔다). 설정에서 유도한다 */
for (const slot of ['해고', '교육', '휴가']) {
  const 개수 = ev('트리거')[slot].length;
  받기 = 트리거열기(slot);
  const o = 클래스들(pop, 'opts');
  ck(o.length === 1 && o[0].children.length === 개수,
     slot + ' 선택지 ' + 개수 + '개 (실제 ' + (o[0] ? o[0].children.length : 0) + ')');
  o[0].children[0].onclick();
  const c = 받기();
  ck(typeof c === 'function' && c() === 0, slot + ' 은 한 번만 묻고 바로 끝난다');
}

/* ── 사무실 옆 풍경 ── */
console.log('\n[UI] 사무실 옆 풍경');
const 풍경SVG = ctx.__ui.풍경SVG;
const 센 = (svg, cls) => (svg.match(new RegExp('class="' + cls + '"', 'g')) || []).length;
const 기대 = [
  { 단계:'스타트업', person:0, tree:0, bench:0, car:0, board:0 },
  { 단계:'중소기업', person:2, tree:1, bench:0, car:0, board:0 },
  { 단계:'중견기업', person:5, tree:2, bench:1, car:1, board:0 },
  { 단계:'대기업',   person:8, tree:2, bench:2, car:2, board:1 },
];
for (let i = 0; i < 4; i++) {
  const svg = 풍경SVG(i), e = 기대[i];
  const 실제 = { person:센(svg,'person'), tree:센(svg,'tree'),
                 bench:Math.round(센(svg,'bench')/4), car:Math.round(센(svg,'car')/2),
                 board:센(svg,'board') };
  const 맞나 = ['person','tree','bench','car','board'].every(k => 실제[k] === e[k]);
  ck(맞나, e.단계 + ' — 사람' + 실제.person + ' 나무' + 실제.tree + ' 벤치' + 실제.bench
        + ' 차' + 실제.car + ' 간판' + 실제.board);
  ck(센(svg,'ground') === 1, e.단계 + ' 땅선이 있다');
  ck(svg.indexOf('width="560"') > 0, e.단계 + ' 땅선이 칸 전체를 덮는다');
}
/* 캔버스를 벗어나면 좌우가 잘린 채 그려진다. 좌표를 전부 훑는다 */
let 벗어남 = null, 최소x = 999;
for (let i = 0; i < 4; i++) {
  /* \s 로 앞을 막아야 한다. 안 막으면 rx="1.25" 의 rx 가 x 로 잡혀 0 에 가까운 값이 섞인다 */
  const xs = (풍경SVG(i).match(/\s(?:x|cx)="(-?[\d.]+)"/g) || [])
    .map(t => parseFloat(t.replace(/[^-\d.]/g, '')));
  for (const x of xs) {
    if (x < 0 || x > 560) 벗어남 = '단계' + i + ' x=' + x;
    if (x > 0 && x < 최소x) 최소x = x;
  }
}
ck(!벗어남, '모든 좌표가 캔버스(0~560) 안에 있다' + (벗어남 ? ' — ' + 벗어남 : ''));
ck(최소x >= 100, '왼쪽 여백이 남아 있다 (최소 x=' + 최소x + ')');

/* 땅선이 .rise 밖에 있어야 건물이 솟을 때 땅이 안 끌려간다.
   안으로 들어가면 옆 풍경의 땅선과 어긋나는데, 0.35초짜리라 눈으로는 놓치기 쉽다 */
{
  const svg = ctx.__ui.사무실SVG(1, 60);
  const g = svg.indexOf('<g class="rise">');
  ck(g > 0, '건물이 .rise 로 묶여 있다');
  ck(svg.indexOf('class="ground"') < g, '땅선이 .rise 앞(=밖)에 있다');
  ck((svg.match(/<g class="rise">/g) || []).length === 1
     && (svg.match(/<\/g>/g) || []).length === 1, '.rise 가 정확히 하나이고 닫혀 있다');
}

/* 땅선이 건물 SVG 와 같은 높이인지 — 다르면 두 그림이 따로 논다 */
const 건물 = ctx.__ui.사무실SVG(0, 1);
const 건물바닥 = (건물.match(/class="ground" x="0" y="(\d+)"/) || [])[1];
const 풍경바닥 = (풍경SVG(0).match(/class="ground" x="0" y="(\d+)"/) || [])[1];
ck(건물바닥 === 풍경바닥 && 건물바닥 === '156',
   '땅선 y 가 건물과 같다 (건물 ' + 건물바닥 + ' / 풍경 ' + 풍경바닥 + ')');
ck(건물.indexOf('viewBox="0 0 200 170"') > 0 && 풍경SVG(0).indexOf('0 0 560 170') > 0,
   'viewBox 높이가 170 으로 같다 — 배율이 같아야 땅선이 이어진다');

/* ── 화면에 실제로 붙나 ── */
console.log('\n[UI] 회사 탭 배치');
ctx.새게임();
ctx.__ui.V.화면 = 'play'; ctx.__ui.V.탭 = '회사';
ctx.draw();
const 회사 = document.getElementById('screen');
ck(클래스들(회사, 'scenebox').length === 1, '풍경 칸이 붙는다');
ck(클래스들(회사, 'sidestage').length === 0, '단계 이름 글씨가 빠졌다 (상태바와 중복)');
ck(클래스들(회사, 'sidenum').length === 0, '직원 수 글씨가 빠졌다');
ck(클래스들(document.getElementById('bar'), 'stg').length === 1, '단계 이름은 상태바에 그대로 있다');
ctx.__ui.V.말풍선 = '영업';
ctx.draw();
ck(클래스들(회사, 'scenebox').length === 1, '말풍선이 떠도 풍경은 남는다 (겹침)');
ck(클래스들(회사, 'bubble').length === 1, '말풍선도 같이 뜬다');

/* ── 배치판 카드가 영업의 부호 반전을 보여주나 ──
   영업은 평판이 영업과잉선 이상이면 평판을 깎는다. 카드가 늘 '평판+' 로 띄우면
   "평판을 낮추는 버튼은 외주뿐" 으로 읽히고, 실제로 그렇게 플레이했다
   (이어하기 §1-1 관찰 1 — 평판 배출구가 하나로 보이던 진짜 이유) */
console.log('\n[UI] 배치판 카드 — 영업의 평판 부호');
ctx.새게임();
const 과잉선 = ev('설정').영업과잉선;
const 영업글 = 평판 => { ctx.__ui.S.평판 = 평판; return ev('효과글("영업")'); };

const 낮을때 = 영업글(과잉선 - 1);
ck(/평판\s*\+/.test(낮을때), `평판 ${과잉선-1} → 카드에 평판+ (${낮을때})`);
const 높을때 = 영업글(과잉선);
ck(/평판\s*[−-]/.test(높을때), `평판 ${과잉선} → 카드에 평판− (${높을때})`);
ck(낮을때 !== 높을때, '두 상태의 카드 문구가 실제로 다르다');

/* 설정값이 게임에 실제로 반영되나 — 예전엔 +8/−6 이 runQuarter 에 박혀 있어서
   설정을 고치면 화면만 바뀌고 게임은 안 바뀌었다 (2026-09-15 수정) */
const G2 = ctx.window.__game, 영 = ev('설정').업무.영업;
const T1 = G2.newGame(1); T1.평판 = 30; const 전1 = T1.평판;
G2.runQuarter(T1, '영업', () => 0, () => 0.99);
ck(T1.평판 > 전1, `평판 ${전1} 에서 영업을 누르면 평판이 오른다 (→ ${T1.평판})`);
const T2 = G2.newGame(1); T2.평판 = 과잉선 + 5; const 전2 = T2.평판;
G2.runQuarter(T2, '영업', () => 0, () => 0.99);
ck(T2.평판 < 전2, `평판 ${전2} 에서 영업을 누르면 평판이 내린다 (→ ${T2.평판})`);
ck(영.과잉평판 < 0, '설정에 과잉평판이 음수로 들어 있다 (하드코딩이 아니다)');

console.log('\n' + (실패 ? '✗ ' + 실패 + '건 실패' : '전부 통과'));
process.exit(실패 ? 1 : 0);
