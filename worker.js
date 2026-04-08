var LOCALIZED_PATHS = {
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

var REDIRECT_PATHS = {
  "/games/inga/history-tools/": "/history-tools/"
};

var BOT_PATTERN = /bot|crawl|spider|slurp|facebook|twitter|linkedin|whatsapp|telegram|discord|preview|embed|fetch|curl|wget|lighthouse|pagespeed|gtmetrix/i;
var LOCALE_COOKIE = "randa_locale";

function getCookie(cookieHeader, name) {
  if (!cookieHeader) return "";
  var match = cookieHeader.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"));
  return match ? match[1] : "";
}

function prefersEnglish(acceptLanguage) {
  if (!acceptLanguage) return false;

  var parts = acceptLanguage.split(",");
  var best = { lang: "", q: -1 };

  for (var i = 0; i < parts.length; i++) {
    var segment = parts[i].trim();
    var qMatch = segment.match(/;q=([\d.]+)/);
    var q = qMatch ? parseFloat(qMatch[1]) : 1.0;
    var lang = segment.replace(/;q=.*/, "").trim().toLowerCase();

    if (q > best.q) {
      best = { lang: lang, q: q };
    }
  }

  return best.lang.startsWith("en");
}

function normalizePath(path) {
  if (!path) return "/";
  if (path.length > 1 && !path.endsWith("/") && !/\.html$/i.test(path)) {
    return path + "/";
  }
  return path;
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var pathname = normalizePath(url.pathname);
    var userAgent = request.headers.get("user-agent") || "";

    if (REDIRECT_PATHS[pathname]) {
      return Response.redirect(new URL(REDIRECT_PATHS[pathname] + url.search + url.hash, url.origin), 301);
    }

    // Skip bots
    if (BOT_PATTERN.test(userAgent)) {
      return env.ASSETS.fetch(request);
    }

    // Only redirect Japanese (root) pages that have English equivalents
    var isJaPage = !pathname.startsWith("/en/") && LOCALIZED_PATHS[pathname];

    if (isJaPage) {
      var cookieHeader = request.headers.get("cookie") || "";
      var localePref = getCookie(cookieHeader, LOCALE_COOKIE);

      // User has manually chosen a locale — respect it
      if (localePref) {
        if (localePref === "en") {
          var enPath = pathname === "/" ? "/en/" : "/en" + pathname;
          return Response.redirect(new URL(enPath + url.search + url.hash, url.origin), 302);
        }
        // localePref === "ja" → stay on Japanese page
        return env.ASSETS.fetch(request);
      }

      // No cookie — check Accept-Language
      var acceptLang = request.headers.get("accept-language") || "";
      if (prefersEnglish(acceptLang)) {
        var enPath = pathname === "/" ? "/en/" : "/en" + pathname;
        return Response.redirect(new URL(enPath + url.search + url.hash, url.origin), 302);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
