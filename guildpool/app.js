/* GuildPool — DRAFT prototype. All data is local to this device (localStorage). */
(() => {
  'use strict';

  const KEY = 'guildpool.v1';
  const POINTS_PER_HOUR = 10;
  const POINTS_PER_ACHIEVEMENT = 5;
  const SEASON_BONUS = 50;

  // Demo catalogue. Sponsors/prizes are placeholders, not real partnerships.
  const SEASONS = [
    { id: 's-fps', title: 'FPS Marathon', genre: 'FPS', goalHours: 50, sponsor: 'Demo Accelerator Co.',
      prize: 'Monthly accelerator pass pool (sponsor-funded, in kind)', poolUnits: 20 },
    { id: 's-moba', title: 'MOBA Grind', genre: 'MOBA', goalHours: 30, sponsor: 'Demo Peripheral Brand',
      prize: 'Gaming mouse prize pool (sponsor-funded, in kind)', poolUnits: 5 },
    { id: 's-multi', title: 'Cross-Game Explorer', genre: '*', goalHours: 40, achievementGoal: 10,
      sponsor: 'Demo Studio Partner', prize: 'In-game item codes (sponsor-funded)', poolUnits: 50 },
  ];
  const REWARDS = [
    { id: 'r1', title: '1-month accelerator pass', cost: 400, sponsor: 'Demo Accelerator Co.' },
    { id: 'r2', title: 'In-game currency code (sponsor)', cost: 250, sponsor: 'Demo Studio Partner' },
    { id: 'r3', title: 'Peripheral discount voucher', cost: 600, sponsor: 'Demo Peripheral Brand' },
  ];
  const CONNECTORS = [
    { id: 'steam', name: 'Steam', note: 'Public Web API (needs your profile set to public + a backend)' },
    { id: 'riot', name: 'Riot Games', note: 'Riot API (requires production key / RSO sign-on)' },
    { id: 'psn', name: 'PlayStation', note: 'No official public API — partner program required' },
    { id: 'nintendo', name: 'Nintendo', note: 'No public API — manual logging only' },
  ];
  const GENRES = ['FPS', 'MOBA', 'RPG', 'Strategy', 'Sports', 'Other'];

  const load = () => {
    try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); }
    catch { return defaults(); }
  };
  const defaults = () => ({ name: '', logs: [], joined: [], offers: [], requests: [], redeemed: [], bonuses: [] });
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const inMonth = (l) => (l.date || '').startsWith(monthKey());

  // ---- derived values ----
  const hoursFor = (season) => state.logs
    .filter(l => l.kind === 'play' && inMonth(l) && (season.genre === '*' || l.genre === season.genre))
    .reduce((a, l) => a + l.hours, 0);
  const achievementsThisMonth = () => state.logs.filter(l => l.kind === 'achievement' && inMonth(l)).length;
  const seasonDone = (s) => hoursFor(s) >= s.goalHours && (!s.achievementGoal || achievementsThisMonth() >= s.achievementGoal);
  const totalHours = () => state.logs.filter(l => l.kind === 'play').reduce((a, l) => a + l.hours, 0);
  const earned = () => {
    const play = state.logs.filter(l => l.kind === 'play').reduce((a, l) => a + Math.round(l.hours * POINTS_PER_HOUR), 0);
    const ach = state.logs.filter(l => l.kind === 'achievement').length * POINTS_PER_ACHIEVEMENT;
    const season = SEASONS.filter(s => state.joined.includes(s.id) && seasonDone(s)).length * SEASON_BONUS;
    const sessions = state.bonuses.reduce((a, b) => a + b.points, 0);
    return play + ach + season + sessions;
  };
  const spent = () => state.redeemed.reduce((a, r) => a + r.cost, 0);
  const balance = () => earned() - spent();

  // ---- views ----
  const views = {
    home() {
      return `
      <section class="card">
        <h2>Your reputation</h2>
        <div class="stats">
          <div><b>${balance()}</b><span>points</span></div>
          <div><b>${totalHours().toFixed(1)}</b><span>hours logged</span></div>
          <div><b>${state.joined.length}</b><span>seasons joined</span></div>
        </div>
        <label>Display name
          <input id="name" maxlength="24" value="${esc(state.name)}" placeholder="Player name" />
        </label>
        <p class="hint">Points are a non-transferable reputation score. They have no cash value, can't be bought, sold or withdrawn.</p>
      </section>
      <section class="card">
        <h2>How it works</h2>
        <ol>
          <li><b>Play &amp; log</b> — hours and achievements earn reputation.</li>
          <li><b>Join seasons</b> — hit a sponsor challenge to share its prize pool.</li>
          <li><b>Team up</b> — players with time help players without; both build reputation.</li>
          <li><b>Redeem</b> — spend points on sponsor in-kind rewards. No cash payouts.</li>
        </ol>
      </section>`;
    },

    log() {
      const rows = [...state.logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(l => `
        <li><span>${esc(l.date)} · ${l.kind === 'play' ? `${esc(l.game)} (${esc(l.genre)}) — ${l.hours}h` : `🏆 ${esc(l.game)}: ${esc(l.note || 'achievement')}`}
        <small>${esc(l.source)}</small></span>
        <button class="link" data-del="${l.id}" aria-label="Delete entry">✕</button></li>`).join('');
      return `
      <section class="card">
        <h2>Log playtime</h2>
        <form id="playForm">
          <label>Game <input name="game" required maxlength="40" /></label>
          <label>Genre <select name="genre">${GENRES.map(g => `<option>${g}</option>`).join('')}</select></label>
          <label>Hours <input name="hours" type="number" min="0.25" max="24" step="0.25" required /></label>
          <label>Date <input name="date" type="date" required value="${new Date().toISOString().slice(0, 10)}" /></label>
          <button class="btn">Add playtime</button>
        </form>
      </section>
      <section class="card">
        <h2>Log achievement</h2>
        <form id="achForm">
          <label>Game <input name="game" required maxlength="40" /></label>
          <label>Achievement <input name="note" maxlength="60" /></label>
          <button class="btn">Add achievement</button>
        </form>
      </section>
      <section class="card">
        <h2>Connect accounts <span class="tag">coming soon</span></h2>
        <ul class="plain">${CONNECTORS.map(c => `<li><b>${c.name}</b><small>${c.note}</small></li>`).join('')}</ul>
        <p class="hint">Opt-in only, using official APIs. This app does <b>not</b> use Accessibility Service or screen/usage scraping.</p>
      </section>
      <section class="card"><h2>History</h2><ul class="plain">${rows || '<li class="hint">Nothing logged yet.</li>'}</ul></section>`;
    },

    seasons() {
      return SEASONS.map(s => {
        const h = hoursFor(s), pct = Math.min(100, Math.round(h / s.goalHours * 100));
        const joined = state.joined.includes(s.id), done = joined && seasonDone(s);
        return `
        <section class="card">
          <h2>${esc(s.title)} <span class="tag">${monthKey()}</span></h2>
          <p>Play <b>${s.goalHours}h</b>${s.genre === '*' ? ' across any games' : ` of ${esc(s.genre)}`}${s.achievementGoal ? ` + <b>${s.achievementGoal}</b> achievements` : ''} this month.</p>
          <p class="hint">Sponsor: ${esc(s.sponsor)} · Prize: ${esc(s.prize)} · ${s.poolUnits} units, shared equally by qualifiers.</p>
          <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
          <p class="hint">${h.toFixed(1)} / ${s.goalHours} h ${s.achievementGoal ? `· ${achievementsThisMonth()} / ${s.achievementGoal} achievements` : ''}</p>
          ${joined ? (done ? '<p class="ok">✅ Qualified — +50 bonus points</p>' : '<p class="hint">Joined — keep playing!</p>')
                   : `<button class="btn" data-join="${s.id}">Join season</button>`}
        </section>`;
      }).join('');
    },

    team() {
      const list = (arr, kind) => arr.map(x => `
        <li><span><b>${esc(x.game)}</b> — ${esc(x.desc)}<small>${esc(x.who || 'You')} · ${x.hours}h · ${x.status}</small></span>
        ${x.status === 'open' ? `<button class="link" data-cancel="${kind}:${x.id}">cancel</button>` : ''}
        ${x.status === 'matched' ? `<button class="btn sm" data-confirm="${kind}:${x.id}">Confirm session done</button>` : ''}</li>`).join('');
      return `
      <section class="card">
        <h2>Play-with-me</h2>
        <p class="hint">Time-rich players help time-poor players in <b>co-op sessions</b> (coaching, party play, quest help). Both people stay on their own accounts.
        Account sharing, "piloting" and boosting are not allowed — they break most games' terms of service.</p>
      </section>
      <section class="card">
        <h2>Offer my time</h2>
        <form id="offerForm">
          <label>Game <input name="game" required maxlength="40" /></label>
          <label>What I can help with <input name="desc" required maxlength="80" placeholder="e.g. raid co-op, rank coaching" /></label>
          <label>Hours <input name="hours" type="number" min="0.5" max="8" step="0.5" required /></label>
          <button class="btn">Post offer</button>
        </form>
        <ul class="plain">${list(state.offers, 'offer') || '<li class="hint">No offers yet.</li>'}</ul>
      </section>
      <section class="card">
        <h2>Ask for help</h2>
        <form id="reqForm">
          <label>Game <input name="game" required maxlength="40" /></label>
          <label>What I need <input name="desc" required maxlength="80" /></label>
          <label>Hours <input name="hours" type="number" min="0.5" max="8" step="0.5" required /></label>
          <button class="btn">Post request</button>
        </form>
        <ul class="plain">${list(state.requests, 'request') || '<li class="hint">No requests yet.</li>'}</ul>
        <p class="hint">Demo: matching is simulated locally (a request/offer is auto-matched after you tap “simulate match”).</p>
        <button class="btn sm ghost" id="simMatch">Simulate match</button>
      </section>
      <section class="card">
        <h2>Money-side settlement</h2>
        <p class="hint">Not in this draft. Any cash payment between players would need a licensed payment provider and legal review first. Until then, helpers earn reputation points only.</p>
      </section>`;
    },

    rewards() {
      return `
      <section class="card"><h2>Redeem points</h2><p><b>${balance()}</b> points available</p>
        <p class="hint">Rewards are funded and fulfilled by sponsors, in kind. There is no cash-out.</p></section>
      ${REWARDS.map(r => `
        <section class="card"><h3>${esc(r.title)}</h3><p class="hint">${esc(r.sponsor)} · ${r.cost} pts</p>
        <button class="btn" data-redeem="${r.id}" ${balance() < r.cost ? 'disabled' : ''}>Redeem</button></section>`).join('')}
      <section class="card"><h3>Redeemed</h3><ul class="plain">${state.redeemed.map(r => `<li>${esc(r.title)} <small>${esc(r.date)} · demo code ${esc(r.code)}</small></li>`).join('') || '<li class="hint">None yet.</li>'}</ul></section>`;
    },

    about() {
      return `
      <section class="card"><h2>About this draft</h2>
        <p>GuildPool is an early prototype. Data stays on your device. Sponsors, prizes and codes are placeholders.</p>
        <h3>Design guardrails</h3>
        <ul>
          <li>Reputation points are non-transferable, non-purchasable and have no cash value.</li>
          <li>Prizes are sponsor-funded and delivered in kind (passes, peripherals, in-game codes).</li>
          <li>No pooling or holding of members' money by the platform.</li>
          <li>Playtime comes from manual logs or official, opt-in game APIs — not from Accessibility Service.</li>
          <li>No account sharing, boosting or piloting.</li>
        </ul>
        <p class="hint">This is not legal advice. Whether a given prize/reward scheme is a regulated activity (gambling/lottery, money transmission, securities, consumer or tax rules) depends on your jurisdiction. Get qualified legal review before any real launch.</p>
        <button class="btn ghost" id="reset">Reset all local data</button>
      </section>`;
    },
  };

  // ---- render + events ----
  let tab = 'home';
  function render() {
    $('#view').innerHTML = views[tab]();
    document.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
    bind();
  }
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); };

  function bind() {
    const v = $('#view');
    $('#name', v)?.addEventListener('input', e => { state.name = e.target.value; save(); });
    $('#playForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.logs.push({ id: uid(), kind: 'play', game: f.get('game').trim(), genre: f.get('genre'), hours: +f.get('hours'), date: f.get('date'), source: 'manual' });
      save(); toast('Playtime added'); render();
    });
    $('#achForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.logs.push({ id: uid(), kind: 'achievement', game: f.get('game').trim(), note: f.get('note').trim(), date: new Date().toISOString().slice(0, 10), source: 'manual' });
      save(); toast('Achievement added'); render();
    });
    v.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { state.logs = state.logs.filter(l => l.id !== b.dataset.del); save(); render(); }));
    v.querySelectorAll('[data-join]').forEach(b => b.addEventListener('click', () => { state.joined.push(b.dataset.join); save(); toast('Joined season'); render(); }));
    v.querySelectorAll('[data-redeem]').forEach(b => b.addEventListener('click', () => {
      const r = REWARDS.find(x => x.id === b.dataset.redeem); if (!r || balance() < r.cost) return;
      state.redeemed.push({ title: r.title, cost: r.cost, date: new Date().toISOString().slice(0, 10), code: 'DEMO-' + uid().toUpperCase() });
      save(); toast('Redeemed (demo)'); render();
    }));
    const post = (id, key) => $(id, v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state[key].push({ id: uid(), game: f.get('game').trim(), desc: f.get('desc').trim(), hours: +f.get('hours'), status: 'open' });
      save(); toast('Posted'); render();
    });
    post('#offerForm', 'offers'); post('#reqForm', 'requests');
    v.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => {
      const [k, id] = b.dataset.cancel.split(':'); const key = k === 'offer' ? 'offers' : 'requests';
      state[key] = state[key].filter(x => x.id !== id); save(); render();
    }));
    $('#simMatch', v)?.addEventListener('click', () => {
      let n = 0; [...state.offers, ...state.requests].forEach(x => { if (x.status === 'open') { x.status = 'matched'; x.who = 'Demo partner'; n++; } });
      save(); toast(n ? `${n} matched` : 'Nothing to match'); render();
    });
    v.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', () => {
      const [k, id] = b.dataset.confirm.split(':'); const key = k === 'offer' ? 'offers' : 'requests';
      const x = state[key].find(y => y.id === id); if (!x) return;
      x.status = 'done';
      // Reputation goes to the helper (the player who offered time).
      if (k === 'offer') state.bonuses.push({ id: uid(), points: Math.round(x.hours * POINTS_PER_HOUR * 1.5) });
      save(); toast(k === 'offer' ? 'Session confirmed — reputation earned' : 'Session confirmed'); render();
    }));
    $('#reset', v)?.addEventListener('click', () => { if (confirm('Delete all local GuildPool data?')) { state = defaults(); save(); render(); } });
  }

  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));

  // ---- PWA ----
  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  render();
})();
