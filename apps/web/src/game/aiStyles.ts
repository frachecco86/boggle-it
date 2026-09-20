/**
 * Stili "AI" per la foto profilo, eseguiti INTERAMENTE nel browser.
 *
 * Modello: **AnimeGANv2** (TachibanaYoshino, MIT) convertito in ONNX da
 * vumichien. È una vera rete neurale di style transfer, non un filtro grafico:
 * ridisegna il volto in stile anime invece di scurire i contorni.
 *
 * Perché locale e non un'API cloud:
 *  - costo zero per foto (puoi provare 10 stili senza pensare al contatore);
 *  - la foto NON lascia il dispositivo (è un volto, spesso di minori);
 *  - funziona offline nell'app Android, come schede e musica.
 *
 * Dettagli tecnici del modello (verificati):
 *  - input:  `generator_input:0`, float32 **NHWC** `[1, H, W, 3]`, dimensioni
 *            spaziali dinamiche, valori normalizzati in **[-1, 1]**;
 *  - output: `generator/G_MODEL/out_layer/Tanh:0`, stessa forma, in **[-1, 1]**.
 *  - inferenza misurata: ~250 ms a 256×256 su CPU (node), ~60 ms a 128×128.
 *
 * I pesi (8.25 MB per stile) e il runtime WASM (~13.6 MB) sono scaricati al primo
 * uso e poi tenuti in cache: l'app resta leggera e le volte successive è offline.
 */

export const AI_STYLES = [
  {
    id: 'hayao',
    label: 'Hayao',
    hint: 'Ispirato a Miyazaki: linee morbide, colori pastello',
    file: 'AnimeGANv2_Hayao.onnx',
    /** URL dei pesi: Hugging Face, licenza Apache-2.0. */
    url: 'https://huggingface.co/vumichien/AnimeGANv2_Hayao/resolve/main/AnimeGANv2_Hayao.onnx',
  },
  {
    id: 'shinkai',
    label: 'Shinkai',
    hint: 'Cieli luminosi, contrasto e saturazione alti',
    file: 'AnimeGANv2_Shinkai.onnx',
    url: 'https://huggingface.co/vumichien/AnimeGANv2_Shinkai/resolve/main/AnimeGANv2_Shinkai.onnx',
  },
  {
    id: 'paprika',
    label: 'Paprika',
    hint: 'Cartoon saturo, colori pieni e vivaci',
    file: 'AnimeGANv2_Paprika.onnx',
    url: 'https://huggingface.co/vumichien/AnimeGANv2_Paprika/resolve/main/AnimeGANv2_Paprika.onnx',
  },
] as const;

export type AiStyleId = (typeof AI_STYLES)[number]['id'];

export function isAiStyle(value: unknown): value is AiStyleId {
  return typeof value === 'string' && AI_STYLES.some((s) => s.id === value);
}

/** Lato massimo dell'immagine data in pasto alla rete (i volti non servono di più). */
export const AI_INPUT_SIZE = 256;

/**
 * Runtime WASM di onnxruntime, servito dalla CDN invece che dal bundle.
 *
 * Perché: onnxruntime-web espone più varianti del file `.wasm` (base, JSEP,
 * asyncify, JSPI) e Vite le include TUTTE perché non può sapere quale servirà a
 * runtime — 27+ MB nel build finale. Puntando `wasmPaths` alla CDN scarichiamo
 * solo la variante base (13.6 MB) e solo quando l'utente usa uno stile AI.
 * Il tutto entra nella cache del browser: dalla seconda volta si va offline.
 */
const ORT_VERSION = '1.30.0';
const ORT_WASM_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

/** L'unico file di runtime da pre-scaricare (la variante base, senza WebGPU). */
export const ORT_RUNTIME_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'] as const;

/** Cache dei modelli: nomi e versione (cambiarla invalida la cache). */
const CACHE_NAME = 'sbooble-ai-models-v1';

type ProgressFn = (state: { phase: 'download' | 'run'; loaded: number; total: number }) => void;

/** Sessione ONNX condivisa per stile (evita di ricaricare il modello). */
const sessions = new Map<AiStyleId, unknown>();
/** Promesse in corso: due click rapidi non devono scaricare due volte. */
const loading = new Map<AiStyleId, Promise<unknown>>();

/**
 * Carica i pesi con cache HTTP/CacheStorage.
 * Prima visita: scarica (~8 MB). Visite successive: dalla cache, anche offline.
 */
async function fetchModel(url: string, onProgress?: ProgressFn): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  const cached = await cache?.match(url);
  if (cached) {
    onProgress?.({ phase: 'download', loaded: 1, total: 1 });
    return cached.arrayBuffer();
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Modello non scaricabile (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length') ?? 0);

  // Con un reader mostriamo l'avanzamento; senza, si attende e basta.
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    await cache?.put(url, new Response(buf.slice(0), { headers: res.headers })).catch(() => undefined);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ phase: 'download', loaded, total });
  }
  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  await cache?.put(url, new Response(merged.slice(0), { headers: res.headers })).catch(() => undefined);
  return merged.buffer;
}

