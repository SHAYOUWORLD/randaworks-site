/**
 * videos-data.js の VIDEOS 配列から
 * メインプレーヤー（左右ナビ付き） + サムネイル選択UIを生成する
 */
(function () {
  var container = document.getElementById("js-video-list");
  if (!container || typeof VIDEOS === "undefined" || VIDEOS.length === 0) return;

  var current = 0;

  // ── メインプレーヤー ──────────────────────────────────
  var stage = document.createElement("div");
  stage.className = "vp-stage";

  // 左ボタン
  var btnPrev = document.createElement("button");
  btnPrev.type = "button";
  btnPrev.className = "vp-nav vp-nav-prev";
  btnPrev.setAttribute("aria-label", "前の動画");
  btnPrev.innerHTML =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';

  // プレーヤーシェル
  var shell = document.createElement("div");
  shell.className = "video-embed-shell";

  var iframe = document.createElement("iframe");
  iframe.id = "vp-iframe";
  iframe.src = "https://www.youtube.com/embed/" + VIDEOS[0].id;
  iframe.title = VIDEOS[0].title;
  iframe.loading = "lazy";
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  iframe.setAttribute("allowfullscreen", "");

  shell.appendChild(iframe);

  // 右ボタン
  var btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.className = "vp-nav vp-nav-next";
  btnNext.setAttribute("aria-label", "次の動画");
  btnNext.innerHTML =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';

  stage.appendChild(btnPrev);
  stage.appendChild(shell);
  stage.appendChild(btnNext);
  container.appendChild(stage);

  // ── サムネイル一覧 ────────────────────────────────────
  var thumbEls = [];

  if (VIDEOS.length > 1) {
    var strip = document.createElement("div");
    strip.className = "vp-strip";
    strip.setAttribute("role", "list");

    for (var i = 0; i < VIDEOS.length; i++) {
      (function (v, idx) {
        var item = document.createElement("button");
        item.type = "button";
        item.className = "vp-thumb" + (idx === 0 ? " is-active" : "");
        item.setAttribute("role", "listitem");
        item.setAttribute("aria-label", v.title + "を再生");

        var imgWrap = document.createElement("div");
        imgWrap.className = "vp-thumb-img";

        var img = document.createElement("img");
        img.src = "https://i.ytimg.com/vi/" + v.id + "/mqdefault.jpg";
        img.alt = v.title;
        img.loading = "lazy";
        img.width = 320;
        img.height = 180;

        var playIcon = document.createElement("span");
        playIcon.className = "vp-thumb-play";
        playIcon.setAttribute("aria-hidden", "true");
        playIcon.innerHTML =
          '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7z"/></svg>';

        imgWrap.appendChild(img);
        imgWrap.appendChild(playIcon);

        var title = document.createElement("span");
        title.className = "vp-thumb-title";
        title.textContent = v.title;

        item.appendChild(imgWrap);
        item.appendChild(title);

        item.addEventListener("click", function () {
          switchTo(idx);
        });

        strip.appendChild(item);
        thumbEls.push(item);
      })(VIDEOS[i], i);
    }

    container.appendChild(strip);
  }

  // ── 切り替え処理 ──────────────────────────────────────
  function switchTo(idx) {
    current = (idx + VIDEOS.length) % VIDEOS.length;
    var v = VIDEOS[current];

    iframe.src = "https://www.youtube.com/embed/" + v.id;
    iframe.title = v.title;

    // サムネイルのアクティブ更新
    for (var k = 0; k < thumbEls.length; k++) {
      thumbEls[k].classList.toggle("is-active", k === current);
    }

    // ナビボタンの表示制御（端で非表示にしたい場合はコメントアウト解除）
    // btnPrev.disabled = current === 0;
    // btnNext.disabled = current === VIDEOS.length - 1;
  }

  btnPrev.addEventListener("click", function () { switchTo(current - 1); });
  btnNext.addEventListener("click", function () { switchTo(current + 1); });

  // 1本しかない場合はナビを非表示
  if (VIDEOS.length <= 1) {
    btnPrev.hidden = true;
    btnNext.hidden = true;
  }

  // ── schema.org VideoObject を動的注入 ────────────────
  var schema = [];
  for (var j = 0; j < VIDEOS.length; j++) {
    var vid = VIDEOS[j];
    schema.push({
      "@type": "VideoObject",
      "name": vid.title,
      "description": vid.description,
      "thumbnailUrl": "https://i.ytimg.com/vi/" + vid.id + "/hqdefault.jpg",
      "embedUrl": "https://www.youtube.com/embed/" + vid.id,
      "url": "https://www.youtube.com/watch?v=" + vid.id,
      "publisher": {
        "@type": "Organization",
        "name": "RandaWorks",
        "url": "https://www.randaworks.com/"
      }
    });
  }
  var script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": schema });
  document.head.appendChild(script);
})();
