/* Local, bounded diagnostics. Never collect request bodies, headers or query strings. */
(function () {
  'use strict';
  var key = 'sixfold.startup-diagnostics.v1';
  var report = { started: new Date().toISOString(), browser: navigator.userAgent,
    page: location.origin + location.pathname, events: [] };
  var previous = null;
  try { previous = JSON.parse(localStorage.getItem(key)); } catch (_) {}
  var failed = false;
  var button;
  function url(value) {
    try { var u = new URL(value, location.href); return u.origin + u.pathname; }
    catch (_) { return '[unknown URL]'; }
  }
  function message(error) {
    // Error messages can contain URLs with credentials or query parameters.
    return String(error && error.message || error || 'Unknown error')
      .replace(/https?:\/\/[^\s"'<>]+/g, function (s) { return url(s); }).slice(0, 1500);
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify({ current: report, previous: previous && (previous.current || previous) })); } catch (_) {}
  }
  function record(type, details, failure) {
    try {
      report.events.push(Object.assign({ type: type, ms: Math.round(performance.now()), online: navigator.onLine }, details));
      if (report.events.length > 100) report.events.shift();
      failed = failed || failure;
      save();
      if (failed) showButton();
    } catch (_) { /* Diagnostics must never interrupt the game. */ }
  }
  function showButton() {
    if (button || !document.body) return;
    button = document.createElement('button');
    button.textContent = 'Loading error report';
    button.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;padding:10px;font:14px sans-serif';
    button.onclick = function () {
      var panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;inset:10px;z-index:2147483647;background:#fff;color:#111;padding:16px;overflow:auto;font:16px sans-serif';
      var heading = document.createElement('p');
      heading.textContent = 'Copy this report and send it with your bug report. It stays on this device until you share it.';
      var area = document.createElement('textarea');
      area.value = JSON.stringify({ current: report, previous: previous && (previous.current || previous) }, null, 2);
      area.readOnly = true;
      area.style.cssText = 'display:block;width:100%;height:65%;font:12px monospace';
      var copy = document.createElement('button');
      copy.textContent = 'Copy report';
      copy.onclick = function () {
        area.focus(); area.select(); area.setSelectionRange(0, area.value.length);
        if (navigator.clipboard) navigator.clipboard.writeText(area.value).then(function () {
          copy.textContent = 'Copied';
        }, function () { copy.textContent = 'Select and copy the text above'; });
      };
      var close = document.createElement('button');
      close.textContent = 'Close'; close.onclick = function () { panel.remove(); };
      panel.append(heading, area, copy, close); document.body.appendChild(panel);
    };
    document.body.appendChild(button);
  }
  var originalFetch = window.fetch;
  if (originalFetch) window.fetch = function (input, options) {
    var address = url(typeof input === 'string' || input instanceof URL ? input : input && input.url);
    var start = performance.now();
    var method = String(options && options.method || input && input.method || 'GET');
    return originalFetch.apply(this, arguments).then(function (response) {
      record('fetch', { url: address, method: method, status: response.status,
        duration: Math.round(performance.now() - start) }, !response.ok);
      return response;
    }, function (error) {
      record('fetch-rejected', { url: address, method: method, error: message(error),
        duration: Math.round(performance.now() - start) }, true);
      throw error;
    });
  };
  window.addEventListener('unhandledrejection', function (e) {
    record('unhandledrejection', { error: message(e.reason) }, true);
  });
  window.addEventListener('error', function (e) {
    var target = e.target;
    record('error', { error: message(e.error || e.message || 'Resource load failed'),
      url: url(e.filename || target && (target.src || target.href)) }, true);
  }, true);
  var originalAlert = window.alert;
  window.alert = function (text) {
    var version = document.documentElement.innerHTML.match(/productVersion:\s*"([^"]+)"/);
    record('alert', { error: message(text), build: version && version[1] }, true);
    return originalAlert.apply(this, arguments);
  };
  window.addEventListener('offline', function () { record('offline', {}, true); });
  document.addEventListener('DOMContentLoaded', function () {
    var version = document.documentElement.innerHTML.match(/productVersion:\s*"([^"]+)"/);
    report.build = version && version[1];
    if (failed || previous && previous.current && previous.current.events.some(function (e) {
      return e.type === 'alert' || e.type === 'fetch-rejected' || e.type === 'unhandledrejection';
    })) showButton();
    save();
  });
  record('start', {}, false);
}());
