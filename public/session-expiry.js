(function installSessionExpiryHandler(global) {
  let redirecting = false;
  let idleTimer = null;
  let maxTimer = null;
  let listenersInstalled = false;
  const sessionStartKey = 'mam_session_started_at';

  function isSessionFailure(status, bodyText, body) {
    if (status === 401) return true;
    if (status !== 403) return false;

    const text = [
      bodyText,
      body && typeof body === 'object' ? body.error : ''
    ].filter(Boolean).join(' ').toLowerCase();

    return /csrf|login failed|oauth2-proxy|session expired|not authenticated|authentication required|valid csrf token/.test(text);
  }

  function redirect() {
    if (redirecting || !global.location) return true;

    redirecting = true;
    try {
      global.sessionStorage?.removeItem(sessionStartKey);
    } catch (_error) {}
    // /oauth2/start only re-authenticates while the oauth2-proxy cookie is
    // still valid. Use the same full logout flow as the explicit logout button.
    const fallback = '/oauth2/sign_out?rd=%2Foauth2%2Fstart%3Frd%3D%252F';
    global.fetch?.(`/api/logout-url?ts=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store'
    })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        global.location.assign(String(payload?.url || fallback));
      })
      .catch(() => {
        global.location.assign(fallback);
      });
    return true;
  }

  function handle(status, bodyText = '', body = null, options = {}) {
    if (!options.force && !isSessionFailure(status, bodyText, body)) return false;
    return redirect();
  }

  function stop() {
    if (idleTimer) global.clearTimeout(idleTimer);
    if (maxTimer) global.clearTimeout(maxTimer);
    idleTimer = null;
    maxTimer = null;
  }

  function start(settings = {}) {
    const idleMinutes = Number(settings.clientIdleMinutes);
    const maxHours = Number(settings.clientMaxHours);
    if (!Number.isFinite(idleMinutes) || idleMinutes <= 0) return;
    stop();

    const now = Date.now();
    let startedAt = now;
    try {
      const stored = Number(global.sessionStorage?.getItem(sessionStartKey));
      if (Number.isFinite(stored) && stored > 0 && stored <= now) startedAt = stored;
      global.sessionStorage?.setItem(sessionStartKey, String(startedAt));
    } catch (_error) {}

    const idleMs = idleMinutes * 60 * 1000;
    const maxMs = Number.isFinite(maxHours) && maxHours > 0 ? maxHours * 60 * 60 * 1000 : Infinity;
    let lastActivity = now;

    const expireIfNeeded = () => {
      const current = Date.now();
      if (current - lastActivity >= idleMs || current - startedAt >= maxMs) {
        stop();
        redirect();
        return;
      }
      const remaining = Math.min(idleMs - (current - lastActivity), maxMs - (current - startedAt));
      idleTimer = global.setTimeout(expireIfNeeded, Math.max(250, remaining));
    };

    const markActivity = () => {
      lastActivity = Date.now();
      if (idleTimer) global.clearTimeout(idleTimer);
      expireIfNeeded();
    };

    if (!listenersInstalled) {
      ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((eventName) => {
        global.addEventListener(eventName, markActivity, { passive: true });
      });
      global.addEventListener('visibilitychange', expireIfNeeded);
      listenersInstalled = true;
    }
    if (maxMs !== Infinity) {
      maxTimer = global.setTimeout(expireIfNeeded, Math.max(250, maxMs - (now - startedAt)));
    }
    expireIfNeeded();
  }

  global.mamSessionExpiry = { handle, redirect, start, stop };
})(window);
