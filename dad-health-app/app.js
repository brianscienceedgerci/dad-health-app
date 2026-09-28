'use strict';
/* Daily Coach: a private, offline, Noom-style coach. All data stays on the phone (localStorage). */

const KEY = 'coach.v1';
const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];
const COLOR_NAME = { G: 'Green', Y: 'Yellow', R: 'Red' };
const COLOR_TARGET = { G: 0.30, Y: 0.45, R: 0.25 };
const ACTIVITY = [
  { v: 1.2, label: 'Mostly sitting', sub: 'Desk job or retired, little exercise' },
  { v: 1.375, label: 'Lightly active', sub: 'Walks or light activity a few days a week' },
  { v: 1.55, label: 'Active', sub: 'Exercise most days' },
  { v: 1.725, label: 'Very active', sub: 'Hard exercise or a physical job' },
];
const PACE = [
  { v: 0.5, label: '½ lb per week', sub: 'Slow and very easy to stick with' },
  { v: 1, label: '1 lb per week', sub: 'Recommended: steady and sustainable' },
  { v: 1.5, label: '1½ lb per week', sub: 'Faster, takes more effort' },
  { v: 2, label: '2 lb per week', sub: 'Aggressive: check with your doctor' },
];

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString();
const lb1 = n => (Math.round(n * 10) / 10).toString();

/* ---------- Storage ---------- */
const blank = () => ({ profile: null, days: {}, weights: [], customFoods: [], recent: [], lessonsDone: {}, hideInstall: false });
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return blank(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { toast('Could not save. Is the phone\'s storage full?'); }
}
let S = load();

