// ============================================================
// 90-Day Challenge — app logic
// All data is saved on this device only (browser localStorage).
// ============================================================
(() => {
'use strict';

const KEY = 'ninetyday.v1';
const TOTAL = 90;
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------------- dates (always local time, "YYYY-MM-DD") ----------------
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => fmt(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const diffDays = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / 864e5);
const ymd = s => { const [y, m, d] = s.split('-').map(Number); return [y, m - 1, d]; };
const dow = s => parse(s).getDay();
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nice = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString(undefined, opts);
const to12 = t => { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`; };

// ---------------- saved data ----------------
function freshState() {
  return {
    v: 1, setupDone: false, name: '', startDate: today(),
    habits: clone(DEFAULT_HABITS),
    workouts: clone(DEFAULT_WORKOUTS),
    workoutMode: 'gym',
    schedule: clone(DEFAULT_SCHEDULE),
    rewards: clone(DEFAULT_REWARDS),
    purchases: [],
    bank: { stake: 500, earn: 10, lose: 10 },
    reminders: false, fired: {},
    days: {},
    seenBadges: [],
    theme: 'sage',
  };
}
let state;
try { state = Object.assign(freshState(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
catch { state = freshState(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Could not save — storage full?'); } };
const dayData = ds => (state.days[ds] ||= { h: {}, slip: {}, bonus: 0, wo: { log: {} } });

// ---------------- screen state (not saved) ----------------
let tab = 'today';
let viewDate = today();
let wkDow = null;      // weekday shown on Workout tab
let setupStep = 0;
let listFilter = 'all';  // 'all' | 'todo' on the Today checklist

// ---------------- challenge helpers ----------------
const dayIndex = ds => diffDays(state.startDate, ds);           // 0 = Day 1
const inRange = ds => { const i = dayIndex(ds); return i >= 0 && i < TOTAL && ds <= today(); };
const phaseOf = i => Math.max(0, Math.min(6, Math.floor(i / 14)));  // new level every 2 weeks
const mult = streak => streak >= 30 ? 2 : streak >= 7 ? 1.5 : 1;
const basePts = h => h.big ? 20 : 10;

function challengeFor(i) {
  const lvl = Math.min(CHALLENGE_LEVELS.length - 1, Math.floor(Math.max(0, i) / 14));
  const L = CHALLENGE_LEVELS[lvl];
  const within = Math.max(0, i) - lvl * 14;
  return { level: lvl + 1, levelName: L.name, text: L.list[within % L.list.length] };
}
const quoteFor = i => QUOTES[((i % QUOTES.length) + QUOTES.length) % QUOTES.length];

// Scale an exercise up for the current 2-week level
function progressed(e, phase) {
  const grow = 1 + 0.1 * phase;
  let reps = e.reps;
  if (e.unit === 'reps') reps = e.reps <= 1 ? e.reps : Math.round(e.reps * grow);
  else if (e.unit === 'sec') reps = Math.round((e.reps * grow) / 5) * 5;
  else reps = Math.round(e.reps * (1 + 0.07 * phase));
  return { ...e, sets: e.sets + Math.floor(phase / 3), reps };
}
const unitLabel = u => u === 'sec' ? 'sec' : u === 'min' ? 'min' : 'reps';

// ---------------- the scoring engine ----------------
// Walks every day from Day 1 to today and works out streaks, points, perfect days and the bank.
function compute() {
  const hs = state.habits, tIdx = dayIndex(today());
  const last = Math.min(tIdx, TOTAL - 1);
  const run = {}, best = {};
  hs.forEach(h => { run[h.id] = 0; best[h.id] = 0; });
  const days = {};
  let earned = 0, perfect = 0, missed = 0, active = 0, workouts = 0, woMinutes = 0;
  for (let i = 0; i <= last; i++) {
    const ds = addDays(state.startDate, i), d = state.days[ds] || {};
    const h = d.h || {}, slip = d.slip || {};
    let pts = 0, done = 0; const rows = [];
    hs.forEach(x => {
      if (h[x.id]) {
        run[x.id]++; done++;
        const m = mult(run[x.id]), p = Math.round(basePts(x) * m);
        pts += p; rows.push({ h: x, base: basePts(x), m, p, streak: run[x.id] });
      } else if (i < tIdx || slip[x.id]) run[x.id] = 0;
      best[x.id] = Math.max(best[x.id], run[x.id]);
    });
    if (d.bonus) { pts += 25; rows.push({ bonus: true, p: 25 }); }
    const isPerfect = hs.length > 0 && done === hs.length && !!d.bonus;
    if (isPerfect) { pts += 50; perfect++; rows.push({ perfect: true, p: 50 }); }
    const pct = hs.length ? done / hs.length : 0;
    const isMissed = i < tIdx && pct < 0.5;
    if (isMissed) missed++;
    if (pct >= 0.5) active++;
    if (d.wo && d.wo.done) { workouts++; woMinutes += Number(d.wo.minutes) || 0; }
    earned += pts;
    days[ds] = { i, pts, rows, done, pct, perfect: isPerfect, missed: isMissed };
  }
  const spent = state.purchases.reduce((a, p) => a + p.cost, 0);
  const b = state.bank;
  const bank = Math.max(0, b.stake + perfect * b.earn - missed * b.lose);
  return { tIdx, days, run, best, earned, spent, avail: earned - spent, perfect, missed, active, bank, workouts, woMinutes };
}

// ---------------- little UI helpers ----------------
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600);
}
function openSheet(html) { $('#sheet').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeSheet() { $('#modal').classList.add('hidden'); $('#sheet').innerHTML = ''; stopTimer(false); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });
function confetti() {
  const em = ['🎉', '🔥', '⭐', '💪', '🏆', '✨'];
  for (let k = 0; k < 28; k++) {
    const s = document.createElement('div'); s.className = 'confetti';
    s.textContent = em[k % em.length]; s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * .6 + 's'; document.body.appendChild(s);
    setTimeout(() => s.remove(), 2600);
  }
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const habitById = id => state.habits.find(h => h.id === id);

// ---------------- color themes ----------------
const THEMES = [
  { id: 'sage',    name: 'Sage & Cream',   desc: 'Light · calm green',  c: ['#f2f0e9', '#fbfaf6', '#4d7761', '#a9853f'] },
  { id: 'mist',    name: 'Morning Mist',   desc: 'Light · soft blue',   c: ['#eef1f5', '#fbfcfe', '#557aa1', '#b0904a'] },
  { id: 'sand',    name: 'Warm Sand',      desc: 'Light · earthy',      c: ['#f5efe6', '#fffaf3', '#a8714b', '#6b9a76'] },
  { id: 'emerald', name: 'Emerald & Gold', desc: 'Dark · rich',         c: ['#0e1915', '#172822', '#cfae66', '#72bf93'] },
  { id: 'ocean',   name: 'Deep Ocean',     desc: 'Dark · calm blue',    c: ['#0d1724', '#152336', '#86b8d8', '#6fc4ab'] },
  { id: 'plum',    name: 'Plum & Rose',    desc: 'Dark · rich',         c: ['#19121f', '#241a2d', '#d9a8bc', '#e2c07f'] },
];
function applyTheme() {
  const th = THEMES.find(x => x.id === state.theme) || THEMES[0];
  document.documentElement.setAttribute('data-theme', th.id);
  $('#themeColor')?.setAttribute('content', th.c[0]);
}
function openThemes() {
  openSheet(`<h2>🎨 Choose your colors</h2>
    <p class="muted small" style="margin-top:-6px">Tap a theme to try it. It changes right away and is remembered.</p>
    <div class="themes">${THEMES.map(th => `<button class="swatch ${state.theme === th.id ? 'on' : ''}" data-act="setTheme" data-id="${th.id}">
      <div class="preview" style="background:${th.c[0]}"><div style="background:${th.c[1]};margin:10px 0 10px 10px;border-radius:8px"></div>
      <div style="display:flex;flex-direction:column;gap:6px;padding:12px"><i style="display:block;height:14px;border-radius:7px;background:${th.c[2]}"></i><i style="display:block;height:14px;width:60%;border-radius:7px;background:${th.c[3]}"></i></div></div>
      <b>${th.name}</b><small>${th.desc}</small></button>`).join('')}</div>
    <button class="btn primary block mt" data-act="close">Done</button>`);
}
const PAGE_TITLES = { today: 'Today', workout: 'Workout', schedule: 'Daily schedule', rewards: 'Rewards', progress: 'Progress' };

// Average points per day over the last 7 finished days (used for "days until reward")
function pointsPerDay(c) {
  const vals = [];
  for (let k = 1; k <= 7; k++) { const dc = c.days[addDays(today(), -k)]; if (dc) vals.push(dc.pts); }
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}
function rewardStatus(c) {
  const rs = state.rewards.slice().sort((a, b) => a.cost - b.cost);
  return { rs, ready: rs.filter(r => r.cost <= c.avail), saving: rs.filter(r => r.cost > c.avail), rate: pointsPerDay(c) };
}
const daysTo = (need, rate) => !rate ? '' : `about ${Math.max(1, Math.ceil(need / rate))} day${Math.ceil(need / rate) <= 1 ? '' : 's'} at your pace`;
function nextRewardCard(c, cls = '') {
  const { rs, ready, saving, rate } = rewardStatus(c);
  if (!rs.length) return `<div class="card ${cls}"><div class="card-head"><h3>🎁 Your rewards</h3></div>
    <p class="muted small">Set a reward you really want — it makes every point count.</p>
    <button class="btn primary block" data-act="goTab" data-tab="rewards">Add a reward</button></div>`;
  const next = saving[0];
  return `<div class="card next-reward ${cls}">
    <div class="card-head"><h3>🎁 Rewards</h3><button class="link" data-act="goTab" data-tab="rewards">See all →</button></div>
    ${ready.length ? `<div class="row" style="margin-bottom:12px"><span class="ico">${esc(ready[ready.length - 1].icon || '🎁')}</span>
      <div class="grow"><b>You can claim ${ready.length === 1 ? 'a reward' : ready.length + ' rewards'}!</b><div class="muted small">${esc(ready[ready.length - 1].name)} · ${ready[ready.length - 1].cost.toLocaleString()} pts</div></div>
      <button class="btn sm good" data-act="buy" data-id="${ready[ready.length - 1].id}">Claim</button></div>` : ''}
    ${next ? `<div class="row"><span class="ico">${esc(next.icon || '🎁')}</span><div class="grow">
      <div class="row between"><b>${esc(next.name)}</b><span class="small muted">${Math.max(0, c.avail).toLocaleString()} / ${next.cost.toLocaleString()}</span></div>
      <div class="meter mt" style="margin-top:6px"><i style="width:${Math.min(100, Math.max(0, c.avail) / next.cost * 100)}%"></i></div>
      <div class="small muted" style="margin-top:6px">${(next.cost - c.avail).toLocaleString()} pts to go${rate ? ' · ' + daysTo(next.cost - c.avail, rate) : ''}</div></div></div>`
      : '<p class="small muted" style="margin:0">You can afford every reward on your list. Add a bigger one!</p>'}
  </div>`;
}

// ============================================================
// RENDER
// ============================================================
function render() {
  applyTheme();
  document.body.classList.toggle('hidden-nav', !state.setupDone);
  if (!state.setupDone) { renderSetup(); return; }
  const c = compute();
  const t = c.tIdx;
  $('#pageTitle').textContent = PAGE_TITLES[tab];
  $('#topSub').textContent = t < 0 ? `Starts ${nice(state.startDate)}` : t >= TOTAL ? 'Challenge complete 🏆' : `Day ${t + 1} of ${TOTAL} · ${nice(today())}`;
  document.querySelectorAll('.nav button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ({ today: renderToday, workout: renderWorkout, schedule: renderSchedule, rewards: renderRewards, progress: renderProgress })[tab](c);
  checkBadges(c);
}

// ---------------- first-launch setup ----------------
function renderSetup() {
  $('#pageTitle').textContent = '90-Day Challenge';
  $('#topSub').textContent = 'Setup';
  if (setupStep === 0) {
    view.innerHTML = `
      <div class="card hero"><div class="daynum">90 days.<br><small>New habits. New you.</small></div>
      <p style="position:relative;z-index:1">Break the bad habits, build the good ones, train every day, and earn rewards along the way.</p></div>
      <div class="card">
        <h2>Let's set you up</h2>
        <label class="field"><span>Your name (optional)</span><input type="text" id="sName" value="${esc(state.name)}" placeholder="e.g. Hapee"></label>
        <label class="field"><span>Start date of your 90 days</span><input type="date" id="sStart" value="${state.startDate}"></label>
        <p class="muted small">Day 90 will be <b id="sEnd">${nice(addDays(state.startDate, 89), { month: 'long', day: 'numeric', year: 'numeric' })}</b>.</p>
        <button class="btn primary block" data-act="setupNext">Next: my habits →</button>
      </div>`;
    $('#sStart').addEventListener('change', e => { if (e.target.value) $('#sEnd').textContent = nice(addDays(e.target.value, 89), { month: 'long', day: 'numeric', year: 'numeric' }); });
  } else if (setupStep === 1) {
    view.innerHTML = `
      <div class="card"><h2>Your habits</h2>
      <p class="muted small">These are pre-loaded. Tap ✏️ to change one, 🗑 to remove it, or add your own. You can always change these later in ⚙️ Settings.</p></div>
      ${habitEditorList()}
      <div class="row mt"><button class="btn ghost" data-act="setupBack">← Back</button><button class="btn primary grow" data-act="setupNext">Next →</button></div>`;
  } else {
    view.innerHTML = `
      <div class="card"><h2>Money on the line 💰</h2>
        <p class="muted small">Pick a pretend amount to put "on the line." Perfect days grow it, missed days shrink it. <b>No real money is ever charged</b> — it's just to keep you honest.</p>
        <label class="field"><span>Amount on the line ($)</span><input type="number" id="sStake" inputmode="numeric" value="${state.bank.stake}"></label>
        <div class="row"><label class="field grow"><span>Earn per perfect day ($)</span><input type="number" id="sEarn" inputmode="numeric" value="${state.bank.earn}"></label>
        <label class="field grow"><span>Lose per missed day ($)</span><input type="number" id="sLose" inputmode="numeric" value="${state.bank.lose}"></label></div>
      </div>
      <div class="card"><h2>Where will you work out?</h2>
        <div class="seg" id="sMode"><button data-mode="gym" class="${state.workoutMode === 'gym' ? 'on' : ''}">🏋️ Gym</button><button data-mode="home" class="${state.workoutMode === 'home' ? 'on' : ''}">🏠 Home (no equipment)</button></div>
        <p class="muted small mt">You can switch any day.</p>
      </div>
      <div class="row"><button class="btn ghost" data-act="setupBack">← Back</button><button class="btn primary grow" data-act="setupFinish">Start my 90 days 🚀</button></div>`;
    $('#sMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.workoutMode = b.dataset.mode; save(); renderSetup(); });
  }
}

function habitEditorList() {
  const group = type => state.habits.filter(h => h.type === type).map(h => `
    <div class="edit-row"><div class="row grow"><span style="font-size:20px">${esc(h.icon)}</span>
      <div class="grow"><div style="font-weight:650">${esc(h.name)}</div><div class="muted small">${h.big ? '20' : '10'} pts · ${esc(h.goal || '')}</div></div></div>
      <div class="row"><button class="btn sm ghost" data-act="editHabit" data-id="${h.id}">✏️</button><button class="btn sm danger" data-act="delHabit" data-id="${h.id}">🗑</button></div></div>`).join('');
  return `
    <div class="card"><h3>🚫 Breaking bad habits <span class="muted small">(days clean)</span></h3>${group('break') || '<p class="muted small">None yet.</p>'}</div>
    <div class="card"><h3>✅ Building good habits</h3>${group('build') || '<p class="muted small">None yet.</p>'}</div>
    <button class="btn ghost block" data-act="editHabit" data-id="">＋ Add a habit</button>`;
}

function habitForm(id) {
  const h = habitById(id) || { id: '', icon: '⭐', name: '', goal: '', type: 'build', big: false };
  openSheet(`
    <h2>${id ? 'Edit habit' : 'New habit'}</h2>
    <div class="row"><label class="field" style="width:76px"><span>Icon</span><input type="text" id="hIcon" value="${esc(h.icon)}" maxlength="4"></label>
    <label class="field grow"><span>Name</span><input type="text" id="hName" value="${esc(h.name)}" placeholder="e.g. Stretch 10 minutes"></label></div>
    <label class="field"><span>Goal / details</span><input type="text" id="hGoal" value="${esc(h.goal)}" placeholder="e.g. Under 2 hrs screen time"></label>
    <label class="field"><span>Type</span><select id="hType">
      <option value="build" ${h.type === 'build' ? 'selected' : ''}>Build a good habit</option>
      <option value="break" ${h.type === 'break' ? 'selected' : ''}>Break a bad habit (days clean)</option></select></label>
    <label class="toggle"><input type="checkbox" id="hBig" ${h.big ? 'checked' : ''}> Big habit — worth 20 points (otherwise 10)</label>
    <div class="row mt"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary grow" data-act="saveHabit" data-id="${esc(id)}">Save</button></div>`);
}

// ---------------- TODAY ----------------
function renderToday(c) {
  const t = c.tIdx;
  if (t < 0) {
    const q = quoteFor(0);
    view.innerHTML = `
      <div class="card hero"><div class="daynum">${-t}<small> day${-t === 1 ? '' : 's'} to go</small></div>
      <p>Your 90 days start on <b>${nice(state.startDate, { weekday: 'long', month: 'long', day: 'numeric' })}</b>. Get ready!</p></div>
      <div class="card quote"><p>“${esc(q[0])}”</p><div class="muted small">— ${esc(q[1])}</div></div>
      <button class="btn ghost block" data-act="settings">Change start date</button>`;
    return;
  }
  if (!inRange(viewDate)) viewDate = t >= TOTAL ? addDays(state.startDate, TOTAL - 1) : today();
  const i = dayIndex(viewDate), d = dayData(viewDate), dc = c.days[viewDate] || { pts: 0, rows: [], done: 0 };
  const isToday = viewDate === today();
  const ch = challengeFor(i), q = quoteFor(i);
  const hs = state.habits;
  const show = h => listFilter === 'all' || !d.h[h.id];
  const brk = hs.filter(h => h.type === 'break'), bld = hs.filter(h => h.type === 'build');
  const row = h => {
    const done = !!d.h[h.id], slipped = !!(d.slip && d.slip[h.id]);
    const streak = c.run[h.id] || 0;
    const m = mult(done ? streak : streak + 1);
    return `<div class="habit ${done ? 'done' : ''} ${slipped ? 'slipped' : ''}">
      <span class="ico">${esc(h.icon)}</span>
      <div class="grow main" data-act="toggle" data-id="${h.id}">
        <div class="name">${esc(h.name)}</div>
        <div class="goal">${esc(h.goal || '')}</div>
        <div class="meta">
          <span class="pill ${h.big ? 'hot' : ''}">+${Math.round(basePts(h) * m)} pts</span>
          ${isToday && streak ? `<span class="pill ${streak >= 7 ? 'gold' : 'good'}">${h.type === 'break' ? streak + ' day' + (streak === 1 ? '' : 's') + ' clean' : '🔥 ' + streak + ' in a row'}</span>` : ''}
          ${slipped ? '<span class="pill" style="color:var(--bad)">fresh start</span>' : ''}
        </div>
      </div>
      <div class="habit-actions">
        <button class="check" data-act="toggle" data-id="${h.id}" aria-label="Mark ${esc(h.name)} done">✓</button>
        ${h.timer && !done ? `<button class="timer-btn" data-act="timer">⏱ Timer</button>` : ''}
        ${h.type === 'break' && !slipped && !done ? `<button class="slip-btn" data-act="slip" data-id="${h.id}">I slipped</button>` : ''}
      </div></div>`;
  };
  const group = (label, list) => {
    const vis = list.filter(show);
    if (!list.length) return '';
    const doneN = list.filter(h => d.h[h.id]).length;
    return `<div class="group-label"><span>${label}</span><span>${doneN}/${list.length}</span></div>
      ${vis.map(row).join('') || `<p class="small muted" style="margin:4px 4px 12px">All done here ✓</p>`}`;
  };
  const pct = hs.length ? Math.round(dc.done / hs.length * 100) : 0;
  const isSunday = dow(viewDate) === 0;
  const week = isSunday ? weeklyCard(viewDate, c, true) : '';
  view.innerHTML = `
    ${!isToday ? `<div class="banner">You're editing <b>${nice(viewDate, { weekday: 'long', month: 'short', day: 'numeric' })}</b> (Day ${i + 1}). <button class="link" data-act="goToday">Back to today →</button></div>` : ''}
    <div class="layout ${week ? 'has-week' : ''}">
    <div class="card hero a-hero">
      <div class="row between">
        <div class="daynum">Day ${i + 1}<small> of ${TOTAL}</small></div>
        <div class="row"><button class="icon-btn nav-day" data-act="prevDay" aria-label="Previous day">‹</button>
        <button class="icon-btn nav-day" data-act="nextDay" aria-label="Next day" ${viewDate >= today() ? 'disabled style="opacity:.4"' : ''}>›</button></div>
      </div>
      <div style="margin-top:6px">${state.name ? `Keep going, ${esc(state.name)}. ` : ''}${dc.done} of ${hs.length} habits done ${isToday ? 'today' : 'that day'}.</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="stats">
        <div><b>${dc.pts}</b><span>${isToday ? "Today's" : 'Day'} points</span></div>
        <div><b>${c.avail.toLocaleString()}</b><span>Points to spend</span></div>
        <div><b>$${c.bank}</b><span>On the line</span></div>
        <div class="wide-only"><b>${c.perfect}</b><span>Perfect days</span></div>
      </div>
    </div>

    ${week ? `<div class="a-week">${week}</div>` : ''}

    <div class="card a-habits">
      <div class="card-head"><h2>Checklist</h2>
        <div class="filter"><button class="${listFilter === 'all' ? 'on' : ''}" data-act="filter" data-f="all">All</button><button class="${listFilter === 'todo' ? 'on' : ''}" data-act="filter" data-f="todo">To do</button></div></div>
      <div class="list-progress"><i style="width:${pct}%"></i></div>
      ${group('🚫 Stay clean', brk)}
      ${group('✅ Build', bld)}
      ${!hs.length ? '<p class="muted">No habits yet — add some in ⚙️ Settings.</p>' : ''}
    </div>

    <div class="card challenge a-challenge">
      <div class="card-head"><h3>⚡ Today's challenge</h3><span class="pill gold">Level ${ch.level} · ${ch.levelName}</span></div>
      <p style="margin:0 0 12px">${esc(ch.text)}</p>
      <button class="btn ${d.bonus ? 'good' : 'primary'} block" data-act="bonus">${d.bonus ? '✓ Done — +25 pts' : 'I did it · +25 pts'}</button>
    </div>

    ${nextRewardCard(c, 'a-reward')}

    ${scoreCard(dc, isToday)}

    <div class="card quote a-quote"><p>“${esc(q[0])}”</p><div class="muted small">— ${esc(q[1])}</div></div>
    </div>`;
}

function scoreCard(dc, isToday) {
  const rows = dc.rows.map(r => r.bonus ? `<tr><td>⚡ Bonus challenge</td><td>+25</td></tr>`
    : r.perfect ? `<tr><td>🌟 Perfect day bonus</td><td>+50</td></tr>`
    : `<tr><td>${esc(r.h.icon)} ${esc(r.h.name)}${r.m > 1 ? ` <span class="pill gold">${r.m}×</span>` : ''}</td><td>+${r.p}</td></tr>`).join('');
  return `<div class="card a-score"><div class="card-head"><h3>${isToday ? "Today's" : 'Day'} score</h3><span class="score-big">${dc.pts}</span></div>
    ${rows ? `<details class="more"><summary>See points breakdown ▾</summary><table class="breakdown mt">${rows}</table></details>` : '<p class="muted small" style="margin:0">Check off habits to start earning points.</p>'}
    <p class="muted small" style="margin-bottom:0">Big habits 20 · others 10 · challenge 25 · perfect day +50. 7-day streak = 1.5×, 30-day = 2×.</p></div>`;
}

// ---------------- weekly report ----------------
function weekReport(sunday, c) {
  const days = [];
  for (let k = 6; k >= 0; k--) { const ds = addDays(sunday, -k); if (c.days[ds]) days.push(ds); }
  if (!days.length) return null;
  let total = 0; const count = {};
  state.habits.forEach(h => count[h.id] = 0);
  let bonus = 0, perfect = 0;
  days.forEach(ds => {
    total += c.days[ds].pts; if (c.days[ds].perfect) perfect++;
    const d = state.days[ds] || {}; if (d.bonus) bonus++;
    state.habits.forEach(h => { if (d.h && d.h[h.id]) count[h.id]++; });
  });
  const sorted = state.habits.slice().sort((a, b) => count[b.id] - count[a.id]);
  const best = sorted[0], weak = sorted[sorted.length - 1];
  return { from: days[0], to: days[days.length - 1], n: days.length, total, perfect, bonus, best, weak, count,
    tip: (weak && TIPS[weak.id]) || TIPS.default };
}
function weeklyCard(sunday, c, featured) {
  const r = weekReport(sunday, c);
  if (!r || !r.best) return '';
  return `<div class="card" ${featured ? 'style="border-color:var(--accent)"' : ''}>
    <div class="row between"><h3 style="margin:0">📊 Weekly report</h3><span class="muted small">${nice(r.from, { month: 'short', day: 'numeric' })} – ${nice(r.to, { month: 'short', day: 'numeric' })}</span></div>
    <div class="row between mt"><div><div class="score-big">${r.total.toLocaleString()}</div><div class="muted small">points this week</div></div>
    <div class="center"><b style="font-size:22px">${r.perfect}</b><div class="muted small">perfect days</div></div>
    <div class="center"><b style="font-size:22px">${r.bonus}/${r.n}</b><div class="muted small">challenges</div></div></div>
    <p>🏆 <b>Best habit:</b> ${esc(r.best.icon)} ${esc(r.best.name)} (${r.count[r.best.id]}/${r.n} days)<br>
    ${r.count[r.weak.id] >= r.n ? '🎯 <b>Needs work:</b> nothing — every habit, every day. Incredible.' : `🎯 <b>Needs work:</b> ${esc(r.weak.icon)} ${esc(r.weak.name)} (${r.count[r.weak.id]}/${r.n} days)`}</p>
    <div class="banner" style="margin:0">💡 <b>Tip:</b> ${esc(r.count[r.weak.id] >= r.n ? 'You\'re in the zone. Raise the bar: add weight, add pages, add minutes.' : r.tip)}</div></div>`;
}

// ---------------- WORKOUT ----------------
function renderWorkout(c) {
  const t = c.tIdx;
  const logDate = inRange(viewDate) ? viewDate : (t >= 0 ? addDays(state.startDate, Math.min(t, TOTAL - 1)) : null);
  const i = logDate ? dayIndex(logDate) : 0;
  const phase = phaseOf(i);
  const realDow = logDate ? dow(logDate) : dow(today());
  if (wkDow === null) wkDow = realDow;
  const plan = state.workouts[wkDow];
  const mode = state.workoutMode;
  const isLogDay = logDate && wkDow === realDow;
  const d = isLogDay ? dayData(logDate) : null;
  const wo = d ? (d.wo ||= { log: {} }) : null;
  if (wo) wo.log ||= {};
  const list = (plan[mode] || []).map(e => progressed(e, phase));
  const order = [1, 2, 3, 4, 5, 6, 0];
  view.innerHTML = `<div class="grid2"><div>
    <div class="card">
      <div class="row between"><h2 style="margin:0">${esc(plan.icon || '💪')} ${esc(plan.name)}</h2><span class="pill hot">Level ${phase + 1} of 7</span></div>
      <p class="muted small" style="margin:6px 0 12px">Every 2 weeks the numbers go up automatically. ${mode === 'gym' ? 'Add 5 lbs when you hit every rep of every set.' : 'Move slower and with control to make it harder.'}</p>
      <div class="seg" id="modeSeg"><button data-mode="gym" class="${mode === 'gym' ? 'on' : ''}">🏋️ Gym</button><button data-mode="home" class="${mode === 'home' ? 'on' : ''}">🏠 Home</button></div>
      <div class="week-strip">${order.map(k => `<div class="${k === wkDow ? 'on' : ''}" data-act="wkDow" data-d="${k}"><b>${esc(state.workouts[k].icon || '•')}</b>${DOW[k]}</div>`).join('')}</div>
    </div>

    ${!isLogDay ? `<div class="banner">Preview of ${DOW[wkDow]}'s workout. <button class="link" data-act="wkDow" data-d="${realDow}">Back to ${logDate === today() ? 'today' : DOW[realDow]} →</button></div>` : ''}
    ${isLogDay && logDate !== today() ? `<div class="banner">Logging for <b>${nice(logDate)}</b> (Day ${i + 1}).</div>` : ''}

    <div class="card">
      ${list.map((e, k) => {
        const L = wo ? (wo.log[k] || {}) : {};
        return `<div class="exercise"><div class="row between"><b>${esc(e.name)}</b><span class="target">${e.sets} × ${e.reps} ${unitLabel(e.unit)}</span></div>
        ${isLogDay ? `<div class="log-grid">
          ${e.unit === 'reps' && mode === 'gym' ? `<input type="number" inputmode="decimal" placeholder="Weight (lbs)" data-log="${k}" data-f="w" value="${esc(L.w || '')}">` : ''}
          <input type="number" inputmode="numeric" placeholder="${e.unit === 'reps' ? 'Total reps done' : e.unit === 'sec' ? 'Seconds done' : 'Minutes done'}" data-log="${k}" data-f="v" value="${esc(L.v || '')}">
        </div>` : ''}</div>`;
      }).join('') || '<p class="muted">No exercises. Tap “Edit plan” to add some.</p>'}
    </div>

    </div><div>
    ${isLogDay ? `<div class="card">
      <h3>Log today's session</h3>
      <div class="row"><label class="field grow"><span>Total minutes</span><input type="number" inputmode="numeric" id="woMin" value="${esc(wo.minutes || '')}" placeholder="e.g. 45"></label></div>
      <label class="field"><span>Notes (how did it feel?)</span><input type="text" id="woNotes" value="${esc(wo.notes || '')}" placeholder="Felt strong, add weight next time"></label>
      <button class="btn ${wo.done ? 'good' : 'primary'} block" data-act="woDone">${wo.done ? '✓ Workout done! (tap to undo)' : 'Finish workout ✓'}</button>
    </div>` : ''}

    <button class="btn ghost block" data-act="editPlan">✏️ Edit ${DOW[wkDow]}'s plan</button>

    <div class="section-title"><h2>📈 Workout progress</h2><small>${c.workouts} done</small></div>
    ${workoutProgress(c)}</div></div>`;

  $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.workoutMode = b.dataset.mode; save(); render(); });
  view.querySelectorAll('[data-log]').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.log; wo.log[k] ||= {}; wo.log[k][inp.dataset.f] = inp.value; wo.mode = mode; wo.day = wkDow; save();
  }));
  const m = $('#woMin'); if (m) m.addEventListener('change', () => { wo.minutes = m.value; save(); });
  const n = $('#woNotes'); if (n) n.addEventListener('change', () => { wo.notes = n.value; save(); });
}

function workoutProgress(c) {
  // Bar chart of minutes per day + best lifts
  const last = Math.min(c.tIdx, TOTAL - 1);
  const W = 320, H = 90, bw = W / TOTAL;
  let maxMin = 30; const vals = [];
  for (let i = 0; i <= last; i++) {
    const d = state.days[addDays(state.startDate, i)];
    const v = d && d.wo && d.wo.done ? (Number(d.wo.minutes) || 20) : 0;
    vals.push(v); maxMin = Math.max(maxMin, v);
  }
  const bars = vals.map((v, i) => v ? `<rect x="${(i * bw + .5).toFixed(1)}" y="${(H - v / maxMin * (H - 4)).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${(v / maxMin * (H - 4)).toFixed(1)}" rx="1" fill="url(#g)"/>` : '').join('');
  // best weights per exercise name
  const lifts = {};
  Object.keys(state.days).sort().forEach(ds => {
    const wo = state.days[ds].wo; if (!wo || !wo.log || wo.mode !== 'gym') return;
    const plan = state.workouts[wo.day ?? dow(ds)]; if (!plan) return;
    Object.entries(wo.log).forEach(([k, L]) => {
      const e = plan.gym[k]; const w = Number(L.w); if (!e || e.unit !== 'reps' || !w) return;
      const o = lifts[e.name] ||= { first: w, best: w };
      o.best = Math.max(o.best, w);
    });
  });
  const liftRows = Object.entries(lifts).slice(0, 12).map(([n, o]) => `<tr><td>${esc(n)}</td><td>${o.first} → <b>${o.best}</b> lbs${o.best > o.first ? ` <span class="pill good">+${o.best - o.first}</span>` : ''}</td></tr>`).join('');
  return `<div class="card">
    <div class="row between"><div><b style="font-size:22px">${c.workouts}</b> <span class="muted small">workouts</span></div><div><b style="font-size:22px">${c.woMinutes}</b> <span class="muted small">minutes</span></div><div><b style="font-size:22px">${c.run.workout || 0}</b> <span class="muted small">day streak</span></div></div>
    <svg class="chart mt" viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Workout minutes per day">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:var(--good)"/></linearGradient></defs>
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" style="stroke:var(--line)"/>${bars}
      ${[0, 30, 60, 89].map(i => `<text x="${i === 89 ? W : (i * bw).toFixed(0)}" y="${H + 12}" style="fill:var(--muted)" font-size="9" text-anchor="${i === 89 ? 'end' : 'start'}">Day ${i + 1}</text>`).join('')}
    </svg>
    <p class="muted small" style="margin:4px 0 0">Minutes per day across your 90 days.</p>
    ${liftRows ? `<h3 class="mt">Strength gains</h3><table class="breakdown">${liftRows}</table>` : '<p class="muted small">Log weights in the gym version to see your strength gains here.</p>'}
  </div>`;
}

function planEditor(k) {
  const p = state.workouts[k];
  const rows = mode => (p[mode] || []).map((e, j) => `<div class="ex-edit" data-mode="${mode}" data-j="${j}">
    <input type="text" value="${esc(e.name)}" data-f="name" aria-label="Exercise name">
    <input type="number" value="${e.sets}" data-f="sets" aria-label="Sets">
    <input type="number" value="${e.reps}" data-f="reps" aria-label="Reps">
    <select data-f="unit" aria-label="Unit"><option value="reps" ${e.unit === 'reps' ? 'selected' : ''}>reps</option><option value="sec" ${e.unit === 'sec' ? 'selected' : ''}>sec</option><option value="min" ${e.unit === 'min' ? 'selected' : ''}>min</option></select>
    <button class="btn sm danger" data-act="exDel" data-mode="${mode}" data-j="${j}" aria-label="Remove">✕</button></div>`).join('');
  openSheet(`<h2>Edit ${DOW[k]} workout</h2>
    <div class="row"><label class="field" style="width:70px"><span>Icon</span><input type="text" id="pIcon" value="${esc(p.icon || '')}"></label>
    <label class="field grow"><span>Workout name</span><input type="text" id="pName" value="${esc(p.name)}"></label></div>
    <p class="muted small">Starting numbers (Level 1). The app raises them every 2 weeks. Columns: exercise · sets · reps/time · unit.</p>
    <h3>🏋️ Gym version</h3><div id="exGym">${rows('gym')}</div><button class="btn sm ghost" data-act="exAdd" data-mode="gym">＋ Add exercise</button>
    <h3 class="mt">🏠 Home version</h3><div id="exHome">${rows('home')}</div><button class="btn sm ghost" data-act="exAdd" data-mode="home">＋ Add exercise</button>
    <div class="row mt"><button class="btn ghost" data-act="planReset">Reset to default</button><button class="btn primary grow" data-act="planSave">Save plan</button></div>`);
}
function readPlanEditor() {
  const p = state.workouts[wkDow];
  p.name = $('#pName').value.trim() || p.name; p.icon = $('#pIcon').value.trim();
  ['gym', 'home'].forEach(mode => {
    p[mode] = [...document.querySelectorAll(`.ex-edit[data-mode="${mode}"]`)].map(r => ({
      name: r.querySelector('[data-f=name]').value.trim() || 'Exercise',
      sets: Math.max(1, Number(r.querySelector('[data-f=sets]').value) || 1),
      reps: Math.max(1, Number(r.querySelector('[data-f=reps]').value) || 1),
      unit: r.querySelector('[data-f=unit]').value,
    }));
  });
}

// ---------------- SCHEDULE ----------------
function renderSchedule(c) {
  const ds = inRange(today()) ? today() : null;
  const d = ds ? dayData(ds) : null;
  const now = new Date(), nowHM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  view.innerHTML = `
    <div class="card"><h2 style="margin-bottom:4px">Your daily schedule</h2>
    <p class="muted small" style="margin:0">Check habits off as the day goes. Tap ✏️ to change times or tasks.</p></div>
    <div class="grid2">${state.schedule.map(b => {
      const isNow = nowHM >= b.start && (b.end > b.start ? nowHM < b.end : nowHM < '23:59');
      const linked = (b.habits || []).map(habitById).filter(Boolean);
      return `<div class="card"><div class="block ${isNow ? 'now' : ''}">
        <div class="row between"><div><div class="time">${to12(b.start)}${b.end && b.end !== b.start ? ' – ' + to12(b.end) : ''}${isNow ? ' · NOW' : ''}</div><h3 style="margin:2px 0 0">${esc(b.icon || '')} ${esc(b.name)}</h3></div>
        <button class="btn sm ghost" data-act="editBlock" data-id="${b.id}">✏️</button></div>
        <ul class="items">${(b.items || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${d ? linked.map(h => `<button class="mini-habit ${d.h[h.id] ? 'done' : ''}" data-act="toggle" data-id="${h.id}"><span class="check">✓</span><span>${esc(h.icon)} ${esc(h.name)}</span></button>`).join('') : ''}
      </div></div>`;
    }).join('')}</div>
    <button class="btn ghost block" data-act="editBlock" data-id="">＋ Add a time block</button>

    <div class="section-title"><h2>🔔 Reminders</h2></div>
    <div class="card">
      <p style="margin-top:0"><b>Best option — add to your phone's calendar.</b> This gives you a reminder at the start of each block, every day for 90 days, even when the app is closed.</p>
      <button class="btn primary block" data-act="ics">📅 Add schedule to my calendar</button>
      <p class="muted small">On iPhone: open this app in Safari, tap the button, then tap “Add All.” If you change your schedule, delete the old events and add again.</p>
      <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
      <label class="toggle"><input type="checkbox" id="remToggle" ${state.reminders ? 'checked' : ''}> In-app pop-up reminders</label>
      <p class="muted small" style="margin-bottom:0">Only work while the app is open (a limit of web apps without a server). On iPhone they need the app added to your home screen first.</p>
    </div>`;
  $('#remToggle').addEventListener('change', async e => {
    if (e.target.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission().catch(() => 'denied');
      if (p !== 'granted') toast('Notifications not allowed — you\'ll still see pop-ups in the app.');
    }
    state.reminders = e.target.checked; save();
  });
}
function blockForm(id) {
  const b = state.schedule.find(x => x.id === id) || { id: '', name: '', icon: '⏰', start: '12:00', end: '13:00', items: [], habits: [] };
  openSheet(`<h2>${id ? 'Edit' : 'New'} time block</h2>
    <div class="row"><label class="field" style="width:70px"><span>Icon</span><input type="text" id="bIcon" value="${esc(b.icon)}"></label>
    <label class="field grow"><span>Name</span><input type="text" id="bName" value="${esc(b.name)}"></label></div>
    <div class="row"><label class="field grow"><span>Starts</span><input type="time" id="bStart" value="${b.start}"></label>
    <label class="field grow"><span>Ends</span><input type="time" id="bEnd" value="${b.end}"></label></div>
    <label class="field"><span>Tasks (one per line)</span><textarea id="bItems" rows="5">${esc((b.items || []).join('\n'))}</textarea></label>
    <h3>Habits to check off here</h3>
    ${state.habits.map(h => `<label class="toggle" style="padding:5px 0"><input type="checkbox" class="bHab" value="${h.id}" ${(b.habits || []).includes(h.id) ? 'checked' : ''}> ${esc(h.icon)} ${esc(h.name)}</label>`).join('')}
    <div class="row mt">${id ? `<button class="btn danger" data-act="delBlock" data-id="${id}">Delete</button>` : ''}<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary grow" data-act="saveBlock" data-id="${id}">Save</button></div>`);
}
function makeICS() {
  const start = state.startDate > today() ? state.startDate : today();
  const left = TOTAL - Math.max(0, dayIndex(start));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const D = start.replace(/-/g, '');
  const escI = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const ev = state.schedule.map(b => {
    let [h, m] = b.start.split(':').map(Number); let [eh, em] = (b.end || b.start).split(':').map(Number);
    if (eh * 60 + em <= h * 60 + m) { const t = h * 60 + m + 15; eh = Math.floor(t / 60) % 24; em = t % 60; }
    return ['BEGIN:VEVENT', `UID:${b.id}-${D}@90daychallenge`, `DTSTAMP:${stamp}`,
      `DTSTART:${D}T${pad(h)}${pad(m)}00`, `DTEND:${D}T${pad(eh)}${pad(em)}00`,
      `RRULE:FREQ=DAILY;COUNT=${left}`, `SUMMARY:${escI((b.icon ? b.icon + ' ' : '') + b.name)}`,
      `DESCRIPTION:${escI((b.items || []).join('\n'))}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escI(b.name)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//90-Day Challenge//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
}
// In-app reminders (while the app is open)
setInterval(() => {
  if (!state.reminders || !state.setupDone) return;
  const n = new Date(), hm = `${pad(n.getHours())}:${pad(n.getMinutes())}`, ds = today();
  state.schedule.forEach(b => {
    const key = ds + b.id;
    if (b.start === hm && !state.fired[key]) {
      state.fired = { [key]: 1, ...Object.fromEntries(Object.entries(state.fired).filter(([k]) => k.startsWith(ds))) };
      save();
      const body = (b.items || []).slice(0, 3).join(' · ');
      toast(`${b.icon || '⏰'} ${b.name}: ${body}`);
      if ('Notification' in window && Notification.permission === 'granted') {
        navigator.serviceWorker?.getRegistration().then(r => r ? r.showNotification(`${b.icon || ''} ${b.name}`, { body, icon: 'icons/icon-192.png' }) : new Notification(b.name, { body })).catch(() => {});
      }
    }
  });
}, 20000);

// ---------------- REWARDS ----------------
const REWARD_IDEAS = [
  ['💆', 'Massage', 800], ['📚', 'New book', 250], ['🍣', 'Favorite restaurant', 600], ['🛌', 'Lazy morning off', 700],
  ['🎮', 'Hobby / game time', 400], ['👕', 'New outfit', 1500], ['🎟️', 'Concert or game tickets', 2000], ['⌚', 'New watch', 3500],
];
function renderRewards(c) {
  const b = state.bank;
  const { ready, saving, rate } = rewardStatus(c);
  const rcard = r => {
    const can = c.avail >= r.cost, need = r.cost - c.avail;
    return `<div class="rcard ${can ? 'ready' : ''}">
      <div class="row between"><span class="ico">${esc(r.icon || '🎁')}</span><button class="link small" data-act="editReward" data-id="${r.id}">Edit</button></div>
      <div class="rname">${esc(r.name)}</div>
      <div class="small muted">${r.cost.toLocaleString()} pts</div>
      <div class="meter"><i style="width:${Math.min(100, Math.max(0, c.avail) / r.cost * 100)}%"></i></div>
      <div class="small ${can ? '' : 'muted'}" style="${can ? 'color:var(--good);font-weight:700' : ''}">${can ? 'Ready to claim!' : `${need.toLocaleString()} to go${rate ? ' · ' + daysTo(need, rate) : ''}`}</div>
      <div class="actions"><button class="btn sm ${can ? 'good' : ''} grow" data-act="buy" data-id="${r.id}" ${can ? '' : 'disabled'}>${can ? '🎉 Claim it' : 'Keep earning'}</button></div>
    </div>`;
  };
  const owned = new Set(state.rewards.map(r => r.name.toLowerCase()));
  view.innerHTML = `
    <div class="card hero">
      <div class="small" style="opacity:.9">Points you can spend</div>
      <div class="daynum">${c.avail.toLocaleString()}<small> pts</small></div>
      <div class="stats">
        <div><b>${c.earned.toLocaleString()}</b><span>Earned</span></div>
        <div><b>${c.spent.toLocaleString()}</b><span>Spent</span></div>
        <div><b>${rate ?? '—'}</b><span>Pts / day lately</span></div>
      </div>
    </div>

    ${ready.length ? `<div class="section-title"><h2>🎉 Ready to claim</h2><small>you earned these</small></div>
      <div class="reward-grid">${ready.map(rcard).join('')}</div>` : ''}

    <div class="section-title"><h2>🎯 Saving up for</h2><small>closest first</small></div>
    ${saving.length ? `<div class="reward-grid">${saving.map(rcard).join('')}</div>` : '<div class="card muted small">Nothing to save up for — add a bigger reward below.</div>'}

    <div class="grid2" style="margin-top:20px">
      <div class="card">
        <div class="card-head"><h3>＋ Add a reward</h3></div>
        <div class="row"><input type="text" id="qaIcon" value="🎁" style="width:58px;text-align:center" aria-label="Icon">
        <input type="text" id="qaName" placeholder="What do you want?" class="grow" aria-label="Reward name"></div>
        <div class="row mt"><input type="number" id="qaCost" inputmode="numeric" placeholder="Cost in points" aria-label="Cost in points"><button class="btn primary" data-act="quickAdd">Add</button></div>
        <p class="small muted">A strong day earns about 250–400 pts. Quick ideas:</p>
        <div class="chips">${REWARD_IDEAS.filter(x => !owned.has(x[1].toLowerCase())).map((x, k) => `<button class="chip" data-act="addIdea" data-i="${REWARD_IDEAS.indexOf(x)}">${x[0]} ${esc(x[1])} · ${x[2]}</button>`).join('')}</div>
      </div>

      <div class="card center">
        <div class="card-head"><h3>💰 Money on the line</h3><button class="link" data-act="editBank">Settings</button></div>
        <div class="bank-amount ${c.bank >= b.stake ? 'up' : 'down'}">$${c.bank.toLocaleString()}</div>
        <div class="muted small">of your $${b.stake.toLocaleString()} on the line</div>
        <div class="row between mt" style="text-align:left">
          <div><b style="color:var(--good)">+$${(c.perfect * b.earn).toLocaleString()}</b><div class="muted small">${c.perfect} perfect day${c.perfect === 1 ? '' : 's'} × $${b.earn}</div></div>
          <div style="text-align:right"><b style="color:var(--bad)">−$${(c.missed * b.lose).toLocaleString()}</b><div class="muted small">${c.missed} missed day${c.missed === 1 ? '' : 's'} × $${b.lose}</div></div>
        </div>
        <p class="muted small" style="margin-bottom:0">Pretend money — nothing is ever charged. A missed day = under half your habits done.</p>
      </div>
    </div>

    ${state.purchases.length ? `<div class="card"><div class="card-head"><h3>🧾 Rewards you've claimed</h3><span class="pill good">${state.purchases.length}</span></div>
      ${state.purchases.slice().reverse().map(p => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line)"><span>${esc(p.icon || '🎁')} ${esc(p.name)}<div class="muted small">${nice(p.date)}</div></span><span class="row"><b>−${p.cost.toLocaleString()}</b><button class="btn sm ghost" data-act="refund" data-id="${p.id}" aria-label="Undo">Undo</button></span></div>`).join('')}
    </div>` : ''}`;
}
function rewardForm(id) {
  const r = state.rewards.find(x => x.id === id) || { id: '', icon: '🎁', name: '', cost: 500 };
  openSheet(`<h2>${id ? 'Edit' : 'New'} reward</h2>
    <div class="row"><label class="field" style="width:70px"><span>Icon</span><input type="text" id="rIcon" value="${esc(r.icon)}"></label>
    <label class="field grow"><span>Reward</span><input type="text" id="rName" value="${esc(r.name)}" placeholder="e.g. Steak dinner"></label></div>
    <label class="field"><span>Cost in points</span><input type="number" inputmode="numeric" id="rCost" value="${r.cost}"></label>
    <p class="muted small">A perfect day is worth about 265+ points, so 500 pts ≈ 2 great days.</p>
    <div class="row mt">${id ? `<button class="btn danger" data-act="delReward" data-id="${id}">Delete</button>` : ''}<button class="btn ghost" data-act="close">Cancel</button><button class="btn primary grow" data-act="saveReward" data-id="${id}">Save</button></div>`);
}

// ---------------- PROGRESS ----------------
const BADGES = [
  { n: 7, em: '🥉', name: 'One Week' }, { n: 30, em: '🥈', name: 'One Month' },
  { n: 60, em: '🥇', name: 'Two Months' }, { n: 90, em: '🏆', name: 'Finisher' },
];
function renderProgress(c) {
  const t = c.tIdx, dayNum = Math.max(0, Math.min(TOTAL, t + 1));
  const cells = Array.from({ length: TOTAL }, (_, i) => {
    const ds = addDays(state.startDate, i), dc = c.days[ds];
    let cls = '';
    if (!dc) cls = 'future';
    else if (dc.perfect) cls = 'perfect';
    else if (dc.pct >= .75) cls = 'l3'; else if (dc.pct >= .5) cls = 'l2'; else if (dc.pct > 0) cls = 'l1';
    if (ds === today()) cls += ' today';
    return `<button class="${cls}" data-act="openDay" data-ds="${ds}" ${dc ? '' : 'disabled'} aria-label="Day ${i + 1}">${i + 1}</button>`;
  }).join('');
  const sundays = [];
  for (let i = 0; i <= Math.min(t, TOTAL - 1); i++) { const ds = addDays(state.startDate, i); if (dow(ds) === 0 && ds < today()) sundays.push(ds); }
  view.innerHTML = `
    <div class="card hero">
      <div class="daynum" style="position:relative;z-index:1">Day ${dayNum}<small> of ${TOTAL}</small></div>
      <div class="bar"><i style="width:${dayNum / TOTAL * 100}%"></i></div>
      <div class="stats">
        <div><b>${c.earned.toLocaleString()}</b><span>Total points</span></div>
        <div><b>${c.perfect}</b><span>Perfect days</span></div>
        <div><b>$${c.bank}</b><span>Reward bank</span></div>
      </div>
    </div>

    <div class="grid2"><div>
    <div class="section-title"><h2>🗓 Your 90 days</h2><small>tap a day to edit it</small></div>
    <div class="card"><div class="cal">${cells}</div>
      <div class="legend"><span><i style="background:var(--gold)"></i>Perfect</span><span><i style="background:rgba(52,211,153,.7)"></i>75%+</span><span><i style="background:rgba(52,211,153,.42)"></i>50%+</span><span><i style="background:rgba(52,211,153,.18)"></i>Started</span><span><i style="background:var(--bg2);border:1px solid var(--line)"></i>Not yet</span></div>
    </div>

    </div><div>
    <div class="section-title"><h2>🏅 Badges</h2><small>${c.active} solid days</small></div>
    <div class="card"><div class="badges">${BADGES.map(b => `<div class="badge ${c.active >= b.n ? 'got' : ''}"><span class="em">${b.em}</span><b>${b.name}</b><small>${Math.min(c.active, b.n)}/${b.n} days</small></div>`).join('')}</div>
    <p class="muted small" style="margin-bottom:0">A “solid day” = at least half your habits done.</p></div>

    <div class="section-title"><h2>🔥 Streaks</h2><small>now · best</small></div>
    <div class="card">${state.habits.map(h => `<div class="streak-row"><span style="font-size:20px">${esc(h.icon)}</span>
      <div class="grow"><div class="row between"><span class="small" style="font-weight:600">${esc(h.name)}</span><span class="small nums"><b>${c.run[h.id] || 0}</b> · <span class="muted">${c.best[h.id] || 0}</span></span></div>
      <div class="streak-bar"><i style="width:${Math.min(100, (c.run[h.id] || 0) / TOTAL * 100)}%"></i></div></div></div>`).join('')}</div>

    </div></div>
    <div class="grid2"><div>
    <div class="section-title"><h2>💪 Workouts</h2></div>
    ${workoutProgress(c)}
    </div><div>

    <div class="section-title"><h2>📊 Weekly reports</h2><small>every Sunday</small></div>
    ${sundays.length ? sundays.reverse().map(s => weeklyCard(s, c)).join('') : '<div class="card muted small">Your first weekly report appears on your first Sunday.</div>'}
    </div></div>`;
}
function checkBadges(c) {
  const got = BADGES.filter(b => c.active >= b.n && !state.seenBadges.includes(b.n));
  if (!got.length) return;
  got.forEach(b => state.seenBadges.push(b.n)); save();
  const b = got[got.length - 1];
  confetti();
  openSheet(`<div class="center"><div style="font-size:72px">${b.em}</div><h2>Badge unlocked: ${b.name}!</h2>
    <p class="muted">${b.n} solid days. ${b.n === 90 ? 'You finished the 90-Day Challenge. Legend.' : 'Keep stacking days — the next badge is waiting.'}</p>
    <button class="btn primary block" data-act="close">Let's keep going 💪</button></div>`);
}

// ---------------- SETTINGS ----------------
function openSettings() {
  openSheet(`<h2>⚙️ Settings</h2>
    <label class="field"><span>Your name</span><input type="text" id="stName" value="${esc(state.name)}"></label>
    <label class="field"><span>Start date of your 90 days</span><input type="date" id="stStart" value="${state.startDate}"></label>
    <button class="btn primary block" data-act="saveSettings">Save</button>
    <button class="btn ghost block mt" data-act="themes">🎨 Change colors</button>
    <div class="section-title"><h2>Habits</h2></div>
    ${habitEditorList()}
    <div class="section-title"><h2>Backup</h2></div>
    <div class="card"><p class="muted small" style="margin-top:0">Your data lives only on this device. Make a backup now and then — you can restore it on a new phone.</p>
      <div class="row"><button class="btn ghost grow" data-act="export">⬇️ Save backup</button>
      <label class="btn ghost grow center" style="display:block">⬆️ Restore<input type="file" id="importFile" accept=".json,application/json" hidden></label></div></div>
    <button class="btn danger block" data-act="reset">Erase everything & start over</button>
    <button class="btn ghost block mt" data-act="close">Close</button>`);
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(txt => {
      const data = JSON.parse(txt);
      if (!data || !data.habits || !data.days) throw new Error('bad');
      if (!confirm('Replace everything on this device with this backup?')) return;
      state = Object.assign(freshState(), data); save(); closeSheet(); render(); toast('Backup restored ✓');
    }).catch(() => toast('That file is not a 90-Day Challenge backup.'));
  });
}

// ---------------- meditation timer ----------------
let timer = null; // { end, total, paused, left, iv, lock }
function openTimer() {
  openSheet(`<h2>🧘 Meditation</h2>
    <p class="muted small">Sit comfortably, close your eyes, and breathe slowly. When your mind wanders, gently come back to the breath.</p>
    <div class="seg" id="tmSeg"><button data-m="10">10 min</button><button data-m="20" class="on">20 min</button><button data-m="30">30 min</button></div>
    <div class="timer-face" id="tmFace">20:00</div>
    <div class="row"><button class="btn ghost" data-act="close">Close</button><button class="btn primary grow" id="tmGo">Start</button></div>
    <p class="muted small center">Tip: keep this screen open. When the timer ends, your meditation is checked off automatically.</p>`);
  let minutes = 20;
  $('#tmSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || timer) return;
    minutes = Number(b.dataset.m);
    $('#tmSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('#tmFace').textContent = `${minutes}:00`;
  });
  $('#tmGo').addEventListener('click', async () => {
    if (!timer) {
      timer = { total: minutes * 60, end: Date.now() + minutes * 60000 };
      try { timer.lock = await navigator.wakeLock?.request('screen'); } catch {}
      timer.iv = setInterval(tick, 250); $('#tmGo').textContent = 'Pause';
    } else if (timer.paused) {
      timer.end = Date.now() + timer.left; timer.paused = false; $('#tmGo').textContent = 'Pause';
    } else {
      timer.left = timer.end - Date.now(); timer.paused = true; $('#tmGo').textContent = 'Resume';
    }
  });
}
function tick() {
  if (!timer || timer.paused) return;
  const left = Math.max(0, timer.end - Date.now());
  const f = $('#tmFace'); if (f) f.textContent = `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}`;
  if (left <= 0) {
    const mins = Math.round(timer.total / 60);
    stopTimer(true);
    chime(); navigator.vibrate?.([300, 150, 300]);
    const h = state.habits.find(x => x.timer) || habitById('meditate');
    if (inRange(today())) {
      const d = dayData(today()); d.med = (d.med || 0) + mins;
      if (h && mins >= 20) d.h[h.id] = 1;
      save();
    }
    openSheet(`<div class="center"><div style="font-size:64px">🧘</div><h2>${mins} minutes done</h2>
      <p class="muted">${mins >= 20 ? 'Meditation checked off for today. Calm mind, strong day.' : 'Nice work. Go for 20+ minutes to check off the habit.'}</p>
      <button class="btn primary block" data-act="close">Back to my day</button></div>`);
    render();
  }
}
function stopTimer() {
  if (!timer) return;
  clearInterval(timer.iv); try { timer.lock?.release(); } catch {}
  timer = null;
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, .35, .7].forEach((t, k) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = [528, 660, 792][k]; o.type = 'sine';
      g.gain.setValueAtTime(.0001, ac.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.3, ac.currentTime + t + .05);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + 1.6);
      o.connect(g).connect(ac.destination); o.start(ac.currentTime + t); o.stop(ac.currentTime + t + 1.7);
    });
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && timer) tick(); });

