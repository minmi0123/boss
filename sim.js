/* ==========================================================================
   사장으로 살아남기 — 시뮬레이터
   실행:  node sim.js

   ★ 이 파일은 게임 로직을 복제하지 않는다.
     index.html 의 <script> 를 vm 으로 그대로 구동한다.
     (앞 게임에서 손으로 복제했다가 두 번 조용히 어긋났음)

   검증 목표
     1. 진행 속도  — 3년(12분기) 안에 직원 11명이 되나
     2. 양극단     — 과열/위험 구간에 실제로 도달하나
     3. 적중률 ★  — 의도한 성향대로 플레이하면 그 유형이 나오나
     4. 분포   ★  — 무작위로 플레이하면 16유형이 골고루 나오나
   ========================================================================== */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ---------------- index.html 구동 ---------------- */
function loadGame() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html 에서 <script> 를 못 찾음');

  const noop = () => {};
  const el = { style:{}, classList:{ add:noop, remove:noop, toggle:noop },
               addEventListener:noop, appendChild:noop, innerHTML:'', textContent:'' };
  const ctx = {
    window: {},
    document: { getElementById:()=>el, querySelector:()=>el, querySelectorAll:()=>[],
                createElement:()=>el, addEventListener:noop, body:el },
    localStorage: { getItem:()=>null, setItem:noop, removeItem:noop },
    console,
  };
  vm.createContext(ctx);
  try { vm.runInContext(m[1], ctx, { filename:'index.html<script>' }); }
  catch (e) { console.error('로직 실행 실패:', e.message); process.exit(1); }

  if (!ctx.window.__game) throw new Error('window.__game 이 없음');
  return ctx.window.__game;
}

/* ---------------- 시드 랜덤 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 성격별 자동 플레이어 ----------------
   성향 = { E, S, T, J }  각 0~1 확률. 1에 가까울수록 그쪽 성향
   ------------------------------------------------------ */
const 업무맵 = { ES:'영업', EN:'마케팅', IN:'개발', IS:'외주' };

function makePlayer(성향, rnd, 인력비율) {
  인력비율 = 인력비율 === undefined ? 0.35 : 인력비율;

  function 슬롯선택(G, S) {
    // 돈이 마이너스면 벌러 간다 (누구나 하는 생존 행동)
    if (S.돈 < 0) return '외주';

    if (rnd() < 인력비율) {
      const r = rnd();
      if (r < 0.50) return '채용';
      if (r < 0.70) return '교육';
      if (r < 0.88) return '휴가';
      return S.직원 > 2 ? '해고' : '채용';
    }
    const e = rnd() < 성향.E ? 'E' : 'I';
    const s = rnd() < 성향.S ? 'S' : 'N';
    return 업무맵[e + s];
  }

  function choose(slot, opts) {
    if (slot === '채용방침') return rnd() < 성향.T ? 0 : 1;
    const jp = (slot === '휴가');
    const want = jp ? (rnd() < 성향.J ? 'J' : 'P')
                    : (rnd() < 성향.T ? 'T' : 'F');
    const cands = [];
    for (let i = 0; i < opts.length; i++) if (opts[i].축 === want) cands.push(i);
    if (!cands.length) return 0;
    return cands[Math.floor(rnd() * cands.length)];
  }

  const 계획수정할까 = () => rnd() > 성향.J;   // J 가 높을수록 안 바꾼다
  return { 슬롯선택, choose, 계획수정할까 };
}

/* ---------------- 한 판 ---------------- */
function run(G, 성향, seed, 분기수, 인력비율) {
  const rnd = mulberry32(seed);
  const P = makePlayer(성향, rnd, 인력비율);
  const S = G.newGame();
  let prevIdx = 0;
  const 추이 = [];

  for (let q = 0; q < 분기수; q++) {
    const slot = P.슬롯선택(G, S);
    const r = G.runQuarter(S, slot, P.choose, rnd);
    if (G.사건발생(rnd)) G.계획수정기록(S, P.계획수정할까());
    const up = G.승급확인(S, prevIdx);
    if (up) prevIdx = G.단계인덱스(S);
    if ((q + 1) % 4 === 0) {
      추이.push({ 년: (q + 1) / 4, 돈: S.돈, 직원: S.직원,
                  평판: S.평판, 분위기: S.분위기, 실력: S.실력, 매출: r.매출 });
    }
  }
  return { S, 추이 };
}

