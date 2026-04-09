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
var AOZORA_HOSTS = {
  "www.aozora.gr.jp": true,
  "aozora.gr.jp": true
};
var KANJI_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
var GRAPH_RELATION_PROPS = [
  { pid: "P22", label: "父" },
  { pid: "P25", label: "母" },
  { pid: "P26", label: "配偶者" },
  { pid: "P40", label: "子" },
  { pid: "P3373", label: "兄弟姉妹" },
  { pid: "P1038", label: "家臣" },
  { pid: "P511", label: "主君" }
];

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

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(data, status, origin) {
  var headers = getCorsHeaders(origin);
  headers["Content-Type"] = "application/json; charset=UTF-8";
  headers["Cache-Control"] = status === 200 ? "public, max-age=300" : "no-store";
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers
  });
}

function textResponse(text, status, origin) {
  var headers = getCorsHeaders(origin);
  headers["Content-Type"] = "text/plain; charset=UTF-8";
  headers["Cache-Control"] = "no-store";
  return new Response(text || "", {
    status: status || 200,
    headers: headers
  });
}

function normalizeCharset(charset) {
  var value = String(charset || "").trim().toLowerCase();
  if (!value) return "utf-8";
  if (value === "shift_jis" || value === "shift-jis" || value === "sjis" || value === "x-sjis") return "shift_jis";
  if (value === "utf8") return "utf-8";
  return value;
}

function detectCharset(buffer, contentType) {
  var headerMatch = String(contentType || "").match(/charset=([^;]+)/i);
  if (headerMatch) return normalizeCharset(headerMatch[1]);

  var probe = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 2048)));
  var ascii = "";
  for (var i = 0; i < probe.length; i++) {
    ascii += String.fromCharCode(probe[i]);
  }

  var metaMatch = ascii.match(/encoding=["']([^"']+)["']/i) || ascii.match(/charset=([A-Za-z0-9_\-]+)/i);
  return normalizeCharset(metaMatch ? metaMatch[1] : "utf-8");
}

