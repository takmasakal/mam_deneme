(function installSessionExpiryHandler(global) {
  let redirecting = false;

  function isSessionFailure(status, bodyText, body) {
    if (status === 401) return true;
    if (status !== 403) return false;

    const text = [
      bodyText,
      body && typeof body === 'object' ? body.error : ''
    ].filter(Boolean).join(' ').toLowerCase();

    return /csrf|login failed|oauth2-proxy|session expired|not authenticated|authentication required|valid csrf token/.test(text);
  }

  function handle(status, bodyText = '', body = null) {
    if (!isSessionFailure(status, bodyText, body)) return false;
    if (redirecting || !global.location) return true;

    redirecting = true;
    const current = `${global.location.pathname}${global.location.search}${global.location.hash}` || '/';
    global.location.assign(`/oauth2/start?rd=${encodeURIComponent(current)}`);
    return true;
  }

  global.mamSessionExpiry = { handle };
})(window);