/* ---------------- 16유형 성향 ---------------- */
const 강 = 0.85, 약 = 0.15;
function 성향들() {
  const out = [];
  for (const e of ['E','I']) for (const s of ['S','N'])
  for (const t of ['T','F']) for (const j of ['J','P']) {
    out.push({
      유형: e + s + t + j,
      성향: { E: e==='E'?강:약, S: s==='S'?강:약, T: t==='T'?강:약, J: j==='J'?강:약 },
    });
  }
  return out;
}

/* ==========================================================================
   정합성 검사 — 과거에 터진 결함을 회귀로 고정
   ========================================================================== */
function 정합성검사(G) {
  const fail = [];
  const ck = (cond, msg) => { if (!cond) fail.push(msg); };

  // 1. 계수 구간이 기획표와 일치하나
  ck(G.계수(10)  === 0.5, '계수: 0~20 이 0.5 가 아님');
  ck(G.계수(30)  === 0.8, '계수: 20~40 이 0.8 이 아님');
  ck(G.계수(50)  === 1.0, '계수: 40~75 가 1.0 이 아님');
  ck(G.계수(80)  === 0.9, '계수: 75~90 이 0.9 가 아님');
  ck(G.계수(95)  === 0.7, '계수: 90~100 이 0.7 이 아님');
  ck(G.계수(100) === 0.7, '계수: 100 에서 과열이 안 걸림');

  // 2. 단계 판정이 직원수와 맞나
  const st = n => G.단계({ 직원:n }).이름;
  ck(st(1)==='스타트업' && st(10)==='스타트업', '단계: 1~10 이 스타트업이 아님');
  ck(st(11)==='중소기업' && st(100)==='중소기업', '단계: 11~100 이 중소기업이 아님');
  ck(st(101)==='중견기업' && st(500)==='중견기업', '단계: 101~500 이 중견기업이 아님');
  ck(st(501)==='대기업', '단계: 501~ 이 대기업이 아님');

  // 3. 채용 인원이 최소치 아래로 안 내려가나
  ck(G.채용인원({직원:1}) >= 2, '채용: 최소 2명이 안 됨');
  ck(G.채용인원({직원:100}) === 25, '채용: 비율 계산이 틀림');

  // 4. 대표 혼자일 때 인건비가 0 인가
  const solo = G.newGame();
  ck(G.지출(solo) === solo.직원 * 150, '지출: 대표 혼자인데 인건비가 붙음');

  // 5. 지표가 0~100 을 벗어나지 않나 (장기 플레이)
  const { S } = run(G, {E:.5,S:.5,T:.5,J:.5}, 12345, 200);
  for (const k of ['평판','분위기','실력']) {
    ck(S[k] >= 0 && S[k] <= 100, `지표: ${k} 가 범위를 벗어남 (${S[k]})`);
  }
  ck(S.직원 >= 1, '직원: 1명 미만이 됨');

  // 6. 매출이 음수가 되지 않나
  ck(G.매출(G.newGame(), '영업') >= 0, '매출: 음수가 나옴');

  // 7. 진단이 4글자를 반환하나
  ck(G.diagnose(S).유형.length === 4, '진단: 4글자가 아님');

  return fail;
}

/* ==========================================================================
   실행
   ========================================================================== */
const G = loadGame();
const L = (...a) => console.log(...a);
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n) => String(v).padStart(n);

L('='.repeat(74));
L('  사장으로 살아남기 — 시뮬레이션');
L('='.repeat(74));

/* ---- 0. 정합성 ---- */
const fails = 정합성검사(G);
L('\n[0] 정합성 검사');
if (fails.length === 0) L('    전부 통과 (7종)');
else fails.forEach(f => L('    ✗ ' + f));

/* ---- 1. 진행 속도 : 3년 안에 직원 11명? ---- */
L('\n[1] 진행 속도 — 3년(12분기) 시점');
L('    ' + pad('유형',6) + num('돈',9) + num('직원',6) + num('평판',6)
        + num('분위기',7) + num('실력',6) + '  ' + '승급');
let 승급수 = 0, 직원합 = 0, 파산수 = 0;
const 목록 = 성향들();
for (const t of 목록) {
  const { S } = run(G, t.성향, 1000 + t.유형.charCodeAt(0) * 7, 12);
  const 승급 = S.승급이력.length > 0;
  if (승급) 승급수++;
  if (S.돈 < 0) 파산수++;
  직원합 += S.직원;
  L('    ' + pad(t.유형,6) + num(S.돈,9) + num(S.직원,6) + num(S.평판,6)
          + num(S.분위기,7) + num(S.실력,6) + '  ' + (승급 ? '중소기업' : '—'));
}
L(`    → 3년 내 승급 ${승급수}/16 · 평균 직원 ${(직원합/16).toFixed(1)}명 · 돈 마이너스 ${파산수}/16`);

