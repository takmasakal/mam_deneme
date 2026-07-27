(function persistMamLoginLocale() {
  var cookieName = 'mam.login.lang';
  var maxAge = 60 * 60 * 24 * 365;

  function normalize(value) {
    var lang = String(value || '').trim().toLowerCase().split('-')[0];
    return lang === 'tr' ? 'tr' : lang === 'en' ? 'en' : '';
  }

  function cookieDomain() {
    var host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || /^\d+(?:\.\d+){3}$/.test(host)) return '';
    if (host.endsWith('.trt.net.tr')) return '.trt.net.tr';
    var parts = host.split('.');
    return parts.length >= 3 ? '.' + parts.slice(-2).join('.') : '';
  }

  function write(value) {
    var lang = normalize(value);
    if (!lang) return;
    var domain = cookieDomain();
    document.cookie = cookieName + '=' + encodeURIComponent(lang)
      + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax'
      + (window.location.protocol === 'https:' ? '; Secure' : '')
      + (domain ? '; Domain=' + domain : '');
  }

  function fromUrl() {
    try {
      return new URLSearchParams(window.location.search).get('kc_locale')
        || new URLSearchParams(window.location.search).get('ui_locales');
    } catch (_error) {
      return '';
    }
  }

  function capture(event) {
    var link = event.target && event.target.closest
      ? event.target.closest('a[href], button[data-locale], [data-locale]')
      : null;
    if (!link) return;
    var locale = link.getAttribute('data-locale') || '';
    if (!locale && link.href) {
      try { locale = new URL(link.href, window.location.href).searchParams.get('kc_locale') || ''; } catch (_error) {}
    }
    write(locale);
  }

  document.addEventListener('click', capture, true);
  write(fromUrl() || document.documentElement.lang);
})();

(function showMamLoginVersion() {
  function render() {
    var version = String(window.MAM_LOGIN_VERSION || '').trim();
    if (!version) return;
    var page = document.querySelector('.login-pf-page');
    if (!page || page.querySelector('.mam-login-version')) return;
    var label = document.createElement('div');
    label.className = 'mam-login-version';
    label.textContent = version;
    page.appendChild(label);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render, { once: true });
  } else {
    render();
  }
})();
