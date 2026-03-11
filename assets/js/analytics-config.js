(function () {
  var existing = window.RandaAnalyticsConfig || {};
  var isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  window.RandaAnalyticsConfig = Object.assign(
    {
      endpoint: isLocal ? window.location.origin + "/__analytics" : "",
      debug: isLocal,
    },
    existing
  );
})();
