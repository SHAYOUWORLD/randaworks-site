(function () {
  function track(eventName, payload) {
    if (!window.RandaAnalytics || typeof window.RandaAnalytics.track !== "function") return;
    window.RandaAnalytics.track(eventName, payload);
  }

  function init() {
    var body = document.body;
    var frame = document.getElementById("demoFrame");
    var frameShell = document.getElementById("demoFrameShell");
    var status = document.getElementById("playStatusText");
    var errorBox = document.getElementById("playError");
    var launchButton = document.getElementById("launchPlayButton");
    var retryButton = document.getElementById("retryBootButton");
    var fullscreenButton = document.getElementById("fullscreenPlayButton");
    var muteButton = document.getElementById("mutePlayButton");
    var readyNote = document.getElementById("playReadyNote");
    var demoLaunchOverlay = document.getElementById("demoLaunchOverlay");
    var demoLaunchButton = document.getElementById("demoLaunchButton");
    var buildPath = body.dataset.buildPath || "./build/index.html";
    var buildId = body.dataset.buildId || "";
    var mutePreferenceKey = "randa:inga:audio-muted";
    var bootTimer = null;
    var bootResolved = false;
    var bootStartedAt = 0;
    var bootSuccessTracked = false;
    var isMuted = readMutePreference();
    var hasLaunched = false;

    function text(key, fallback) {
      if (body && body.dataset && body.dataset[key]) return body.dataset[key];
      return fallback;
    }

    function readMutePreference() {
      try {
        var stored = window.localStorage.getItem(mutePreferenceKey);
        if (stored === null) return false;
        return stored === "true";
      } catch (error) {
        return false;
      }
    }

    function saveMutePreference(value) {
      try {
        window.localStorage.setItem(mutePreferenceKey, String(Boolean(value)));
      } catch (error) {}
    }

    function setStatus(message) {
      if (status) status.textContent = message;
    }

    function isFullscreenActive() {
      return document.fullscreenElement === frameShell;
    }

    function updateFullscreenButton() {
      if (!fullscreenButton) return;
      fullscreenButton.textContent = isFullscreenActive()
        ? text("fullscreenExitLabel", "外側フルスクリーン解除")
        : text("fullscreenEnterLabel", "外側フルスクリーン");
    }

    function updateMuteButton() {
      if (!muteButton) return;
      muteButton.textContent = isMuted
        ? text("muteOffLabel", "ミュート解除")
        : text("muteOnLabel", "音声をミュート");
    }

    function updateLaunchButtons() {
      if (launchButton) launchButton.hidden = hasLaunched;
      if (retryButton) retryButton.hidden = !bootResolved || !errorBox || errorBox.hidden;
    }

    function showLaunchOverlay() {
      if (!demoLaunchOverlay) return;
      demoLaunchOverlay.hidden = false;
      demoLaunchOverlay.classList.remove("demo-launch-hiding");
    }

    function hideLaunchOverlay() {
      if (!demoLaunchOverlay || demoLaunchOverlay.hidden) return;
      demoLaunchOverlay.classList.add("demo-launch-hiding");
      window.setTimeout(function () {
        if (demoLaunchOverlay.classList.contains("demo-launch-hiding")) {
          demoLaunchOverlay.hidden = true;
        }
      }, 400);
    }

    var ACK_TIMEOUT_MS = 5000;
    var pendingAcks = {};

    function sendFrameControl(command, value) {
      if (!frame || !frame.contentWindow) return;
      frame.contentWindow.postMessage({
        type: "randa-control",
        command: command,
        value: value
      }, window.location.origin);

      if (pendingAcks[command]) clearTimeout(pendingAcks[command]);
      pendingAcks[command] = setTimeout(function () {
        delete pendingAcks[command];
      }, ACK_TIMEOUT_MS);
    }

    function clearPendingAck(command) {
      if (pendingAcks[command]) {
        clearTimeout(pendingAcks[command]);
        delete pendingAcks[command];
      }
    }

    function setError(message) {
      if (!errorBox) return;
      errorBox.hidden = false;
      errorBox.innerHTML = message;
    }

    function clearError() {
      if (!errorBox) return;
      errorBox.hidden = true;
      errorBox.textContent = "";
      updateLaunchButtons();
    }

    function markReady(message) {
      bootResolved = true;
      if (bootTimer) window.clearTimeout(bootTimer);
      if (readyNote) readyNote.hidden = false;
      setStatus(message || text("statusReady", "プレイできます。"));
      updateLaunchButtons();
    }

    function markError(code, message) {
      bootResolved = true;
      if (bootTimer) window.clearTimeout(bootTimer);
      setStatus(text("statusFailed", "起動できませんでした。"));
      setError(message);
      updateLaunchButtons();
      track("demo_boot_error", {
        build_id: buildId,
        error_code: code
      });
    }

    function beginTimeoutWatch() {
      bootTimer = window.setTimeout(function () {
        if (bootResolved) return;
        markError(
          "boot_timeout",
          text("errorBootTimeout", "起動に時間がかかっています。時間をおいて再試行するか、サポートページをご確認ください。")
        );
      }, 15000);
    }

    function loadFrame(launchMethod) {
      hasLaunched = true;
      bootStartedAt = Date.now();
      bootResolved = false;
      bootSuccessTracked = false;
      clearError();
      updateLaunchButtons();
      hideLaunchOverlay();
      if (readyNote) readyNote.hidden = true;
      setStatus(text("statusPreparing", "体験版を準備しています..."));

      track("demo_boot_start", {
        build_id: buildId,
        launch_method: launchMethod || "page_load"
      });

      fetch(buildPath, { cache: "no-store", credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("build_missing");
          }

          setStatus(text("statusLoading", "体験版を読み込んでいます..."));
          frame.src = buildPath;
          beginTimeoutWatch();

          frame.addEventListener(
            "load",
            function () {
              if (bootResolved) return;
              setStatus(text("statusAlmostReady", "まもなく遊べます..."));
              if (isMuted) {
                sendFrameControl("setMuted", true);
              }
            },
            { once: true }
          );
        })
        .catch(function (error) {
          var code = error && error.message ? error.message : "boot_check_failed";
          markError(
            code,
            text("errorLoadFailed", "体験版の読み込みに失敗しました。時間をおいて再試行するか、サポートページをご確認ください。")
          );
        });
    }

    function launchGame(launchMethod) {
      if (hasLaunched) return;
      loadFrame(launchMethod || "play_button");
      track("game_launch", {
        build_id: buildId,
        placement: "play_shell_launch"
      });
    }

    window.addEventListener("message", function (event) {
      if (event.origin !== window.location.origin) return;

      if (event.source === frame.contentWindow && event.data && event.data.type === "randa-control-ack" && event.data.command === "setMuted") {
        clearPendingAck("setMuted");
        isMuted = Boolean(event.data.value);
        saveMutePreference(isMuted);
        updateMuteButton();
        return;
      }

      if (event.source === frame.contentWindow && event.data && event.data.type === "randa-control-notify") {
        if (event.data.command === "mutedChanged") {
          isMuted = Boolean(event.data.value);
          saveMutePreference(isMuted);
          updateMuteButton();
          return;
        }

        if (event.data.command === "ready") {
          setStatus(text("statusReady", "プレイできます。"));
          return;
        }
      }

      if (!event.data || event.data.type !== "randa-analytics" || !event.data.event) return;

      var payload = event.data.payload || {};

      if (event.data.event === "demo_boot_success") {
        if (!bootSuccessTracked) {
          bootSuccessTracked = true;
          track("demo_boot_success", Object.assign({}, payload, {
            build_id: buildId,
            load_ms: Date.now() - bootStartedAt
          }));
        }
        markReady(text("statusReady", "プレイできます。"));
        return;
      }

      if (event.data.event === "demo_boot_error") {
        markError(payload.error_code || "runtime_error", text("errorRuntime", "ゲーム本体が起動エラーを返しました。"));
        return;
      }

      track(event.data.event, payload);
    });

    if (retryButton) {
      retryButton.addEventListener("click", function () {
        if (frame) frame.src = "about:blank";
        hasLaunched = false;
        loadFrame("retry");
      });
    }

    if (launchButton) {
      launchButton.addEventListener("click", function () {
        launchGame("play_button");
      });
    }

    if (demoLaunchButton) {
      demoLaunchButton.addEventListener("click", function () {
        launchGame("play_overlay");
      });
    }

    if (fullscreenButton && frameShell && document.fullscreenEnabled) {
      fullscreenButton.addEventListener("click", function () {
        if (isFullscreenActive()) {
          document.exitFullscreen().catch(function () {});
          track("fullscreen_toggle", {
            build_id: buildId,
            state: "exit"
          });
          return;
        }

        frameShell.requestFullscreen().then(function () {
          track("fullscreen_toggle", {
            build_id: buildId,
            state: "enter"
          });
        }).catch(function () {
          setStatus(text("errorFullscreenUnavailable", "全画面表示を開始できませんでした。"));
        });
      });

      document.addEventListener("fullscreenchange", updateFullscreenButton);
      updateFullscreenButton();
    } else if (fullscreenButton) {
      fullscreenButton.hidden = true;
    }

    if (muteButton) {
      muteButton.addEventListener("click", function () {
        isMuted = !isMuted;
        saveMutePreference(isMuted);
        updateMuteButton();
        if (hasLaunched) {
          sendFrameControl("setMuted", isMuted);
        }
        track("audio_toggle", {
          build_id: buildId,
          placement: "play_shell_audio",
          muted: isMuted
        });
      });
      updateMuteButton();
    }

    window.setTimeout(function () {
      track("session_180s", {
        build_id: buildId
      });
    }, 180000);

    updateLaunchButtons();
    showLaunchOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
    return;
  }

  init();
})();
