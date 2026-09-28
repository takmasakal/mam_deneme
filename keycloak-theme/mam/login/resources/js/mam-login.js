(function () {
  'use strict';

  var COOKIE_NAME = 'mam.login.lang';
  var THEME_COOKIE_NAME = 'mam.shared.theme';
  var THEME_KEY = 'mam.theme';
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
    styleBrand();
    installNativeLocaleSelect();
    installThemeSelect();
    installThemeShortcut();

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

  function applyTheme(value) {
    var theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  }

  function storedTheme() {
    var cookieMatch = document.cookie.match(new RegExp('(?:^|; )' + THEME_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
    try {
      var localTheme = localStorage.getItem(THEME_KEY);
      if (cookieTheme === 'dark' || cookieTheme === 'light') return cookieTheme;
      return localTheme === 'dark' ? 'dark' : 'light';
    } catch (_error) {
      return cookieTheme === 'dark' ? 'dark' : 'light';
    }
  }

  function setTheme(value) {
    var theme = value === 'dark' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, theme); } catch (_error) {}
    document.cookie = THEME_COOKIE_NAME + '=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax'
      + (window.location.protocol === 'https:' ? '; Secure' : '') + cookieDomain();
    applyTheme(theme);
  }

  function styleBrand() {
    var brand = document.getElementById('kc-header-wrapper');
    if (!brand || brand.querySelector('.mam-brand-prefix')) return;
    brand.textContent = '';
    var prefix = document.createElement('span');
    prefix.className = 'mam-brand-prefix';
    prefix.textContent = 'Met';
    var suffix = document.createElement('span');
    suffix.className = 'mam-brand-suffix';
    suffix.textContent = 'MAM';
    brand.appendChild(prefix);
    brand.appendChild(suffix);
  }

  function installThemeSelect() {
    var locale = document.getElementById('kc-locale');
    var card = document.querySelector('.login-pf-page .card-pf') || document.querySelector('.card-pf');
    if (!card || card.querySelector('.mam-theme-control')) return;
    var control = document.createElement('label');
    control.className = 'mam-theme-control';
    control.setAttribute('aria-label', 'Tema');
    var select = document.createElement('select');
    select.className = 'mam-theme-select';
    select.setAttribute('aria-label', 'Tema');
    var prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = 'Tema';
    prompt.selected = true;
    prompt.disabled = true;
    select.appendChild(prompt);
    [['light', 'Açık'], ['dark', 'Koyu']].forEach(function (item) {
      var option = document.createElement('option');
      option.value = item[0];
      option.textContent = item[1];
      select.appendChild(option);
    });
    select.addEventListener('change', function () {
      if (select.value) setTheme(select.value);
      select.value = '';
    });
    control.appendChild(select);
    if (locale && locale.parentNode === card) locale.insertAdjacentElement('afterend', control);
    else card.insertBefore(control, card.firstChild);
    setTheme(storedTheme());
  }

  function installThemeShortcut() {
    document.addEventListener('keydown', function (event) {
      var isThemeKey = event.code === 'KeyT' || String(event.key || '').toLowerCase() === 't';
      if (!isThemeKey || !event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }, true);
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