/* ---------- Dates ---------- */
const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
function dayLabel(k) {
  const t = dkey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  return parseKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
const shortDate = k => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/* ---------- Model helpers ---------- */
const peek = k => S.days[k] || { foods: [], water: 0, steps: 0 };
const day = k => (S.days[k] ||= { foods: [], water: 0, steps: 0 });
const itemCal = f => Math.round(f.c * f.q);
const eatenCal = d => d.foods.reduce((a, f) => a + itemCal(f), 0);
function colorCal(d) {
  const out = { G: 0, Y: 0, R: 0 };
  d.foods.forEach(f => { out[f.col] += itemCal(f); });
  return out;
}
const sortedWeights = () => [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
function weightOn(k) {
  // Most recent weight on or before date k.
  const w = sortedWeights().filter(x => x.date <= k);
  return w.length ? w[w.length - 1].lb : S.profile.startWeight;
}
const currentWeight = () => { const w = sortedWeights(); return w.length ? w[w.length - 1].lb : S.profile.startWeight; };

function calcBudget(p, lb) {
  const kg = lb * 0.45359, cm = p.heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'm' ? 5 : -161);
  const tdee = bmr * p.activity;
  const deficit = lb > p.goalWeight ? p.pace * 500 : 0;
  const floor = p.sex === 'm' ? 1500 : 1200;
  return Math.max(floor, Math.round((tdee - deficit) / 10) * 10);
}
const budget = (k = dkey()) => calcBudget(S.profile, weightOn(k));

function goalDate(p, fromLb) {
  const toGo = fromLb - p.goalWeight;
  if (toGo <= 0) return null;
  const d = new Date(); d.setDate(d.getDate() + Math.ceil(toGo / p.pace * 7));
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
function streak() {
  let k = dkey(), n = 0;
  if (!peek(k).foods.length) k = addDays(k, -1);
  while (peek(k).foods.length) { n++; k = addDays(k, -1); }
  return n;
}
const nextLessonIndex = () => { const i = LESSONS.findIndex((_, j) => !S.lessonsDone[j]); return i < 0 ? null : i; };
const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- UI state ---------- */
const UI = { tab: 'today', date: dkey(), onb: null, sheet: null };
const app = $('#app'), tabs = $('#tabs'), sheet = $('#sheet'), sheetBg = $('#sheetBg');

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// Copy values from inputs marked data-bind="key" into an object before re-rendering.
function capture(obj, root = document) {
  root.querySelectorAll('[data-bind]').forEach(el => { obj[el.dataset.bind] = el.value; });
}

/* ---------- Icons ---------- */
const ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 21V5"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

/* ---------- Render root ---------- */
function render() {
  if (!S.profile) { tabs.hidden = true; app.innerHTML = viewOnboarding(); return; }
  tabs.hidden = false;
  tabs.innerHTML = [['today', 'Today'], ['progress', 'Progress'], ['learn', 'Learn'], ['me', 'Me']]
    .map(([t, l]) => `<button data-a="tab" data-t="${t}" class="${UI.tab === t ? 'on' : ''}" aria-label="${l}">${ICON[t]}${l}</button>`).join('');
  app.innerHTML = { today: viewToday, progress: viewProgress, learn: viewLearn, me: viewMe }[UI.tab]();
}

/* ---------- Onboarding ---------- */
const ONB_STEPS = ['welcome', 'name', 'basics', 'height', 'weight', 'goal', 'activity', 'pace', 'summary'];
function onbProfile(d) {
  return { name: d.name.trim(), sex: d.sex, age: +d.age, heightIn: (+d.ft) * 12 + (+d.inch || 0),
    startWeight: +d.weight, goalWeight: +d.goal, activity: +d.activity, pace: +d.pace, waterGoal: 8, stepGoal: 6000 };
}
function viewOnboarding() {
  const o = UI.onb ||= { step: 0, d: { name: '', sex: 'm', age: '', ft: '', inch: '', weight: '', goal: '', activity: 1.2, pace: 1 } };
  const d = o.d, step = ONB_STEPS[o.step];
  const pct = Math.round(o.step / (ONB_STEPS.length - 1) * 100);
  let body = '';
  if (step === 'welcome') {
    const installFirst = isIOS() && !isStandalone();
    body = `<div class="hero"><img src="icons/icon-180.png" alt=""><h1 style="margin-top:18px">Daily Coach</h1>
      <p class="muted">Your personal coach for losing weight and building healthy habits, one small step at a time.</p></div>
      ${installFirst ? `<div class="banner"><b>Add this to your home screen first</b><p class="small" style="margin:6px 0 0">
      Tap the <b>Share</b> button in Safari (the square with an arrow), then <b>Add to Home Screen</b>. Open Coach from the new icon and set it up there.
      Your data stays with the home-screen app.</p></div>` : ''}
      <div class="card"><div class="stack">
        <div class="row"><span class="dot G"></span><span>Know exactly how much to eat each day</span></div>
        <div class="row"><span class="dot Y"></span><span>Log food in a few taps using the color system</span></div>
        <div class="row"><span class="dot R"></span><span>A short lesson each day to build lasting habits</span></div>
      </div></div>`;
  } else if (step === 'name') {
    body = `<h1>What should I call you?</h1><p class="muted">Your first name or a nickname.</p>
      <input type="text" data-bind="name" value="${esc(d.name)}" placeholder="First name" autocomplete="given-name" autocapitalize="words">`;
  } else if (step === 'basics') {
    body = `<h1>A little about you</h1><p class="muted">This sets your daily calorie budget.</p>
      <div class="section-title">Sex</div><div class="chips">
        <button class="chip ${d.sex === 'm' ? 'on' : ''}" data-a="onbSet" data-k="sex" data-v="m">Male</button>
        <button class="chip ${d.sex === 'f' ? 'on' : ''}" data-a="onbSet" data-k="sex" data-v="f">Female</button></div>
      <div class="section-title">Age</div>
      <input type="number" inputmode="numeric" data-bind="age" value="${esc(d.age)}" placeholder="Age in years">`;
  } else if (step === 'height') {
    body = `<h1>How tall are you?</h1>
      <div class="row" style="margin-top:16px">
        <label class="field grow"><span>Feet</span><input type="number" inputmode="numeric" data-bind="ft" value="${esc(d.ft)}" placeholder="5"></label>
        <label class="field grow"><span>Inches</span><input type="number" inputmode="numeric" data-bind="inch" value="${esc(d.inch)}" placeholder="10"></label>
      </div>`;
  } else if (step === 'weight') {
    body = `<h1>What do you weigh today?</h1><p class="muted">In pounds. A rough number is fine. You can update it anytime.</p>
      <input type="number" inputmode="decimal" data-bind="weight" value="${esc(d.weight)}" placeholder="Pounds">`;
  } else if (step === 'goal') {
    const w = +d.weight, hIn = (+d.ft) * 12 + (+d.inch || 0);
    const healthyTop = hIn ? Math.round(24.9 * hIn * hIn / 703) : null;
    body = `<h1>What's your goal weight?</h1>
      <p class="muted">Losing just 5–10% of your body weight${w ? ` (${Math.round(w * 0.05)}–${Math.round(w * 0.1)} lb)` : ''} brings real health benefits.
      ${healthyTop ? `For your height, a healthy-range weight is ${healthyTop} lb or less.` : ''}</p>
      <input type="number" inputmode="decimal" data-bind="goal" value="${esc(d.goal)}" placeholder="Goal in pounds">`;
  } else if (step === 'activity') {
    body = `<h1>How active are you?</h1><p class="muted">Not counting any new exercise you're planning.</p>` +
      ACTIVITY.map(a => `<button class="choice ${+d.activity === a.v ? 'on' : ''}" data-a="onbSet" data-k="activity" data-v="${a.v}"><b>${a.label}</b><span class="muted small">${a.sub}</span></button>`).join('');
  } else if (step === 'pace') {
    body = `<h1>How fast do you want to go?</h1><p class="muted">Slower is easier to stick with, and easier to keep off.</p>` +
      PACE.map(a => `<button class="choice ${+d.pace === a.v ? 'on' : ''}" data-a="onbSet" data-k="pace" data-v="${a.v}"><b>${a.label}</b><span class="muted small">${a.sub}</span></button>`).join('');
  } else if (step === 'summary') {
    const p = onbProfile(d), b = calcBudget(p, p.startWeight), gd = goalDate(p, p.startWeight);
    body = `<h1>Your plan, ${esc(p.name)}</h1>
      <div class="card" style="text-align:center;margin-top:16px"><div class="muted">Daily calorie budget</div>
        <div style="font-size:52px;font-weight:800;color:var(--brand);line-height:1.1">${fmt(b)}</div>
        ${gd ? `<p style="margin-top:8px">At ${lb1(p.pace)} lb a week you could reach <b>${lb1(p.goalWeight)} lb</b> around <b>${gd}</b>.</p>` : '<p>This budget will help you maintain your weight.</p>'}
      </div>
      <div class="card"><h3>How to use it</h3><div class="stack" style="margin-top:10px">
        <p>1. Log what you eat. Aim to stay under your budget.</p>
        <p>2. Try for mostly <b style="color:var(--green)">green</b> and <b style="color:var(--yellow)">yellow</b> foods.</p>
        <p>3. Weigh in once or twice a week, in the morning.</p>
        <p style="margin:0">4. Read one short lesson a day.</p></div></div>
      <p class="muted small">This app is a helpful guide, not medical advice. Check with your doctor before big changes to diet or exercise.</p>`;
  }
  const last = o.step === ONB_STEPS.length - 1;
  return `<div class="onboard">
    ${o.step ? `<div class="progressbar"><span style="width:${pct}%"></span></div>` : ''}
    <div class="body">${body}</div>
    <div class="stack" style="padding-top:20px">
      <button class="btn" data-a="onbNext">${o.step === 0 ? 'Get started' : last ? 'Start my plan' : 'Next'}</button>
      ${o.step ? '<button class="btn ghost" data-a="onbBack">Back</button>' : ''}
    </div></div>`;
}
function onbValidate() {
  const d = UI.onb.d, step = ONB_STEPS[UI.onb.step];
  if (step === 'name' && !d.name.trim()) return 'Please enter a name.';
  if (step === 'basics' && !(+d.age >= 18 && +d.age <= 110)) return 'Please enter an age between 18 and 110.';
  if (step === 'height' && !(+d.ft >= 4 && +d.ft <= 7 && (+d.inch || 0) >= 0 && (+d.inch || 0) < 12)) return 'Please enter feet (4–7) and inches (0–11).';
  if (step === 'weight' && !(+d.weight >= 80 && +d.weight <= 700)) return 'Please enter your weight in pounds.';
  if (step === 'goal' && !(+d.goal >= 80 && +d.goal <= 700)) return 'Please enter a goal weight in pounds.';
  return null;
}

/* ---------- Today ---------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
function coachLine(d, b, eaten) {
  const cc = colorCal(d);
  if (!d.foods.length) return UI.date === dkey() ? 'Let\'s start the day. Log your first meal when you eat it.' : 'Nothing logged for this day yet.';
  if (eaten > b + 150) return 'A little over today. That\'s okay. One day doesn\'t undo your progress. Get back on track at the next meal.';
  if (cc.R > b * COLOR_TARGET.R) return 'You\'re into your red foods for today. Try green foods to fill up the rest of the day.';
  if (cc.G >= eaten * 0.3) return 'Nice balance of green foods today. That\'s what keeps you full.';
  return 'You\'re on track. Adding more green foods (vegetables, fruit, soup) will help you feel full.';
}
function viewToday() {
  const p = S.profile, k = UI.date, d = peek(k), b = budget(k), eaten = eatenCal(d), left = b - eaten;
  const isToday = k === dkey();
  const R = 64, C = 2 * Math.PI * R, frac = Math.min(1, eaten / b);
  const cc = colorCal(d);
  const lastW = sortedWeights().slice(-1)[0];
  const needWeigh = !lastW || daysBetween(lastW.date, dkey()) >= 7;
  const li = nextLessonIndex();
  const tip = TIPS[daysBetween('2024-01-01', k) % TIPS.length];
  const showInstall = isIOS() && !isStandalone() && !S.hideInstall;

  const meals = MEALS.map(m => {
    const items = d.foods.map((f, i) => ({ f, i })).filter(x => x.f.m === m);
    const tot = items.reduce((a, x) => a + itemCal(x.f), 0);
    return `<div class="card"><div class="meal-head"><h3>${m}</h3><span class="muted">${tot ? fmt(tot) + ' cal' : ''}</span></div>
      ${items.map(({ f, i }) => `<div class="item"><span class="dot ${f.col}"></span><div class="grow"><div class="name">${esc(f.n)}</div>
        ${f.s ? `<div class="muted small">${f.q !== 1 ? lb1(f.q) + ' × ' : ''}${esc(f.s)}</div>` : ''}</div><b>${fmt(itemCal(f))}</b>
        <button class="del" data-a="delFood" data-i="${i}" aria-label="Remove ${esc(f.n)}">×</button></div>`).join('')}
      <button class="btn secondary sm add-food" style="width:100%" data-a="addFood" data-meal="${m}">+ Add ${m === 'Snacks' ? 'a snack' : m.toLowerCase()}</button></div>`;
  }).join('');

  return `
  ${showInstall ? `<div class="banner row"><div class="grow small"><b>Install as an app:</b> tap Share, then “Add to Home Screen.”</div><button class="close" data-a="hideInstall" aria-label="Dismiss">×</button></div>` : ''}
  <div class="datenav">
    <button class="icon-btn" data-a="dayPrev" aria-label="Previous day">‹</button>
    <button class="label" data-a="dayToday" style="border:none;background:none">${dayLabel(k)}</button>
    <button class="icon-btn" data-a="dayNext" aria-label="Next day" ${isToday ? 'disabled style="opacity:.3"' : ''}>›</button>
  </div>
  ${isToday ? `<h1>${greeting()}, ${esc(p.name)}</h1>` : ''}
  <p class="muted">${coachLine(d, b, eaten)}</p>

  <div class="card">
    <div class="ringwrap">
      <div class="ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--line)" stroke-width="14"/>
        <circle cx="75" cy="75" r="${R}" fill="none" stroke="${left < 0 ? 'var(--red)' : 'var(--brand)'}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
        <div class="center"><div class="big" style="${left < 0 ? 'color:var(--red)' : ''}">${fmt(Math.abs(left))}</div><div class="small muted">${left < 0 ? 'over' : 'left'}</div></div></div>
      <div class="stack"><div class="stat"><b>${fmt(b)}</b>budget</div><div class="stat"><b>${fmt(eaten)}</b>eaten</div></div>
    </div>
    <div class="mix">${['G', 'Y', 'R'].map(c => `<span style="width:${eaten ? cc[c] / Math.max(eaten, b) * 100 : 0}%;background:var(--${{ G: 'green', Y: 'yellow', R: 'red' }[c]})"></span>`).join('')}</div>
    <div class="pills">${['G', 'Y', 'R'].map(c => `<div class="pill ${c}"><b>${fmt(cc[c])}</b>${COLOR_NAME[c]} · aim ${fmt(b * COLOR_TARGET[c])}</div>`).join('')}</div>
  </div>

  ${meals}

  <div class="card"><div class="row between"><h3>Water</h3><span class="muted">${d.water} of ${p.waterGoal} glasses</span></div>
    <div class="glasses">${Array.from({ length: Math.max(p.waterGoal, d.water) }, (_, i) => `<button class="glass ${i < d.water ? 'full' : ''}" data-a="water" data-n="${i}" aria-label="Glass ${i + 1}"></button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn secondary sm grow" data-a="waterAdd" data-n="-1">− Glass</button><button class="btn secondary sm grow" data-a="waterAdd" data-n="1">+ Glass</button></div>
  </div>

  <div class="card"><div class="row between"><div><h3>Steps</h3><div class="muted">${d.steps ? fmt(d.steps) : 'Not entered'} · goal ${fmt(p.stepGoal)}</div></div>
    <button class="btn secondary sm" data-a="stepsSheet">Enter</button></div>
    ${d.steps ? `<div class="mix" style="margin-bottom:0"><span style="width:${Math.min(100, d.steps / p.stepGoal * 100)}%;background:var(--green)"></span></div>` : ''}
  </div>

  <div class="card"><div class="row between"><div><h3>Weight</h3><div class="muted">${lastW ? `${lb1(lastW.lb)} lb · ${dayLabel(lastW.date)}` : 'No weigh-ins yet'}</div></div>
    <button class="btn ${needWeigh ? '' : 'secondary'} sm" data-a="weighSheet">Weigh in</button></div></div>

  ${li !== null ? `<button class="card lesson-row" style="border:2px solid var(--brand)" data-a="openLesson" data-i="${li}">
    <span class="num">${li + 1}</span><span class="grow"><span class="muted small">Today's lesson · 2 min</span><br><b>${esc(LESSONS[li].title)}</b></span><span style="font-size:26px">›</span></button>` : ''}

  <div class="card"><div class="muted small" style="font-weight:700">TIP OF THE DAY</div><p style="margin:4px 0 0">${esc(tip)}</p></div>`;
}

/* ---------- Progress ---------- */
function weightChart() {
  const w = sortedWeights(), p = S.profile;
  if (w.length < 2) return '<p class="muted">Your weight chart will appear after your second weigh-in.</p>';
  const W = 340, H = 190, pl = 34, pr = 10, pt = 12, pb = 24;
  const t0 = parseKey(w[0].date), t1 = parseKey(w[w.length - 1].date), span = Math.max(1, t1 - t0);
  const lo = Math.floor(Math.min(p.goalWeight, ...w.map(x => x.lb)) - 2), hi = Math.ceil(Math.max(...w.map(x => x.lb)) + 2);
  const X = k => pl + (parseKey(k) - t0) / span * (W - pl - pr), Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const pts = w.map(x => `${X(x.date).toFixed(1)},${Y(x.lb).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time">
    <line x1="${pl}" x2="${W - pr}" y1="${Y(p.goalWeight)}" y2="${Y(p.goalWeight)}" stroke="var(--green)" stroke-width="2" stroke-dasharray="6 5"/>
    <text x="${W - pr}" y="${Y(p.goalWeight) - 5}" text-anchor="end">goal ${lb1(p.goalWeight)}</text>
    <text x="${pl - 6}" y="${Y(hi) + 10}" text-anchor="end">${hi}</text><text x="${pl - 6}" y="${Y(lo)}" text-anchor="end">${lo}</text>
    <polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${w.map(x => `<circle cx="${X(x.date)}" cy="${Y(x.lb)}" r="4" fill="var(--brand)"/>`).join('')}
    <text x="${pl}" y="${H - 4}">${shortDate(w[0].date)}</text><text x="${W - pr}" y="${H - 4}" text-anchor="end">${shortDate(w[w.length - 1].date)}</text>
  </svg>`;
}
function weekBars() {
  const W = 340, H = 150, pb = 22, today = dkey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const vals = days.map(k => eatenCal(peek(k))), b = budget();
  const max = Math.max(b * 1.25, ...vals), bw = 30, gap = (W - bw * 7) / 8;
  const Y = v => (H - pb) - v / max * (H - pb - 6);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories eaten each day this week">
    ${days.map((k, i) => { const x = gap + i * (bw + gap), v = vals[i];
      return `<rect x="${x}" y="${Y(v)}" width="${bw}" height="${(H - pb) - Y(v)}" rx="5" fill="${v > b ? 'var(--red)' : 'var(--brand)'}" opacity="${v ? 1 : 0}"/>
      <text x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${parseKey(k).toLocaleDateString(undefined, { weekday: 'narrow' })}</text>`; }).join('')}
    <line x1="0" x2="${W}" y1="${Y(b)}" y2="${Y(b)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="5 5"/>
  </svg>`;
}
function viewProgress() {
  const p = S.profile, now = currentWeight(), lost = p.startWeight - now, toGo = now - p.goalWeight;
  const gd = goalDate(p, now);
  const today = dkey(), logged = Array.from({ length: 7 }, (_, i) => peek(addDays(today, -i))).filter(d => d.foods.length);
  const avg = logged.length ? logged.reduce((a, d) => a + eatenCal(d), 0) / logged.length : 0;
  const mix = { G: 0, Y: 0, R: 0 }; logged.forEach(d => { const c = colorCal(d); mix.G += c.G; mix.Y += c.Y; mix.R += c.R; });
  const mixTot = mix.G + mix.Y + mix.R;
  const st = streak(), lessonsDone = Object.keys(S.lessonsDone).length;
  return `<h1>Progress</h1><p class="muted">${lost > 0 ? `You've lost ${lb1(lost)} lb. Keep it up!` : 'Every journey starts with the first step.'}</p>
  <div class="stats" style="margin:14px 0">
    <div class="card"><div class="muted small">Started</div><div class="v">${lb1(p.startWeight)}</div></div>
    <div class="card"><div class="muted small">Now</div><div class="v">${lb1(now)}</div></div>
    <div class="card"><div class="muted small">Lost</div><div class="v" style="color:var(--green)">${lost > 0 ? lb1(lost) : 0}</div></div>
    <div class="card"><div class="muted small">To go</div><div class="v">${toGo > 0 ? lb1(toGo) : '🎉'}</div></div>
  </div>
  <div class="card chart"><div class="row between"><h2 style="margin:0">Weight</h2><button class="btn secondary sm" data-a="weighSheet">Weigh in</button></div>
    <div style="margin-top:10px">${weightChart()}</div>
    ${gd ? `<p class="small muted" style="margin:8px 0 0">At ${lb1(p.pace)} lb/week, you'll reach ${lb1(p.goalWeight)} lb around <b>${gd}</b>.</p>` : toGo <= 0 ? '<p style="margin:8px 0 0"><b>You reached your goal!</b> Set a new one on the Me tab, or keep maintaining.</p>' : ''}
    ${S.weights.length ? '<button class="btn ghost sm" style="width:100%;margin-top:12px" data-a="weightList">See all weigh-ins</button>' : ''}
  </div>
  <div class="card chart"><h2>This week</h2>${weekBars()}
    <p class="small muted" style="margin:8px 0 0">${logged.length ? `Average ${fmt(avg)} cal on ${logged.length} logged day${logged.length > 1 ? 's' : ''}. The dashed line is your budget.` : 'Log some meals to see your week.'}</p>
    ${mixTot ? `<div class="mix">${['G', 'Y', 'R'].map(c => `<span style="width:${mix[c] / mixTot * 100}%;background:var(--${{ G: 'green', Y: 'yellow', R: 'red' }[c]})"></span>`).join('')}</div>
    <div class="pills">${['G', 'Y', 'R'].map(c => `<div class="pill ${c}"><b>${Math.round(mix[c] / mixTot * 100)}%</b>${COLOR_NAME[c]} · aim ${COLOR_TARGET[c] * 100}%</div>`).join('')}</div>` : ''}
  </div>
  <div class="stats">
    <div class="card"><div class="muted small">Logging streak</div><div class="v">${st} 🔥</div><div class="small muted">day${st === 1 ? '' : 's'}</div></div>
    <div class="card"><div class="muted small">Lessons done</div><div class="v">${lessonsDone}</div><div class="small muted">of ${LESSONS.length}</div></div>
  </div>`;
}

/* ---------- Learn ---------- */
function viewLearn() {
  const li = nextLessonIndex();
  return `<h1>Learn</h1><p class="muted">One short lesson a day. Small ideas, big results.</p>
  ${li !== null ? `<div class="card" style="border:2px solid var(--brand)"><div class="muted small">UP NEXT · LESSON ${li + 1}</div><h2 style="margin:4px 0 12px">${esc(LESSONS[li].title)}</h2>
    <button class="btn" data-a="openLesson" data-i="${li}">Start lesson</button></div>`
    : '<div class="card"><h2>All lessons complete! 🎉</h2><p style="margin:0">You can reread any lesson below.</p></div>'}
  <div class="section-title">All lessons</div>
  ${LESSONS.map((l, i) => `<button class="lesson-row" data-a="openLesson" data-i="${i}"><span class="num ${S.lessonsDone[i] ? 'done' : ''}">${S.lessonsDone[i] ? '✓' : i + 1}</span>
    <span class="grow"><b>${esc(l.title)}</b></span><span style="font-size:24px" class="muted">›</span></button>`).join('')}`;
}

/* ---------- Me ---------- */
function viewMe() {
  const p = S.profile, act = ACTIVITY.find(a => a.v === p.activity) || ACTIVITY[0];
  return `<h1>${esc(p.name)}</h1><p class="muted">Your plan and settings</p>
  <div class="card"><div class="stack">
    <div class="row between"><span class="muted">Daily budget</span><b>${fmt(budget())} cal</b></div>
    <div class="row between"><span class="muted">Goal weight</span><b>${lb1(p.goalWeight)} lb</b></div>
    <div class="row between"><span class="muted">Pace</span><b>${lb1(p.pace)} lb/week</b></div>
    <div class="row between"><span class="muted">Activity</span><b>${act.label}</b></div>
    <div class="row between"><span class="muted">Height · Age</span><b>${Math.floor(p.heightIn / 12)}′${p.heightIn % 12}″ · ${p.age}</b></div>
    <div class="row between"><span class="muted">Water · Steps goal</span><b>${p.waterGoal} · ${fmt(p.stepGoal)}</b></div>
  </div><button class="btn secondary" style="margin-top:14px" data-a="editSheet">Change my plan</button></div>
  <p class="small muted">Your budget updates automatically as your weight changes.</p>

  <div class="section-title">Your data</div>
  <div class="card"><p class="small">Everything is stored only on this phone. Save a backup now and then, and email or text it to yourself or family.</p>
    <div class="stack"><button class="btn secondary" data-a="backup">Save a backup</button>
    <label class="btn ghost" style="cursor:pointer">Restore from a backup<input type="file" accept=".json,application/json" id="restoreFile" hidden></label></div></div>

  <div class="section-title">Help</div>
  <div class="card stack">
    <button class="btn ghost" data-a="helpSheet">How the color system works</button>
    <button class="btn ghost" data-a="installSheet">Install on iPhone</button>
  </div>
  <button class="btn danger" data-a="reset" style="margin-top:14px">Erase everything and start over</button>
  <p class="small muted" style="margin-top:14px">Daily Coach is a guide, not medical advice. Check with your doctor about diet and exercise changes.</p>`;
}

/* ---------- Sheets ---------- */
function openSheet(s) { UI.sheet = s; renderSheet(); sheet.classList.add('open'); sheetBg.classList.add('open'); sheet.scrollTop = 0; }
function closeSheet() { UI.sheet = null; sheet.classList.remove('open'); sheetBg.classList.remove('open'); sheet.innerHTML = ''; }
const head = t => `<div class="grab"></div><div class="sheet-head"><h2 style="margin:0">${t}</h2><button class="close" data-a="close" aria-label="Close">×</button></div>`;

function allFoods() { return [...S.customFoods, ...FOODS]; }
function foodRow(f) {
  return `<button class="food-row" data-a="pick" data-id="${esc(f.id)}"><span class="dot ${f.color}"></span>
    <span class="grow"><span class="name">${esc(f.name)}</span><br><span class="muted small">${esc(f.serving)}</span></span><b>${fmt(f.cal)}</b></button>`;
}
function logResults(q) {
  q = q.trim().toLowerCase();
  if (q) {
    const words = q.split(/\s+/);
    const hits = allFoods().filter(f => words.every(w => f.name.toLowerCase().includes(w)));
    return (hits.length ? hits.slice(0, 60).map(foodRow).join('') : `<p class="muted">No match for “${esc(q)}”.</p>`) +
      `<button class="btn secondary" data-a="customSheet" data-name="${esc(q)}" style="margin-top:8px">+ Create “${esc(q)}” as my own food</button>`;
  }
  const recent = S.recent.slice(0, 12);
  const byName = [...allFoods()].sort((a, b) => a.name.localeCompare(b.name));
  return `${recent.length ? `<div class="section-title">Recent</div>${recent.map(foodRow).join('')}` : ''}
    <div class="section-title">All foods</div>${byName.map(foodRow).join('')}`;
}
function renderSheet() {
  const s = UI.sheet; if (!s) return;
  let h = '';
  if (s.type === 'log') {
    h = head(`Add to ${s.meal}`) + `<input type="search" id="q" placeholder="Search foods…" value="${esc(s.q)}" autocomplete="off">
      <div class="row" style="margin:10px 0"><button class="btn secondary sm grow" data-a="quickSheet">Quick add calories</button><button class="btn secondary sm grow" data-a="customSheet">New food</button></div>
      <div id="results">${logResults(s.q)}</div>`;
  } else if (s.type === 'portion') {
    const f = s.food, total = Math.round(f.cal * s.qty);
    h = head(esc(f.name)) + `<div class="row"><span class="dot ${f.color}"></span><span>${COLOR_NAME[f.color]} food · ${fmt(f.cal)} cal per ${esc(f.serving)}</span></div>
      <div class="section-title">How much?</div>
      <div class="stepper"><button class="icon-btn" data-a="qty" data-n="-0.5" aria-label="Less">−</button>
        <div class="val">${lb1(s.qty)}</div><button class="icon-btn" data-a="qty" data-n="0.5" aria-label="More">+</button></div>
      <p class="muted" style="text-align:center">${lb1(s.qty)} × ${esc(f.serving)} = <b style="color:var(--ink)">${fmt(total)} cal</b></p>
      <div class="section-title">Meal</div><div class="chips">${MEALS.map(m => `<button class="chip ${s.meal === m ? 'on' : ''}" data-a="setMeal" data-m="${m}">${m}</button>`).join('')}</div>
      <div class="stack" style="margin-top:20px"><button class="btn" data-a="logIt">Add ${fmt(total)} calories</button>
      <button class="btn ghost" data-a="backToLog">Back</button></div>`;
  } else if (s.type === 'quick' || s.type === 'custom') {
    const f = s.form, custom = s.type === 'custom';
    h = head(custom ? 'New food' : 'Quick add') +
      `<label class="field"><span>Name${custom ? '' : ' (optional)'}</span><input type="text" data-bind="name" value="${esc(f.name)}" placeholder="e.g. Mom's lasagna" autocapitalize="sentences"></label>
      ${custom ? `<label class="field"><span>Serving size</span><input type="text" data-bind="serving" value="${esc(f.serving)}" placeholder="e.g. 1 cup, 1 piece"></label>` : ''}
      <label class="field"><span>Calories${custom ? ' per serving' : ''}</span><input type="number" inputmode="numeric" data-bind="cal" value="${esc(f.cal)}" placeholder="Calories"></label>
      <div class="section-title">Color</div>
      <div class="stack">${['G', 'Y', 'R'].map(c => `<button class="choice ${f.color === c ? 'on' : ''}" data-a="setColor" data-c="${c}"><span class="row"><span class="dot ${c}"></span><b>${COLOR_NAME[c]}</b></span>
        <span class="muted small">${{ G: 'Vegetables, fruit, broth soups, skim milk, plain yogurt', Y: 'Lean meat, fish, eggs, grains, beans, most meals', R: 'Cheese, nuts, oils, sweets, fried and processed food' }[c]}</span></button>`).join('')}</div>
      <div class="section-title">Meal</div><div class="chips">${MEALS.map(m => `<button class="chip ${s.meal === m ? 'on' : ''}" data-a="setMeal" data-m="${m}">${m}</button>`).join('')}</div>
      <div class="stack" style="margin-top:20px"><button class="btn" data-a="${custom ? 'saveCustom' : 'saveQuick'}">${custom ? 'Save and add' : 'Add'}</button>
      <button class="btn ghost" data-a="backToLog">Back</button></div>`;
  } else if (s.type === 'steps') {
    h = head('Steps') + `<p class="muted">Open the <b>Health</b> app on your iPhone, check today's steps, and type the number here.</p>
      <input type="number" inputmode="numeric" data-bind="v" value="${esc(s.form.v)}" placeholder="Steps" id="focusMe">
      <button class="btn" style="margin-top:16px" data-a="saveSteps">Save</button>`;
  } else if (s.type === 'weigh') {
    h = head('Weigh in') + `<p class="muted">For ${dayLabel(UI.date).toLowerCase() === 'today' ? 'today' : dayLabel(UI.date)}. Best done in the morning, before eating.</p>
      <input type="number" inputmode="decimal" step="0.1" data-bind="v" value="${esc(s.form.v)}" placeholder="Pounds" id="focusMe">
      <button class="btn" style="margin-top:16px" data-a="saveWeight">Save</button>`;
  } else if (s.type === 'weights') {
    const w = sortedWeights().reverse();
    h = head('All weigh-ins') + w.map(x => `<div class="item"><div class="grow"><b>${lb1(x.lb)} lb</b><div class="muted small">${dayLabel(x.date)}</div></div>
      <button class="del" data-a="delWeight" data-d="${x.date}" aria-label="Delete">×</button></div>`).join('');
  } else if (s.type === 'lesson') {
    const l = LESSONS[s.i], q = l.quiz, ans = s.answer;
    h = head(`Lesson ${s.i + 1}`) + `<h1 style="margin-bottom:14px">${esc(l.title)}</h1><div class="lesson-body">${l.body.map(p => `<p>${esc(p)}</p>`).join('')}</div>
      <div class="card"><div class="muted small" style="font-weight:700">QUICK CHECK</div><p style="font-weight:600;margin-top:6px">${esc(q.q)}</p>
      ${q.options.map((o, j) => `<button class="quiz-opt ${ans != null ? (j === q.answer ? 'right' : j === ans ? 'wrong' : '') : ''}" data-a="quiz" data-o="${j}">${esc(o)}</button>`).join('')}
      ${ans != null ? `<p style="margin:6px 0 0"><b>${ans === q.answer ? 'Correct!' : 'Not quite.'}</b> ${esc(q.why)}</p>` : ''}</div>
      <button class="btn" data-a="lessonDone">${S.lessonsDone[s.i] ? 'Done' : 'Mark as complete'}</button>`;
  } else if (s.type === 'edit') {
    const f = s.form;
    h = head('Change my plan') + `
      <label class="field"><span>Name</span><input type="text" data-bind="name" value="${esc(f.name)}"></label>
      <div class="row"><label class="field grow"><span>Age</span><input type="number" inputmode="numeric" data-bind="age" value="${esc(f.age)}"></label>
        <label class="field grow"><span>Sex</span><select data-bind="sex"><option value="m" ${f.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${f.sex === 'f' ? 'selected' : ''}>Female</option></select></label></div>
      <div class="row"><label class="field grow"><span>Height (ft)</span><input type="number" inputmode="numeric" data-bind="ft" value="${esc(f.ft)}"></label>
        <label class="field grow"><span>Inches</span><input type="number" inputmode="numeric" data-bind="inch" value="${esc(f.inch)}"></label></div>
      <label class="field"><span>Goal weight (lb)</span><input type="number" inputmode="decimal" data-bind="goal" value="${esc(f.goal)}"></label>
      <label class="field"><span>Activity</span><select data-bind="activity">${ACTIVITY.map(a => `<option value="${a.v}" ${+f.activity === a.v ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <label class="field"><span>Pace</span><select data-bind="pace">${PACE.map(a => `<option value="${a.v}" ${+f.pace === a.v ? 'selected' : ''}>${a.label}</option>`).join('')}</select></label>
      <div class="row"><label class="field grow"><span>Water (glasses)</span><input type="number" inputmode="numeric" data-bind="waterGoal" value="${esc(f.waterGoal)}"></label>
        <label class="field grow"><span>Step goal</span><input type="number" inputmode="numeric" data-bind="stepGoal" value="${esc(f.stepGoal)}"></label></div>
      <button class="btn" data-a="saveEdit">Save</button>`;
  } else if (s.type === 'help') {
    h = head('The color system') + `<p>Every food gets a color based on how many calories are packed into each bite.</p>
      ${['G', 'Y', 'R'].map(c => `<div class="card"><div class="row"><span class="dot ${c}"></span><h3>${COLOR_NAME[c]}: aim for about ${COLOR_TARGET[c] * 100}%</h3></div>
      <p class="small" style="margin:8px 0 0">${{ G: 'The most filling for the fewest calories. Vegetables, fruit, broth soups, oatmeal, skim milk, plain Greek yogurt. Eat plenty.',
        Y: 'The middle ground. Lean meats, fish, eggs, grains, beans, most sandwiches and meals. The core of your day.',
        R: 'A lot of calories in a small amount. Cheese, nuts, oils, butter, sweets, chips, fried food, alcohol. Enjoy in smaller portions.' }[c]}</p></div>`).join('')}
      <p class="muted small">No food is off-limits. Red foods just go further when the portions are smaller.</p>`;
  } else if (s.type === 'install') {
    h = head('Install on iPhone') + `<div class="stack">
      <p>1. Open this page in <b>Safari</b> (not Chrome).</p>
      <p>2. Tap the <b>Share</b> button: the square with an arrow pointing up, at the bottom of the screen.</p>
      <p>3. Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</p>
      <p>4. Open <b>Coach</b> from the new icon. It works without internet.</p>
      <p class="muted small">Note: The home-screen app keeps its own data, separate from Safari. Always open it from the icon.</p></div>
      ${isStandalone() ? '<div class="banner"><b>✓ You\'re already using the installed app.</b></div>' : ''}`;
  }
  sheet.innerHTML = h;
  const fm = $('#focusMe', sheet); if (fm) setTimeout(() => fm.focus(), 50);
}

/* ---------- Actions ---------- */
function addEntry(food, qty, meal) {
  day(UI.date).foods.push({ n: food.name, s: food.serving, c: food.cal, col: food.color, q: qty, m: meal, t: Date.now() });
  const snap = { id: food.id, name: food.name, serving: food.serving, cal: food.cal, color: food.color };
  if (food.id !== 'q') S.recent = [snap, ...S.recent.filter(r => r.name !== food.name)].slice(0, 20);
  save(); closeSheet(); render(); toast(`Added ${fmt(food.cal * qty)} cal`);
}
function defaultMeal() {
  const h = new Date().getHours();
  return h < 10.5 ? 'Breakfast' : h < 15 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snacks';
}

const A = {
  tab: el => { UI.tab = el.dataset.t; if (UI.tab === 'today') UI.date = dkey(); render(); scrollTo(0, 0); },
  dayPrev: () => { UI.date = addDays(UI.date, -1); render(); },
  dayNext: () => { if (UI.date < dkey()) { UI.date = addDays(UI.date, 1); render(); } },
  dayToday: () => { UI.date = dkey(); render(); },
  hideInstall: () => { S.hideInstall = true; save(); render(); },

  onbSet: el => { capture(UI.onb.d); UI.onb.d[el.dataset.k] = el.dataset.v; render(); },
  onbBack: () => { capture(UI.onb.d); UI.onb.step--; render(); scrollTo(0, 0); },
  onbNext: () => {
    capture(UI.onb.d);
    const err = onbValidate(); if (err) return toast(err);
    if (UI.onb.step < ONB_STEPS.length - 1) { UI.onb.step++; render(); scrollTo(0, 0); return; }
    S.profile = onbProfile(UI.onb.d); S.profile.createdAt = dkey();
    S.weights = [{ date: dkey(), lb: S.profile.startWeight }];
    UI.onb = null; save(); try { navigator.storage?.persist?.(); } catch { }
    UI.tab = 'today'; render(); scrollTo(0, 0);
  },

  addFood: el => openSheet({ type: 'log', meal: el.dataset.meal, q: '' }),
  pick: el => {
    const s = UI.sheet, f = allFoods().find(x => x.id === el.dataset.id) || S.recent.find(x => x.id === el.dataset.id);
    if (f) openSheet({ type: 'portion', food: f, qty: 1, meal: s.meal, q: s.q });
  },
  qty: el => { const s = UI.sheet; s.qty = Math.max(0.5, Math.min(20, s.qty + +el.dataset.n)); renderSheet(); },
  setMeal: el => { if (UI.sheet.form) capture(UI.sheet.form, sheet); UI.sheet.meal = el.dataset.m; renderSheet(); },
  setColor: el => { capture(UI.sheet.form, sheet); UI.sheet.form.color = el.dataset.c; renderSheet(); },
  logIt: () => { const s = UI.sheet; addEntry(s.food, s.qty, s.meal); },
  backToLog: () => openSheet({ type: 'log', meal: UI.sheet.meal, q: UI.sheet.q || '' }),
  quickSheet: () => openSheet({ type: 'quick', meal: UI.sheet.meal, q: UI.sheet.q, form: { name: '', cal: '', color: 'Y' } }),
  customSheet: el => openSheet({ type: 'custom', meal: UI.sheet.meal, q: UI.sheet.q, form: { name: el.dataset.name ? el.dataset.name.replace(/^./, c => c.toUpperCase()) : '', serving: '1 serving', cal: '', color: 'Y' } }),
  saveQuick: () => {
    const s = UI.sheet; capture(s.form, sheet);
    const cal = Math.round(+s.form.cal); if (!(cal > 0 && cal < 5000)) return toast('Enter the calories.');
    addEntry({ id: 'q', name: s.form.name.trim() || 'Quick add', serving: '', cal, color: s.form.color }, 1, s.meal);
  },
  saveCustom: () => {
    const s = UI.sheet; capture(s.form, sheet);
    const cal = Math.round(+s.form.cal), name = s.form.name.trim();
    if (!name) return toast('Give the food a name.');
    if (!(cal >= 0 && cal < 5000) || s.form.cal === '') return toast('Enter the calories.');
    const f = { id: 'c' + Date.now(), name, serving: s.form.serving.trim() || '1 serving', cal, color: s.form.color };
    S.customFoods.unshift(f); addEntry(f, 1, s.meal);
  },
  delFood: el => {
    const d = day(UI.date), f = d.foods[+el.dataset.i];
    if (!f || !confirm(`Remove ${f.n}?`)) return;
    d.foods.splice(+el.dataset.i, 1); save(); render();
  },

  water: el => { const d = day(UI.date), n = +el.dataset.n; d.water = d.water === n + 1 ? n : n + 1; save(); render(); },
  waterAdd: el => { const d = day(UI.date); d.water = Math.max(0, d.water + +el.dataset.n); save(); render(); },
  stepsSheet: () => openSheet({ type: 'steps', form: { v: peek(UI.date).steps || '' } }),
  saveSteps: () => {
    const s = UI.sheet; capture(s.form, sheet); const v = Math.round(+s.form.v);
    if (!(v >= 0 && v < 200000)) return toast('Enter a number of steps.');
    day(UI.date).steps = v; save(); closeSheet(); render(); if (v >= S.profile.stepGoal) toast('Step goal reached! 🎉');
  },
  weighSheet: () => openSheet({ type: 'weigh', form: { v: lb1(weightOn(UI.date)) } }),
  saveWeight: () => {
    const s = UI.sheet; capture(s.form, sheet); const v = +s.form.v;
    if (!(v >= 80 && v <= 700)) return toast('Enter your weight in pounds.');
    const prev = currentWeight();
    S.weights = S.weights.filter(w => w.date !== UI.date); S.weights.push({ date: UI.date, lb: Math.round(v * 10) / 10 });
    save(); closeSheet(); render();
    toast(v < prev ? `Down ${lb1(prev - v)} lb. Great work!` : 'Saved. It\'s the trend that counts.');
  },
  weightList: () => openSheet({ type: 'weights' }),
  delWeight: el => {
    if (S.weights.length <= 1) return toast('Keep at least one weigh-in.');
    if (!confirm('Delete this weigh-in?')) return;
    S.weights = S.weights.filter(w => w.date !== el.dataset.d); save(); renderSheet(); render();
  },

  openLesson: el => openSheet({ type: 'lesson', i: +el.dataset.i, answer: null }),
  quiz: el => { if (UI.sheet.answer == null) { UI.sheet.answer = +el.dataset.o; renderSheet(); } },
  lessonDone: () => {
    const first = !S.lessonsDone[UI.sheet.i];
    S.lessonsDone[UI.sheet.i] = dkey(); save(); closeSheet(); render();
    if (first) toast('Lesson complete! ✓');
  },

  editSheet: () => {
    const p = S.profile;
    openSheet({ type: 'edit', form: { name: p.name, age: p.age, sex: p.sex, ft: Math.floor(p.heightIn / 12), inch: p.heightIn % 12, goal: p.goalWeight,
      activity: p.activity, pace: p.pace, waterGoal: p.waterGoal, stepGoal: p.stepGoal } });
  },
  saveEdit: () => {
    const f = UI.sheet.form; capture(f, sheet);
    if (!f.name.trim()) return toast('Please enter a name.');
    if (!(+f.age >= 18 && +f.age <= 110)) return toast('Please enter a valid age.');
    if (!(+f.ft >= 4 && +f.ft <= 7 && +f.inch >= 0 && +f.inch < 12)) return toast('Please check the height.');
    if (!(+f.goal >= 80 && +f.goal <= 700)) return toast('Please check the goal weight.');
    Object.assign(S.profile, { name: f.name.trim(), age: +f.age, sex: f.sex, heightIn: +f.ft * 12 + +f.inch, goalWeight: +f.goal,
      activity: +f.activity, pace: +f.pace, waterGoal: Math.max(1, Math.min(20, Math.round(+f.waterGoal) || 8)),
      stepGoal: Math.max(500, Math.round(+f.stepGoal) || 6000) });
    save(); closeSheet(); render(); toast(`New budget: ${fmt(budget())} cal`);
  },
  helpSheet: () => openSheet({ type: 'help' }),
  installSheet: () => openSheet({ type: 'install' }),

  backup: async () => {
    const name = `coach-backup-${dkey()}.json`, text = JSON.stringify(S);
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Daily Coach backup' }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  reset: () => {
    if (!confirm('Erase ALL of your data on this phone? This can\'t be undone.')) return;
    if (!confirm('Are you sure? Consider saving a backup first.')) return;
    S = blank(); save(); UI.onb = null; UI.tab = 'today'; render(); scrollTo(0, 0);
  },
  close: closeSheet,
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && A[el.dataset.a]) { e.preventDefault(); A[el.dataset.a](el); }
});
sheetBg.addEventListener('click', closeSheet);
document.addEventListener('input', e => {
  if (e.target.id === 'q' && UI.sheet?.type === 'log') { UI.sheet.q = e.target.value; $('#results').innerHTML = logResults(UI.sheet.q); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'restoreFile' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!data || !data.profile || typeof data.days !== 'object') throw new Error('bad');
    if (!confirm(`Restore backup for ${data.profile.name}? This replaces the data on this phone.`)) return;
    S = Object.assign(blank(), data); save(); render(); toast('Backup restored');
  } catch { toast('That file isn\'t a Daily Coach backup.'); }
  e.target.value = '';
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[data-bind]')) {
    const btn = (UI.sheet ? sheet : app).querySelector('.btn[data-a^="save"], .btn[data-a="onbNext"]');
    if (btn) { e.preventDefault(); btn.click(); }
  }
});
// Roll over to the new day if the app is left open overnight.
let lastToday = dkey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || dkey() === lastToday) return;
  if (UI.date === lastToday) UI.date = dkey();
  lastToday = dkey();
  if (S.profile && !UI.sheet) render();
});

render();
