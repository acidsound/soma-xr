/**
 * MotionBricks SOMA ONNX Web Worker
 * Adapted from https://huggingface.co/spaces/monoradio/motionbricks-live/blob/main/viewer/mb_worker.js
 *
 * Supports:
 * 1) Downloading & caching the 8-bit quantized MotionBricks SOMA ONNX model
 *    from Cloudflare R2 (mmm_v6_soma_q8h.onnx) via Cache Storage (32MB chunks)
 * 2) Loading a user-supplied local .onnx ArrayBuffer directly
 */

const CACHE_NAME = 'motionbricks-model-v1';
const CHUNK = 32 * 1024 * 1024;
const ORT_VERSION = '1.24.3';

let session = null;
let ortLib = null;

async function fetchModel(url) {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    cache = null;
  }

  if (cache) {
    const metaResp = await cache.match(url + '#meta');
    if (metaResp) {
      const meta = await metaResp.json();
      const parts = await Promise.all(
        Array.from({ length: meta.chunks }, (_, i) => cache.match(`${url}#${i}`)),
      );
      if (parts.every(Boolean)) {
        self.postMessage({ type: 'cached' });
        const bufs = await Promise.all(parts.map((r) => r.arrayBuffer()));
        const out = new Uint8Array(meta.size);
        let off = 0;
        for (const b of bufs) {
          out.set(new Uint8Array(b), off);
          off += b.byteLength;
        }
        return out;
      }
    }
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} while downloading SOMA ONNX model`);
  }
  const total = +(resp.headers.get('content-length') || 0);
  const reader = resp.body.getReader();
  const chunks = [];
  let loaded = 0;
  let lastPost = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const now = performance.now();
    if (now - lastPost > 120) {
      lastPost = now;
      self.postMessage({ type: 'progress', loaded, total });
    }
  }
  self.postMessage({ type: 'progress', loaded, total: total || loaded });

  const buf = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }

  if (cache) {
    try {
      const n = Math.ceil(loaded / CHUNK);
      for (let i = 0; i < n; i++) {
        await cache.put(
          `${url}#${i}`,
          new Response(buf.subarray(i * CHUNK, (i + 1) * CHUNK)),
        );
      }
      await cache.put(
        url + '#meta',
        new Response(JSON.stringify({ size: loaded, chunks: n })),
      );
    } catch {
      // Cache quota exceeded is non-fatal
    }
  }
  return buf;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
      importScripts(base + 'ort.webgpu.min.js');
      ortLib = self.ort;
      ortLib.env.wasm.wasmPaths = base;

      let bytes;
      if (m.buffer) {
        bytes = new Uint8Array(m.buffer);
      } else {
        bytes = await fetchModel(m.modelUrl);
      }

      const ep = m.ep || 'webgpu';
      const providers = ep === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'];
      session = await ortLib.InferenceSession.create(bytes, {
        executionProviders: providers,
      });

      self.postMessage({
        type: 'ready',
        inputNames: session.inputNames,
        outputNames: session.outputNames,
        ep,
      });
    }
  } catch (err) {
    self.postMessage({
      type: 'error',
      id: m.id,
      message: err?.stack || err?.message || String(err),
    });
  }
};
