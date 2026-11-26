/* Lousynx — anonymous click counting for the showcase apps.
   Sends a tiny, anonymous signal (which button, which app, which page) to the owner's Google Apps Script.
   No cookies, no personal data. Counts are never shown on the website. */
(function () {
  'use strict';
  // Set to the Google Apps Script Web App URL (ends with /exec). Empty = tracking switched off.
  var ENDPOINT = '';
  var APPS = { guildpool: 1, carecircle: 1, wayly: 1 };
  var ACTS = { 'try': 1, android: 1, ios: 1, 'open-android': 1, 'open-ios': 1 };

  function send(act, app, src) {
    if (!ENDPOINT || !ACTS[act] || !APPS[app]) return false;
    var url = ENDPOINT + '?e=' + encodeURIComponent(act) + '&a=' + encodeURIComponent(app) + '&s=' + encodeURIComponent(src || 'other');
    try { if (navigator.sendBeacon && navigator.sendBeacon(url)) return true; } catch (e) { /* fall through */ }
    try { fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true }); return true; } catch (e) { return false; }
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-track]') : null;
    if (el) send(el.getAttribute('data-track'), el.getAttribute('data-app'), el.getAttribute('data-src'));
  }, true);

  // First time an installed app is opened on this device (Android app or iPhone Home Screen icon).
  function firstOpen(app) {
    try {
      var key = 'lousynx.opened.' + app;
      if (localStorage.getItem(key)) return;
      var act = null;
      if ((document.referrer || '').indexOf('android-app://com.lousynx.') === 0) act = 'open-android';
      else if (window.navigator.standalone === true) act = 'open-ios';
      if (!act) return;
      if (send(act, app, 'installed')) localStorage.setItem(key, '1');
    } catch (e) { /* storage blocked: skip */ }
  }

  window.lousynxTrack = { send: send, firstOpen: firstOpen };
  var me = document.currentScript;
  if (me && me.getAttribute('data-first-open')) firstOpen(me.getAttribute('data-first-open'));
})();
