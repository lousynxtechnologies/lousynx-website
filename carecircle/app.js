/* CareCircle — DRAFT prototype. Single-device demo: data is stored locally in this browser.
   Other people on the map are SIMULATED. A real version needs a backend (see BACKEND.md). */
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

  const defaults = () => ({
    role: 'senior', big: false, share: false,
    senior: { name: '', emergencyName: '', emergencyPhone: '' },
    helper: { name: '' },
    requests: [],
  });
  const load = () => { try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return defaults(); } };
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const cat = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[3];
  const phoneOk = p => /^[+0-9()\-\s]{7,20}$/.test(p);
  const newCode = () => String(Math.floor(1000 + Math.random() * 9000));
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);

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
  const helperSelf = () => {
    const job = activeJob('helper');
    return job && job.helperPos ? job.helperPos : offset(me, 1200, 45);
  };
  const activeJob = () => [...state.requests].reverse().find(r => r.status === 'accepted' || r.status === 'arrived');
  const reqPos = r => r.pos || me;
  const startHelper = r => { r.helperPos = offset(reqPos(r), 1500, hash(r.id) % 360); };

  let tab = { senior: 'home', helper: 'jobs' };
  let draftCat = null;

  function reqCard(r, mode) {
    const c = cat(r.category);
    const lines = [`<b>${c.icon} ${esc(c.title)}</b> — ${esc(r.when)}`];
    if (r.notes) lines.push(`<span>${esc(r.notes)}</span>`);
    if (mode === 'helper' && r.status === 'open') lines.push(`<small>About ${fmtDist(dist(helperSelf(), jitter(r.id, reqPos(r), 400)))} away (approximate area)${r.demo ? ' · demo' : ''}</small>`);
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

  const views = {
    // ---------- senior ----------
    'senior:home'() {
      return `
      <section class="card"><h2>${state.senior.name ? `Hello, ${esc(state.senior.name)}!` : 'Hello!'}</h2>
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
      const list = [...state.requests].sort((a, b) => b.created - a.created);
      return `<h2 class="pad">My requests</h2><ul class="plain">${list.map(r => reqCard(r, 'senior')).join('') || '<li class="card hint">No requests yet. Tap Home to ask for help.</li>'}</ul>`;
    },
    'senior:safety'() {
      const s = state.senior;
      const call = s.emergencyPhone && phoneOk(s.emergencyPhone)
        ? `<a class="btn big" href="tel:${esc(s.emergencyPhone.replace(/[^+0-9]/g, ''))}">📞 Call ${esc(s.emergencyName || 'my contact')}</a>` : '<p class="hint">Add a family contact below to get a quick-call button.</p>';
      return `
      <section class="card danger"><h2>Emergency</h2>
        <p>In an emergency, call your local emergency number right away. CareCircle is not an emergency or medical service.</p>
        <a class="btn big red" href="tel:911">🚨 Call 911</a></section>
      <section class="card"><h2>My family contact</h2>${call}
        <form id="profileForm">
          <label>My name<input name="name" maxlength="40" value="${esc(s.name)}"></label>
          <label>Contact's name<input name="ename" maxlength="40" value="${esc(s.emergencyName)}"></label>
          <label>Contact's phone<input name="ephone" type="tel" maxlength="20" value="${esc(s.emergencyPhone)}"></label>
          <button class="btn">Save</button>
        </form></section>
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
        <ul class="plain">${open.map(r => reqCard(r, 'helper')).join('') || '<li class="card hint">No open requests. Open the Map tab and tap “Add demo requests”, or switch to “I need help” and post one.</li>'}</ul>`;
    },
    'helper:mine'() {
      const mine = state.requests.filter(r => ['accepted', 'arrived', 'done'].includes(r.status));
      return `<h2 class="pad">My jobs</h2><ul class="plain">${mine.map(r => reqCard(r, 'helper')).join('') || '<li class="card hint">No jobs yet.</li>'}</ul>`;
    },
    'helper:profile'() {
      return `<section class="card"><h2>Helper profile</h2>
        <form id="helperForm"><label>Display name<input name="name" maxlength="40" value="${esc(state.helper.name)}"></label><button class="btn">Save</button></form>
        <p class="hint">A real launch would require identity checks, a police/background check and training before anyone can accept requests.</p></section>`;
    },
    // ---------- map (both roles) ----------
    'senior:map'() { return mapView('senior'); },
    'helper:map'() { return mapView('helper'); },
    // ---------- shared ----------
    'senior:about'() { return about(); },
    'helper:about'() { return about(); },
  };

  function mapView(role) {
    return `
    <section class="card"><h2>🗺️ Map</h2>
      <p id="mapInfo" aria-live="polite"></p>
      <div id="map" role="application" aria-label="Map showing nearby people"></div>
      <div class="legend"><span class="dot me"></span> You <span class="dot helper"></span> Helper <span class="dot senior"></span> Person needing help <span class="dot area"></span> Approximate area</div>
      <button class="btn ghost" id="recenter">Re-center</button>
      ${role === 'helper' ? '<button class="btn ghost" id="demoReqs">Add demo requests</button>' : ''}
    </section>
    <section class="card"><h3>Location &amp; privacy</h3>
      <label class="check"><input type="checkbox" id="shareToggle" ${state.share ? 'checked' : ''}> Share my location on this device</label>
      <p class="hint" id="geoMsg">${geoMsg()}</p>
      <ul class="hint">
        <li>Open requests show only a <b>rough area</b> to helpers — never an exact address.</li>
        <li>Exact positions are shared <b>only between the two people on a visit</b>, from acceptance until it ends.</li>
        <li>Demo: the other people on this map are simulated.</li></ul></section>`;
  }

  function about() {
    return `<section class="card"><h2>About this draft</h2>
      <p>CareCircle connects seniors with helpers for chatting, shopping and companionship — like a ride-hailing app, but for everyday help.</p>
      <p>This is an early prototype. Everything is stored on <b>this device only</b>, helpers and other people on the map are simulated, and no money moves.</p>
      <h3>What's next</h3><ul>
        <li>Backend for real matching, live location, notifications and ratings</li>
        <li>Helper identity and background checks</li>
        <li>Family dashboard and trusted-contact alerts</li>
        <li>Payments through a licensed provider</li></ul>
      <p class="hint">Not an emergency, medical or personal-care service. Rules for in-home visits, background checks, location privacy and payments vary by region — get legal advice before launching.</p>
      <button class="btn ghost" id="reset">Erase data on this device</button></section>`;
  }

  const NAVS = {
    senior: [['home', '🏠', 'Home'], ['mine', '📋', 'Requests'], ['map', '🗺️', 'Map'], ['safety', '🛟', 'Safety'], ['about', 'ℹ️', 'About']],
    helper: [['jobs', '🔎', 'Requests'], ['mine', '📋', 'My jobs'], ['map', '🗺️', 'Map'], ['profile', '👤', 'Profile'], ['about', 'ℹ️', 'About']],
  };

  // ---------------- map drawing ----------------
  let map = null, layer = null, fitted = false;
  const COLORS = { me: '#2563eb', helper: '#16a34a', senior: '#ea580c', area: '#ea580c' };

  function mapData() {
    const items = []; let line = null, info = '';
    if (state.role === 'senior') {
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
        const open = state.requests.some(r => r.status === 'open');
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
  const onMapTab = () => tab[state.role] === 'map';
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
    $('#roleSenior').setAttribute('aria-pressed', state.role === 'senior');
    $('#roleHelper').setAttribute('aria-pressed', state.role === 'helper');
    $('#view').innerHTML = views[`${state.role}:${tab[state.role]}`]();
    $('nav').innerHTML = NAVS[state.role].map(([id, ico, label]) =>
      `<button data-tab="${id}" aria-current="${tab[state.role] === id ? 'page' : 'false'}"><span>${ico}</span>${label}</button>`).join('');
    bind();
    if (onMapTab()) initMap();
  }
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500); };
  const byId = id => state.requests.find(r => r.id === id);

  function bind() {
    const v = $('#view');
    v.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { draftCat = b.dataset.cat; render(); $('#newreq')?.scrollIntoView?.(); }));
    $('#cancelDraft', v)?.addEventListener('click', () => { draftCat = null; render(); });
    $('#reqForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.requests.push({ id: uid(), category: draftCat, when: f.get('when'), notes: (f.get('notes') || '').trim(), status: 'open', created: Date.now(), pos: { ...me } });
      draftCat = null; tab.senior = 'mine'; save(); toast('Request sent'); render();
    });
    v.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const r = byId(b.dataset.cancel); if (r) { r.status = 'cancelled'; delete r.helperPos; save(); render(); } }));
    v.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.sim); if (!r) return; r.status = 'accepted'; r.helper = 'Demo helper'; r.code = newCode(); startHelper(r); save(); render();
    }));
    v.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => {
      const [id, n] = b.dataset.rate.split(':'); const r = byId(id); if (r) { r.rating = +n; save(); toast('Thank you!'); render(); }
    }));
    $('#profileForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target); const ph = (f.get('ephone') || '').trim();
      if (ph && !phoneOk(ph)) { toast('Please check the phone number'); return; }
      state.senior = { name: f.get('name').trim(), emergencyName: f.get('ename').trim(), emergencyPhone: ph };
      save(); toast('Saved'); render();
    });
    $('#helperForm', v)?.addEventListener('submit', e => { e.preventDefault(); state.helper.name = new FormData(e.target).get('name').trim(); save(); toast('Saved'); render(); });
    v.querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.accept); if (!r || r.status !== 'open') return;
      r.status = 'accepted'; r.helper = state.helper.name || 'Demo helper'; r.code = newCode(); startHelper(r); save(); tab.helper = 'mine'; toast('Accepted — ask the senior for their code'); render();
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
    $('#reset', v)?.addEventListener('click', () => { if (confirm('Erase all CareCircle data on this device?')) { stopGeo(); state = defaults(); save(); draftCat = null; render(); } });
    // map controls
    $('#recenter', v)?.addEventListener('click', () => drawMap(true));
    $('#shareToggle', v)?.addEventListener('change', e => {
      state.share = e.target.checked; save();
      if (state.share) startGeo(); else stopGeo();
      refreshMap(true);
    });
    $('#demoReqs', v)?.addEventListener('click', () => {
      [0, 1].forEach(i => {
        const id = uid(); const c = CATEGORIES[(hash(id) + i) % CATEGORIES.length];
        state.requests.push({ id, category: c.id, when: WHEN[i], notes: '', status: 'open', created: Date.now(), demo: true, pos: offset(me, 700 + i * 650, 200 + i * 120) });
      });
      save(); toast('Added 2 demo requests'); render();
    });
  }

  $('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab[state.role] = b.dataset.tab; render(); window.scrollTo(0, 0); });
  $('#roleSenior').addEventListener('click', () => { state.role = 'senior'; save(); render(); });
  $('#roleHelper').addEventListener('click', () => { state.role = 'helper'; save(); render(); });
  $('#bigText').addEventListener('click', () => { state.big = !state.big; save(); render(); });

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  if (state.share) startGeo();
  setInterval(tick, 2000);
  window.CCGeo = { dist, offset, jitter, stepToward, etaMin, tick }; // exposed for tests

  render();
})();