/**
 * Mette in cache il runtime WASM (dalla CDN) così le volte successive funzionano
 * anche offline. Se la CDN non è raggiungibile e la cache è vuota, l'errore è
 * esplicito: l'AI richiede la rete la prima volta.
 */
async function warmOrtRuntime(onProgress?: ProgressFn): Promise<void> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  if (!cache) return;
  for (const file of ORT_RUNTIME_FILES) {
    const url = `${ORT_WASM_CDN}${file}`;
    if (await cache.match(url)) continue;
    try {
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
    } catch {
      /* senza rete: il runtime verrà preso (o richiesto) al momento dell'uso */
    }
  }
  onProgress?.({ phase: 'download', loaded: 1, total: 1 });
}

/** Tipo minimo di una sessione onnxruntime-web (evita un import pesante a monte). */
interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array; dims: number[] }>>;
}

/**
 * Crea (o riprende) la sessione ONNX di uno stile.
 * `onnxruntime-web` è importato **dinamicamente**: i suoi ~13 MB di WASM non
 * entrano nel bundle iniziale, ma si scaricano solo quando serve l'AI.
 */
async function getSession(style: AiStyleId, onProgress?: ProgressFn): Promise<OrtSession> {
  const ready = sessions.get(style);
  if (ready) return ready as OrtSession;
  const pending = loading.get(style);
  if (pending) return pending as Promise<OrtSession>;

  const job = (async () => {
    const ort = await import('onnxruntime-web');
    ort.env.wasm.wasmPaths = ORT_WASM_CDN;
    // Un solo thread: niente SharedArrayBuffer, che richiede header COOP/COEP.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;

    const style0 = AI_STYLES.find((s) => s.id === style)!;
    // Runtime e pesi in parallelo: sono due download indipendenti.
    const buffer = await Promise.all([fetchModel(style0.url, onProgress), warmOrtRuntime()]).then(
      ([b]) => b,
    );
    const session = (await ort.InferenceSession.create(buffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })) as unknown as OrtSession;
    sessions.set(style, session);
    return session;
  })();

  loading.set(style, job);
  try {
    return await job;
  } finally {
    loading.delete(style);
  }
}

/** True se lo stile è già pronto (modello in memoria): nessuna attesa. */
export function isStyleReady(style: AiStyleId): boolean {
  return sessions.has(style);
}

/** True se i pesi sono in cache: usabile anche senza rete. */
export async function isStyleCached(style: AiStyleId): Promise<boolean> {
  const cache = await caches.open(CACHE_NAME).catch(() => null);
  if (!cache) return false;
  const url = AI_STYLES.find((s) => s.id === style)!.url;
  return Boolean(await cache.match(url));
}

/**
 * Applica uno stile AI alla foto e disegna il risultato su `outCanvas`.
 *
 * Il canvas di ingresso deve essere già quadrato a `size` (vedi `cropSquare`):
 * qui non si ritaglia, si trasforma soltanto.
 */
export async function applyAiStyle(
  source: HTMLCanvasElement,
  style: AiStyleId,
  outCanvas: HTMLCanvasElement,
  onProgress?: ProgressFn,
): Promise<void> {
  const size = source.width;
  const session = await getSession(style, onProgress);

  const ctx = source.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, size, size);

  // HWC float32 in [-1, 1]: è il formato che il modello si aspetta.
  const input = new Float32Array(size * size * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
    input[p] = data[i]! / 127.5 - 1;
    input[p + 1] = data[i + 1]! / 127.5 - 1;
    input[p + 2] = data[i + 2]! / 127.5 - 1;
  }

  const ort = await import('onnxruntime-web');
  onProgress?.({ phase: 'run', loaded: 0, total: 1 });
  const tensor = new ort.Tensor('float32', input, [1, size, size, 3]);
  const result = await session.run({ [session.inputNames[0]!]: tensor });
  const output = result[session.outputNames[0]!]!;

  // Da [-1, 1] a [0, 255].
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3) {
    rgba[i] = (output.data[p]! + 1) * 127.5;
    rgba[i + 1] = (output.data[p + 1]! + 1) * 127.5;
    rgba[i + 2] = (output.data[p + 2]! + 1) * 127.5;
    rgba[i + 3] = 255;
  }

  outCanvas.width = size;
  outCanvas.height = size;
  outCanvas.getContext('2d')!.putImageData(new ImageData(rgba, size, size), 0, 0);
  onProgress?.({ phase: 'run', loaded: 1, total: 1 });
}