function decodeBuffer(buffer, charset) {
  try {
    return new TextDecoder(normalizeCharset(charset)).decode(buffer);
  } catch (error) {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function readResponseText(response) {
  var buffer = await response.arrayBuffer();
  return decodeBuffer(buffer, detectCharset(buffer, response.headers.get("content-type")));
}

function decodeHtmlEntities(text) {
  if (!text) return "";

  var named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " "
  };

  return text.replace(/&(#x?[0-9A-Fa-f]+|[A-Za-z]+);/g, function (_, entity) {
    if (entity.charAt(0) === "#") {
      if (entity.charAt(1).toLowerCase() === "x") {
        var hex = parseInt(entity.slice(2), 16);
        return Number.isFinite(hex) ? String.fromCodePoint(hex) : _;
      }

      var code = parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }

    return Object.prototype.hasOwnProperty.call(named, entity) ? named[entity] : _;
  });
}

function cleanupText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseIsoDateUtc(dateStr) {
  var match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatDateKeyUtc(date) {
  return date.getUTCFullYear() + "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(date.getUTCDate()).padStart(2, "0");
}

function buildLongWeekendCandidates(year, holidays) {
  var holidaySet = {};
  for (var i = 0; i < holidays.length; i++) {
    if (holidays[i] && holidays[i].date) {
      holidaySet[holidays[i].date] = true;
    }
  }

  var spans = [];
  var current = [];
  var start = new Date(Date.UTC(year, 0, 1));
  var end = new Date(Date.UTC(year, 11, 31));

  for (var day = new Date(start.getTime()); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    var key = formatDateKeyUtc(day);
    var isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    var isHoliday = !!holidaySet[key];

    if (isWeekend || isHoliday) {
      current.push({
        date: key,
        isWeekend: isWeekend,
        isHoliday: isHoliday
      });
    } else if (current.length) {
      spans.push(current.slice());
      current = [];
    }
  }

  if (current.length) spans.push(current.slice());

  return spans
    .filter(function (span) {
      var hasHoliday = false;
      for (var i = 0; i < span.length; i++) {
        if (span[i].isHoliday) {
          hasHoliday = true;
          break;
        }
      }
      return span.length >= 3 && hasHoliday;
    })
    .map(function (span) {
      var holidayCount = 0;
      for (var i = 0; i < span.length; i++) {
        if (span[i].isHoliday) holidayCount += 1;
      }
      return {
        startDate: span[0].date,
        endDate: span[span.length - 1].date,
        dayCount: span.length,
        holidayCount: holidayCount
      };
    });
}

function normalizeHolidayItems(holidays) {
  var grouped = {};
  var orderedDates = [];

  for (var i = 0; i < holidays.length; i++) {
    var item = holidays[i];
    if (!item || !item.date) continue;

    if (!grouped[item.date]) {
      grouped[item.date] = {
        date: item.date,
        localNames: [],
        names: [],
        countryCode: item.countryCode || "",
        global: item.global !== false,
        types: []
      };
      orderedDates.push(item.date);
    }

    if (item.localName && grouped[item.date].localNames.indexOf(item.localName) === -1) {
      grouped[item.date].localNames.push(item.localName);
    }
    if (item.name && grouped[item.date].names.indexOf(item.name) === -1) {
      grouped[item.date].names.push(item.name);
    }

    var types = item.types || [];
    for (var j = 0; j < types.length; j++) {
      if (grouped[item.date].types.indexOf(types[j]) === -1) {
        grouped[item.date].types.push(types[j]);
      }
    }
  }

  return orderedDates.map(function (date) {
    return {
      date: date,
      localName: grouped[date].localNames.join(" / "),
      name: grouped[date].names.join(" / "),
      countryCode: grouped[date].countryCode,
      global: grouped[date].global,
      types: grouped[date].types
    };
  });
}

function katakanaToHiragana(str) {
  return String(str || "").replace(/[\u30A1-\u30F6]/g, function (char) {
    return String.fromCharCode(char.charCodeAt(0) - 0x60);
  });
}

function getFirstKanjiReading(payload) {
  if (!payload) return "";
  var readings = []
    .concat(payload.on_readings || [])
    .concat(payload.kun_readings || []);

  for (var i = 0; i < readings.length; i++) {
    var normalized = katakanaToHiragana(String(readings[i]).replace(/^-+/, "").replace(/-.*/, ""));
    if (normalized) return normalized;
  }

  return "";
}

function firstMatch(text, pattern) {
  var match = String(text || "").match(pattern);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function stripAozoraHtml(html) {
  var text = String(html || "");

  text = text.replace(/<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi, function (_, rubyInner) {
    var rb = rubyInner.match(/<rb\b[^>]*>([\s\S]*?)<\/rb>/i);
    if (rb) return rb[1];

    return rubyInner
      .replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, "")
      .replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, "");
  });
  text = text.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, "");
  text = text.replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, "");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<div\b[^>]*>/gi, "");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<p\b[^>]*>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeHtmlEntities(text);

  return cleanupText(text);
}

function extractAozoraTextPayload(html, sourceUrl) {
  var mainStart = html.indexOf('<div class="main_text">');
  if (mainStart === -1) {
    return null;
  }

  var endMarkers = [
    '<div class="bibliographical_information">',
    '<div class="notation_notes">',
    '<div class="after_text">',
    "</body>"
  ];
  var mainEnd = html.length;

  for (var i = 0; i < endMarkers.length; i++) {
    var markerIndex = html.indexOf(endMarkers[i], mainStart);
    if (markerIndex !== -1 && markerIndex < mainEnd) {
      mainEnd = markerIndex;
    }
  }

  var section = html.slice(mainStart, mainEnd);
  var title = firstMatch(html, /<h1 class="title">([\s\S]*?)<\/h1>/i);
  var author = firstMatch(html, /<h2 class="author">([\s\S]*?)<\/h2>/i);
  var translator = firstMatch(html, /<h2 class="translator">([\s\S]*?)<\/h2>/i);
  var text = stripAozoraHtml(section);

  if (!text) {
    return null;
  }

  return {
    title: title,
    author: author,
    translator: translator,
    sourceUrl: sourceUrl,
    text: text
  };
}

