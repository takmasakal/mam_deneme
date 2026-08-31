(function () {
  'use strict';

  var COOKIE_NAME = 'mam.login.lang';
  var pageLoadedAt = Date.now();

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

  function cookieLocale() {
    var match = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return normalize(match ? decodeURIComponent(match[1]) : '');
  }

  function ensureDefaultTurkishLocale() {
    if (currentLocale() || cookieLocale()) return false;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('kc_locale', 'tr');
      window.location.replace(url.toString());
      return true;
    } catch (_error) {
      return false;
    }
  }

  function bind() {
    if (ensureDefaultTurkishLocale()) return;
    moveHeaderIntoLoginCard();
    installNativeLocaleSelect();

    var locale = currentLocale();
    var rememberedLocale = cookieLocale();
    if (locale) persist(locale);
    document.documentElement.lang = locale || rememberedLocale || normalize(document.documentElement.lang) || 'tr';

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

    installFreshLoginGuard();
  }

  function localeLabel(value, fallback) {
    var lang = normalize(value);
    if (lang === 'tr') return 'Türkçe';
    if (lang === 'en') return 'English';
    return fallback || value || '';
  }

  function installNativeLocaleSelect() {
    var locale = document.getElementById('kc-locale');
    if (!locale || locale.querySelector('.mam-locale-select')) return;

    var links = Array.from(locale.querySelectorAll('a[href*="kc_locale="], a[href*="ui_locales="]'));
    if (!links.length) return;

    var select = document.createElement('select');
    select.className = 'mam-locale-select';
    select.setAttribute('aria-label', 'Dil seçimi');

    var activeLocale = currentLocale() || cookieLocale() || normalize(document.documentElement.lang) || 'tr';
    links.forEach(function (link) {
      var url;
      var value = normalize(link.getAttribute('data-locale'));
      try {
        url = new URL(link.href, window.location.href);
        value = value || normalize(url.searchParams.get('kc_locale') || url.searchParams.get('ui_locales'));
      } catch (_error) {
        url = null;
      }
      if (!value || select.querySelector('option[value="' + value + '"]')) return;
      var option = document.createElement('option');
      option.value = value;
      option.textContent = localeLabel(value, link.textContent.trim());
      option.dataset.href = url ? url.toString() : link.href;
      if (value === activeLocale) option.selected = true;
      select.appendChild(option);
    });

    if (!select.options.length) return;
    select.addEventListener('change', function () {
      var selected = select.options[select.selectedIndex];
      var target = selected && selected.dataset.href;
      persist(select.value);
      if (target) window.location.href = target;
    });

    locale.classList.add('mam-native-locale');
    locale.insertBefore(select, locale.firstChild);
  }

  function moveHeaderIntoLoginCard() {
    var header = document.getElementById('kc-header');
    var card = document.querySelector('.login-pf-page .card-pf') || document.querySelector('.card-pf');
    if (!header || !card) return;
    if (!card.contains(header)) {
      card.insertBefore(header, card.firstChild);
    }
    moveLocaleToCardTop(card, header);
    card.classList.add('mam-login-card-with-header');
  }

  function moveLocaleToCardTop(card, header) {
    var locale = document.getElementById('kc-locale');
    if (!locale || !card) return;
    if (card.firstChild !== locale) {
      card.insertBefore(locale, header || card.firstChild);
    }
    card.classList.add('mam-login-card-with-locale');
  }

  function restartFreshLogin() {
    var target = String(window.MAM_LOGIN_START_URL || '').trim();
    if (!target) return false;
    window.location.replace(target);
    return true;
  }

  function hasExpiredLoginMessage() {
    var text = String(document.body && document.body.innerText || '').toLocaleLowerCase('tr-TR');
    return text.indexOf('giriş yapmak çok uzun sürdü') >= 0
      || text.indexOf('giriş süreci baştan başlayacak') >= 0
      || /login.{0,40}(timed out|timeout|too long)/i.test(text);
  }

  function installFreshLoginGuard() {
    if (hasExpiredLoginMessage()) {
      restartFreshLogin();
      return;
    }
    var form = document.getElementById('kc-form-login')
      || document.querySelector('form[action*="/login-actions/"]');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      var staleMs = Math.max(60 * 1000, Number(window.MAM_LOGIN_STALE_MS) || 0);
      if (Date.now() - pageLoadedAt < staleMs) return;
      event.preventDefault();
      restartFreshLogin();
    }, true);
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
