// src/lib/generate.ts
// Генератор іконок у БРАУЗЕРІ: SVG → PNG-набір, favicon.ico, site.webmanifest → ZIP.
// Пакети: @resvg/resvg-wasm, jszip

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import JSZip from "jszip";

/* =========================
   Константи
   ========================= */
const WASM_URL = "/resvg.wasm"; // поклади resvg.wasm у /public

// Розміри PNG, які реально корисні у 2025
export const PNG_SIZES = [
  16, 32, 48, 64, 128, 180, 192, 256, 384, 512,
] as const;
const ICO_SIZES = [16, 32, 48] as const; // для favicon.ico
const PWA_MAIN = [192, 512] as const; // мінімум у маніфесті
const MASKABLE_MAIN = [192, 512] as const; // maskable у маніфесті

let wasmReady = false;

/* =========================
   Ініціалізація resvg.wasm
   ========================= */
export async function ensureResvg(): Promise<void> {
  if (wasmReady) return;
  const res = await fetch(WASM_URL);
  if (!res.ok) {
    throw new Error(`resvg.wasm not found (${res.status}) at ${WASM_URL}`);
  }
  const buf = await res.arrayBuffer(); // стабільно для будь-якого MIME
  await initWasm(buf); // ІМЕНОВАНИЙ import { initWasm }
  wasmReady = true;
}

/* =========================
   SVG → PNG (Uint8Array)
   ========================= */
export async function svgToPng(
  svgText: string,
  size: number
): Promise<Uint8Array> {
  await ensureResvg();
  const resvg = new Resvg(svgText, {
    fitTo: { mode: "width", value: size }, // квадрат: width = height
    background: "transparent",
  });
  return resvg.render().asPng(); // Uint8Array
}

/* =========================
   PNG-набір
   ========================= */
export async function makePngSet(
  svgText: string
): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (const s of PNG_SIZES) {
    files[`icons/icon-${s}.png`] = await svgToPng(svgText, s);
  }
  // поширені імена
  files["icons/favicon-16x16.png"] = await svgToPng(svgText, 16);
  files["icons/favicon-32x32.png"] = await svgToPng(svgText, 32);
  files["icons/apple-touch-icon.png"] = await svgToPng(svgText, 180);
  return files;
}

/* =============================================================================
   favicon.ico (16/32/48) — реалізація без icojs/pngjs (чистий браузер).
   Ми створюємо ICO-контейнер, у який вкладаємо PNG-бінарники (це валідно з Vista).
   Формат:
     ICONDIR (6 байт) + N * ICONDIRENTRY (16 байт) + PNG-бінарники
   ============================================================================= */
function writeUint16LE(view: DataView, off: number, v: number) {
  view.setUint16(off, v, true);
}
function writeUint32LE(view: DataView, off: number, v: number) {
  view.setUint32(off, v, true);
}

function buildIcoFromPngs(
  images: { size: number; data: Uint8Array }[]
): Uint8Array {
  const count = images.length;
  const dirSize = 6 + 16 * count;

  // Підрахуємо повний розмір
  let totalSize = dirSize;
  for (const img of images) totalSize += img.data.length;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // ICONDIR header
  writeUint16LE(view, 0, 0); // reserved
  writeUint16LE(view, 2, 1); // type = 1 (icon)
  writeUint16LE(view, 4, count); // count

  // Directory entries
  let offset = dirSize;
  images.forEach((img, i) => {
    const base = 6 + 16 * i;
    const w = img.size;
    const h = img.size;
    u8[base + 0] = w >= 256 ? 0 : w; // 0 => 256 у ICO
    u8[base + 1] = h >= 256 ? 0 : h;
    u8[base + 2] = 0; // color count
    u8[base + 3] = 0; // reserved
    writeUint16LE(view, base + 4, 0); // planes
    writeUint16LE(view, base + 6, 32); // bit count (для PNG не критично, але ставимо 32)
    writeUint32LE(view, base + 8, img.data.length); // bytes in resource
    writeUint32LE(view, base + 12, offset); // image offset
    // скопіюємо PNG-дані
    u8.set(img.data, offset);
    offset += img.data.length;
  });

  return new Uint8Array(buf);
}

export async function makeIco(svgText: string): Promise<Uint8Array> {
  const sizes = [...ICO_SIZES];
  const pngs = await Promise.all(sizes.map((s) => svgToPng(svgText, s)));
  return buildIcoFromPngs(pngs.map((data, i) => ({ size: sizes[i], data })));
}

/* =========================
   site.webmanifest
   ========================= */
export function makeManifest(options: {
  name: string;
  short_name?: string;
  theme?: string;
  bg?: string;
}): string {
  const {
    name,
    short_name = name,
    theme = "#ffffff",
    bg = "#ffffff",
  } = options;

  const baseIcons = PWA_MAIN.map((s) => ({
    src: `/icons/icon-${s}.png`,
    sizes: `${s}x${s}`,
    type: "image/png",
    purpose: "any",
  }));

  const maskableIcons = MASKABLE_MAIN.map((s) => ({
    src: `/icons/icon-${s}.png`,
    sizes: `${s}x${s}`,
    type: "image/png",
    purpose: "maskable",
  }));

  return JSON.stringify(
    {
      name,
      short_name,
      icons: [...baseIcons, ...maskableIcons],
      theme_color: theme,
      background_color: bg,
      display: "standalone",
      start_url: "/",
    },
    null,
    2
  );
}

/* =========================
   Збір ZIP
   ========================= */
export async function buildZip(
  svgText: string,
  appName: string
): Promise<Blob> {
  const zip = new JSZip();

  // PNG
  const pngs = await makePngSet(svgText);
  for (const [path, data] of Object.entries(pngs)) {
    zip.file(path, data); // Uint8Array
  }

  // ICO
  const icoBytes = await makeIco(svgText);
  zip.file("icons/favicon.ico", icoBytes);

  // Manifest
  const manifest = makeManifest({ name: appName });
  zip.file("icons/site.webmanifest", manifest);

  return zip.generateAsync({ type: "blob" }); // готовий Blob ZIP
}

/* =========================
   Хелпер завантаження
   ========================= */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
