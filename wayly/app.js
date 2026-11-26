/* Wayly — AI Travel Concierge (DRAFT prototype).
   Real in the browser: voice (speechSynthesis), voice input (where supported), reminders, notifications,
   GPS-based nearby sights, taxi/navigation deep links.
   SAMPLE / SIMULATED: flights, hotels, prices and bookings. The "AI" is a rule-based assistant. */
(() => {
  'use strict';
  const { CITIES, km, hash, utc, flightOptions, hotelOptions, transferOptions } = window.WD;
  const KEY = 'wayly.v1', H = 3600000, MIN = 60000;

  const defaults = () => ({ voice: { on: true, rate: 1, uri: '' }, notif: false, trip: null, fired: {},
    plan: { from: 'toronto', to: 'paris', depart: '', ret: '', travelers: 1 } });
  const load = () => { try { const s = JSON.parse(localStorage.getItem(KEY)) || {}; const d = defaults(); return Object.assign(d, s, { voice: Object.assign(d.voice, s.voice), plan: Object.assign(d.plan, s.plan) }); } catch { return defaults(); } };
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------- date / money helpers (explicit UTC offsets, so the maths is deterministic) ----------------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = n => String(n).padStart(2, '0');
  const lt = (ts, tz) => new Date(ts + tz * H);
  const fmtTime = (ts, tz) => { const d = lt(ts, tz); let h = d.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${pad(d.getUTCMinutes())} ${ap}`; };
  const fmtDay = (ts, tz) => { const d = lt(ts, tz); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const dateStr = (ts, tz) => { const d = lt(ts, tz); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  const dayDiff = (a, b) => Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 86400000);
  const localToday = (plus = 0) => { const n = new Date(); return addDays(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`, plus); };
  const fmtDur = m => `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
  const money = n => `$${Math.round(n).toLocaleString('en-US')}`;
  const countdown = ms => { const m = Math.round(ms / MIN); if (m < 1) return 'now'; if (m < 60) return `in ${m} min`; const h = Math.floor(m / 60); if (h < 48) return `in ${h} h ${m % 60} min`; return `in ${Math.round(h / 24)} days`; };
  const allAttractions = () => Object.values(CITIES).flatMap(c => c.attractions.map(a => Object.assign({ city: c }, a)));
  const findAttr = id => allAttractions().find(a => a.id === id);

  // ---------------- voice ----------------
  const synth = window.speechSynthesis || null;
  let voices = [], speakToken = 0;
  const loadVoices = () => { voices = synth && synth.getVoices ? synth.getVoices() : []; };
  if (synth) { loadVoices(); if ('onvoiceschanged' in synth) synth.onvoiceschanged = () => { loadVoices(); if (tab === 'me') render(); }; }
  const pickVoice = () => voices.find(v => v.voiceURI === state.voice.uri) || voices.find(v => /^en/i.test(v.lang)) || null;
  function speak(text, opts = {}) {
    const cb = opts.onend;
    if (!synth || (!state.voice.on && !opts.force)) { if (cb) setTimeout(cb, 0); return; }
    synth.cancel();
    const tok = ++speakToken, u = new window.SpeechSynthesisUtterance(text);
    u.rate = state.voice.rate; const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    const done = () => { if (tok === speakToken && cb) cb(); };
    u.onend = done; u.onerror = done; synth.speak(u);
  }
  const stopSpeak = () => { speakToken++; if (synth) synth.cancel(); };

  // ---------------- itinerary builder ----------------
  function buildItinerary(t) {
    const A = CITIES[t.from], B = CITIES[t.to], f = t.flight, rf = t.retFlight, h = t.hotel, S = [];
    const add = o => S.push(Object.assign({ lead: 15, actions: [] }, o));
    const home = { name: `${A.name} (home)`, lat: A.lat, lng: A.lng };
    const aptA = { name: A.airport.name, lat: A.airport.lat, lng: A.airport.lng }, aptB = { name: B.airport.name, lat: B.airport.lat, lng: B.airport.lng };
    const hotelP = { name: h.name, lat: h.lat, lng: h.lng, address: h.address };
    const hm = (ts, tz) => fmtTime(ts, tz);

    add({ id: 'o-ci', ts: f.depTs - 24 * H, tz: A.tz, icon: '📱', title: 'Online check-in opens', lead: 0,
      detail: `Check in with ${f.airline} for flight ${f.number} and save your boarding pass offline.`,
      say: `Online check-in for flight ${f.number} to ${B.name} is now open. Check in now and save your boarding pass.` });
    add({ id: 'o-leave', ts: f.depTs - 4 * H, tz: A.tz, icon: '🚕', title: 'Time to leave for the airport', lead: 10,
      detail: `Your flight departs at ${hm(f.depTs, A.tz)}. Allow time for traffic.`,
      say: `Time to leave for the airport. Your flight ${f.number} departs at ${hm(f.depTs, A.tz)}. I can help you get a taxi. Tap the taxi button.`,
      actions: [{ t: 'taxi', label: 'Get a taxi to the airport', from: home, to: aptA }] });
    add({ id: 'o-apt', ts: f.depTs - 3 * H, tz: A.tz, icon: '🛄', title: 'Arrive at the airport', detail: 'Drop bags, then go through security. Keep your passport and boarding pass handy.',
      say: 'You should be arriving at the airport. Drop your bags, then head through security. Keep your passport and boarding pass handy.', actions: [{ t: 'nav', label: 'Navigate to the airport', to: aptA }] });
    add({ id: 'o-gate', ts: f.depTs - 75 * MIN, tz: A.tz, icon: '🚶', title: 'Head to your gate', detail: 'Check the screens for your gate number, and grab water before boarding.',
      say: 'Time to head to your gate. Check the screens for your gate number.' });
    add({ id: 'o-board', ts: f.depTs - 45 * MIN, tz: A.tz, icon: '🎫', title: 'Boarding starts', lead: 5, detail: `Flight ${f.number} to ${B.name}.`,
      say: `Boarding for flight ${f.number} to ${B.name} is starting. Have your boarding pass and passport ready.` });
    add({ id: 'o-dep', ts: f.depTs, tz: A.tz, icon: '🛫', title: `Takeoff to ${B.name}`, lead: 0, detail: `Flight time ${fmtDur(f.durMin)}${f.stops ? ', 1 stop' : ', nonstop'}.`,
      say: `Have a wonderful flight to ${B.name}. I'll be here when you land.` });
    add({ id: 'o-land', ts: f.arrTs, tz: B.tz, icon: '🛬', title: `Welcome to ${B.name}`, lead: 0,
      detail: `Local time is ${hm(f.arrTs, B.tz)}. Follow the signs for passport control and baggage claim.`,
      say: `Welcome to ${B.name}. The local time is ${hm(f.arrTs, B.tz)}. Follow the signs for passport control and baggage claim.` });
    add({ id: 'o-ride', ts: f.arrTs + 60 * MIN, tz: B.tz, icon: '🚕', title: 'Ride to your hotel', lead: 0,
      detail: `${t.transfer.name} to ${h.name}, about ${t.transfer.mins} minutes.`,
      say: `Once you have your bags, let's get you to your hotel. I can set up your ${t.transfer.name.toLowerCase()} ride to ${h.name}.`,
      actions: [{ t: 'taxi', label: 'Get a ride to the hotel', from: aptB, to: hotelP }] });
    const arrDate = dateStr(f.arrTs, B.tz), ciTs = Math.max(f.arrTs + 2 * H, utc(arrDate, 15, 0, B.tz));
    add({ id: 'h-in', ts: ciTs, tz: B.tz, icon: '🏨', title: `Check in at ${h.name}`, lead: 20, detail: `Check-in from ${h.checkIn}. ${h.address}.`,
      say: `You can check in at ${h.name} now. The address is ${h.address}.`, actions: [{ t: 'nav', label: 'Navigate to the hotel', to: hotelP }] });
    const nights = Math.max(1, dayDiff(arrDate, t.ret));
    for (let i = 0; i < Math.min(nights - 1, 3); i++) {
      const day = addDays(arrDate, i + 1); if (day >= t.ret) break;
      const a = B.attractions[i % B.attractions.length];
      add({ id: `tour-${i}`, ts: utc(day, 10, 0, B.tz), tz: B.tz, icon: '🎧', title: `Guided visit: ${a.name}`, lead: 30,
        detail: `${a.intro} About ${a.minutes} minutes. Audio guide and scenic description included.`,
        say: `Good morning. Today we're visiting ${a.name}. I can guide you with audio when you arrive. Tap the audio guide button, and I'll start.`,
        actions: [{ t: 'guide', label: 'Start audio guide', attr: a.id }, { t: 'nav', label: 'Navigate there', to: { name: a.name, lat: a.lat, lng: a.lng } }] });
    }
    add({ id: 'r-ci', ts: rf.depTs - 24 * H, tz: B.tz, icon: '📱', title: 'Return flight check-in opens', lead: 0,
      detail: `Check in with ${rf.airline} for flight ${rf.number} home.`, say: `Online check-in for your flight home, ${rf.number}, is now open.` });
    add({ id: 'r-out', ts: rf.depTs - 5 * H, tz: B.tz, icon: '🧳', title: 'Check out of your hotel', lead: 15, detail: `Check-out is by ${h.checkOut}. Don't forget your passport and chargers.`,
      say: 'Time to check out of your hotel. Don\'t forget your passport and chargers.' });
    add({ id: 'r-ride', ts: rf.depTs - 270 * MIN, tz: B.tz, icon: '🚕', title: 'Ride to the airport', lead: 10, detail: `Your flight home departs at ${hm(rf.depTs, B.tz)}.`,
      say: `Let's get you to the airport. Your flight ${rf.number} departs at ${hm(rf.depTs, B.tz)}. Tap the taxi button and I'll prepare your ride.`,
      actions: [{ t: 'taxi', label: 'Get a taxi to the airport', from: hotelP, to: aptB }] });
    add({ id: 'r-apt', ts: rf.depTs - 3 * H, tz: B.tz, icon: '🛄', title: 'Arrive at the airport', detail: 'Bag drop and security. Keep your boarding pass ready.', say: 'You should be arriving at the airport. Head to bag drop and security.' });
    add({ id: 'r-board', ts: rf.depTs - 45 * MIN, tz: B.tz, icon: '🎫', title: 'Boarding starts', lead: 5, detail: `Flight ${rf.number} to ${A.name}.`, say: `Boarding for flight ${rf.number} to ${A.name} is starting.` });
    add({ id: 'r-dep', ts: rf.depTs, tz: B.tz, icon: '🛫', title: `Takeoff to ${A.name}`, lead: 0, detail: `Flight time ${fmtDur(rf.durMin)}.`, say: `Safe travels home. Thank you for letting me guide your trip.` });
    add({ id: 'r-land', ts: rf.arrTs, tz: A.tz, icon: '🏠', title: `Welcome back to ${A.name}`, lead: 0, detail: `Local time is ${hm(rf.arrTs, A.tz)}.`, say: `Welcome back to ${A.name}. I hope you had a wonderful trip.` });
    return S.sort((a, b) => a.ts - b.ts);
  }

  // ---------------- clock, reminders, banner ----------------
  let demo = { on: false, now: 0, auto: false, fired: new Set(), timer: null, guard: null };
  const nowTs = () => demo.on ? demo.now : Date.now();
  const stepById = id => state.trip && state.trip.steps.find(s => s.id === id);
  const nextStep = (now = nowTs()) => state.trip ? state.trip.steps.find(s => s.ts > now) || null : null;
  let banner = null;

  function notify(step) {
    if (!state.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: step.detail, tag: step.id };
    try { new Notification(step.title, opts); } catch (e) {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(r => r && r.showNotification(step.title, opts)).catch(() => {});
    }
  }
  function fireReminder(step, cb) { banner = { id: step.id }; renderBanner(); speak(step.say || `${step.title}. ${step.detail}`, { onend: cb }); notify(step); }
  function checkReminders(now = Date.now()) {
    if (!state.trip) return false;
    // Everything that is due gets marked as handled, but only the most recent reminder (within 6 hours) is announced.
    const due = state.trip.steps.filter(s => !state.fired[s.id] && now >= s.ts - s.lead * MIN);
    if (!due.length) return false;
    due.forEach(s => { state.fired[s.id] = 1; });
    save();
    const latest = due.filter(s => now - (s.ts - s.lead * MIN) < 6 * H).pop();
    if (latest) fireReminder(latest);
    return !!latest;
  }
  function startDemo() { const t = state.trip; if (!t) return; stopSpeak(); demo = { on: true, now: t.steps[0].ts - 25 * H, auto: false, fired: new Set(), timer: null, guard: null }; banner = null; render(); renderBanner(); }
  function stopDemo() { clearTimeout(demo.timer); clearTimeout(demo.guard); demo = { on: false, now: 0, auto: false, fired: new Set(), timer: null, guard: null }; render(); }
  function demoNext(cb) {
    const t = state.trip; if (!t || !demo.on) return false;
    const nxt = t.steps.filter(s => !demo.fired.has(s.id)).sort((a, b) => (a.ts - a.lead * MIN) - (b.ts - b.lead * MIN))[0];
    if (!nxt) { stopDemo(); toast('Demo trip complete'); return false; }
    demo.fired.add(nxt.id); demo.now = nxt.ts - nxt.lead * MIN + 1000; fireReminder(nxt, cb); render(); return true;
  }
  function demoAuto() {
    demo.auto = true; render();
    const advance = () => { clearTimeout(demo.guard); clearTimeout(demo.timer); demo.timer = setTimeout(loop, state.voice.on && synth ? 1600 : 4200); };
    const loop = () => { if (!demo.on || !demo.auto) return; if (demoNext(advance)) { clearTimeout(demo.guard); demo.guard = setTimeout(advance, 16000); } };
    loop();
  }

  // ---------------- guide (audio tours) ----------------
  let guide = null; // { attrId, mode:'guide'|'scenic', idx, playing, token }
  let loc = null, locMsg = '';
  function playGuide() {
    if (!guide) return; const a = findAttr(guide.attrId); if (!a) return;
    const tok = ++guide.token, text = guide.mode === 'scenic' ? a.scenic : a.stops[guide.idx].text;
    guide.playing = true; render();
    speak(text, { force: true, onend: () => {
      if (!guide || guide.token !== tok || !guide.playing) return;
      if (guide.mode === 'guide' && guide.idx < a.stops.length - 1) { guide.idx++; playGuide(); } else { guide.playing = false; render(); }
    } });
  }
  function startGuide(attrId, mode) { stopSpeak(); guide = { attrId, mode, idx: 0, playing: false, token: 0 }; tab = 'guide'; guideCity = findAttr(attrId).city.id; render(); playGuide(); }
  function pauseGuide() { if (!guide) return; guide.token++; guide.playing = false; stopSpeak(); render(); }
  function stepGuide(d) {
    if (!guide) return; const a = findAttr(guide.attrId); guide.token++; stopSpeak();
    guide.idx = Math.max(0, Math.min(a.stops.length - 1, guide.idx + d)); render(); playGuide();
  }
  function endGuide() { if (guide) guide.token++; guide = null; stopSpeak(); render(); }
  const distTo = a => loc ? km(loc, a) : null;
  function nearestAttr(from = loc) { if (!from) return null; return allAttractions().map(a => ({ a, d: km(from, a) })).sort((x, y) => x.d - y.d)[0]; }

  // ---------------- assistant (rule-based) ----------------
  const BASE_CHIPS = ["What's next?", 'Tell me about my flight', 'Call a taxi', 'Show nearby sights', 'What can you do?'];
  function answer(q) {
    const L = q.toLowerCase().trim(), t = state.trip, now = nowTs();
    const noTrip = { text: "You haven't planned a trip yet. Open Plan to search sample flights and hotels, and I'll build your itinerary.", actions: [{ label: 'Plan a trip', act: 'tab:plan' }] };
    if (/\b(hello|hi|hey|good (morning|evening|afternoon))\b/.test(L) && L.split(/\s+/).length < 5) return { text: "Hello! I'm Wayly, your travel concierge. Ask me what's next, about your flight or hotel, to call a taxi, or to guide you around an attraction.", actions: [] };
    if (/(what can you do|\bhelp\b(?! me)|capabilit)/.test(L)) return { text: "I can tell you what's next on your trip, give flight and hotel details, prepare a taxi, and guide you around attractions with audio and scenic descriptions. I can also remind you of each step by voice. Try “Tell me about the Eiffel Tower”.", actions: [] };
    if (/(emergency|police|ambulance|stolen|lost my|robbed)/.test(L)) {
      const c = t ? CITIES[t.to] : null;
      return { text: c ? `In ${c.name}, the emergency numbers are: ${c.emergency}. If you are in danger, call them now. For lost passports, contact your country's embassy or consulate.` : 'Emergency numbers differ by country. If you are in danger, call the local emergency number right away.', actions: [] };
    }
    const hit = allAttractions().find(a => a.aka.some(k => L.includes(k)) || L.includes(a.name.toLowerCase()));
    if (hit && /(tell|guide|tour|describe|audio|about|what is|what's|show|see|view)/.test(L)) {
      const scenic = /(describe|view|scenic|see|look)/.test(L) && !/(tell me|guide|tour|audio)/.test(L);
      return { text: scenic ? `Here's what you'll see at ${hit.name}: ${hit.scenic}` : `Let me guide you around ${hit.name}. ${hit.intro} I'll start the audio guide now.`, actions: [{ label: scenic ? '🌄 Replay description' : '▶ Start audio guide', act: `${scenic ? 'scenic' : 'guide'}:${hit.id}` }, { label: '🧭 Navigate', act: `nav:${hit.id}` }], auto: scenic ? null : `guide:${hit.id}` };
    }
    if (/(nearby|near me|around me|close to me|what.*(see|visit))/.test(L)) {
      const n = nearestAttr(loc || (t ? CITIES[t.to] : null));
      if (!n) return { text: 'I need a location first. Tap “Show nearby sights” in the Guide tab and allow location, or plan a trip so I know your destination.', actions: [{ label: 'Open Guide', act: 'tab:guide' }] };
      return { text: `The closest sight is ${n.a.name} in ${n.a.city.name}, about ${n.d < 1 ? Math.round(n.d * 1000) + ' metres' : n.d.toFixed(1) + ' kilometres'} away. ${n.a.intro}`, actions: [{ label: '▶ Start audio guide', act: `guide:${n.a.id}` }, { label: '🧭 Navigate', act: `nav:${n.a.id}` }] };
    }
    if (/(taxi|cab|ride|uber|lyft|pick me up|get to the|get me to|transport)/.test(L)) {
      if (!t) return noTrip;
      const s = t.steps.filter(x => x.actions.some(a => a.t === 'taxi')).find(x => x.ts > now - 2 * H) || t.steps.find(x => x.actions.some(a => a.t === 'taxi'));
      const i = s.actions.findIndex(a => a.t === 'taxi'), ac = s.actions[i];
      return { text: `I can prepare a ride from ${ac.from.name} to ${ac.to.name} for your step “${s.title}”. Tap the button and I'll show the details and open your ride app.`, actions: [{ label: `🚕 ${ac.label}`, act: `step:${s.id}:${i}` }] };
    }
    if (/(next|schedule|itinerary|reminder|what.*now|what.*do|coming up|on today)/.test(L)) {
      if (!t) return noTrip;
      const n = nextStep(now); if (!n) return { text: 'Your trip is complete. I hope you had a wonderful time!', actions: [] };
      return { text: `Next is “${n.title}” on ${fmtDay(n.ts, n.tz)} at ${fmtTime(n.ts, n.tz)} (${countdown(n.ts - now)}). ${n.detail}`, actions: n.actions.map((a, i) => ({ label: a.label, act: `step:${n.id}:${i}` })) };
    }
    if (/(hotel|room|stay|check.?out|accommodation)/.test(L) || (/check.?in/.test(L) && /hotel|room|stay/.test(L))) {
      if (!t) return noTrip;
      const h = t.hotel; return { text: `You're staying at ${h.name}, ${h.address}. Check-in is from ${h.checkIn} and check-out is by ${h.checkOut}. ${h.amenities.length ? 'It offers ' + h.amenities.join(', ').toLowerCase() + '.' : ''}`, actions: [{ label: '🧭 Navigate to hotel', act: 'nav:hotel' }] };
    }
    if (/(flight|gate|board|airline|takeoff|take off|depart|check.?in|land|arriv)/.test(L)) {
      if (!t) return noTrip;
      const f = t.flight, r = t.retFlight, A = CITIES[t.from], B = CITIES[t.to];
      return { text: `Your outbound flight ${f.number} with ${f.airline} leaves ${A.name} on ${fmtDay(f.depTs, A.tz)} at ${fmtTime(f.depTs, A.tz)} and lands in ${B.name} at ${fmtTime(f.arrTs, B.tz)} local time (${fmtDur(f.durMin)}${f.stops ? ', 1 stop' : ', nonstop'}). Your return flight ${r.number} departs on ${fmtDay(r.depTs, B.tz)} at ${fmtTime(r.depTs, B.tz)}. Gate numbers aren't available in this demo; check the airport screens.`, actions: [] };
    }
    if (/weather|rain|forecast|temperature/.test(L)) return { text: "I don't have live weather in this draft. A full version would show a forecast for each day and adjust your plan if it rains.", actions: [] };
    if (/(thank|thanks|great|awesome)/.test(L)) return { text: "You're welcome! I'm here whenever you need me.", actions: [] };
    return { text: "I'm not sure about that yet. I can tell you what's next, details of your flight or hotel, prepare a taxi, or guide you around an attraction. Try “What's next?”", actions: [] };
  }

  // ---------------- UI state ----------------
  let tab = 'plan', planStep = 'form', res = null, sel = { flight: null, retFlight: null, hotel: null, transfer: 'taxi' };
  let guideCity = state.trip ? state.trip.to : 'paris';
  let taxi = null, showDriver = false, chat = [], listening = false, planErr = '';
  if (state.trip) tab = 'trip';

  const uberLink = p => `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[nickname]=${encodeURIComponent(p.name)}&dropoff[latitude]=${p.lat}&dropoff[longitude]=${p.lng}`;
  const mapsLink = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
  const toast = m => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2600); };

  // ---------------- views ----------------
  function planView() {
    const p = state.plan;
    const cityOpts = sel0 => Object.values(CITIES).map(c => `<option value="${c.id}" ${sel0 === c.id ? 'selected' : ''}>${esc(c.name)}, ${esc(c.country)}</option>`).join('');
    if (planStep === 'form') return `
      <section class="card"><h2>Plan a trip</h2>
        <p class="hint">Flights, hotels and prices are <b>sample data</b>. No real bookings or payments are made.</p>
        <form id="planForm" novalidate>
          <label>From<select name="from">${cityOpts(p.from)}</select></label>
          <label>To<select name="to">${cityOpts(p.to)}</select></label>
          <div class="row"><label>Depart<input type="date" name="depart" value="${esc(p.depart || localToday(30))}" required></label>
          <label>Return<input type="date" name="ret" value="${esc(p.ret || localToday(35))}" required></label></div>
          <label>Travellers<select name="travelers">${[1, 2, 3, 4, 5, 6].map(n => `<option ${+p.travelers === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <p class="err" role="alert">${esc(planErr)}</p>
          <button class="btn big">Search sample flights &amp; hotels</button>
        </form></section>`;
    if (planStep === 'results') {
      const A = CITIES[p.from], B = CITIES[p.to];
      const flightCard = (f, key, fromC, toC) => `<button class="opt ${sel[key] && sel[key].id === f.id ? 'on' : ''}" aria-pressed="${!!(sel[key] && sel[key].id === f.id)}" data-sel="${key}:${f.id}">
        <b>${esc(f.airline)}</b> <small>${esc(f.number)}</small><span class="price">${money(f.price)}<small>/person</small></span>
        <span>${fmtTime(f.depTs, fromC.tz)} ${esc(fromC.code || '')} → ${fmtTime(f.arrTs, toC.tz)} ${esc(toC.code)}</span>
        <small>${fmtDur(f.durMin)} · ${f.stops ? '1 stop' : 'Nonstop'}</small></button>`;
      const nights = Math.max(1, dayDiff(p.depart, p.ret));
      return `
      <section class="card"><button class="btn sm ghost" data-act="plan:form">← Edit search</button>
        <h2>${esc(A.name)} → ${esc(B.name)}</h2><p class="hint">${fmtDayStr(p.depart)} – ${fmtDayStr(p.ret)} · ${p.travelers} traveller${p.travelers > 1 ? 's' : ''} · sample data</p></section>
      <section class="card"><h3>✈️ Outbound · ${fmtDayStr(p.depart)}</h3>${res.flights.map(f => flightCard(f, 'flight', A, B)).join('')}</section>
      <section class="card"><h3>✈️ Return · ${fmtDayStr(p.ret)}</h3>${res.retFlights.map(f => flightCard(f, 'retFlight', B, A)).join('')}</section>
      <section class="card"><h3>🏨 Hotels · ${nights} night${nights > 1 ? 's' : ''}</h3>${res.hotels.map(h => `<button class="opt ${sel.hotel && sel.hotel.id === h.id ? 'on' : ''}" aria-pressed="${!!(sel.hotel && sel.hotel.id === h.id)}" data-sel="hotel:${h.id}">
        <b>${esc(h.name)}</b> <span class="price">${money(h.price)}<small>/night</small></span>
        <span>${'★'.repeat(h.stars)} · ${esc(h.rating)}/10</span><small>${esc(h.address)}${h.amenities.length ? ' · ' + esc(h.amenities.join(', ')) : ''}</small></button>`).join('')}</section>
      ${sel.hotel ? `<section class="card"><h3>🚕 Airport transfer</h3>${transferOptions(p.to, sel.hotel).map(tr => `<button class="opt ${sel.transfer === tr.id ? 'on' : ''}" aria-pressed="${sel.transfer === tr.id}" data-sel="transfer:${tr.id}">
        <b>${tr.icon} ${esc(tr.name)}</b><span class="price">~${money(tr.fare)}</span><small>${tr.mins} min · ${esc(tr.note)}</small></button>`).join('')}</section>` : ''}
      <section class="card"><button class="btn big" data-act="plan:summary" ${sel.flight && sel.retFlight && sel.hotel ? '' : 'disabled'}>Review &amp; build my itinerary</button>
        ${sel.flight && sel.retFlight && sel.hotel ? '' : '<p class="hint">Choose an outbound flight, a return flight and a hotel to continue.</p>'}</section>`;
    }
    // summary
    const tot = totals();
    return `
      <section class="card"><button class="btn sm ghost" data-act="plan:results">← Back</button><h2>Review your trip</h2>
        <ul class="plain sum">
          <li><span>✈️ ${esc(sel.flight.airline)} ${esc(sel.flight.number)}</span><b>${money(tot.out)}</b></li>
          <li><span>✈️ ${esc(sel.retFlight.airline)} ${esc(sel.retFlight.number)}</span><b>${money(tot.back)}</b></li>
          <li><span>🏨 ${esc(sel.hotel.name)}<small>${tot.nights} night${tot.nights > 1 ? 's' : ''} × ${tot.rooms} room${tot.rooms > 1 ? 's' : ''}</small></span><b>${money(tot.hotel)}</b></li>
          <li><span>🚕 ${esc(tot.tr.name)} (both ways, estimate)</span><b>${money(tot.transfer)}</b></li>
          <li class="total"><span>Estimated total</span><b>${money(tot.total)}</b></li></ul>
        <p class="hint safe">Simulated booking. Nothing is reserved and no payment is taken. These are sample prices, not real offers.</p>
        <button class="btn big" data-act="plan:confirm">Confirm (simulated) &amp; build itinerary</button></section>`;
  }
  const fmtDayStr = ds => { const [y, m, d] = ds.split('-').map(Number); return `${MON[m - 1]} ${d}`; };
  function totals() {
    const p = state.plan, nights = Math.max(1, dayDiff(p.depart, p.ret)), rooms = Math.ceil(p.travelers / 2);
    const tr = transferOptions(p.to, sel.hotel).find(x => x.id === sel.transfer) || transferOptions(p.to, sel.hotel)[0];
    const out = sel.flight.price * p.travelers, back = sel.retFlight.price * p.travelers, hotel = sel.hotel.price * nights * rooms, transfer = tr.fare * 2;
    return { nights, rooms, tr, out, back, hotel, transfer, total: out + back + hotel + transfer };
  }

  function stepCard(s, status) {
    return `<li class="step ${status}" id="s-${esc(s.id)}"><div class="when"><b>${fmtTime(s.ts, s.tz)}</b><small>${fmtDay(s.ts, s.tz)}</small></div>
      <div class="what"><span class="ico" aria-hidden="true">${s.icon}</span> <b>${esc(s.title)}</b><small>${esc(s.detail)}</small>
        <div class="acts">${s.actions.map((a, i) => `<button class="btn sm ghost" data-act="step:${esc(s.id)}:${i}">${esc(a.label)}</button>`).join('')}<button class="btn sm ghost" data-act="say:${esc(s.id)}" aria-label="Read aloud">🔊</button></div></div></li>`;
  }
  function tripView() {
    const t = state.trip;
    if (!t) return `<section class="card"><h2>No trip yet</h2><p>Plan a trip and I'll turn it into a step-by-step itinerary with voice reminders.</p><button class="btn big" data-act="tab:plan">Plan a trip</button></section>`;
    const now = nowTs(), A = CITIES[t.from], B = CITIES[t.to], nx = nextStep(now);
    let lastDay = '';
    const list = t.steps.map(s => {
      const day = dateStr(s.ts, s.tz), head = day !== lastDay ? `<li class="dayhead">${fmtDay(s.ts, s.tz)}</li>` : ''; lastDay = day;
      const status = s.ts <= now ? 'done' : (nx && nx.id === s.id ? 'next' : '');
      return head + stepCard(s, status);
    }).join('');
    return `
      <section class="card trip"><div><h2>${esc(A.name)} → ${esc(B.name)}</h2><small>${fmtDayStr(t.depart)} – ${fmtDayStr(t.ret)} · ${t.travelers} traveller${t.travelers > 1 ? 's' : ''} · Ref <b>${esc(t.ref)}</b> <span class="tag">simulated</span></small></div></section>
      ${nx ? `<section class="card nextup" aria-live="polite"><small>NEXT UP · ${countdown(nx.ts - now)}${demo.on ? ' (demo clock)' : ''}</small><h2>${nx.icon} ${esc(nx.title)}</h2><p>${esc(nx.detail)}</p>
        <div class="acts">${nx.actions.map((a, i) => `<button class="btn" data-act="step:${esc(nx.id)}:${i}">${esc(a.label)}</button>`).join('')}<button class="btn ghost" data-act="say:${esc(nx.id)}">🔊 Read aloud</button></div></section>`
        : '<section class="card"><h2>🎉 Trip complete</h2><p>Thanks for travelling with Wayly.</p></section>'}
      <section class="card"><h3>🧪 Try it: demo trip</h3><p class="hint">Fast-forward through the whole trip to hear each reminder.</p>
        ${demo.on ? `<p><b>Demo clock:</b> ${fmtDay(demo.now, A.tz)}, ${fmtTime(demo.now, A.tz)} (${esc(A.name)} time)</p>
          <div class="acts"><button class="btn" data-act="demo:next">⏭ Next reminder</button>${demo.auto ? '<button class="btn ghost" data-act="demo:pause">⏸ Pause auto-play</button>' : '<button class="btn ghost" data-act="demo:auto">▶ Auto-play</button>'}<button class="btn ghost" data-act="demo:stop">⏹ Stop demo</button></div>`
          : '<button class="btn" data-act="demo:start">▶ Start demo trip</button>'}</section>
      <section class="card"><h3>🆘 Safety</h3><p>${esc(B.name)} emergency numbers: <b>${esc(B.emergency)}</b>.</p></section>
      <section class="card"><h3>Itinerary</h3><ol class="timeline">${list}</ol></section>
      <section class="card"><button class="btn ghost danger" data-act="trip:cancel">Cancel this (simulated) trip</button></section>`;
  }

  function guideView() {
    const c = CITIES[guideCity] || CITIES.paris;
    const player = guide ? (() => {
      const a = findAttr(guide.attrId), total = a.stops.length, txt = guide.mode === 'scenic' ? a.scenic : a.stops[guide.idx].text, ttl = guide.mode === 'scenic' ? 'Scenic description' : a.stops[guide.idx].title;
      return `<section class="card player" aria-live="polite"><small>${guide.playing ? '🔊 NOW PLAYING' : '⏸ PAUSED'} · ${esc(a.name)}${guide.mode === 'guide' ? ` · Stop ${guide.idx + 1} of ${total}` : ''}</small>
        <h3>${esc(ttl)}</h3><p class="script">${esc(txt)}</p>
        <div class="acts">${guide.mode === 'guide' ? '<button class="btn ghost" data-act="gprev" aria-label="Previous stop">⏮</button>' : ''}
          ${guide.playing ? '<button class="btn" data-act="gpause">⏸ Pause</button>' : '<button class="btn" data-act="gplay">▶ Play</button>'}
          ${guide.mode === 'guide' ? '<button class="btn ghost" data-act="gnext" aria-label="Next stop">⏭</button>' : ''}<button class="btn ghost" data-act="gstop">⏹ Close</button></div>
        ${!state.voice.on ? '<p class="hint">Voice reminders are off, but audio guides still play when you tap Play.</p>' : ''}${synth ? '' : '<p class="err">This browser has no speech synthesis. You can still read the text.</p>'}</section>`;
    })() : '';
    const list = c.attractions.map(a => { const d = distTo(a); return `<li class="card attr"><b>${esc(a.name)}</b> <small>${esc(a.area)} · ~${a.minutes} min${d != null ? ` · ${d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'} from you` : ''}</small>
      <p>${esc(a.intro)}</p><div class="acts"><button class="btn" data-act="guide:${esc(a.id)}">▶ Audio guide</button><button class="btn ghost" data-act="scenic:${esc(a.id)}">🌄 Describe the view</button><a class="btn ghost" href="${mapsLink(a)}" target="_blank" rel="noopener noreferrer">🧭 Navigate</a></div></li>`; }).join('');
    return `${player}
      <section class="card"><h2>🎧 Guided tours</h2>
        <label>City<select id="guideCity">${Object.values(CITIES).map(x => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <div class="acts"><button class="btn ghost" data-act="locate">📍 Show nearby sights</button><button class="btn ghost" data-act="pretend">🎭 Pretend I'm there</button></div>
        <p class="hint" id="locMsg">${esc(locMsg)}</p></section>
      <ul class="plain">${list}</ul>
      <p class="hint pad">Short, general-knowledge summaries for the demo. A full version would use licensed, fact-checked content in many languages.</p>`;
  }

  function chatView() {
    const bubbles = chat.map(m => `<li class="bubble ${m.from}"><span>${esc(m.text)}</span>${m.actions && m.actions.length ? `<div class="acts">${m.actions.map(a => `<button class="chip" data-act="${esc(a.act)}">${esc(a.label)}</button>`).join('')}</div>` : ''}</li>`).join('');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return `<section class="card chat"><h2>💬 Concierge</h2><p class="hint">A rule-based demo assistant. A full version would use an AI language model with live travel data.</p>
      <ul class="chatlog" id="chatLog" role="log" aria-live="polite">${bubbles}</ul>
      <div class="chips">${BASE_CHIPS.map(q => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form id="chatForm" autocomplete="off"><label class="sr" for="chatInput">Ask the concierge</label>
        <div class="inrow"><input id="chatInput" name="text" maxlength="200" placeholder="Ask me anything about your trip…" required>
        ${SR ? `<button type="button" class="btn ${listening ? 'red' : 'ghost'}" id="mic" aria-label="${listening ? 'Listening…' : 'Speak'}">${listening ? '🎙️…' : '🎤'}</button>` : ''}<button class="btn">Send</button></div></form></section>`;
  }

  function meView() {
    const v = state.voice, perm = 'Notification' in window ? Notification.permission : 'unsupported';
    return `
    <section class="card"><h2>🔊 Voice</h2>
      <label class="check"><input type="checkbox" id="voiceOn" ${v.on ? 'checked' : ''}> Speak reminders and answers aloud</label>
      <label>Speaking speed: <b id="rateVal">${v.rate.toFixed(1)}×</b><input type="range" id="rate" min="0.7" max="1.4" step="0.1" value="${v.rate}"></label>
      ${voices.length ? `<label>Voice<select id="voiceSel"><option value="">Automatic (English)</option>${voices.map(x => `<option value="${esc(x.voiceURI)}" ${x.voiceURI === v.uri ? 'selected' : ''}>${esc(x.name)} (${esc(x.lang)})</option>`).join('')}</select></label>` : `<p class="hint">${synth ? 'No voices reported yet by this browser.' : 'This browser does not support speech synthesis.'}</p>`}
      <button class="btn ghost" data-act="testvoice">▶ Test voice</button></section>
    <section class="card"><h2>🔔 Notifications</h2>
      <p class="hint">Status: <b>${esc(perm)}</b>. Reminders appear in the app and are spoken. With notifications on, they also pop up while the app is open. Reminders while the app is closed need a server.</p>
      <button class="btn ghost" data-act="notif" ${perm === 'unsupported' ? 'disabled' : ''}>${state.notif && perm === 'granted' ? 'Notifications on' : 'Turn on notifications'}</button></section>
    <section class="card"><h2>🔒 Privacy</h2><ul class="hint"><li>Your trip stays on this device. Nothing is sent to a server.</li><li>Location is used only when you tap “Show nearby sights”, and isn't stored.</li><li>Voice input (microphone button) uses your browser's speech service, which may send audio to its provider.</li></ul></section>
    <section class="card"><h2>About this draft</h2><ul>
      <li>Flights, hotels, prices and bookings are <b>sample data</b> and are simulated.</li>
      <li>The assistant is a simple rule-based demo, not a live AI.</li>
      <li>Landmark notes are short general summaries. Verify opening hours, tickets and travel rules with official sources.</li></ul>
      <button class="btn ghost danger" data-act="reset">Erase all Wayly data on this device</button></section>`;
  }

  const NAV = [['plan', '🧭', 'Plan'], ['trip', '🗓️', 'Trip'], ['guide', '🎧', 'Guide'], ['chat', '💬', 'Concierge'], ['me', '⚙️', 'Settings']];
  function render() {
    if (tab === 'chat' && !chat.length) chat.push({ from: 'bot', text: state.trip ? "Hi! I'm Wayly. Ask me what's next, about your flight or hotel, or to call a taxi." : "Hi! I'm Wayly, your travel concierge. Plan a trip first, or ask me to guide you around an attraction.", actions: [] });
    const views = { plan: planView, trip: tripView, guide: guideView, chat: chatView, me: meView };
    $('#view').innerHTML = views[tab]();
    $('nav').innerHTML = NAV.map(([id, ico, label]) => `<button data-act="tab:${id}" aria-current="${tab === id ? 'page' : 'false'}"><span>${ico}</span>${label}</button>`).join('');
    $('#modal').innerHTML = taxi ? taxiModal() : ''; $('#modal').hidden = !taxi;
    bind(); renderBanner();
    if (tab === 'chat') { const log = $('#chatLog'); if (log) log.scrollTop = log.scrollHeight; }
  }
  function renderBanner() {
    const el = $('#banner'); if (!el) return;
    const s = banner && stepById(banner.id);
    if (!s) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = `<div class="bn"><div><small>REMINDER</small><b>${s.icon} ${esc(s.title)}</b><span>${esc(s.detail)}</span></div>
      <div class="acts">${s.actions.slice(0, 1).map((a, i) => `<button class="btn sm" data-act="step:${esc(s.id)}:${i}">${esc(a.label)}</button>`).join('')}<button class="btn sm ghost" data-act="say:${esc(s.id)}" aria-label="Repeat">🔊</button><button class="btn sm ghost" data-act="dismiss" aria-label="Dismiss">✕</button></div></div>`;
  }
  function taxiModal() {
    const { from, to } = taxi, d = km(from, to), fare = Math.round((4 + d * 2.1) * 2) / 2, eta = 4 + (hash(to.name + from.name) % 6), trip = Math.round(10 + d * 1.8);
    return `<div class="sheet" role="dialog" aria-modal="true" aria-label="Taxi"><div class="panel">
      <h2>🚕 Your ride</h2>
      <p><b>From:</b> ${esc(from.name)}<br><b>To:</b> ${esc(to.name)}${to.address ? `<br><small>${esc(to.address)}</small>` : ''}</p>
      <p class="hint">Estimate (sample): about ${money(fare)} · ${trip} min trip · pickup in about ${eta} min. Real prices come from your ride or taxi provider.</p>
      <div class="acts"><a class="btn" href="${uberLink(to)}" target="_blank" rel="noopener noreferrer">Open Uber</a><a class="btn ghost" href="${mapsLink(to)}" target="_blank" rel="noopener noreferrer">Directions in Maps</a></div>
      <button class="btn ghost" data-act="driver">${showDriver ? 'Hide driver card' : 'Show to the driver'}</button>
      ${showDriver ? `<div class="driver"><small>Please take me to:</small><b>${esc(to.name)}</b>${to.address ? `<span>${esc(to.address)}</span>` : ''}</div>` : ''}
      <button class="btn ghost" data-act="closemodal">Close</button></div></div>`;
  }

  // ---------------- actions ----------------
  function runStepAction(stepId, i) {
    const s = stepById(stepId); const a = s && s.actions[i]; if (!a) return;
    if (a.t === 'taxi') { taxi = { from: a.from, to: a.to }; showDriver = false; speak(`I've prepared your ride from ${a.from.name} to ${a.to.name}. You can open your ride app, or show the driver card.`); render(); }
    else if (a.t === 'nav') { window.open(mapsLink(a.to), '_blank', 'noopener'); }
    else if (a.t === 'guide') startGuide(a.attr, 'guide');
  }
  function say(text) { speak(text, { force: true }); }
  function sendChat(text) {
    text = String(text || '').trim().slice(0, 200); if (!text) return;
    chat.push({ from: 'me', text, actions: [] });
    const r = answer(text); chat.push({ from: 'bot', text: r.text, actions: r.actions || [] });
    if (tab !== 'chat') tab = 'chat';
    render(); const ci = $('#chatInput'); if (ci && ci.focus) ci.focus();
    if (r.auto) { const [k, id] = r.auto.split(':'); startGuide(id, 'guide'); } else speak(r.text);
  }
  function act(a) {
    const [k, x, y] = a.split(':');
    switch (k) {
      case 'tab': tab = x; if (x !== 'chat') listening = false; render(); window.scrollTo(0, 0); break;
      case 'plan': if (x === 'form') planStep = 'form'; else if (x === 'results') planStep = 'results'; else if (x === 'summary') planStep = 'summary'; else if (x === 'confirm') confirmBooking(); render(); window.scrollTo(0, 0); break;
      case 'step': runStepAction(x, +y); break;
      case 'say': { const s = stepById(x); if (s) say(s.say || s.title); break; }
      case 'dismiss': banner = null; stopSpeak(); renderBanner(); break;
      case 'demo': if (x === 'start') startDemo(); else if (x === 'next') { demo.auto = false; demoNext(); } else if (x === 'auto') demoAuto(); else if (x === 'pause') { demo.auto = false; clearTimeout(demo.timer); clearTimeout(demo.guard); render(); } else if (x === 'stop') { stopSpeak(); stopDemo(); } break;
      case 'guide': startGuide(x, 'guide'); break;
      case 'scenic': startGuide(x, 'scenic'); break;
      case 'gplay': playGuide(); break;
      case 'gpause': pauseGuide(); break;
      case 'gnext': stepGuide(1); break;
      case 'gprev': stepGuide(-1); break;
      case 'gstop': endGuide(); break;
      case 'nav': { const at = x === 'hotel' ? state.trip && state.trip.hotel : findAttr(x); if (at) window.open(mapsLink(at), '_blank', 'noopener'); break; }
      case 'locate': locate(); break;
      case 'pretend': { const c = CITIES[guideCity]; loc = { lat: c.attractions[0].lat, lng: c.attractions[0].lng }; locMsg = `Pretending you're at ${c.attractions[0].name}. Sights are sorted by distance.`; render(); break; }
      case 'driver': showDriver = !showDriver; render(); break;
      case 'closemodal': taxi = null; render(); break;
      case 'trip': if (x === 'cancel' && confirm('Cancel this simulated trip?')) { state.trip = null; state.fired = {}; banner = null; stopDemo(); save(); tab = 'plan'; planStep = 'form'; render(); } break;
      case 'testvoice': say('Hello, I am Wayly, your travel concierge. This is how I will sound.'); break;
      case 'notif': requestNotif(); break;
      case 'reset': if (confirm('Erase all Wayly data on this device?')) { stopSpeak(); state = defaults(); save(); guide = null; chat = []; banner = null; stopDemo(); tab = 'plan'; planStep = 'form'; render(); } break;
      default: break;
    }
  }
  function confirmBooking() {
    const p = state.plan, tot = totals();
    const trip = { ref: 'WY-' + (hash(JSON.stringify([p, sel.flight.id, sel.retFlight.id, sel.hotel.id])) % 1679616).toString(36).toUpperCase().padStart(4, '0'),
      from: p.from, to: p.to, depart: p.depart, ret: p.ret, travelers: +p.travelers, flight: sel.flight, retFlight: sel.retFlight, hotel: sel.hotel,
      transfer: { id: tot.tr.id, name: tot.tr.name, mins: tot.tr.mins, fare: tot.tr.fare }, total: tot.total };
    trip.steps = buildItinerary(trip);
    state.trip = trip; state.fired = {}; guideCity = trip.to; save(); tab = 'trip'; planStep = 'form'; toast('Itinerary built. Reminders are on.');
  }
  function locate() {
    if (!navigator.geolocation) { locMsg = 'This device cannot share a location. Try “Pretend I\'m there”.'; render(); return; }
    locMsg = 'Finding your location…'; render();
    navigator.geolocation.getCurrentPosition(p => {
      loc = { lat: p.coords.latitude, lng: p.coords.longitude };
      const n = nearestAttr();
      if (n && n.d < 60) { guideCity = n.a.city.id; locMsg = `Nearest sight: ${n.a.name} (${n.d < 1 ? Math.round(n.d * 1000) + ' m' : n.d.toFixed(1) + ' km'}).`; }
      else locMsg = "You're not near any demo city, so pick a city and tap “Pretend I'm there”.";
      render();
    }, () => { locMsg = 'Location permission was declined. You can still use “Pretend I\'m there”.'; render(); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function requestNotif() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(r => { state.notif = r === 'granted'; save(); render(); toast(r === 'granted' ? 'Notifications on' : 'Notifications not allowed'); });
  }
  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { toast('Voice input is not supported in this browser'); return; }
    stopSpeak(); const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = e => { const t = e.results[0][0].transcript; listening = false; sendChat(t); };
    rec.onerror = () => { listening = false; toast('Could not hear you. Try again.'); render(); };
    rec.onend = () => { if (listening) { listening = false; render(); } };
    listening = true; render(); rec.start();
  }

  function bind() {
    const v = $('#view');
    $('#planForm', v)?.addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target), p = state.plan;
      Object.assign(p, { from: f.get('from'), to: f.get('to'), depart: f.get('depart'), ret: f.get('ret'), travelers: +f.get('travelers') });
      if (p.from === p.to) { planErr = 'Please choose two different cities.'; render(); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.depart) || !/^\d{4}-\d{2}-\d{2}$/.test(p.ret)) { planErr = 'Please choose both dates.'; render(); return; }
      if (dayDiff(p.depart, p.ret) < 1) { planErr = 'The return date must be after the departure date.'; render(); return; }
      if (dayDiff(p.depart, p.ret) > 30) { planErr = 'Please keep trips under 30 nights for this demo.'; render(); return; }
      planErr = ''; save();
      res = { flights: flightOptions(p.from, p.to, p.depart), retFlights: flightOptions(p.to, p.from, p.ret), hotels: hotelOptions(p.to) };
      sel = { flight: null, retFlight: null, hotel: null, transfer: 'taxi' }; planStep = 'results'; render(); window.scrollTo(0, 0);
    });
    $$('[data-sel]', v).forEach(b => b.addEventListener('click', () => {
      const [k, id] = b.dataset.sel.split(':');
      if (k === 'flight') sel.flight = res.flights.find(f => f.id === id); else if (k === 'retFlight') sel.retFlight = res.retFlights.find(f => f.id === id);
      else if (k === 'hotel') sel.hotel = res.hotels.find(h => h.id === id); else if (k === 'transfer') sel.transfer = id;
      render();
    }));
    $('#guideCity', v)?.addEventListener('change', e => { guideCity = e.target.value; render(); });
    $('#chatForm', v)?.addEventListener('submit', e => { e.preventDefault(); const i = $('#chatInput', v); const t = i.value; i.value = ''; sendChat(t); });
    $$('[data-quick]', v).forEach(b => b.addEventListener('click', () => sendChat(b.dataset.quick)));
    $('#mic', v)?.addEventListener('click', listen);
    $('#voiceOn', v)?.addEventListener('change', e => { state.voice.on = e.target.checked; if (!state.voice.on) stopSpeak(); save(); });
    $('#rate', v)?.addEventListener('input', e => { state.voice.rate = +e.target.value; $('#rateVal', v).textContent = state.voice.rate.toFixed(1) + '×'; save(); });
    $('#voiceSel', v)?.addEventListener('change', e => { state.voice.uri = e.target.value; save(); });
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'A') return;
    e.preventDefault(); act(el.dataset.act);
  });
  $('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
  let deferred;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // real-time reminders (only while the app is open)
  setInterval(() => { if (!demo.on) { const f = checkReminders(Date.now()); if (f && tab === 'trip') render(); } }, 15000);
  checkReminders(Date.now());

  window.__wayly = { get state() { return state; }, get demo() { return demo; }, get tab() { return tab; }, get chat() { return chat; }, get guide() { return guide; }, buildItinerary, answer, nextStep, checkReminders, nowTs, fmtTime, fmtDay, sendChat };
  render();
})();