function extractRecordData(xmlRecord) {
  var recordDataMatch = xmlRecord.match(/<recordData>([\s\S]*?)<\/recordData>/i);
  return recordDataMatch ? decodeHtmlEntities(recordDataMatch[1]) : "";
}

function extractNdlField(recordData, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    var value = firstMatch(recordData, patterns[i]);
    if (value) return cleanupText(value);
  }
  return "";
}

function parseNdlResponse(xmlText) {
  var records = [];
  var matches = String(xmlText || "").match(/<record>[\s\S]*?<\/record>/gi) || [];

  for (var i = 0; i < matches.length; i++) {
    var recordData = extractRecordData(matches[i]);
    if (!recordData) continue;

    var title = extractNdlField(recordData, [
      /<dcterms:title>([\s\S]*?)<\/dcterms:title>/i,
      /<dc:title>([\s\S]*?)<\/dc:title>/i,
      /<rdf:value>([\s\S]*?)<\/rdf:value>/i
    ]);
    var creator = extractNdlField(recordData, [
      /<foaf:name>([\s\S]*?)<\/foaf:name>/i,
      /<dc:creator>([\s\S]*?)<\/dc:creator>/i
    ]).replace(/\s*\/\s*/g, "");
    var date = extractNdlField(recordData, [
      /<dcterms:issued[^>]*>([\s\S]*?)<\/dcterms:issued>/i,
      /<dcterms:date>([\s\S]*?)<\/dcterms:date>/i
    ]);
    var summary = extractNdlField(recordData, [
      /<dcterms:abstract>([\s\S]*?)<\/dcterms:abstract>/i,
      /<dcterms:description>([\s\S]*?)<\/dcterms:description>/i
    ]);
    var url = firstMatch(recordData, /rdf:about="(https:\/\/ndlsearch\.ndl\.go\.jp\/books\/[^"#]+)(?:#material)?"/i);

    if (!title) continue;

    records.push({
      title: title,
      creator: creator,
      date: date,
      summary: summary,
      url: url
    });
  }

  return records;
}

function isAllowedAozoraUrl(rawUrl) {
  try {
    var parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && AOZORA_HOSTS[parsed.hostname] && /\/cards\/.+\.html$/i.test(parsed.pathname);
  } catch (error) {
    return false;
  }
}

async function handleAozoraText(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var sourceUrl = url.searchParams.get("url") || "";
  if (!isAllowedAozoraUrl(sourceUrl)) {
    return jsonResponse({ error: "青空文庫の本文URLを指定してください。" }, 400, origin);
  }

  var upstream = await fetch(sourceUrl, {
    headers: {
      "User-Agent": "RandaWorks Site Viewer/1.0"
    },
    cf: {
      cacheTtl: 3600,
      cacheEverything: true
    }
  });

  if (!upstream.ok) {
    return jsonResponse({ error: "青空文庫の本文を取得できませんでした。" }, 502, origin);
  }

  var html = await readResponseText(upstream);
  var payload = extractAozoraTextPayload(html, sourceUrl);

  if (!payload) {
    return jsonResponse({ error: "本文の解析に失敗しました。" }, 502, origin);
  }

  return jsonResponse(payload, 200, origin);
}

async function handleNdlSearch(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var query = (url.searchParams.get("q") || "").trim();

  if (!query) {
    return jsonResponse({ error: "検索語を入力してください。" }, 400, origin);
  }

  var params = new URLSearchParams({
    operation: "searchRetrieve",
    version: "1.2",
    query: 'title="' + query + '" OR creator="' + query + '"',
    maximumRecords: "8",
    recordSchema: "dcndl"
  });
  var upstreamUrl = "https://ndlsearch.ndl.go.jp/api/sru?" + params.toString();
  var upstream = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "RandaWorks Site Viewer/1.0"
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  });

  if (!upstream.ok) {
    return jsonResponse({ error: "NDL 検索に接続できませんでした。" }, 502, origin);
  }

  var xml = await upstream.text();
  var results = parseNdlResponse(xml);

  return jsonResponse({
    query: query,
    results: results
  }, 200, origin);
}