/* ---- 2. 양극단 페널티가 작동하나 ---- */
L('\n[2] 양극단 — 40분기(10년) 동안 과열/위험 구간에 머문 분기 수');
let 과열합 = 0, 위험합 = 0;
for (const t of 목록) {
  const { S } = run(G, t.성향, 2000 + t.유형.charCodeAt(1) * 13, 40);
  과열합 += S.과열분기; 위험합 += S.위험분기;
}
L(`    과열(90+) 평균 ${(과열합/16).toFixed(1)}분기 / 40`);
L(`    위험(20-) 평균 ${(위험합/16).toFixed(1)}분기 / 40`);
L('    → 둘 다 0 이면 페널티가 죽은 것. 20 이상이면 너무 자주 걸리는 것');

/* ---- 3. 적중률 ★ ---- */
function 적중률(분기수, 인력비율) {
  const SEEDS = 12;
  let 완전일치 = 0, 총판 = 0;
  const 축일치 = { ei:0, sn:0, tf:0, jp:0 };
  const 표본 = { ei:0, sn:0, tf:0, jp:0 };
  const 유보 = { ei:0, sn:0, tf:0, jp:0 };
  const 유형별 = {};

  for (const t of 목록) {
    let hit = 0;
    for (let s = 0; s < SEEDS; s++) {
      const { S } = run(G, t.성향, s * 977 + t.유형.length * 31 + s, 분기수, 인력비율);
      const d = G.diagnose(S);
      총판++;
      if (d.유형 === t.유형) { 완전일치++; hit++; }
      const pairs = [['ei',0],['sn',1],['tf',2],['jp',3]];
      for (const [k, i] of pairs) {
        표본[k] += d[k].표본;
        if (d[k].글자 === '?') 유보[k]++;
        else if (d[k].글자 === t.유형[i]) 축일치[k]++;
      }
    }
    유형별[t.유형] = hit + '/' + SEEDS;
  }
  return { 완전일치, 총판, 축일치, 표본, 유보, 유형별 };
}

L('\n[3] ★ 적중률 — 그 성향대로 플레이하면 그 유형이 나오나  (16유형 × 12시드)');
for (const [label, q] of [['3년(12분기)', 12], ['10년(40분기)', 40]]) {
  const r = 적중률(q);
  L(`\n    ${label}   4글자 완전일치 ${r.완전일치}/${r.총판}  (${(r.완전일치/r.총판*100).toFixed(1)}%)`);
  L('    ' + pad('축',6) + num('일치',6) + num('유보',6) + num('평균표본',10));
  for (const k of ['ei','sn','tf','jp']) {
    const nm = { ei:'E/I', sn:'S/N', tf:'T/F', jp:'J/P' }[k];
    L('    ' + pad(nm,6) + num(`${(r.축일치[k]/r.총판*100).toFixed(0)}%`,6)
            + num(r.유보[k],6) + num((r.표본[k]/r.총판).toFixed(1),10));
  }
  if (q === 12) {
    const 낮은 = Object.entries(r.유형별).filter(([,v]) => +v.split('/')[0] <= 3);
    if (낮은.length) L('    잘 안 나오는 유형: ' + 낮은.map(([k,v])=>`${k}(${v})`).join(' '));
  }
}

/* ---- 4. 분포 ★ ---- */
L('\n[4] ★ 분포 — 아무렇게나 플레이하면 16유형이 골고루 나오나  (중립 성향 400판)');
for (const [label, q] of [['3년', 12], ['10년', 40]]) {
  const cnt = {};
  const N = 400;
  for (let i = 0; i < N; i++) {
    const { S } = run(G, {E:.5,S:.5,T:.5,J:.5}, i * 7919 + 3, q);
    const u = G.diagnose(S).유형;
    cnt[u] = (cnt[u] || 0) + 1;
  }
  const keys = Object.keys(cnt).sort((a,b) => cnt[b] - cnt[a]);
  const 유효 = 목록.map(t => t.유형).filter(u => cnt[u]);
  L(`\n    ${label}  — 나온 유형 ${유효.length}/16 종 (물음표 포함 ${keys.length}종)`);
  let line = '    ';
  keys.slice(0, 10).forEach(k => { line += `${k} ${num((cnt[k]/N*100).toFixed(1),4)}%   `; });
  L(line);
  const 최다 = cnt[keys[0]] / N * 100;
  L(`    최다 유형 비중 ${최다.toFixed(1)}%   (6.25% 가 완전 균등. 20% 넘으면 쏠림)`);
}

L('\n' + '='.repeat(74));
