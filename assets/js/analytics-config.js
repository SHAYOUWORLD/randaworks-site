(function () {
  var existing = window.RandaAnalyticsConfig || {};
  var isLocal =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  var CLOUD_RUN_API = "https://randaworks-analytics-945977546061.asia-northeast1.run.app";

  window.RandaAnalyticsConfig = Object.assign(
    {
      endpoint: isLocal
        ? window.location.origin + "/__analytics"
        : CLOUD_RUN_API + "/__analytics",
      debug: isLocal,
    },
    existing
  );
})();