async function fetchJsonUpstream(url, options) {
  var upstream = await fetch(url, options || {});
  if (!upstream.ok) {
    throw new Error("Upstream request failed");
  }
  return upstream.json();
}

async function handleKanjiLookup(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var ch = (url.searchParams.get("ch") || "").trim().charAt(0);

  if (!ch || !KANJI_PATTERN.test(ch)) {
    return jsonResponse({ error: "漢字1文字を指定してください。" }, 400, origin);
  }

  try {
    var data = await fetchJsonUpstream("https://kanjiapi.dev/v1/kanji/" + encodeURIComponent(ch), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "RandaWorks Site Viewer/1.0"
      },
      cf: {
        cacheTtl: 86400,
        cacheEverything: true
      }
    });
    return jsonResponse(data, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "漢字情報を取得できませんでした。" }, 502, origin);
  }
}

async function handleFuriganaLookup(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var body = {};
  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse({ error: "JSONを送信してください。" }, 400, origin);
  }

  var text = String(body.text || "");
  var matches = text.match(/[\u3400-\u4DBF\u4E00-\u9FFF]/g) || [];
  var uniqueKanji = Array.from(new Set(matches));

  if (!uniqueKanji.length) {
    return jsonResponse({ mode: "plain", readingMap: {} }, 200, origin);
  }

  try {
    var results = await Promise.all(uniqueKanji.map(function (kanji) {
      return fetchJsonUpstream("https://kanjiapi.dev/v1/kanji/" + encodeURIComponent(kanji), {
        headers: {
          "Accept": "application/json",
          "User-Agent": "RandaWorks Site Viewer/1.0"
        },
        cf: {
          cacheTtl: 86400,
          cacheEverything: true
        }
      }).catch(function () {
        return null;
      });
    }));

    var readingMap = {};
    for (var i = 0; i < results.length; i++) {
      if (results[i] && results[i].kanji) {
        readingMap[results[i].kanji] = getFirstKanjiReading(results[i]);
      }
    }

    return jsonResponse({
      mode: "per_character",
      readingMap: readingMap
    }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "ふりがな推定に失敗しました。" }, 502, origin);
  }
}

async function handleTriviaQuestion(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var diff = (url.searchParams.get("difficulty") || "medium").toLowerCase();
  if (["easy", "medium", "hard"].indexOf(diff) === -1) diff = "medium";

  try {
    var data = await fetchJsonUpstream("https://opentdb.com/api.php?amount=1&category=23&difficulty=" + encodeURIComponent(diff) + "&type=multiple", {
      headers: {
        "Accept": "application/json",
        "User-Agent": "RandaWorks Site Viewer/1.0"
      },
      cf: {
        cacheTtl: 60,
        cacheEverything: true
      }
    });
    return jsonResponse(data, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "問題を取得できませんでした。" }, 502, origin);
  }
}

async function handleHolidayLookup(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var year = Number(url.searchParams.get("year"));
  var country = String(url.searchParams.get("country") || "JP").trim().toUpperCase();

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return jsonResponse({ error: "年は1900〜2100で指定してください。" }, 400, origin);
  }

  if (!/^[A-Z]{2}$/.test(country)) {
    return jsonResponse({ error: "国コードは2文字で指定してください。" }, 400, origin);
  }

  try {
    var rawHolidays = await fetchJsonUpstream("https://date.nager.at/api/v3/PublicHolidays/" + year + "/" + country, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "RandaWorks Site Viewer/1.0"
      },
      cf: {
        cacheTtl: 21600,
        cacheEverything: true
      }
    });
    var holidays = normalizeHolidayItems(rawHolidays);

    return jsonResponse({
      year: year,
      countryCode: country,
      holidays: holidays,
      longWeekends: buildLongWeekendCandidates(year, holidays)
    }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "祝日データを取得できませんでした。" }, 502, origin);
  }
}

