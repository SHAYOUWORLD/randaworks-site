(function () {
  const PCK_NAME = 'index.pck';
  const PCK_PARTS = [{"name":"index.pck.part000","size":199229440},{"name":"index.pck.part001","size":175707368}];
  const PCK_TOTAL_SIZE = 374936808;
  const GCS_BASE_URL = 'https://storage.googleapis.com/randaworks-game-builds/inga-demo/0.1.8/';
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  const originalFetch = window.fetch.bind(window);
  const targetSuffix = '/' + PCK_NAME;
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const GCS_BINARY_FILES = ['index.wasm'];

  function getGcsRedirectUrl(resource) {
    if (isLocal || !GCS_BASE_URL) return null;
    let raw = '';
    if (typeof resource === 'string') {
      raw = resource;
    } else if (resource && typeof resource.url === 'string') {
      raw = resource.url;
    }
    if (!raw) return null;
    try {
      const pathname = new URL(raw, window.location.href).pathname;
      for (const name of GCS_BINARY_FILES) {
        if (pathname.endsWith('/' + name) || pathname.endsWith(name)) {
          return GCS_BASE_URL + name;
        }
      }
    } catch (_err) {}
    return null;
  }

  function isMainPackRequest(resource) {
    let raw = '';
    if (typeof resource === 'string') {
      raw = resource;
    } else if (resource && typeof resource.url === 'string') {
      raw = resource.url;
    }
    if (!raw) {
      return false;
    }
    try {
      const pathname = new URL(raw, window.location.href).pathname;
      return pathname.endsWith(targetSuffix) || pathname.endsWith(PCK_NAME);
    } catch (_err) {
      return false;
    }
  }

  function extractMethod(resource, init) {
    if (init && typeof init.method === 'string') {
      return init.method.toUpperCase();
    }
    if (resource && typeof resource.method === 'string') {
      return resource.method.toUpperCase();
    }
    return 'GET';
  }

  function resolvePartUrl(resource, partName) {
    if (!isLocal && GCS_BASE_URL) {
      return GCS_BASE_URL + partName;
    }
    let raw = '';
    if (typeof resource === 'string') {
      raw = resource;
    } else if (resource && typeof resource.url === 'string') {
      raw = resource.url;
    }
    if (!raw) {
      return partName;
    }
    try {
      const base = new URL(raw, window.location.href);
      return new URL(partName, base).toString();
    } catch (_err) {
      return partName;
    }
  }

  function createHeaders() {
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    if (Number.isFinite(PCK_TOTAL_SIZE) && PCK_TOTAL_SIZE > 0) {
      headers.set('Content-Length', String(PCK_TOTAL_SIZE));
    }
    return headers;
  }

  var RETRY_MAX = 3;
  var RETRY_BASE_MS = 1000;
  var FETCH_TIMEOUT_MS = 60000;
  var STALL_TIMEOUT_MS = 30000;

  function fetchWithTimeout(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return originalFetch(url, { signal: controller.signal }).then(
      function (response) { clearTimeout(timer); return response; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  function readBodyWithStallDetection(response, streamController) {
    return new Promise(function (resolve, reject) {
      if (!response.body || typeof response.body.getReader !== 'function') {
        response.arrayBuffer().then(function (buf) {
          streamController.enqueue(new Uint8Array(buf));
          resolve();
        }, reject);
        return;
      }
      var reader = response.body.getReader();
      var stallTimer = null;
      var stalled = false;
      function resetStallTimer() {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(function () {
          stalled = true;
          try { reader.cancel('stall timeout'); } catch (_e) {}
          reject(new Error('Body stall timeout'));
        }, STALL_TIMEOUT_MS);
      }
      function pump() {
        reader.read().then(function (result) {
          if (stalled) return;
          if (result.done) {
            clearTimeout(stallTimer);
            resolve();
            return;
          }
          if (result.value) {
            streamController.enqueue(result.value);
          }
          resetStallTimer();
          pump();
        }, function (err) {
          clearTimeout(stallTimer);
          if (stalled) return;
          reject(err);
        });
      }
      resetStallTimer();
      pump();
    });
  }

  async function createPackResponse(resource) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const part of PCK_PARTS) {
            const partUrl = resolvePartUrl(resource, part.name);
            var lastErr = null;
            var success = false;
            for (var attempt = 0; attempt <= RETRY_MAX; attempt++) {
              try {
                var response = await fetchWithTimeout(partUrl);
                if (!response.ok) throw new Error('HTTP ' + response.status);
                await readBodyWithStallDetection(response, controller);
                success = true;
                break;
              } catch (err) {
                lastErr = err;
                if (attempt < RETRY_MAX) {
                  var delay = RETRY_BASE_MS * Math.pow(2, attempt);
                  await new Promise(function (r) { setTimeout(r, delay); });
                }
              }
            }
            if (!success) throw lastErr || new Error('Failed loading ' + part.name);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: createHeaders(),
    });
  }

  window.fetch = async function (resource, init) {
    const gcsUrl = getGcsRedirectUrl(resource);
    if (gcsUrl) {
      return originalFetch(gcsUrl, init);
    }
    if (!isMainPackRequest(resource)) {
      return originalFetch(resource, init);
    }
    const method = extractMethod(resource, init);
    if (method === 'HEAD') {
      return new Response(null, { status: 200, headers: createHeaders() });
    }
    return createPackResponse(resource);
  };
}());
