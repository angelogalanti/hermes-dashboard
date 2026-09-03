    // ── api.js — fetch con ETag, retry e timeout ───────────────────
    //
    // Il backend espone ETag su tutti i GET JSON (304 se invariato).
    // Questo modulo memorizza gli ETag per URL e li reinvia come
    // If-None-Match: su 304 torna NOT_MODIFIED così il chiamante
    // può saltare il re-render. Retry con backoff su errori di rete.

    export const NOT_MODIFIED = Symbol('not-modified');

    const etags = new Map();

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    export async function fetchJSON(url, { retries = 2, timeout = 15000 } = {}) {
      let lastErr = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout);
        try {
          const headers = {};
          if (etags.has(url)) headers['If-None-Match'] = etags.get(url);
          const resp = await fetch(url, { headers, signal: ctrl.signal });
          clearTimeout(timer);
          if (resp.status === 304) return NOT_MODIFIED;
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const etag = resp.headers.get('ETag');
          if (etag) etags.set(url, etag);
          return await resp.json();
        } catch (err) {
          clearTimeout(timer);
          lastErr = err && err.name === 'AbortError'
            ? new Error('timeout dopo ' + timeout + 'ms')
            : err;
          if (attempt < retries) await sleep(400 * (attempt + 1));
        }
      }
      throw lastErr;
    }

    // Dimentica l'ETag memorizzato (es. dopo un force refresh)
    export function dropEtag(url) {
      etags.delete(url);
    }