async function handleWeatherArchive(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var lat = Number(url.searchParams.get("lat"));
  var lon = Number(url.searchParams.get("lon"));
  var date = String(url.searchParams.get("date") || "");

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonResponse({ error: "緯度・経度・日付を正しく指定してください。" }, 400, origin);
  }

  var params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: date,
    end_date: date,
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max",
    timezone: "Asia/Tokyo"
  });

  try {
    var data = await fetchJsonUpstream("https://archive-api.open-meteo.com/v1/archive?" + params.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "RandaWorks Site Viewer/1.0"
      },
      cf: {
        cacheTtl: 86400,
        cacheEverything: true
      }
    });
    return jsonResponse(data, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "気象データを取得できませんでした。" }, 502, origin);
  }
}

async function graphSparql(query) {
  return fetchJsonUpstream("https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json", {
    headers: {
      "Accept": "application/sparql-results+json",
      "User-Agent": "RandaWorks Site Viewer/1.0"
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  });
}

async function handleGraphFind(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var name = String(url.searchParams.get("name") || "").trim();
  if (!name) {
    return jsonResponse({ error: "人物名を指定してください。" }, 400, origin);
  }

  var query = 'SELECT ?item ?itemLabel WHERE { ?item wdt:P31 wd:Q5. ?item rdfs:label "' + name.replace(/"/g, '\\"') + '"@ja. SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". } } LIMIT 1';

  try {
    var data = await graphSparql(query);
    var bindings = data && data.results && data.results.bindings ? data.results.bindings : [];
    if (!bindings.length) {
      return jsonResponse({ person: null }, 200, origin);
    }

    var uri = bindings[0].item.value;
    return jsonResponse({
      person: {
        qid: uri.split("/").pop(),
        label: bindings[0].itemLabel.value
      }
    }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "Wikidata を検索できませんでした。" }, 502, origin);
  }
}

async function handleGraphRelations(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var qid = String(url.searchParams.get("qid") || "").trim();
  if (!/^Q\d+$/i.test(qid)) {
    return jsonResponse({ error: "QIDを指定してください。" }, 400, origin);
  }

  var query = 'SELECT ?prop ?relLabel WHERE { wd:' + qid + ' ?prop ?rel. FILTER(?prop IN (' +
    GRAPH_RELATION_PROPS.map(function (p) { return 'wdt:' + p.pid; }).join(',') +
    ')). SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". } } LIMIT 30';

  try {
    var data = await graphSparql(query);
    var bindings = data && data.results && data.results.bindings ? data.results.bindings : [];
    var relations = bindings.map(function (item) {
      var pid = item.prop.value.split("/prop/direct/").pop();
      var relation = "";
      for (var i = 0; i < GRAPH_RELATION_PROPS.length; i++) {
        if (GRAPH_RELATION_PROPS[i].pid === pid) {
          relation = GRAPH_RELATION_PROPS[i].label;
          break;
        }
      }
      return {
        label: item.relLabel.value,
        relation: relation || pid
      };
    });
    return jsonResponse({ relations: relations }, 200, origin);
  } catch (error) {
    return jsonResponse({ error: "関連人物を取得できませんでした。" }, 502, origin);
  }
}

