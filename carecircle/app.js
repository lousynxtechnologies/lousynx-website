/* CareCircle — DRAFT prototype. Single-device demo: data is stored locally in this browser.
   A real version needs a backend (see BACKEND.md). */
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
    role: 'senior', big: false,
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

  let tab = { senior: 'home', helper: 'jobs' };
  let draftCat = null;

  function reqCard(r, mode) {
    const c = cat(r.category);
    const lines = [`<b>${c.icon} ${esc(c.title)}</b> — ${esc(r.when)}`];
    if (r.notes) lines.push(`<span>${esc(r.notes)}</span>`);
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
        <ul class="plain">${open.map(r => reqCard(r, 'helper')).join('') || '<li class="card hint">No open requests. Switch to “Senior” and post one to try it out.</li>'}</ul>`;
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
    // ---------- shared ----------
    'senior:about'() { return about(); },
    'helper:about'() { return about(); },
  };

  function about() {
    return `<section class="card"><h2>About this draft</h2>
      <p>CareCircle connects seniors with helpers for chatting, shopping and companionship — like a ride-hailing app, but for everyday help.</p>
      <p>This is an early prototype. Everything is stored on <b>this device only</b>, helpers are simulated, and no money moves.</p>
      <h3>What's next</h3><ul>
        <li>Backend for real matching, notifications and ratings</li>
        <li>Helper identity and background checks</li>
        <li>Family dashboard and trusted-contact alerts</li>
        <li>Payments through a licensed provider</li></ul>
      <p class="hint">Not an emergency, medical or personal-care service. Rules for in-home visits, background checks, privacy and payments vary by region — get legal advice before launching.</p>
      <button class="btn ghost" id="reset">Erase data on this device</button></section>`;
  }

  const NAVS = {
    senior: [['home', '🏠', 'Home'], ['mine', '📋', 'My requests'], ['safety', '🛟', 'Safety'], ['about', 'ℹ️', 'About']],
    helper: [['jobs', '🔎', 'Requests'], ['mine', '📋', 'My jobs'], ['profile', '👤', 'Profile'], ['about', 'ℹ️', 'About']],
  };

  function render() {
    document.body.classList.toggle('big', !!state.big);
    $('#roleSenior').setAttribute('aria-pressed', state.role === 'senior');
    $('#roleHelper').setAttribute('aria-pressed', state.role === 'helper');
    $('#view').innerHTML = views[`${state.role}:${tab[state.role]}`]();
    $('nav').innerHTML = NAVS[state.role].map(([id, ico, label]) =>
      `<button data-tab="${id}" aria-current="${tab[state.role] === id ? 'page' : 'false'}"><span>${ico}</span>${label}</button>`).join('');
    bind();
  }
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2500); };
  const byId = id => state.requests.find(r => r.id === id);

  function bind() {
    const v = $('#view');
    v.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { draftCat = b.dataset.cat; render(); $('#newreq')?.scrollIntoView?.(); }));
    $('#cancelDraft', v)?.addEventListener('click', () => { draftCat = null; render(); });
    $('#reqForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      state.requests.push({ id: uid(), category: draftCat, when: f.get('when'), notes: (f.get('notes') || '').trim(), status: 'open', created: Date.now() });
      draftCat = null; tab.senior = 'mine'; save(); toast('Request sent'); render();
    });
    v.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => { const r = byId(b.dataset.cancel); if (r) { r.status = 'cancelled'; save(); render(); } }));
    v.querySelectorAll('[data-sim]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.sim); if (!r) return; r.status = 'accepted'; r.helper = 'Demo helper'; r.code = newCode(); save(); render();
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
      r.status = 'accepted'; r.helper = state.helper.name || 'Demo helper'; r.code = newCode(); save(); tab.helper = 'mine'; toast('Accepted — ask the senior for their code'); render();
    }));
    v.querySelectorAll('[data-checkin]').forEach(b => b.addEventListener('click', () => {
      const r = byId(b.dataset.checkin); if (!r) return;
      const val = ($(`#code-${r.id}`, v).value || '').trim();
      if (val !== r.code) { $(`#err-${r.id}`, v).textContent = 'That code is not right. Do not enter until it matches.'; return; }
      r.status = 'arrived'; save(); toast('Checked in'); render();
    }));
    v.querySelectorAll('[data-finish]').forEach(b => b.addEventListener('click', () => { const r = byId(b.dataset.finish); if (r) { r.status = 'done'; save(); toast('Marked finished'); render(); } }));
    $('#reset', v)?.addEventListener('click', () => { if (confirm('Erase all CareCircle data on this device?')) { state = defaults(); save(); draftCat = null; render(); } });
  }

  $('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab[state.role] = b.dataset.tab; render(); window.scrollTo(0, 0); });
  $('#roleSenior').addEventListener('click', () => { state.role = 'senior'; save(); render(); });
  $('#roleHelper').addEventListener('click', () => { state.role = 'helper'; save(); render(); });
  $('#bigText').addEventListener('click', () => { state.big = !state.big; save(); render(); });

  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  $('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  render();
})();
