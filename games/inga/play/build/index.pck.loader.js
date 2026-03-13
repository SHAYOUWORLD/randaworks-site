(function () {
  const PCK_NAME = 'index.pck';
  const PCK_PARTS = [{"name":"index.pck.part000","size":199229440},{"name":"index.pck.part001","size":199229440},{"name":"index.pck.part002","size":11098468}];
  const PCK_TOTAL_SIZE = 409557348;
  const GCS_BASE_URL = 'https://storage.googleapis.com/randaworks-game-builds/inga-demo/0.1.5/';
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return;
  }
  const originalFetch = window.fetch.bind(window);
  const targetSuffix = '/' + PCK_NAME;
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

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

  async function createPackResponse(resource) {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const part of PCK_PARTS) {
            const partUrl = resolvePartUrl(resource, part.name);
            const response = await originalFetch(partUrl);
            if (!response.ok) {
              throw new Error(`Failed loading file '${part.name}'`);
            }
            if (!response.body || typeof response.body.getReader !== 'function') {
              const buf = await response.arrayBuffer();
              controller.enqueue(new Uint8Array(buf));
              continue;
            }
            const reader = response.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              if (value) {
                controller.enqueue(value);
              }
            }
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