async function handleSteamStats(request) {
  var origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return textResponse("", 204, origin);
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  var url = new URL(request.url);
  var raw = (url.searchParams.get("appids") || "").split(",");
  var appids = [];
  for (var i = 0; i < raw.length && appids.length < 25; i++) {
    var id = raw[i].trim();
    if (/^\d+$/.test(id)) appids.push(id);
  }

  if (!appids.length) {
    return jsonResponse({ error: "appidsを指定してください。" }, 400, origin);
  }

  var fetchOpts = function (ttl) {
    return {
      headers: { "Accept": "application/json", "User-Agent": "RandaWorks Site Viewer/1.0" },
      cf: { cacheTtl: ttl, cacheEverything: true }
    };
  };

  try {
    var promises = [];
    for (var j = 0; j < appids.length; j++) {
      promises.push(
        fetchJsonUpstream(
          "https://store.steampowered.com/appreviews/" + appids[j] + "?json=1&purchase_type=all&language=all&num_per_page=0",
          fetchOpts(21600)
        ).catch(function () { return null; })
      );
      promises.push(
        fetchJsonUpstream(
          "https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=" + appids[j],
          fetchOpts(300)
        ).catch(function () { return null; })
      );
    }

    var results = await Promise.all(promises);
    var games = {};
    for (var k = 0; k < appids.length; k++) {
      var reviewData = results[k * 2];
      var ccuData = results[k * 2 + 1];
      var qs = reviewData && reviewData.query_summary ? reviewData.query_summary : {};
      var pos = Number(qs.total_positive) || 0;
      var neg = Number(qs.total_negative) || 0;
      var total = pos + neg;
      var ccu = ccuData && ccuData.response ? Number(ccuData.response.player_count) || 0 : 0;

      if (total > 0 || ccu > 0) {
        games[appids[k]] = {
          totalReviews: total,
          positiveRate: total > 0 ? Math.round(pos / total * 100) : 0,
          reviewDesc: qs.review_score_desc || "",
          ccu: ccu
        };
      }
    }

    var headers = getCorsHeaders(origin);
    headers["Content-Type"] = "application/json; charset=UTF-8";
    headers["Cache-Control"] = "public, max-age=300";
    return new Response(JSON.stringify({ games: games, fetchedAt: new Date().toISOString() }), {
      status: 200,
      headers: headers
    });
  } catch (error) {
    return jsonResponse({ error: "Steamデータを取得できませんでした。" }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var pathname = normalizePath(url.pathname);
    var userAgent = request.headers.get("user-agent") || "";

    if (pathname === "/api/shiryo/aozora/text/") {
      return handleAozoraText(request);
    }

    if (pathname === "/api/shiryo/ndl/") {
      return handleNdlSearch(request);
    }


    if (pathname === "/api/kanji/") {
      return handleKanjiLookup(request);
    }

    if (pathname === "/api/furigana/") {
      return handleFuriganaLookup(request);
    }

    if (pathname === "/api/trivia/") {
      return handleTriviaQuestion(request);
    }

    if (pathname === "/api/holidays/") {
      return handleHolidayLookup(request);
    }

    if (pathname === "/api/weather/archive/") {
      return handleWeatherArchive(request);
    }

    if (pathname === "/api/graph/find/") {
      return handleGraphFind(request);
    }

    if (pathname === "/api/graph/relations/") {
      return handleGraphRelations(request);
    }

    if (pathname === "/api/steam/stats/") {
      return handleSteamStats(request);
    }

    if (REDIRECT_PATHS[pathname]) {
      return Response.redirect(new URL(REDIRECT_PATHS[pathname] + url.search + url.hash, url.origin), 301);
    }

    if (BOT_PATTERN.test(userAgent)) {
      return env.ASSETS.fetch(request);
    }

    var isJaPage = !pathname.startsWith("/en/") && LOCALIZED_PATHS[pathname];

    if (isJaPage) {
      var cookieHeader = request.headers.get("cookie") || "";
      var localePref = getCookie(cookieHeader, LOCALE_COOKIE);

      if (localePref) {
        if (localePref === "en") {
          var enPath = pathname === "/" ? "/en/" : "/en" + pathname;
          return Response.redirect(new URL(enPath + url.search + url.hash, url.origin), 302);
        }
        return env.ASSETS.fetch(request);
      }

      var acceptLang = request.headers.get("accept-language") || "";
      if (prefersEnglish(acceptLang)) {
        var localizedEnPath = pathname === "/" ? "/en/" : "/en" + pathname;
        return Response.redirect(new URL(localizedEnPath + url.search + url.hash, url.origin), 302);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
