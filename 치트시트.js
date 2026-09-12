/* ==========================================================================
   MBTI 치트시트 생성기 —  실행:  node 치트시트.js   → 치트시트.md

   ★ 손으로 쓰지 않는다. index.html 과 story.js 를 읽어서 만든다.
     축이나 선택지를 고치면 이 스크립트를 다시 돌려야 문서가 따라온다.
     (문서를 손으로 관리하면 반드시 어긋난다 — 이 프로젝트에서 두 번 겪었다)
   ========================================================================== */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function 로드() {
  const ctx = { window:{}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'story.js'), 'utf8'), ctx, { filename:'story.js' });
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx, { filename:'logic' });
  return { G: ctx.window.__game, 스토리: ctx.window.__story };
}
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const { G, 스토리 } = 로드();
const 업무맵 = { ES:'영업', EN:'마케팅', IN:'개발', IS:'외주' };
const 강 = 0.9, 약 = 0.1;
const 목록 = [];
for (const e of ['E','I']) for (const s of ['S','N'])
for (const t of ['T','F']) for (const j of ['J','P'])
  목록.push({ 유형: e+s+t+j,
              성향: { E: e==='E'?강:약, S: s==='S'?강:약, T: t==='T'?강:약, J: j==='J'?강:약 } });

/* 그 성향대로 48분기를 플레이하고 무엇을 눌렀는지 기록한다 */
function 한판(성향, seed) {
  const rnd = mulberry32(seed);
  const S = G.newGame();
  const p = { E:()=>성향.E, I:()=>1-성향.E, S:()=>성향.S, N:()=>1-성향.S,
              T:()=>성향.T, F:()=>1-성향.T, J:()=>성향.J, P:()=>1-성향.J };
  const choose = (sl, o) => {
    if (sl === '채용방침') return rnd() < 성향.T ? 0 : 1;
    const sc = o.map(x => x.축 ? p[x.축]() * (x.강도 || 1) : 0.5);
    let sum = sc.reduce((a,b)=>a+b,0), r = rnd() * sum;
    for (let i = 0; i < o.length; i++) { r -= sc[i]; if (r <= 0) return i; }
    return 0;
  };
  const 업무 = { 영업:0, 마케팅:0, 개발:0, 외주:0 };
  let 수정 = 0, 유지 = 0;
  for (let q = 0; q < 48; q++) {
    let slot;
    const j = G.승급판정(S);
    const 모자람 = j.항목 && j.항목.some(x => (x.이름==='직원'||x.이름==='매출') && x.현재 < x.필요);
    if (모자람 && G.선택가능(S, '채용').가능) slot = '채용';
    else if (rnd() < 0.25) { const r = rnd();
      const w = r < 0.45 ? '교육' : r < 0.85 ? '휴가' : '해고';
      slot = G.선택가능(S, w).가능 ? w : null; }
    if (!slot) { const e = rnd()<성향.E?'E':'I', sn = rnd()<성향.S?'S':'N';
      slot = 업무맵[e+sn];
      if (!G.선택가능(S, slot).가능) slot = '개발'; }
    if (업무[slot] !== undefined) 업무[slot]++;
    G.runQuarter(S, slot, choose, rnd);
    const ev = G.이벤트뽑기(S, rnd);
    if (ev) { G.이벤트적용(S, ev, choose);
      const 바꿈 = rnd() > 성향.J; G.계획수정기록(S, 바꿈); 바꿈 ? 수정++ : 유지++; }
    G.승급확인(S, S.단계);
  }
  return { 업무, 수정, 유지, 유형: G.diagnose(S).유형 };
}

const 판수 = 40;
const 프로필 = 목록.map(t => {
  const 업 = { 영업:0, 마케팅:0, 개발:0, 외주:0 };
  let 수정 = 0, 유지 = 0, 적중 = 0;
  for (let s = 0; s < 판수; s++) {
    const r = 한판(t.성향, s*977 + t.유형.charCodeAt(0)*31 + t.유형.charCodeAt(3)*7 + s);
    for (const k in 업) 업[k] += r.업무[k];
    수정 += r.수정; 유지 += r.유지;
    if (r.유형 === t.유형) 적중++;
  }
  const 총 = Object.values(업).reduce((a,b)=>a+b,0);
  return { 유형: t.유형, 업: 업, 총,
           수정률: Math.round(수정/(수정+유지)*100),
           적중: Math.round(적중/판수*100) };
});