// ============================================================
// ACTIONS (every button with data-act ends up here)
// ============================================================
function toggleHabit(id) {
  const ds = tab === 'schedule' ? today() : viewDate;
  if (!inRange(ds)) return;
  const d = dayData(ds), before = compute().days[ds];
  if (d.h[id]) delete d.h[id]; else { d.h[id] = 1; if (d.slip) delete d.slip[id]; }
  if (id === 'workout' && d.wo) d.wo.done = d.h[id] ? 1 : 0;
  save();
  const after = compute().days[ds];
  if (after && after.perfect && !(before && before.perfect)) { confetti(); toast('🌟 PERFECT DAY! +50 bonus'); }
  else if (d.h[id]) { const h = habitById(id); toast(`+${after.rows.find(r => r.h && r.h.id === id)?.p ?? basePts(h)} pts · ${h.icon} nice!`); }
  render();
}

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.nav button[data-tab]');
  if (tabBtn) { tab = tabBtn.dataset.tab; if (tab !== 'workout') wkDow = null; window.scrollTo(0, 0); render(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  const val = s => ($(s)?.value ?? '').trim();
  switch (act) {
    case 'close': closeSheet(); break;
    case 'settings': openSettings(); break;
    case 'themes': openThemes(); break;
    case 'setTheme': state.theme = id; save(); applyTheme(); openThemes(); render(); break;
    case 'filter': listFilter = el.dataset.f; render(); break;
    case 'goTab': tab = el.dataset.tab; wkDow = null; window.scrollTo(0, 0); render(); break;
    case 'quickAdd': {
      const name = val('#qaName'), cost = Number(val('#qaCost'));
      if (!name || !cost) { toast('Add a name and a point cost'); return; }
      state.rewards.push({ id: 'r' + uid(), icon: val('#qaIcon') || '🎁', name, cost: Math.max(1, cost) });
      save(); render(); toast('Reward added 🎁'); break;
    }
    case 'addIdea': {
      const x = REWARD_IDEAS[Number(el.dataset.i)];
      state.rewards.push({ id: 'r' + uid(), icon: x[0], name: x[1], cost: x[2] });
      save(); render(); toast(`${x[0]} ${x[1]} added — tap Edit to change the price`); break;
    }

    // setup wizard
    case 'setupNext':
      if (setupStep === 0) { state.name = val('#sName'); state.startDate = val('#sStart') || today(); viewDate = today(); }
      setupStep++; save(); render(); window.scrollTo(0, 0); break;
    case 'setupBack': setupStep--; render(); break;
    case 'setupFinish':
      state.bank = { stake: Number(val('#sStake')) || 0, earn: Number(val('#sEarn')) || 0, lose: Number(val('#sLose')) || 0 };
      state.setupDone = true; save(); tab = 'today'; render(); confetti(); toast('Day 1 starts now. Let\'s go! 🚀'); break;

    // habits
    case 'toggle': toggleHabit(id); break;
    case 'slip': {
      if (!inRange(viewDate)) return;
      const d = dayData(viewDate); delete d.h[id]; d.slip[id] = 1; save(); render();
      const msg = ENCOURAGEMENT[Math.floor(Math.random() * ENCOURAGEMENT.length)];
      openSheet(`<div class="center"><div style="font-size:60px">🤝</div><h2>It's okay. Reset and keep going.</h2>
        <p>${esc(msg)}</p><p class="muted small">Your “days clean” counter for <b>${esc(habitById(id).name)}</b> starts fresh tomorrow. Everything else you've built is still here.</p>
        <button class="btn primary block" data-act="close">I'm back on it 💪</button>
        <button class="btn ghost block mt" data-act="unslip" data-id="${id}">Oops, I tapped by mistake</button></div>`);
      break;
    }
    case 'unslip': { const d = dayData(viewDate); delete d.slip[id]; save(); closeSheet(); render(); break; }
    case 'timer': openTimer(); break;
    case 'bonus': {
      if (!inRange(viewDate)) return;
      const d = dayData(viewDate), before = compute().days[viewDate];
      d.bonus = d.bonus ? 0 : 1; save();
      const after = compute().days[viewDate];
      if (after.perfect && !before.perfect) { confetti(); toast('🌟 PERFECT DAY! +50 bonus'); } else if (d.bonus) toast('⚡ Challenge crushed! +25');
      render(); break;
    }
    case 'prevDay': { const p = addDays(viewDate, -1); if (dayIndex(p) >= 0) { viewDate = p; render(); } else toast('That was Day 1!'); break; }
    case 'nextDay': { const n = addDays(viewDate, 1); if (n <= today()) { viewDate = n; render(); } break; }
    case 'goToday': viewDate = today(); render(); break;
    case 'openDay': viewDate = el.dataset.ds; tab = 'today'; window.scrollTo(0, 0); render(); break;
    case 'editHabit': habitForm(id); break;
    case 'saveHabit': {
      const name = val('#hName'); if (!name) { toast('Give the habit a name'); return; }
      const data = { icon: val('#hIcon') || '⭐', name, goal: val('#hGoal'), type: $('#hType').value, big: $('#hBig').checked };
      if (id) Object.assign(habitById(id), data); else state.habits.push({ id: 'h' + uid(), ...data });
      save(); closeSheet(); render(); if (state.setupDone) openSettings(); break;
    }
    case 'delHabit': {
      const h = habitById(id); if (!confirm(`Remove "${h.name}"? (Past check-offs are kept in the history.)`)) return;
      state.habits = state.habits.filter(x => x.id !== id); save(); render(); if (state.setupDone) openSettings(); break;
    }

    // workout
    case 'wkDow': wkDow = Number(el.dataset.d); render(); break;
    case 'woDone': {
      const ds = inRange(viewDate) ? viewDate : today(); if (!inRange(ds)) return;
      const d = dayData(ds); d.wo ||= { log: {} };
      const before = compute().days[ds];
      d.wo.done = d.wo.done ? 0 : 1; d.wo.mode = state.workoutMode; d.wo.day = wkDow;
      if (habitById('workout')) { if (d.wo.done) d.h.workout = 1; else delete d.h.workout; }
      save();
      if (d.wo.done) { const after = compute().days[ds]; if (after.perfect && !before.perfect) { confetti(); toast('🌟 PERFECT DAY! +50 bonus'); } else toast('💪 Workout logged! Daily workout checked off.'); }
      render(); break;
    }
    case 'editPlan': planEditor(wkDow); break;
    case 'exAdd': readPlanEditor(); state.workouts[wkDow][el.dataset.mode].push({ name: '', sets: 3, reps: 10, unit: 'reps' }); planEditor(wkDow); break;
    case 'exDel': readPlanEditor(); state.workouts[wkDow][el.dataset.mode].splice(Number(el.dataset.j), 1); planEditor(wkDow); break;
    case 'planSave': readPlanEditor(); save(); closeSheet(); render(); toast('Plan saved ✓'); break;
    case 'planReset': if (confirm('Reset this day to the original plan?')) { state.workouts[wkDow] = clone(DEFAULT_WORKOUTS[wkDow]); save(); closeSheet(); render(); } break;

    // schedule
    case 'editBlock': blockForm(id); break;
    case 'saveBlock': {
      const data = { name: val('#bName') || 'Block', icon: val('#bIcon'), start: val('#bStart') || '12:00', end: val('#bEnd') || val('#bStart'),
        items: $('#bItems').value.split('\n').map(s => s.trim()).filter(Boolean),
        habits: [...document.querySelectorAll('.bHab:checked')].map(x => x.value) };
      if (id) Object.assign(state.schedule.find(x => x.id === id), data); else state.schedule.push({ id: 'b' + uid(), ...data });
      state.schedule.sort((a, b) => a.start.localeCompare(b.start));
      save(); closeSheet(); render(); break;
    }
    case 'delBlock': if (confirm('Delete this time block?')) { state.schedule = state.schedule.filter(x => x.id !== id); save(); closeSheet(); render(); } break;
    case 'ics': download('90-day-schedule.ics', makeICS(), 'text/calendar'); toast('Calendar file ready 📅'); break;

    // rewards
    case 'editReward': rewardForm(id); break;
    case 'saveReward': {
      const name = val('#rName'); if (!name) { toast('Name your reward'); return; }
      const data = { icon: val('#rIcon') || '🎁', name, cost: Math.max(1, Number(val('#rCost')) || 1) };
      if (id) Object.assign(state.rewards.find(x => x.id === id), data); else state.rewards.push({ id: 'r' + uid(), ...data });
      save(); closeSheet(); render(); break;
    }
    case 'delReward': state.rewards = state.rewards.filter(x => x.id !== id); save(); closeSheet(); render(); break;
    case 'buy': {
      const r = state.rewards.find(x => x.id === id), c = compute();
      if (c.avail < r.cost) return;
      if (!confirm(`Spend ${r.cost} points on "${r.name}"?`)) return;
      state.purchases.push({ id: 'p' + uid(), rewardId: r.id, icon: r.icon, name: r.name, cost: r.cost, date: today() });
      save(); confetti(); render();
      openSheet(`<div class="center"><div style="font-size:64px">${esc(r.icon || '🎁')}</div><h2>You earned it!</h2><p>Enjoy your <b>${esc(r.name)}</b>. Hard work, real reward.</p><button class="btn primary block" data-act="close">Back to work 💪</button></div>`);
      break;
    }
    case 'refund': if (confirm('Undo this purchase and get the points back?')) { state.purchases = state.purchases.filter(p => p.id !== id); save(); render(); } break;
    case 'editBank':
      openSheet(`<h2>💰 Money on the line</h2><p class="muted small">Pretend money only — nothing is ever charged.</p>
        <label class="field"><span>Amount on the line ($)</span><input type="number" id="bkStake" value="${state.bank.stake}"></label>
        <div class="row"><label class="field grow"><span>Earn per perfect day</span><input type="number" id="bkEarn" value="${state.bank.earn}"></label>
        <label class="field grow"><span>Lose per missed day</span><input type="number" id="bkLose" value="${state.bank.lose}"></label></div>
        <div class="row mt"><button class="btn ghost" data-act="close">Cancel</button><button class="btn primary grow" data-act="saveBank">Save</button></div>`);
      break;
    case 'saveBank': state.bank = { stake: Number(val('#bkStake')) || 0, earn: Number(val('#bkEarn')) || 0, lose: Number(val('#bkLose')) || 0 }; save(); closeSheet(); render(); break;

    // settings
    case 'saveSettings': {
      const s = val('#stStart');
      if (s && s !== state.startDate && !confirm('Change your start date? Your check-offs stay on the dates you made them.')) return;
      state.name = val('#stName'); if (s) state.startDate = s; viewDate = today(); save(); closeSheet(); render(); toast('Saved ✓'); break;
    }
    case 'export': download(`90-day-backup-${today()}.json`, JSON.stringify(state, null, 1), 'application/json'); toast('Backup saved ⬇️'); break;
    case 'reset':
      if (confirm('Erase ALL your data on this device?') && confirm('Are you sure? This cannot be undone.')) {
        localStorage.removeItem(KEY); state = freshState(); setupStep = 0; tab = 'today'; closeSheet(); render();
      }
      break;
  }
});
$('#settingsBtn').addEventListener('click', () => state.setupDone ? openSettings() : null);
$('#themeBtn').addEventListener('click', openThemes);

// Refresh at midnight / when coming back to the app so "today" is always right
let lastDay = today();
const refreshIfNewDay = () => { if (today() !== lastDay) { lastDay = today(); viewDate = today(); if (!$('#modal').classList.contains('hidden')) return; render(); } };
setInterval(refreshIfNewDay, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNewDay(); });

// Offline support + "install to home screen"
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
})();
