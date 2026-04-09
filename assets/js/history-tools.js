(function () {
  var quizEntries = [
    { title: "聖徳太子", kind: "person", period: "ancient", label: "飛鳥", fallback: "飛鳥時代の政治と仏教政策で知られ、十七条憲法や冠位十二階と結び付けて学ばれる人物です。" },
    { title: "中大兄皇子", kind: "person", period: "ancient", label: "飛鳥", fallback: "のちの天智天皇で、中臣鎌足とともに政変を進めた人物として知られます。" },
    { title: "紫式部", kind: "person", period: "heian", label: "平安", fallback: "平安時代の宮廷文化を代表する作家で、『源氏物語』の作者として著名です。" },
    { title: "源頼朝", kind: "person", period: "kamakura", label: "鎌倉", fallback: "武家政権の成立と結び付けて学ぶことが多い、鎌倉幕府初代将軍です。" },
    { title: "北条政子", kind: "person", period: "kamakura", label: "鎌倉", fallback: "源頼朝の妻で、鎌倉幕府の政治に強い影響力を持った人物です。" },
    { title: "足利義満", kind: "person", period: "muromachi", label: "室町", fallback: "室町幕府の最盛期を築き、金閣建立でも知られる将軍です。" },
    { title: "織田信長", kind: "person", period: "sengoku", label: "戦国", fallback: "戦国時代の統一事業を大きく前進させ、本能寺の変で生涯を終えた武将です。" },
    { title: "豊臣秀吉", kind: "person", period: "sengoku", label: "戦国", fallback: "天下統一を実現し、太閤検地や刀狩などでも知られる人物です。" },
    { title: "徳川家康", kind: "person", period: "edo", label: "江戸", fallback: "関ヶ原の戦いを経て江戸幕府を開いた武将です。" },
    { title: "坂本龍馬", kind: "person", period: "bakumatsu", label: "幕末", fallback: "幕末の志士として薩長同盟や大政奉還の流れで語られることが多い人物です。" },
    { title: "西郷隆盛", kind: "person", period: "bakumatsu", label: "幕末", fallback: "明治維新の中心人物の一人で、維新後の政治や西南戦争でも知られます。" },
    { title: "福沢諭吉", kind: "person", period: "meiji", label: "明治", fallback: "啓蒙思想家として近代日本の教育や思想に大きな影響を与えた人物です。" },
    { title: "大化の改新", kind: "event", period: "ancient", label: "飛鳥", fallback: "645年の政変とその後の改革を指し、律令国家形成の出発点の一つとして学ばれます。" },
    { title: "壇ノ浦の戦い", kind: "event", period: "kamakura", label: "鎌倉", fallback: "源平合戦の最終局面として知られ、平氏滅亡につながった戦いです。" },
    { title: "応仁の乱", kind: "event", period: "muromachi", label: "室町", fallback: "室町時代の大規模な内乱で、戦国時代の始まりとして扱われることが多い出来事です。" },
    { title: "関ヶ原の戦い", kind: "event", period: "sengoku", label: "戦国", fallback: "1600年に行われ、徳川家康の政権確立につながった合戦です。" },
    { title: "参勤交代", kind: "event", period: "edo", label: "江戸", fallback: "江戸幕府が大名統制のために整えた制度で、街道や城下町の発達にも影響しました。" },
    { title: "黒船来航", kind: "event", period: "bakumatsu", label: "幕末", fallback: "ペリー来航をきっかけに開国と幕末政治の変化が加速した出来事です。" },
    { title: "廃藩置県", kind: "event", period: "meiji", label: "明治", fallback: "明治政府が中央集権化を進めるために実施した重要政策です。" }
  ];

  var eras = [
    { key: "reiwa", label: "令和", start: 2019, end: null, startedOn: "2019-05-01" },
    { key: "heisei", label: "平成", start: 1989, end: 2019, startedOn: "1989-01-08", endedOn: "2019-04-30" },
    { key: "showa", label: "昭和", start: 1926, end: 1989, startedOn: "1926-12-25", endedOn: "1989-01-07" },
    { key: "taisho", label: "大正", start: 1912, end: 1926, startedOn: "1912-07-30", endedOn: "1926-12-24" },
    { key: "meiji", label: "明治", start: 1868, end: 1912, startedOn: "1868-09-08", endedOn: "1912-07-29" }
  ];

  var quizState = { currentEntry: null, currentChoices: [] };
  var summaryCache = {};

  function $(id) { return document.getElementById(id); }

  function track(eventName, payload) {
    if (!window.RandaAnalytics || typeof window.RandaAnalytics.track !== "function") return;
    window.RandaAnalytics.track(eventName, payload || {});
  }

  function shuffle(items) {
    var clone = items.slice();
    for (var i = clone.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = clone[i];
      clone[i] = clone[j];
      clone[j] = temp;
    }
    return clone;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function maskTitle(text, entry) {
    if (!text) return entry.fallback;
    var replacement = entry.kind === "person" ? "この人物" : "この出来事";
    return text.replace(new RegExp(escapeRegExp(entry.title), "g"), replacement);
  }

  function chooseQuizEntry(period) {
    var pool = quizEntries.filter(function (entry) {
      return period === "all" ? true : entry.period === period;
    });
    if (!pool.length) pool = quizEntries.slice();
    return shuffle(pool)[0];
  }

  function buildChoices(entry) {
    var sameKind = quizEntries.filter(function (candidate) {
      return candidate.kind === entry.kind && candidate.title !== entry.title;
    });
    var choices = shuffle(sameKind).slice(0, 3).map(function (candidate) {
      return candidate.title;
    });
    choices.push(entry.title);
    return shuffle(choices);
  }

  function summarizeExtract(text) {
    if (!text) return "";
    var normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= 130) return normalized;
    return normalized.slice(0, 130) + "…";
  }

  function fetchJson(url) {
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("Request failed: " + response.status);
      return response.json();
    });
  }

  function fetchSummary(title) {
    if (summaryCache[title]) return Promise.resolve(summaryCache[title]);
    return fetchJson("https://ja.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title)).then(function (data) {
      if (data.type === "disambiguation") throw new Error("disambiguation");
      summaryCache[title] = data;
      return data;
    });
  }

  function renderQuizPlaceholder(message) {
    var question = $("historyQuizQuestion");
    var choices = $("historyQuizChoices");
    var explanation = $("historyQuizExplanation");
    if (question) question.innerHTML = "<p>" + escapeHtml(message) + "</p>";
    if (choices) choices.innerHTML = "";
    if (explanation) explanation.innerHTML = "";
  }

  function renderQuiz(entry, summary) {
    var question = $("historyQuizQuestion");
    var choices = $("historyQuizChoices");
    var explanation = $("historyQuizExplanation");
    var promptText = summarizeExtract(maskTitle(summary && summary.extract ? summary.extract : entry.fallback, entry));

    if (question) {
      question.innerHTML =
        "<p class=\"tool-note\">" + escapeHtml(entry.label) + " / " + escapeHtml(entry.kind === "person" ? "人物問題" : "出来事問題") + "</p>" +
        "<h3>次の説明が表す" + (entry.kind === "person" ? "人物" : "出来事") + "は？</h3>" +
        "<p>" + escapeHtml(promptText) + "</p>";
    }

    if (choices) {
      choices.innerHTML = "";
      quizState.currentChoices.forEach(function (choice) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "quiz-option";
        button.textContent = choice;
        button.setAttribute("data-choice", choice);
        choices.appendChild(button);
      });
    }

    if (explanation) {
      explanation.innerHTML = "<p class=\"tool-note\">回答すると解説とWikipediaリンクを表示します。</p>";
    }
  }

  function updateQuiz() {
    var select = $("historyQuizPeriod");
    var button = $("historyQuizGenerate");
    var period = select ? select.value : "all";
    var entry = chooseQuizEntry(period);
    quizState.currentEntry = entry;
    quizState.currentChoices = buildChoices(entry);

    if (button) {
      button.disabled = true;
      button.textContent = "生成中…";
    }

    renderQuizPlaceholder("Wikipedia の公開概要を取得しています…");

    fetchSummary(entry.title)
      .then(function (summary) { renderQuiz(entry, summary); })
      .catch(function () { renderQuiz(entry, null); })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.textContent = "新しい問題を出す";
        }
      });

    track("history_quiz_generate", {
      placement: "history_tools_quiz",
      period: period,
      topic: entry.title
    });
  }

  function handleQuizAnswer(event) {
    var trigger = event.target;
    if (!trigger || !trigger.matches(".quiz-option") || !quizState.currentEntry) return;

    var isCorrect = trigger.getAttribute("data-choice") === quizState.currentEntry.title;
    var explanation = $("historyQuizExplanation");
    var options = document.querySelectorAll(".quiz-option");

    Array.prototype.forEach.call(options, function (option) {
      var optionCorrect = option.getAttribute("data-choice") === quizState.currentEntry.title;
      option.disabled = true;
      option.classList.add(optionCorrect ? "is-correct" : "is-muted");
      if (option === trigger && !isCorrect) option.classList.add("is-incorrect");
    });

    fetchSummary(quizState.currentEntry.title)
      .then(function (summary) {
        var summaryText = summarizeExtract(summary.extract || quizState.currentEntry.fallback);
        var imageHtml = summary.thumbnail && summary.thumbnail.source
          ? "<img class=\"quiz-answer-thumb\" src=\"" + escapeHtml(summary.thumbnail.source) + "\" alt=\"" + escapeHtml(quizState.currentEntry.title) + "\" loading=\"lazy\">"
          : "";
        var link = summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page
          ? summary.content_urls.desktop.page
          : "https://ja.wikipedia.org/wiki/" + encodeURIComponent(quizState.currentEntry.title);

        if (explanation) {
          explanation.innerHTML =
            "<div class=\"quiz-answer\">" +
              imageHtml +
              "<div>" +
                "<p class=\"tool-note\">" + (isCorrect ? "正解です。" : "正解は「" + escapeHtml(quizState.currentEntry.title) + "」です。") + "</p>" +
                "<p>" + escapeHtml(summaryText) + "</p>" +
                "<p><a href=\"" + escapeHtml(link) + "\" target=\"_blank\" rel=\"noopener noreferrer\" data-track-event=\"cta_click\" data-track-placement=\"history_tools_quiz_wiki\" data-track-label=\"history tools quiz wiki\">Wikipediaで続きを読む</a></p>" +
              "</div>" +
            "</div>";
        }
      })
      .catch(function () {
        if (explanation) {
          explanation.innerHTML =
            "<p class=\"tool-note\">" + (isCorrect ? "正解です。" : "正解は「" + escapeHtml(quizState.currentEntry.title) + "」です。") + "</p>" +
            "<p>" + escapeHtml(quizState.currentEntry.fallback) + "</p>";
        }
      });

    track("history_quiz_answer", {
      placement: "history_tools_quiz",
      correct: isCorrect,
      topic: quizState.currentEntry.title,
      period: quizState.currentEntry.period
    });
  }

  function convertGregorianYear(year) {
    return eras.filter(function (era) {
      return year >= era.start && (era.end === null || year <= era.end);
    }).map(function (era) {
      return {
        label: era.label,
        year: year - era.start + 1,
        transition: year === era.start || (era.end !== null && year === era.end)
      };
    });
  }

  function renderGregorianConversion(event) {
    event.preventDefault();
    var input = $("gregorianYear");
    var result = $("gregorianResult");
    var year = parseInt(input && input.value, 10);

    if (!year || year < 1868 || year > 9999) {
      result.innerHTML = "<p>1868年以降の西暦年を入力してください。</p>";
      return;
    }

    var matches = convertGregorianYear(year);
    if (!matches.length) {
      result.innerHTML = "<p>対応範囲は明治以降です。</p>";
      return;
    }

    result.innerHTML = matches.map(function (match) {
      return "<div class=\"calc-result-card\"><strong>" + escapeHtml(String(year)) + "年 → " + escapeHtml(match.label) + (match.year === 1 ? "元年" : match.year + "年") + "</strong><span>" + (match.transition ? "改元のある年です。月日によって表記が分かれます。" : "年単位の換算結果です。") + "</span></div>";
    }).join("");

    track("history_era_convert", {
      placement: "history_tools_calculator",
      direction: "gregorian_to_era",
      source_year: year,
      match_count: matches.length
    });
  }

  function renderEraConversion(event) {
    event.preventDefault();
    var eraSelect = $("eraName");
    var yearInput = $("eraYear");
    var result = $("eraResult");
    var selectedEra = eras.filter(function (era) {
      return era.key === (eraSelect ? eraSelect.value : "");
    })[0];
    var eraYear = parseInt(yearInput && yearInput.value, 10);

    if (!selectedEra || !eraYear || eraYear < 1) {
      result.innerHTML = "<p>元号と年数を正しく入力してください。</p>";
      return;
    }

    var gregorianYear = selectedEra.start + eraYear - 1;
    if (selectedEra.end !== null && gregorianYear > selectedEra.end) {
      result.innerHTML = "<p>" + escapeHtml(selectedEra.label) + "で入力できる範囲を超えています。</p>";
      return;
    }

    result.innerHTML =
      "<div class=\"calc-result-card\">" +
        "<strong>" + escapeHtml(selectedEra.label) + (eraYear === 1 ? "元年" : eraYear + "年") + " → 西暦" + gregorianYear + "年</strong>" +
        "<span>改元日の厳密判定が必要な場合は月日も確認してください。開始日は " + escapeHtml(selectedEra.startedOn) + " です。</span>" +
      "</div>";

    track("history_era_convert", {
      placement: "history_tools_calculator",
      direction: "era_to_gregorian",
      era_name: selectedEra.label,
      era_year: eraYear,
      result_year: gregorianYear
    });
  }

  function scoreSearchResult(query, item) {
    var score = 0;
    if (item.title === query) score += 100;
    if (item.title.indexOf(query) === 0) score += 40;
    if (item.title.indexOf("（") === -1 && item.title.indexOf("(") === -1) score += 10;
    return score;
  }

  function truncateExtract(text, limit) {
    if (!text) return "";
    var normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= limit) return normalized;
    return normalized.slice(0, limit) + "…";
  }

  function renderProfileDetail(item) {
    var detail = $("profileDetail");
    if (!detail) return;
    var image = item.thumbnail && item.thumbnail.source
      ? "<img class=\"profile-detail-thumb\" src=\"" + escapeHtml(item.thumbnail.source) + "\" alt=\"" + escapeHtml(item.title) + "\" loading=\"lazy\">"
      : "";
    var link = item.content_urls && item.content_urls.desktop && item.content_urls.desktop.page
      ? item.content_urls.desktop.page
      : "https://ja.wikipedia.org/wiki/" + encodeURIComponent(item.title);
    var extractText = truncateExtract(item.extract || "", 300) || "概要を取得できませんでした。";

    detail.innerHTML =
      "<div class=\"profile-detail-card\">" +
        image +
        "<div>" +
          "<p class=\"tool-note\">Wikipedia 公開概要</p>" +
          "<h3>" + escapeHtml(item.title) + "</h3>" +
          "<p>" + escapeHtml(item.description || "") + "</p>" +
          "<p class=\"profile-detail-extract\">" + escapeHtml(extractText) + "</p>" +
          "<p><a href=\"" + escapeHtml(link) + "\" target=\"_blank\" rel=\"noopener noreferrer\" data-track-event=\"cta_click\" data-track-placement=\"history_tools_profile_wiki\" data-track-label=\"history tools profile wiki\">Wikipediaで詳しく読む</a></p>" +
        "</div>" +
      "</div>";

    track("history_profile_view", {
      placement: "history_tools_profiles",
      title: item.title
    });
  }

  function renderProfileResults(query, items) {
    var list = $("profileResults");
    if (!list) return;
    list.innerHTML = "";

    if (!items.length) {
      list.innerHTML = "<p>該当する公開プロフィールが見つかりませんでした。別の人物名で試してください。</p>";
      $("profileDetail").innerHTML = "";
      return;
    }

    items.forEach(function (item, index) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "profile-result";
      button.innerHTML =
        "<strong>" + escapeHtml(item.title) + "</strong>" +
        "<span>" + escapeHtml(summarizeExtract(item.description || item.extract || "Wikipedia 公開概要")) + "</span>";
      button.addEventListener("click", function () { renderProfileDetail(item); });
      list.appendChild(button);
      if (index === 0) renderProfileDetail(item);
    });

    track("history_profile_search", {
      placement: "history_tools_profiles",
      query: query,
      result_count: items.length
    });
  }

  function runProfileSearch(query) {
    var trimmed = (query || "").trim();
    var results = $("profileResults");
    var detail = $("profileDetail");

    if (!trimmed) {
      if (results) results.innerHTML = "<p>人物名を入れて検索してください。</p>";
      if (detail) detail.innerHTML = "";
      return;
    }

    if (results) results.innerHTML = "<p>検索中…</p>";
    if (detail) detail.innerHTML = "";

    fetchJson("https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(trimmed) + "&srlimit=6&utf8=1&format=json&origin=*")
      .then(function (data) {
        var searchResults = data && data.query && data.query.search ? data.query.search.slice() : [];
        searchResults.sort(function (left, right) {
          return scoreSearchResult(trimmed, right) - scoreSearchResult(trimmed, left);
        });
        var titles = searchResults.map(function (item) { return item.title; }).filter(function (title, index, items) {
          return items.indexOf(title) === index;
        }).slice(0, 5);

        return Promise.all(titles.map(function (title) {
          return fetchSummary(title).catch(function () { return null; });
        }));
      })
      .then(function (items) {
        renderProfileResults(trimmed, items.filter(function (item) { return !!item; }));
      })
      .catch(function () {
        if (results) results.innerHTML = "<p>現在このツールは工事中です。API 復旧後に再開します。</p>";
      });
  }

  function initQuickSearch() {
    var buttons = document.querySelectorAll("[data-profile-query]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function () {
        var query = button.getAttribute("data-profile-query") || "";
        var input = $("profileSearchInput");
        if (input) input.value = query;
        runProfileSearch(query);
      });
    });
  }

  function initSteamTracking() {
    var section = $("steam");
    if (!section || typeof IntersectionObserver !== "function") return;
    var tracked = false;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!tracked && entry.isIntersecting) {
          tracked = true;
          observer.disconnect();
          track("history_steam_widget_view", { placement: "history_tools_steam" });
        }
      });
    }, { threshold: 0.35 });
    observer.observe(section);
  }

  function initForms() {
    var quizGenerate = $("historyQuizGenerate");
    var quizChoices = $("historyQuizChoices");
    var gregorianForm = $("gregorianForm");
    var eraForm = $("eraForm");
    var profileForm = $("profileSearchForm");

    if (quizGenerate) quizGenerate.addEventListener("click", updateQuiz);
    if (quizChoices) quizChoices.addEventListener("click", handleQuizAnswer);
    if (gregorianForm) gregorianForm.addEventListener("submit", renderGregorianConversion);
    if (eraForm) eraForm.addEventListener("submit", renderEraConversion);
    if (profileForm) {
      profileForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var input = $("profileSearchInput");
        runProfileSearch(input ? input.value : "");
      });
    }
  }

  function init() {
    initForms();
    initQuickSearch();
    initSteamTracking();
    if ($("historyQuizGenerate") || $("historyQuizQuestion")) {
      updateQuiz();
    }
    if ($("profileSearchForm") || $("profileResults") || $("profileDetail")) {
      runProfileSearch("織田信長");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    return;
  }

  init();
})();