/* ---------------- 문서 조립 ---------------- */
const L = [];
const 오늘 = new Date().toISOString().slice(0,10);
L.push('---');
L.push('title: 사장으로 살아남기 — MBTI 치트시트');
L.push('category: 게임기획');
L.push('tags: [토이게임, MBTI, 치트시트, 자동생성]');
L.push('summary: 어떤 선택이 어느 축으로 가는지. 16유형이 나오는 플레이 방식');
L.push('created: ' + 오늘);
L.push('updated: ' + 오늘);
L.push('status: 자동 생성 — `node 치트시트.js` 로 갱신');
L.push('---');
L.push('');
L.push('# MBTI 치트시트');
L.push('');
L.push('> **이 파일은 손으로 고치지 않는다.** `index.html` 과 `story.js` 에서 뽑아낸다.');
L.push('> 축이나 선택지를 바꾸면 `node 치트시트.js` 를 다시 돌린다.');
L.push('');
L.push('---');
L.push('');
L.push('## 1. E/I · S/N — 배치판 네 칸이 그대로 두 축이다');
L.push('');
L.push('```');
L.push('           밖으로 (E)        안에서 (I)');
L.push('  지금(S)   영업              외주');
L.push('  나중(N)   마케팅            개발');
L.push('```');
L.push('');
const 슬롯설명 = [];
for (const [nm, w] of Object.entries(G.CFG.업무)) {
  const 효 = [];
  for (const k of ['평판','실력','분위기']) if (w[k]) 효.push(k + (w[k]>0?'+':'') + w[k]);
  슬롯설명.push(`| **${nm}** | ${w.ei} · ${w.sn} | ×${w.배수} | ${효.join(' · ') || '—'} |`);
}
L.push('| 슬롯 | 축 | 매출 배수 | 지표 |');
L.push('|---|---|--:|---|');
L.push(...슬롯설명);
L.push('');
L.push(`> **영업만 예외** — 평판이 ${G.CFG.영업과잉선} 이상이면 +8 이 아니라 −6 이 된다 (무리한 영업).`);
L.push(`> **외주는 평판 ${G.CFG.외주하한평판} 미만이면 잠긴다** — 일감이 안 들어온다.`);
L.push('');
L.push('---');
L.push('');
L.push('## 2. T/F — 이벤트 선택지에서만 갈린다');
L.push('');
/* 글은 문자열 배열이거나 { 화자, 말 } 객체 배열이다 (이벤트1 이 대화형으로 전환됨).
   양쪽을 다 받아야 한다 — 안 그러면 객체를 slice 해서 여기서 터진다 */
const 첫줄 = e => { const x = e.글[0]; return typeof x === 'string' ? x : x.말; };

