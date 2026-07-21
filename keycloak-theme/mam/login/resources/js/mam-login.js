(function () {
  'use strict';

  var COOKIE_NAME = 'mam.login.lang';

  function normalize(value) {
    var lang = String(value || '').toLowerCase().split('-')[0];
    return lang === 'tr' || lang === 'en' ? lang : '';
  }

  function cookieDomain() {
    var host = String(window.location.hostname || '').toLowerCase();
    return host.endsWith('.trt.net.tr') ? '; Domain=.trt.net.tr' : '';
  }

  function persist(value) {
    var lang = normalize(value);
    if (!lang) return;
    document.cookie = COOKIE_NAME + '=' + encodeURIComponent(lang)
      + '; Path=/; Max-Age=31536000; SameSite=Lax'
      + (window.location.protocol === 'https:' ? '; Secure' : '')
      + cookieDomain();
  }

  function currentLocale() {
    var params = new URLSearchParams(window.location.search);
    return normalize(params.get('kc_locale') || params.get('ui_locales'));
  }

  function bind() {
    var locale = currentLocale();
    if (locale) persist(locale);
    document.documentElement.lang = locale || normalize(document.documentElement.lang) || 'tr';

    document.querySelectorAll('a[href*="kc_locale="], a[href*="ui_locales="], [data-locale]').forEach(function (link) {
      link.addEventListener('click', function () {
        var value = normalize(link.getAttribute('data-locale'));
        if (!value) {
          try {
            var url = new URL(link.href, window.location.href);
            value = normalize(url.searchParams.get('kc_locale') || url.searchParams.get('ui_locales'));
          } catch (_error) {}
        }
        persist(value);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
}());

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
