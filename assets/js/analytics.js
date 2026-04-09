(function () {
  var globalObject = window;
  var config = globalObject.RandaAnalyticsConfig || {};
  var sessionKey = "randa_session_id";
  var pageViewTracked = false;
  var playSessionId = "";
  var playSessionEndTracked = false;
  var localeSwitchInitialized = false;
  var localizedPaths = {
    "/": true,
    "/about/": true,
    "/games/": true,
    "/games/inga/": true,
    "/games/inga/support/": true,
    "/games/inga/privacy/": true,
    "/games/inga/play/": true,
    "/news/": true,
    "/news/video-page-launch/": true,
    "/news/site-renewal/": true,
    "/videos/": true,
    "/contact/": true,
    "/contact/thanks.html": true,
    "/support/": true,
    "/privacy/": true,
    "/terms/": true
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function makeId() {
    return "sess_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function makePlaySessionId() {
    return "play_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function getSessionId() {
    try {
      var value = globalObject.sessionStorage.getItem(sessionKey);
      if (!value) {
        value = makeId();
        globalObject.sessionStorage.setItem(sessionKey, value);
      }
      return value;
    } catch (error) {
      return "session_unavailable";
    }
  }

  function sanitizeUrl(value) {
    if (!value) return "";

    try {
      var parsed = new URL(value, globalObject.location.href);
      return parsed.origin + parsed.pathname;
    } catch (error) {
      return "";
    }
  }

  function getSearchValue(key) {
    try {
      return new URLSearchParams(globalObject.location.search).get(key) || "";
    } catch (error) {
      return "";
    }
  }

  function normalizePath(path) {
    if (!path) return "/";
    if (path.length > 1 && path.slice(-1) !== "/" && !/\.html$/i.test(path)) {
      return path + "/";
    }
    return path;
  }

  function getPageLocale() {
    var html = document.documentElement;
    if (html && html.lang) return html.lang.toLowerCase();
    var body = document.body || {};
    if (body.dataset && body.dataset.pageLocale) return String(body.dataset.pageLocale).toLowerCase();
    return "";
  }

  function getAlternateLocalePath(pathname, currentLocale) {
    var normalized = normalizePath(pathname);
    if (currentLocale === "en") {
      var jaPath = normalized === "/en/" ? "/" : normalized.replace(/^\/en/, "");
      if (!localizedPaths[jaPath]) return "";
      return jaPath;
    }

    if (!localizedPaths[normalized]) return "";
    return normalized === "/" ? "/en/" : "/en" + normalized;
  }

  function injectLocaleSwitch() {
    if (localeSwitchInitialized) return;
    localeSwitchInitialized = true;

    var links = document.querySelector(".nav .links");
    if (!links) return;

    var locale = getPageLocale();
    if (locale !== "ja" && locale !== "en") return;

    var altPath = getAlternateLocalePath(globalObject.location.pathname, locale);
    if (!altPath) return;

    var switcher = document.createElement("span");
    switcher.className = "locale-switch";
    switcher.setAttribute("aria-label", locale === "ja" ? "言語切替" : "Language switcher");

    function setLocaleCookie(value) {
      document.cookie = "randa_locale=" + value + ";path=/;max-age=31536000;SameSite=Lax";
    }

    var jaLink = document.createElement("a");
    jaLink.className = "locale-switch-link";
    jaLink.href = locale === "ja" ? globalObject.location.pathname + globalObject.location.search + globalObject.location.hash : altPath;
    jaLink.textContent = "JP";
    jaLink.lang = "ja";
    if (locale === "ja") jaLink.setAttribute("aria-current", "true");
    jaLink.addEventListener("click", function () { setLocaleCookie("ja"); });

    var divider = document.createElement("span");
    divider.className = "locale-switch-divider";
    divider.setAttribute("aria-hidden", "true");
    divider.textContent = "/";

    var enLink = document.createElement("a");
    enLink.className = "locale-switch-link";
    enLink.href = locale === "en" ? globalObject.location.pathname + globalObject.location.search + globalObject.location.hash : altPath;
    enLink.textContent = "EN";
    enLink.lang = "en";
    if (locale === "en") enLink.setAttribute("aria-current", "true");
    enLink.addEventListener("click", function () { setLocaleCookie("en"); });

    switcher.appendChild(jaLink);
    switcher.appendChild(divider);
    switcher.appendChild(enLink);
    links.appendChild(switcher);
  }

  function getDeviceType() {
    var width = globalObject.innerWidth || 0;
    var coarsePointer = false;

    try {
      coarsePointer = globalObject.matchMedia("(pointer: coarse)").matches;
    } catch (error) {
      coarsePointer = false;
    }

    if (coarsePointer && width <= 767) return "mobile";
    if (width <= 767) return "mobile";
    if (width <= 1024) return "tablet";
    return "desktop";
  }

  function getBrowserName() {
    var userAgent = navigator.userAgent || "";

    if (/Edg\//.test(userAgent)) return "Edge";
    if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return "Chrome";
    if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
    if (/Firefox\//.test(userAgent)) return "Firefox";
    return "Other";
  }

  function getOsName() {
    var userAgent = navigator.userAgent || "";
    var platform = navigator.platform || "";

    if (/Windows/i.test(platform) || /Windows/i.test(userAgent)) return "Windows";
    if (/Mac/i.test(platform) || /Mac OS X/i.test(userAgent)) return "macOS";
    if (/Android/i.test(userAgent)) return "Android";
    if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
    if (/Linux/i.test(platform) || /Linux/i.test(userAgent)) return "Linux";
    return "Other";
  }

  function isPlaySessionScoped() {
    var body = document.body || {};
    return !!(body.dataset && body.dataset.playSessionScope === "true");
  }

  function basePayload() {
    var body = document.body || {};

    return {
      path: globalObject.location.pathname,
      page_type: body.dataset && body.dataset.pageType ? body.dataset.pageType : "",
      build_id: body.dataset && body.dataset.buildId ? body.dataset.buildId : "",
      page_locale: getPageLocale(),
      session_id: getSessionId(),
      play_session_id: isPlaySessionScoped() ? playSessionId : "",
      referrer: sanitizeUrl(document.referrer),
      viewport_w: globalObject.innerWidth || 0,
      viewport_h: globalObject.innerHeight || 0,
      device_type: getDeviceType(),
      browser: getBrowserName(),
      os: getOsName(),
      lang: navigator.language || "",
      browser_lang: navigator.language || "",
      entry_src: getSearchValue("src"),
      utm_source: getSearchValue("utm_source"),
      utm_medium: getSearchValue("utm_medium"),
      utm_campaign: getSearchValue("utm_campaign"),
      timestamp: nowIso()
    };
  }

  function emitCustomEvent(detail) {
    try {
      document.dispatchEvent(new CustomEvent("randa:track", { detail: detail }));
    } catch (error) {
      return;
    }
  }

  function sendWithBeacon(endpoint, payload) {
    if (!navigator.sendBeacon) return false;

    try {
      var blob = new Blob([JSON.stringify(payload)], { type: "text/plain" });
      return navigator.sendBeacon(endpoint, blob);
    } catch (error) {
      return false;
    }
  }

  function sendWithFetch(endpoint, payload) {
    try {
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit"
      });
    } catch (error) {
      return Promise.resolve();
    }
  }

  var eventQueue = [];
  var flushTimer = null;
  var FLUSH_DELAY_MS = 800;

  function flushQueue() {
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0);
    if (!config.endpoint) return;
    for (var i = 0; i < batch.length; i++) {
      if (!sendWithBeacon(config.endpoint, batch[i])) {
        sendWithFetch(config.endpoint, batch[i]);
      }
    }
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flushQueue();
    }, FLUSH_DELAY_MS);
  }

  function sendToEndpoint(payload) {
    if (!config.endpoint) return;
    eventQueue.push(payload);
    scheduleFlush();
  }

  function sendToGtag(payload) {
    if (typeof globalObject.gtag !== "function") return;
    globalObject.gtag("event", payload.event_name, payload);
  }

  function debugLog(payload) {
    var debugEnabled = config.debug || getSearchValue("debug") === "analytics";
    if (!debugEnabled || !globalObject.console || typeof console.info !== "function") return;
    console.info("[RandaAnalytics]", payload.event_name, payload);
  }

  function track(eventName, payload) {
    if (!eventName) return;

    var finalPayload = Object.assign({}, basePayload(), payload || {}, {
      event_name: eventName
    });

    emitCustomEvent(finalPayload);
    debugLog(finalPayload);
    sendToGtag(finalPayload);
    sendToEndpoint(finalPayload);
  }

  function trackPageView() {
    if (pageViewTracked) return;
    pageViewTracked = true;
    track("page_view");
  }

  function trackPlaySessionStart() {
    if (!isPlaySessionScoped()) return;
    track("play_session_start", {
      started_at: nowIso()
    });
  }

  function trackPlaySessionEnd(reason) {
    if (!isPlaySessionScoped() || playSessionEndTracked) return;
    playSessionEndTracked = true;
    track("play_session_end", {
      ended_at: nowIso(),
      reason: reason || "pagehide"
    });
  }

  function handleTrackedClick(event) {
    if (!event.target || typeof event.target.closest !== "function") return;

    var trigger = event.target.closest("[data-track-event], [data-track]");
    if (!trigger) return;

    var eventName = trigger.dataset.trackEvent || trigger.dataset.track || "cta_click";
    var href = trigger.getAttribute("href");

    track(eventName, {
      placement: trigger.dataset.trackPlacement || "",
      label: trigger.dataset.trackLabel || trigger.textContent.trim(),
      target_path: sanitizeUrl(href),
      target_kind: trigger.dataset.trackKind || (href && /^https?:/i.test(href) ? "external" : "internal")
    });
  }

  function init() {
    if (isPlaySessionScoped()) {
      playSessionId = makePlaySessionId();
    }

    document.addEventListener("click", handleTrackedClick);
    globalObject.addEventListener("pagehide", function () {
      trackPlaySessionEnd("pagehide");
      flushQueue();
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        injectLocaleSwitch();
        trackPlaySessionStart();
        trackPageView();
      }, { once: true });
      return;
    }

    injectLocaleSwitch();
    trackPlaySessionStart();
    trackPageView();
  }

  globalObject.RandaAnalytics = {
    track: track,
    trackPageView: trackPageView,
    getSessionId: getSessionId
  };

  init();
})();