const tf행 = [];
for (const e of 스토리) {
  const T = e.선택.filter(c => c.축==='T'), F = e.선택.filter(c => c.축==='F');
  if (!T.length && !F.length) continue;
  const 라 = c => c.글 + (c.강도===2 ? ' *(강)*' : c.강도===1 ? ' *(약)*' : '');
  tf행.push(`| ${e.id} | ${첫줄(e).slice(0,22)} | ${T.map(라).join('<br>') || '—'} | ${F.map(라).join('<br>') || '—'} |`);
}
L.push('| # | 상황 | **T** 쪽 | **F** 쪽 |');
L.push('|:-:|---|---|---|');
L.push(...tf행);
L.push('');
L.push('### 트리거 — 인력관리 버튼을 누르면');
L.push('');
L.push('| 버튼 | **T** 쪽 | **F** 쪽 |');
L.push('|---|---|---|');
for (const k of ['채용','해고','교육']) {
  const o = G.트리거[k];
  const 라 = c => c.글 + (c.강도===2 ? ' *(강)*' : c.강도===1 ? ' *(약)*' : '');
  L.push(`| ${k} | ${o.filter(c=>c.축==='T').map(라).join('<br>')} | ${o.filter(c=>c.축==='F').map(라).join('<br>')} |`);
}
L.push('');
L.push('---');
L.push('');
L.push('## 3. J/P — 계획 수정이 주력');
L.push('');
L.push('이벤트가 끝나면 **"계획을 바꾸시겠습니까?"** 가 뜬다. 여기가 제일 큰 측정 지점이다.');
L.push('');
L.push('```');
L.push('  그대로 간다  →  J');
L.push('  다시 짠다    →  P');
L.push('```');
L.push('');
L.push('| 버튼 | **J** 쪽 | **P** 쪽 |');
L.push('|---|---|---|');
{
  const o = G.트리거['휴가'];
  L.push(`| 휴가 트리거 | ${o.filter(c=>c.축==='J').map(c=>c.글).join('<br>')} | ${o.filter(c=>c.축==='P').map(c=>c.글).join('<br>')} |`);
}
for (const e of 스토리) {
  const J = e.선택.filter(c=>c.축==='J'), Pp = e.선택.filter(c=>c.축==='P');
  if (!J.length && !Pp.length) continue;
  const 라 = c => c.글 + (c.강도===2 ? ' *(강)*' : c.강도===1 ? ' *(약)*' : '');
  L.push(`| 이벤트 ${e.id} · ${첫줄(e).slice(0,18)} | ${J.map(라).join('<br>') || '—'} | ${Pp.map(라).join('<br>') || '—'} |`);
}
L.push('');
L.push('---');
L.push('');
L.push('## 4. 16유형별 플레이 프로필');
L.push('');
L.push(`시뮬레이션 실측 — 각 유형 ${판수}판 × 48분기. 그 성향대로 골랐을 때 실제로 무엇을 눌렀나.`);
L.push('');
L.push('| 유형 | 영업 | 마케팅 | 개발 | 외주 | 계획 다시 짬 | 적중률 |');
L.push('|---|--:|--:|--:|--:|--:|--:|');
for (const r of 프로필) {
  const p = k => Math.round(r.업[k]/r.총*100) + '%';
  const 굵 = k => { const v = Math.round(r.업[k]/r.총*100);
                    return v >= 50 ? `**${v}%**` : v + '%'; };
  L.push(`| ${r.유형} | ${굵('영업')} | ${굵('마케팅')} | ${굵('개발')} | ${굵('외주')} | ${r.수정률}% | ${r.적중}% |`);
}
L.push('');
L.push('읽는 법 — **굵은 칸이 그 유형의 지문**이다.');
L.push('E·S 는 영업, E·N 은 마케팅, I·N 은 개발, I·S 는 외주로 몰린다.');
L.push('계획을 다시 짜는 비율이 J 는 10% 안팎, P 는 90% 안팎이다.');
L.push('');
L.push('---');
L.push('');
L.push('## 5. 이벤트는 언제 뜨나');
L.push('');
L.push('**단계에 들어온 뒤 N분기.** 확률이 아니라 고정이다.');
L.push('');
L.push('| 단계 | 이벤트 | 뜨는 시점 |');
L.push('|---|---|---|');
{
  const 단계별 = {};
  for (const e of 스토리) (단계별[e.단계] = 단계별[e.단계] || []).push(e);
  for (const k in 단계별) {
    const 보통 = 단계별[k].filter(e => !e.승급);
    const 승급 = 단계별[k].filter(e => e.승급);
    L.push(`| ${k} | ${보통.map(e=>e.id).join(' · ')} | 진입 +${보통.map(e=>e.진입후).join(' · +')}분기 |`);
    L.push(`| | ${승급.map(e=>e.id).join('')} ★졸업 | 승급 조건을 채우면 |`);
  }
}
L.push('');
L.push('| 승급 조건 | 기간 | 직원 | 분기 매출 |');
L.push('|---|--:|--:|--:|');
{
  const 금 = v => v >= 10000 ? (v/10000).toFixed(0) + '억' : v.toLocaleString() + '만';
  for (let i = 1; i < G.CFG.단계.length; i++) {
    const c = G.CFG.승급조건[i];
    L.push(`| ${G.CFG.단계[i].이름} | 진입 +${c.분기}분기 | ${c.직원}명 | ${금(c.매출)} |`);
  }
}
L.push('');
fs.writeFileSync(path.join(__dirname, '치트시트.md'), L.join('\n'), 'utf8');
console.log('치트시트.md 생성 완료 —', L.length, '줄');
