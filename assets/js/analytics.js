(function () {
  var globalObject = window;
  var config = globalObject.RandaAnalyticsConfig || {};
  var sessionKey = "randa_session_id";
  var pageViewTracked = false;
  var playSessionId = "";
  var playSessionEndTracked = false;

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
      session_id: getSessionId(),
      play_session_id: isPlaySessionScoped() ? playSessionId : "",
      referrer: sanitizeUrl(document.referrer),
      viewport_w: globalObject.innerWidth || 0,
      viewport_h: globalObject.innerHeight || 0,
      device_type: getDeviceType(),
      browser: getBrowserName(),
      os: getOsName(),
      lang: navigator.language || "",
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

  function sendToEndpoint(payload) {
    if (!config.endpoint) return;
    if (sendWithBeacon(config.endpoint, payload)) return;
    sendWithFetch(config.endpoint, payload);
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
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        trackPlaySessionStart();
        trackPageView();
      }, { once: true });
      return;
    }

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
