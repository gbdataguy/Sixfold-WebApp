/* Local, bounded diagnostics. Store only allowlisted run context and error codes;
   never store raw request/response bodies, headers or query strings. */
(function () {
  'use strict';
  var key = 'sixfold.startup-diagnostics.v1';
  var report = { started: new Date().toISOString(), browser: navigator.userAgent,
    page: location.origin + location.pathname, diagnosticsVersion: 2,
    events: [], failures: [], environment: {
      width: window.innerWidth, height: window.innerHeight,
      pixelRatio: window.devicePixelRatio, touchPoints: navigator.maxTouchPoints,
      deviceMemory: navigator.deviceMemory, hardwareConcurrency: navigator.hardwareConcurrency
    } };
  var previous = null;
  try { previous = JSON.parse(localStorage.getItem(key)); } catch (_) {}
  var failed = false;
  var button;
  var dismissed = false;
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
      var event = Object.assign({ type: type, ms: Math.round(performance.now()), online: navigator.onLine }, details);
      report.events.push(event);
      if (report.events.length > 100) report.events.shift();
      if (failure) {
        report.failures.push(event);
        if (report.failures.length > 20) report.failures.shift();
      }
      failed = failed || failure;
      save();
      if (failed) showButton();
    } catch (_) { /* Diagnostics must never interrupt the game. */ }
  }
  function showButton() {
    if (dismissed || button || !document.body) return;
    var controls = document.createElement('div');
    controls.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;display:flex;gap:4px';
    button = document.createElement('button');
    button.textContent = 'Loading error report';
    button.style.cssText = 'padding:10px;font:14px sans-serif';
    var dismiss = document.createElement('button');
    dismiss.textContent = 'Dismiss';
    dismiss.style.cssText = 'padding:10px;font:14px sans-serif';
    dismiss.onclick = function () { dismissed = true; controls.remove(); };
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
    controls.append(button, dismiss);
    document.body.appendChild(controls);
  }
  var originalFetch = window.fetch;
  window.sixfoldDiagnostics = {
    unityReady: function () { record('unity-ready', {}, false); }
  };
  var requestSequence = 0;
  function numericContext(source, target, fields) {
    fields.forEach(function (field) {
      if (Number.isSafeInteger(source[field]) && source[field] >= 0) target[field] = source[field];
    });
  }
  function runContext(input, options, address) {
    var context = {};
    try {
      var endpoint = new URL(address);
      if (!/^\/v1\//.test(endpoint.pathname)) return context;
      var rawUrl = typeof input === 'string' || input instanceof URL ? input : input && input.url;
      var ranked = new URL(rawUrl, location.href).searchParams.get('ranked');
      if (ranked === '1' || ranked === '0') context.mode = ranked === '1' ? 'ranked' : 'casual';
      var body = options && options.body;
      if (typeof body !== 'string' && body && typeof TextDecoder !== 'undefined' &&
          (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) {
        if (body.byteLength > 1048576) return context;
        body = new TextDecoder().decode(body);
      }
      if (typeof body !== 'string' || body.length > 1048576) return context;
      var payload = JSON.parse(body);
      var run = payload.run || payload.playerBoard || payload.ghost || payload;
      if (!run) return context;
      var commander = run.commanderId || run.character;
      if (typeof commander === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(commander))
        context.commander = commander;
      if (typeof run.rankedMode === 'boolean') context.mode = run.rankedMode ? 'ranked' : 'casual';
      numericContext(run, context, ['version', 'round', 'wins', 'losses']);
      if (typeof payload.allowUnverifiedProgress === 'boolean') context.allowUnverifiedProgress = payload.allowUnverifiedProgress;
    } catch (_) {}
    return context;
  }
  if (originalFetch) window.fetch = function (input, options) {
    var address = url(typeof input === 'string' || input instanceof URL ? input : input && input.url);
    var context = runContext(input, options, address);
    context.requestId = ++requestSequence;
    var start = performance.now();
    var method = String(options && options.method || input && input.method || 'GET');
    return originalFetch.apply(this, arguments).then(function (response) {
      var failure = !response.ok && response.status !== 304;
      record('fetch', Object.assign({ url: address, method: method, status: response.status,
        duration: Math.round(performance.now() - start) }, context), failure);
      if ((failure || /\/v1\/profile$/.test(address)) && /\/v1\//.test(address) && response.clone) {
        try {
          response.clone().json().then(function (body) {
            var code = body && body.error && body.error.code;
            if (failure && typeof code === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(code))
              record('api-error', Object.assign({ url: address, method: method,
                status: response.status, errorCode: code }, context), true);
            if (!failure && body && body.profile) {
              var profile = body.profile;
              var access = {};
              numericContext(profile, access, ['completedFiveWinRuns', 'casualFiveWinRuns']);
              if (typeof profile.allCommandersUnlocked === 'boolean') access.allCommandersUnlocked = profile.allCommandersUnlocked;
              if (Array.isArray(profile.purchasedCommanderIds)) access.purchasedCommanderIds = profile.purchasedCommanderIds
                .filter(function (id) { return typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(id); }).slice(0, 32);
              report.commanderAccess = access;
              save();
            }
          }).catch(function () {});
        } catch (_) {}
      }
      return response;
    }, function (error) {
      record('fetch-rejected', Object.assign({ url: address, method: method, error: message(error),
        duration: Math.round(performance.now() - start) }, context), true);
      throw error;
    });
  };
  window.addEventListener('unhandledrejection', function (e) {
    record('unhandledrejection', { error: message(e.reason), stack: message(e.reason && e.reason.stack || '') }, true);
  });
  window.addEventListener('error', function (e) {
    var target = e.target;
    record('error', { error: message(e.error || e.message || 'Resource load failed'),
      stack: message(e.error && e.error.stack || ''), line: e.lineno, column: e.colno,
      url: url(e.filename || target && (target.src || target.href)) }, true);
  }, true);
  var originalAlert = window.alert;
  window.alert = function (text) {
    var version = document.documentElement.innerHTML.match(/productVersion:\s*"([^"]+)"/);
    record('alert', { error: message(text), build: version && version[1] }, true);
    return originalAlert.apply(this, arguments);
  };
  window.addEventListener('offline', function () { record('offline', {}, true); });
  window.addEventListener('online', function () { record('online', {}, false); });
  window.addEventListener('pageshow', function (e) { record('pageshow', { restored: e.persisted === true }, false); });
  document.addEventListener('visibilitychange', function () {
    record('visibility', { state: document.visibilityState }, false);
  });
  document.addEventListener('webglcontextlost', function () { record('webgl-context-lost', {}, true); }, true);
  document.addEventListener('webglcontextrestored', function () { record('webgl-context-restored', {}, false); }, true);
  document.addEventListener('DOMContentLoaded', function () {
    var version = document.documentElement.innerHTML.match(/productVersion:\s*"([^"]+)"/);
    report.build = version && version[1];
    record('dom-ready', {}, false);
    if (failed || previous && previous.current && (previous.current.failures && previous.current.failures.length || previous.current.events.some(function (e) {
      return e.type === 'alert' || e.type === 'fetch-rejected' || e.type === 'unhandledrejection';
    }))) showButton();
    save();
  });
  record('start', {}, false);
}());
