/* CareCircle — DRAFT prototype. Single-device demo: data is stored locally in this browser.
   Accounts here are LOCAL to this device (salted PBKDF2 hashes, never plain text) — real sign-in
   must be done by a server (see BACKEND.md). Other people on the map are SIMULATED. */
(() => {
  'use strict';
  const KEY = 'carecircle.v1';

  const CATEGORIES = [
    { id: 'chat', icon: '💬', title: 'Chat', help: 'A friendly phone or video chat' },
    { id: 'shopping', icon: '🛒', title: 'Shopping', help: 'Help buying groceries or errands' },
    { id: 'company', icon: '🤝', title: 'Companionship', help: 'A walk, a visit, or a coffee together' },
    { id: 'other', icon: '🧰', title: 'Something else', help: 'Tech help, reading mail, small tasks' },
  ];
  const WHEN = ['As soon as possible', 'Today', 'Tomorrow', 'This week'];
  const STATUS_LABEL = {
    open: 'Waiting for a helper', accepted: 'Helper on the way', arrived: 'Helper is here',
    done: 'Finished', cancelled: 'Cancelled',
  };
  const PBKDF2_ITERATIONS = 150000;
  const MAX_FAILS = 5, LOCK_MS = 30000;

  const defaults = () => ({
    role: 'senior', big: false, share: false, session: null, accounts: [],
    senior: { name: '', emergencyName: '', emergencyPhone: '' },
    helper: { name: '' },
    requests: [],
  });
  const load = () => { try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return defaults(); } };
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[3];
  const phoneOk = p => /^[+0-9()\-\s]{7,20}$/.test(p);
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const pwOk = p => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
  const newCode = () => String(Math.floor(1000 + Math.random() * 9000));
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

  // ---------------- session helpers ----------------
  const acct = () => state.accounts.find(a => a.id === state.session) || null;
  const isGuest = () => state.session === 'guest';
  const loggedIn = () => isGuest() || !!acct();
  const role = () => acct() ? acct().role : state.role;
  const cid = () => acct() ? acct().id : 'guest';
  const profile = () => acct() ? acct().profile : (state.role === 'senior' ? state.senior : state.helper);
  if (state.session && state.session !== 'guest' && !acct()) { state.session = null; }

  // ---------------- password hashing (WebCrypto PBKDF2) ----------------
  const b64e = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function hashPw(pw, saltB64) {
    const subtle = (window.crypto || {}).subtle;
    if (!subtle) throw new Error('secure-context');
    const key = await subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(saltB64), iterations: PBKDF2_ITERATIONS }, key, 256);
    return b64e(bits);
  }
  const newSalt = () => b64e(window.crypto.getRandomValues(new Uint8Array(16)));
  const safeEq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  const fails = {}; // email -> { n, until }  (in-memory throttle for the demo)

  // ---------------- geo helpers ----------------
  const DEFAULT_CENTER = { lat: 43.8561, lng: -79.3370 }; // demo area (Markham, ON) used when sharing is off
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dist = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const offset = (p, meters, bearingDeg) => {
    const b = rad(bearingDeg);
    return { lat: p.lat + (meters * Math.cos(b)) / 111320, lng: p.lng + (meters * Math.sin(b)) / (111320 * Math.cos(rad(p.lat))) };
  };
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  // Deterministic "fuzzing": the true point is always within maxM of the returned centre.
  const jitter = (id, p, maxM) => { const h = hash(id); return offset(p, (0.3 + 0.7 * ((h % 1000) / 1000)) * maxM, (h >>> 10) % 360); };
  const stepToward = (from, to, m) => {
    const d = dist(from, to); if (d <= m) return { ...to };
    const f = m / d; return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
  };
  const etaMin = m => Math.max(1, Math.round(m / 80)); // ~5 km/h walking
  const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

  let me = { ...DEFAULT_CENTER };
  let geoState = 'off'; // off | asking | on | denied | unsupported
  let watchId = null;
  function startGeo() {
    if (!navigator.geolocation) { geoState = 'unsupported'; return; }
    geoState = 'asking';
    watchId = navigator.geolocation.watchPosition(
      p => { me = { lat: p.coords.latitude, lng: p.coords.longitude }; geoState = 'on'; refreshMap(true); },
      () => { geoState = 'denied'; me = { ...DEFAULT_CENTER }; refreshMap(true); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }
  function stopGeo() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null; geoState = 'off'; me = { ...DEFAULT_CENTER };
  }
  const geoMsg = () => ({
    off: 'Location sharing is <b>off</b>. The map shows a demo area.',
    asking: 'Waiting for your phone to share its location…',
    on: 'Using your phone\'s location.',
    denied: 'Location permission was declined, so the map shows a demo area.',
    unsupported: 'This device can\'t share a location, so the map shows a demo area.',
  }[geoState]);

  // ---------------- simulated people ----------------
  const demoHelpers = () => [0, 1, 2].map(i => ({ id: 'dh' + i, pos: offset(me, 600 + i * 500, 70 + i * 110) }));
  const isMineAsSenior = r => (r.ownerId || 'guest') === cid();
  const isMineAsHelper = r => r.helperId === cid();
  const activeJob = () => [...state.requests].reverse().find(r =>
    (r.status === 'accepted' || r.status === 'arrived') && (role() === 'senior' ? isMineAsSenior(r) : isMineAsHelper(r)));
  const helperSelf = () => {
    const job = activeJob();
    return job && job.helperPos ? job.helperPos : offset(me, 1200, 45);
  };
  const reqPos = r => r.pos || me;
  const startHelper = r => { r.helperPos = offset(reqPos(r), 1500, hash(r.id) % 360); };

  let tab = { senior: 'home', helper: 'jobs' };
  let draftCat = null;
  let authTab = 'login';
  let authMsg = '';

  const initials = (name, fallback) => (String(name || fallback || '?').trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('') || '?').toUpperCase();

  function reqCard(r, mode) {
    const c = cat(r.category);
    const lines = [`<b>${c.icon} ${esc(c.title)}</b> — ${esc(r.when)}`];
    if (r.notes) lines.push(`<span>${esc(r.notes)}</span>`);
    if (mode === 'helper' && r.status === 'open') lines.push(`<small>About ${fmtDist(dist(helperSelf(), jitter(r.id, reqPos(r), 400)))} away (approximate area)${r.demo ? ' · demo' : ''}</small>`);
    if (mode === 'helper' && r.status !== 'open' && r.ownerName) lines.push(`<small>For ${esc(r.ownerName)}</small>`);
    lines.push(`<small>${STATUS_LABEL[r.status]}${r.helper ? ' · ' + esc(r.helper) : ''}${r.rating ? ' · ' + stars(r.rating) : ''}</small>`);
    let actions = '';
    if (mode === 'senior') {
      if (r.status === 'open') actions = `<button class="btn ghost" data-cancel="${r.id}">Cancel</button><button class="btn sm ghost" data-sim="${r.id}">Demo: a helper accepts</button>`;
      if (r.status === 'accepted') actions = `<div class="code" aria-label="Safety code">Your safety code: <b>${esc(r.code)}</b><small>Only let the helper in if they tell you this code.</small></div><button class="btn ghost" data-cancel="${r.id}">Cancel</button>`;
      if (r.status === 'arrived') actions = `<p class="hint">If you feel unsafe, use the Safety tab.</p>`;
      if (r.status === 'done' && !r.rating) actions = `<div class="rate">Rate your helper: ${[1, 2, 3, 4, 5].map(n => `<button class="star" data-rate="${r.id}:${n}" aria-label="${n} stars">★</button>`).join('')}</div>`;
    } else {
      if (r.status === 'open') actions = `<button class="btn" data-accept="${r.id}">Accept</button>`;
      if (r.status === 'accepted') actions = `<label>Ask the senior for their safety code
        <input inputmode="numeric" maxlength="4" id="code-${r.id}" placeholder="4-digit code"></label>
        <button class="btn" data-checkin="${r.id}">Check in</button><small id="err-${r.id}" class="err"></small>`;
      if (r.status === 'arrived') actions = `<button class="btn" data-finish="${r.id}">Mark finished</button>`;
    }
    return `<li class="card">${lines.join('<br>')}${actions ? `<div class="acts">${actions}</div>` : ''}</li>`;
  }

  // ---------------- auth screen ----------------
  function authView() {
    const login = authTab === 'login';
    return `
    <section class="card">
      <div class="seg" role="tablist" aria-label="Account">
        <button role="tab" aria-selected="${login}" data-auth="login">Log in</button>
        <button role="tab" aria-selected="${!login}" data-auth="register">Create account</button>
      </div>
      <p id="authMsg" class="err" role="alert">${esc(authMsg)}</p>
      ${login ? `
      <form id="loginForm" novalidate>
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" data-pw autocomplete="current-password" required></label>
        <label class="check"><input type="checkbox" id="showPw"> Show password</label>
        <button class="btn big">Log in</button>
      </form>` : `
      <form id="regForm" novalidate>
        <fieldset class="roles2"><legend>I want to…</legend>
          <label class="rolecard"><input type="radio" name="role" value="senior" checked><span><b>🙋 Get help</b><small>I'm a senior or a family member</small></span></label>
          <label class="rolecard"><input type="radio" name="role" value="helper"><span><b>🤝 Be a helper</b><small>I can chat, shop or keep company</small></span></label>
        </fieldset>
        <label>Your name<input name="name" maxlength="40" autocomplete="name" required></label>
        <label>Email<input name="email" type="email" autocomplete="username" required></label>
        <label>Password <small>At least 8 characters, with a letter and a number</small><input name="password" type="password" data-pw autocomplete="new-password" required></label>
        <label>Confirm password<input name="confirm" type="password" data-pw autocomplete="new-password" required></label>
        <label class="check"><input type="checkbox" id="showPw"> Show passwords</label>
        <label class="check"><input type="checkbox" name="agree" required> I understand this is a demo: my account stays on this device only.</label>
        <button class="btn big">Create my account</button>
      </form>`}
      <p class="hint">Real sign-in (with verification and recovery) needs a server. This draft keeps accounts on this device and stores only salted password hashes.</p>
    </section>
    <section class="card"><p>Just looking around?</p><button class="btn ghost" id="guestBtn">Continue as guest (demo)</button></section>`;
  }

  // ---------------- profile (Me) ----------------
  function meView() {
    const a = acct(), p = profile(), r = role();
    const f = (k) => esc(p[k] || '');
    const common = `
      <label>Display name<input name="name" maxlength="40" value="${f('name')}" required></label>
      <label>Phone <small>Optional</small><input name="phone" type="tel" maxlength="20" value="${f('phone')}" autocomplete="tel"></label>
      <label>Neighbourhood / city <small>Rough area only — never your street address</small><input name="area" maxlength="60" value="${f('area')}"></label>
      <label>Languages spoken<input name="languages" maxlength="60" value="${f('languages')}" placeholder="e.g. English, Mandarin"></label>`;
    const seniorFields = `
      <label>A little about me <small>Anything that helps a helper be kind and useful</small><textarea name="bio" maxlength="300" rows="3">${f('bio')}</textarea></label>
      <h3>Family / emergency contact</h3>
      <label>Contact's name<input name="emergencyName" maxlength="40" value="${f('emergencyName')}"></label>
      <label>Contact's phone<input name="emergencyPhone" type="tel" maxlength="20" value="${f('emergencyPhone')}"></label>`;
    const helperFields = `
      <fieldset class="svc"><legend>I can help with</legend>
        ${CATEGORIES.map(c => `<label class="check"><input type="checkbox" name="services" value="${c.id}" ${(p.services || []).includes(c.id) ? 'checked' : ''}> ${c.icon} ${c.title}</label>`).join('')}
      </fieldset>
      <label>When I'm usually free<input name="availability" maxlength="80" value="${f('availability')}" placeholder="e.g. weekday afternoons"></label>
      <label>About me<textarea name="bio" maxlength="300" rows="3">${f('bio')}</textarea></label>
      <p class="hint">Identity check: <b>not started</b>. A real launch requires ID and background checks before anyone can accept requests.</p>`;
    return `
    <section class="card prof">
      <div class="avatar" aria-hidden="true">${esc(initials(p.name, a && a.email))}</div>
      <div><h2>${esc(p.name || (a ? 'Your profile' : 'Guest'))}</h2>
        <span class="tag">${r === 'senior' ? 'Getting help' : 'Helper'}</span>
        ${a ? `<small>${esc(a.email)} · member since ${esc(new Date(a.created).toLocaleDateString())}</small>` : '<small>Guest mode — nothing is tied to an account</small>'}</div>
    </section>
    <section class="card"><h2>Edit profile</h2>
      <form id="meForm" novalidate>${common}${r === 'senior' ? seniorFields : helperFields}<button class="btn">Save changes</button></form>
    </section>
    ${a ? `
    <section class="card"><h2>Change password</h2>
      <form id="pwForm" novalidate>
        <label>Current password<input name="current" type="password" data-pw autocomplete="current-password"></label>
        <label>New password<input name="next" type="password" data-pw autocomplete="new-password"></label>
        <label>Confirm new password<input name="confirm" type="password" data-pw autocomplete="new-password"></label>
        <label class="check"><input type="checkbox" id="showPw"> Show passwords</label>
        <p id="pwMsg" class="err" role="alert"></p>
        <button class="btn">Update password</button>
      </form></section>` : `
    <section class="card"><h2>Want to keep your profile?</h2><p class="hint">Create an account so your profile and requests belong to you.</p>
      <button class="btn" id="goRegister">Create an account</button></section>`}
    <section class="card"><button class="btn ghost" id="logout">${a ? 'Log out' : 'Leave guest mode'}</button>
      ${a ? '<button class="btn ghost danger" id="delAcct">Delete my account</button>' : ''}</section>
    <section class="card"><details><summary><b>About this draft</b></summary>${aboutText()}</details></section>`;
  }

  const views = {
    // ---------- senior ----------
    'senior:home'() {
      const p = profile();
      return `
      <section class="card"><h2>${p.name ? `Hello, ${esc(p.name.split(' ')[0])}!` : 'Hello!'}</h2>
        <p>What would you like help with?</p>
        <div class="grid">${CATEGORIES.map(c => `<button class="tile" data-cat="${c.id}"><span class="ico">${c.icon}</span><b>${c.title}</b><small>${c.help}</small></button>`).join('')}</div>
      </section>
      ${draftCat ? `
      <section class="card" id="newreq"><h2>${cat(draftCat).icon} ${cat(draftCat).title}</h2>
        <form id="reqForm">
          <label>When?<select name="when">${WHEN.map(w => `<option>${w}</option>`).join('')}</select></label>
          <label>Anything the helper should know? (optional)
            <textarea name="notes" maxlength="200" rows="3" placeholder="e.g. I need milk, bread and eggs"></textarea></label>
          <p class="hint">Please don't write passwords, bank details or health records here.</p>
          <button class="btn big">Send my request</button>
          <button type="button" class="btn ghost" id="cancelDraft">Never mind</button>
        </form></section>` : ''}`;
    },
    'senior:mine'() {
      const list = state.requests.filter(isMineAsSenior).sort((a, b) => b.created - a.created);
      return `<h2 class="pad">My requests</h2><ul class="plain">${list.map(r => reqCard(r, 'senior')).join('') || '<li class="card hint">No requests yet. Tap Home to ask for help.</li>'}</ul>`;
    },
    'senior:safety'() {
      const s = profile();
      const call = s.emergencyPhone && phoneOk(s.emergencyPhone)
        ? `<a class="btn big" href="tel:${esc(s.emergencyPhone.replace(/[^+0-9]/g, ''))}">📞 Call ${esc(s.emergencyName || 'my contact')}</a>` : '<p class="hint">Add a family contact in the <b>Me</b> tab to get a quick-call button here.</p>';
      return `
      <section class="card danger"><h2>Emergency</h2>
        <p>In an emergency, call your local emergency number right away. CareCircle is not an emergency or medical service.</p>
        <a class="btn big red" href="tel:911">🚨 Call 911</a></section>
      <section class="card"><h2>My family contact</h2>${call}</section>
      <section class="card"><h2>Staying safe</h2><ul>
        <li>Only let a helper in if they say your <b>safety code</b>.</li>
        <li>Never give out bank details, PINs or passwords.</li>
        <li>Helpers should never ask you for cash up front.</li>
        <li>Tell a family member when a helper is coming.</li></ul></section>`;
    },
    // ---------- helper ----------
    'helper:jobs'() {
      const open = state.requests.filter(r => r.status === 'open');
      return `<h2 class="pad">Requests near you <span class="tag">demo</span></h2>
        <ul class="plain">${open.map(r => reqCard(r, 'helper')).join('') || '<li class="card hint">No open requests. Open the Map tab and tap “Add demo requests”, or log in as a senior and post one.</li>'}</ul>`;
    },
    'helper:mine'() {
      const mine = state.requests.filter(r => isMineAsHelper(r) && ['accepted', 'arrived', 'done'].includes(r.status));
      return `<h2 class="pad">My jobs</h2><ul class="plain">${mine.map(r => reqCard(r, 'helper')).join('') || '<li class="card hint">No jobs yet.</li>'}</ul>`;
    },
    // ---------- map (both roles) ----------
    'senior:map'() { return mapView('senior'); },
    'helper:map'() { return mapView('helper'); },
    // ---------- me ----------
    'senior:me'() { return meView(); },
    'helper:me'() { return meView(); },
  };

  function mapView(r) {
    return `
    <section class="card"><h2>🗺️ Map</h2>
      <p id="mapInfo" aria-live="polite"></p>
      <div id="map" role="application" aria-label="Map showing nearby people"></div>
      <div class="legend"><span class="dot me"></span> You <span class="dot helper"></span> Helper <span class="dot senior"></span> Person needing help <span class="dot area"></span> Approximate area</div>
      <button class="btn ghost" id="recenter">Re-center</button>
      ${r === 'helper' ? '<button class="btn ghost" id="demoReqs">Add demo requests</button>' : ''}
    </section>
    <section class="card"><h3>Location &amp; privacy</h3>
      <label class="check"><input type="checkbox" id="shareToggle" ${state.share ? 'checked' : ''}> Share my location on this device</label>
      <p class="hint" id="geoMsg">${geoMsg()}</p>
      <ul class="hint">
        <li>Open requests show only a <b>rough area</b> to helpers — never an exact address.</li>
        <li>Exact positions are shared <b>only between the two people on a visit</b>, from acceptance until it ends.</li>
        <li>Demo: the other people on this map are simulated.</li></ul></section>`;
  }

  function aboutText() {
    return `
      <p>CareCircle connects seniors with helpers for chatting, shopping and companionship — like a ride-hailing app, but for everyday help.</p>
      <p>This is an early prototype. Everything is stored on <b>this device only</b>, other people on the map are simulated, and no money moves.</p>
      <h3>What's next</h3><ul>
        <li>Backend for real sign-in, matching, live location, notifications and ratings</li>
        <li>Helper identity and background checks</li>
        <li>Family dashboard and trusted-contact alerts</li>
        <li>Payments through a licensed provider</li></ul>
      <p class="hint">Not an emergency, medical or personal-care service. Rules for in-home visits, background checks, location privacy and payments vary by region — get legal advice before launching.</p>
      <button class="btn ghost" id="reset">Erase ALL CareCircle data on this device</button>`;
  }

  const NAVS = {
    senior: [['home', '🏠', 'Home'], ['mine', '📋', 'Requests'], ['map', '🗺️', 'Map'], ['safety', '🛟', 'Safety'], ['me', '👤', 'Me']],
    helper: [['jobs', '🔎', 'Requests'], ['mine', '📋', 'My jobs'], ['map', '🗺️', 'Map'], ['me', '👤', 'Me']],
  };

  // ---------------- map drawing ----------------
  let map = null, layer = null, fitted = false;
  const COLORS = { me: '#2563eb', helper: '#16a34a', senior: '#ea580c', area: '#ea580c' };

  function mapData() {
    const items = []; let line = null, info = '';
    if (role() === 'senior') {
      items.push({ pos: me, kind: 'me', label: 'You' });
      const job = activeJob();
      if (job && job.helperPos) {
        const d = dist(job.helperPos, reqPos(job));
        items.push({ pos: job.helperPos, kind: 'helper', label: job.helper || 'Your helper' });
        line = [reqPos(job), job.helperPos];
        info = job.status === 'arrived' ? `<b>${esc(job.helper || 'Your helper')}</b> has arrived.`
          : d <= 30 ? `<b>${esc(job.helper || 'Your helper')}</b> is at your door. Ask for your safety code.`
            : `<b>${esc(job.helper || 'Your helper')}</b> is ${fmtDist(d)} away — about ${etaMin(d)} min.`;
      } else {
        demoHelpers().forEach(h => items.push({ pos: jitter(h.id, h.pos, 300), kind: 'helper', label: 'Helper nearby (approx.)', radius: 300 }));
        const open = state.requests.some(r => r.status === 'open' && isMineAsSenior(r));
        info = open ? 'Your request is sent. Helpers nearby can see a rough area, not your address.' : `${demoHelpers().length} helpers are nearby (approximate areas, demo).`;
      }
    } else {
      const self = helperSelf();
      items.push({ pos: self, kind: 'me', label: 'You (helper)' });
      const job = activeJob();
      if (job) {
        const d = dist(self, reqPos(job));
        items.push({ pos: reqPos(job), kind: 'senior', label: 'Person you are helping' });
        line = [self, reqPos(job)];
        info = job.status === 'arrived' ? 'You have checked in.' : d <= 30 ? 'You are at the door. Ask for the safety code.' : `Person you are helping is ${fmtDist(d)} away — about ${etaMin(d)} min.`;
      } else {
        const open = state.requests.filter(r => r.status === 'open');
        open.forEach(r => items.push({ pos: jitter(r.id, reqPos(r), 400), kind: 'area', label: `${cat(r.category).title} request (approx. area)`, radius: 400 }));
        info = open.length ? `${open.length} open request${open.length > 1 ? 's' : ''} nearby. Exact addresses are shown only after you accept.` : 'No open requests. Tap “Add demo requests” to see how it looks.';
      }
    }
    return { items, line, info };
  }

  function drawMap(refit) {
    const d = mapData();
    $('#mapInfo') && ($('#mapInfo').innerHTML = d.info);
    if (!map || !layer) return;
    try {
      layer.clearLayers();
      d.items.forEach(it => {
        const ll = [it.pos.lat, it.pos.lng], color = COLORS[it.kind];
        if (it.radius) L.circle(ll, { radius: it.radius, color, weight: 2, fillColor: color, fillOpacity: 0.15 }).bindTooltip(it.label).addTo(layer);
        else L.circleMarker(ll, { radius: 10, color: '#fff', weight: 3, fillColor: color, fillOpacity: 1 }).bindTooltip(it.label).addTo(layer);
      });
      if (d.line) L.polyline(d.line.map(p => [p.lat, p.lng]), { color: '#0f766e', weight: 3, dashArray: '6 8' }).addTo(layer);
      if (!fitted || refit) {
        const pts = d.items.map(i => [i.pos.lat, i.pos.lng]);
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
        else map.setView(pts[0], 15);
        fitted = true;
      }
    } catch (err) {
      // A drawing problem must never break the app; the text summary above still works.
      console.error('Map drawing failed', err);
    }
  }
  function initMap() {
    const el = $('#map'); if (!el) return;
    if (typeof L === 'undefined') { el.textContent = 'The map could not be loaded. The text above still shows distances.'; drawMap(); return; }
    map = L.map(el, { zoomControl: true }).setView([me.lat, me.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map); fitted = false; drawMap();
  }
  function destroyMap() { if (map) { try { map.remove(); } catch { /* ignore */ } } map = null; layer = null; }
  const onMapTab = () => loggedIn() && tab[role()] === 'map';
  function refreshMap(refit) { if (onMapTab()) { $('#geoMsg') && ($('#geoMsg').innerHTML = geoMsg()); drawMap(refit); } }

  // Simulated helper walking toward the senior (demo only).
  function tick() {
    let moved = false;
    state.requests.forEach(r => {
      if (r.status === 'accepted' && r.helperPos && dist(r.helperPos, reqPos(r)) > 30) { r.helperPos = stepToward(r.helperPos, reqPos(r), 60); moved = true; }
    });
    if (moved) { save(); refreshMap(); }
    return moved;
  }

  // ---------------- rendering ----------------
  function render() {
    destroyMap();
    document.body.classList.toggle('big', !!state.big);
    const guest = isGuest();
    $('.roles').hidden = !guest;
    if (!loggedIn()) {
      $('#view').innerHTML = authView();
      $('nav').innerHTML = ''; $('nav').hidden = true;
      bind(); return;
    }
    $('nav').hidden = false;
    $('#roleSenior').setAttribute('aria-pressed', role() === 'senior');
    $('#roleHelper').setAttribute('aria-pressed', role() === 'helper');
    $('#view').innerHTML = views[`${role()}:${tab[role()]}`]();
    $('nav').innerHTML = NAVS[role()].map(([id, ico, label]) =>
      `<button data-tab="${id}" aria-current="${tab[role()] === id ? 'page' : 'false'}"><span>${ico}</span>${label}</button>`).join('');
    bind();
    if (onMapTab()) initMap();
  }
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500); };
  const byId = id => state.requests.find(r => r.id === id);
  const setAuthMsg = m => { authMsg = m; const el = $('#authMsg'); if (el) el.textContent = m; };

  // ---------------- auth actions ----------------
  async function doRegister(form) {
    const f = new FormData(form);
    const rl = f.get('role') === 'helper' ? 'helper' : 'senior';
    const name = (f.get('name') || '').trim(), email = (f.get('email') || '').trim().toLowerCase();
    const pw = f.get('password') || '', confirm = f.get('confirm') || '';
    if (!name) return setAuthMsg('Please enter your name.');
    if (!emailOk(email)) return setAuthMsg('Please enter a valid email address.');
    if (!pwOk(pw)) return setAuthMsg('Password needs at least 8 characters, with a letter and a number.');
    if (pw !== confirm) return setAuthMsg('The two passwords do not match.');
    if (!f.get('agree')) return setAuthMsg('Please tick the box to confirm you understand this is a demo.');
    if (state.accounts.some(a => a.email === email)) return setAuthMsg('That email already has an account. Please log in instead.');
    try {
      const salt = newSalt(), h = await hashPw(pw, salt);
      const profile = rl === 'senior' ? { name, emergencyName: '', emergencyPhone: '' } : { name, services: ['chat', 'shopping', 'company'] };
      const a = { id: uid(), email, role: rl, salt, hash: h, created: Date.now(), profile };
      state.accounts.push(a); state.session = a.id; save();
      authMsg = ''; draftCat = null; tab = { senior: 'home', helper: 'jobs' };
      toast(`Welcome, ${name.split(' ')[0]}!`); render();
    } catch (e) { setAuthMsg(e.message === 'secure-context' ? 'This browser needs a secure (https) connection to create accounts.' : 'Something went wrong. Please try again.'); }
  }
  async function doLogin(form) {
    const f = new FormData(form);
    const email = (f.get('email') || '').trim().toLowerCase(), pw = f.get('password') || '';
    if (!emailOk(email) || !pw) return setAuthMsg('Please enter your email and password.');
    const fl = fails[email] || { n: 0, until: 0 };
    if (fl.until > Date.now()) return setAuthMsg(`Too many tries. Please wait ${Math.ceil((fl.until - Date.now()) / 1000)} seconds.`);
    const a = state.accounts.find(x => x.email === email);
    try {
      const h = await hashPw(pw, a ? a.salt : newSalt()); // always hash, so timing doesn't reveal if the email exists
      if (a && safeEq(h, a.hash)) {
        delete fails[email]; state.session = a.id; save();
        authMsg = ''; draftCat = null; tab = { senior: 'home', helper: 'jobs' }; render(); return;
      }
    } catch (e) { return setAuthMsg(e.message === 'secure-context' ? 'This browser needs a secure (https) connection to log in.' : 'Something went wrong. Please try again.'); }
    fl.n += 1; if (fl.n >= MAX_FAILS) { fl.until = Date.now() + LOCK_MS; fl.n = 0; }
    fails[email] = fl;
    setAuthMsg('Email or password is incorrect.');
  }
  function doLogout() {
    stopGeo(); state.share = false; state.session = null; draftCat = null; authMsg = ''; authTab = 'login';
    save(); render();
  }
  async function doChangePw(form) {
    const a = acct(), f = new FormData(form), msg = $('#pwMsg');
    const say = m => { msg.textContent = m; msg.className = m.startsWith('✅') ? 'ok' : 'err'; };
    const cur = f.get('current') || '', next = f.get('next') || '', conf = f.get('confirm') || '';
    try {
      if (!safeEq(await hashPw(cur, a.salt), a.hash)) return say('Your current password is not correct.');
      if (!pwOk(next)) return say('New password needs at least 8 characters, with a letter and a number.');
      if (next !== conf) return say('The new passwords do not match.');
      const salt = newSalt(); a.salt = salt; a.hash = await hashPw(next, salt); save(); form.reset(); say('✅ Password updated.');
    } catch { say('Something went wrong. Please try again.'); }
  }
  function doDelete() {
    const a = acct(); if (!a) return;
    if (!confirm('Delete your account and its requests from this device? This cannot be undone.')) return;
    state.requests = state.requests.filter(r => r.ownerId !== a.id);
    state.requests.forEach(r => { if (r.helperId === a.id && (r.status === 'accepted' || r.status === 'arrived')) { r.status = 'open'; delete r.helper; delete r.helperId; delete r.helperPos; delete r.code; } });
    state.accounts = state.accounts.filter(x => x.id !== a.id);
    doLogout(); toast('Account deleted');
  }

  function bind() {
    const v = $('#view');
    // ----- auth -----
    v.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => { authTab = b.dataset.auth; authMsg = ''; render(); }));
    $('#loginForm', v)?.addEventListener('submit', e => { e.preventDefault(); doLogin(e.target); });
    $('#regForm', v)?.addEventListener('submit', e => { e.preventDefault(); doRegister(e.target); });
    $('#guestBtn', v)?.addEventListener('click', () => { state.session = 'guest'; save(); render(); });
    v.querySelectorAll('#showPw').forEach(c => c.addEventListener('change', () => v.querySelectorAll('[data-pw]').forEach(i => { i.type = c.checked ? 'text' : 'password'; })));
    // ----- me -----
    $('#logout', v)?.addEventListener('click', doLogout);
    $('#delAcct', v)?.addEventListener('click', doDelete);
    $('#goRegister', v)?.addEventListener('click', () => { state.session = null; authTab = 'register'; save(); render(); });
    $('#pwForm', v)?.addEventListener('submit', e => { e.preventDefault(); doChangePw(e.target); });
    $('#meForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target), p = profile();
      const name = (f.get('name') || '').trim(); if (!name) { toast('Please enter a display name'); return; }
      const phone = (f.get('phone') || '').trim(); if (phone && !phoneOk(phone)) { toast('Please check your phone number'); return; }
      const upd = { name, phone, area: (f.get('area') || '').trim(), languages: (f.get('languages') || '').trim(), bio: (f.get('bio') || '').trim() };
      if (role() === 'senior') {
        const ep = (f.get('emergencyPhone') || '').trim(); if (ep && !phoneOk(ep)) { toast('Please check the contact\'s phone number'); return; }
        upd.emergencyName = (f.get('emergencyName') || '').trim(); upd.emergencyPhone = ep;
      } else { upd.services = f.getAll('services'); upd.availability = (f.get('availability') || '').trim(); }
      Object.assign(p, upd); save(); toast('Profile saved'); render();
    });
    // ----- requests -----
    v.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { draftCat = b.dataset.cat; render(); $('#newreq')?.scrollIntoView?.(); }));
    $('#cancelDraft', v)?.addEventListener('click', () => { draftCat = null; render(); });
    $('#reqForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.requests.push({ id: uid(), ownerId: cid(), ownerName: (profile().name || '').split(' ')[0], category: draftCat, when: f.get('when'), notes: (f.get('notes') || '').trim(), status: 'open', created: Date.now(), pos: { ...me } });
      draftCat = null; tab.senior = 'mine'; save(); toast('Request sent'); render();
    });
    v.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const r = byId(b.dataset.cancel); if (r) { r.status = 'cancelled'; delete r.helperPos; save(); render(); } }));
    v.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.sim); if (!r) return; r.status = 'accepted'; r.helper = 'Demo helper'; r.helperId = 'demo'; r.code = newCode(); startHelper(r); save(); render();
    }));
    v.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
      const [id, n] = b.dataset.rate.split(':'); const r = byId(id); if (r) { r.rating = +n; save(); toast('Thank you!'); render(); }
    }));
    v.querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.accept); if (!r || r.status !== 'open') return;
      r.status = 'accepted'; r.helper = profile().name || 'Helper'; r.helperId = cid(); r.code = newCode(); startHelper(r); save(); tab.helper = 'mine'; toast('Accepted — ask the senior for their code'); render();
    }));
    v.querySelectorAll('[data-checkin]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.checkin); if (!r) return;
      const val = ($(`#code-${r.id}`, v).value || '').trim();
      if (val !== r.code) { $(`#err-${r.id}`, v).textContent = 'That code is not right. Do not enter until it matches.'; return; }
      r.status = 'arrived'; r.helperPos = jitter(r.id, reqPos(r), 15); save(); toast('Checked in'); render();
    }));
    v.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.finish); if (r) { r.status = 'done'; delete r.helperPos; save(); toast('Marked finished — locations are no longer shared'); render(); }
    }));
    $('#reset', v)?.addEventListener('click', () => { if (confirm('Erase ALL CareCircle data on this device, including accounts?')) { stopGeo(); state = defaults(); save(); draftCat = null; authTab = 'login'; render(); } });
    // ----- map controls -----
    $('#recenter', v)?.addEventListener('click', () => drawMap(true));
    $('#shareToggle', v)?.addEventListener('change', e => {
      state.share = e.target.checked; save();
      if (state.share) startGeo(); else stopGeo();
      refreshMap(true);
    });
    $('#demoReqs', v)?.addEventListener('click', () => {
      [0, 1].forEach(i => {
        const id = uid(); const c = CATEGORIES[(hash(id) + i) % CATEGORIES.length];
        state.requests.push({ id, ownerId: 'demo', ownerName: 'Demo', category: c.id, when: WHEN[i], notes: '', status: 'open', created: Date.now(), demo: true, pos: offset(me, 700 + i * 650, 200 + i * 120) });
      });
      save(); toast('Added 2 demo requests'); render();
    });
  }

  $('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab[role()] = b.dataset.tab; render(); window.scrollTo(0, 0); });
  $('#roleSenior').addEventListener('click', () => { state.role = 'senior'; save(); render(); });
  $('#roleHelper').addEventListener('click', () => { state.role = 'helper'; save(); render(); });
  $('#bigText').addEventListener('click', () => { state.big = !state.big; save(); render(); });

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  if (state.share && loggedIn()) startGeo(); else state.share = false;
  setInterval(tick, 2000);
  window.CCGeo = { dist, offset, jitter, stepToward, etaMin, tick }; // exposed for tests

  render();
})();
