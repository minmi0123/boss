/* 최소 DOM 셰임 — index.html 의 화면 블록을 브라우저 없이 구동한다.
   이 맥엔 브라우저 자동화가 없고 sim.js 는 로직 블록만 읽으므로,
   화면 전용 버그(과거 const 충돌 2회)를 잡으려면 이게 필요하다 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = '/Users/minji/study/toy/boss';

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
ck(선택박스[0].children.length === 3, '선택지 3개 (실제 ' + (선택박스[0].children.length||0) + ')');
ck(pop.scrollTop === pop.scrollHeight, '팝업이 맨 아래로 따라 내려간다');

const 실력전 = ctx.__ui.S.실력;
선택박스[0].children[0].onclick();          // 「일도 잘하고 참 좋았지」 T · 실력+6
ck(선택박스[0].children.length === 0, '선택하면 선택지가 사라진다');
ck(줄().length === 6, '고른 선택지가 내 말풍선으로 붙는다 (실제 ' + 줄().length + ')');
ck(줄()[5].className === 'ln me', '고른 선택지는 오른쪽 (' + 줄()[5].className + ')');

pump(10);
ck(줄().length === 7, '결과 답장이 붙는다 (실제 ' + 줄().length + ')');
ck(줄()[6].className === 'ln you', '결과화자:후임 → 왼쪽 (' + 줄()[6].className + ')');
ck(텍스트(줄()[6]).some(t => t.includes('서포트')), '결과 문구가 들어 있다');
ck(ctx.__ui.S.실력 === 실력전 + 6, '지표가 실제로 적용된다 (실력 ' + 실력전 + '→' + ctx.__ui.S.실력 + ')');
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

console.log('\n' + (실패 ? '✗ ' + 실패 + '건 실패' : '전부 통과'));
process.exit(실패 ? 1 : 0);
