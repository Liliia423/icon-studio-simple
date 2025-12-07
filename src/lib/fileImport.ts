// src/lib/fileImport.ts
// ---------------------------------------------
//  ✨ ІМПОРТ ФАЙЛІВ З МАКСИМАЛЬНОЮ БЕЗПЕКОЮ
// ---------------------------------------------

export type ImportedSource =
  | { kind: "svg"; svgText: string }
  | { kind: "raster-svg"; svgText: string };

// підтримувані растрові MIME
const RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

// ---------------------------------------------
// 1. MIME + EXT + SIG (надійна перевірка файлу)
// ---------------------------------------------

async function sniffMime(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split(".").pop() || "";

  // 1) SVG
  if (ext === "svg") return "image/svg+xml";
  if (file.type === "image/svg+xml") return "image/svg+xml";

  // 2) Читаємо перші 32 байти
  const buf = new Uint8Array(await file.slice(0, 32).arrayBuffer());

  // PNG сигнатура
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];
  if (PNG_SIG.every((b, i) => buf[i] === b)) return "image/png";

  // JPG sig
  const JPG_SIG = [0xff, 0xd8, 0xff];
  if (JPG_SIG.every((b, i) => buf[i] === b)) return "image/jpeg";

  // WEBP: "RIFF" ... "WEBP"
  const isRiff =
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
  const isWebp =
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
  if (isRiff && isWebp) return "image/webp";

  // ICO: 00 00 01 00
  const ICO_SIG = [0x00, 0x00, 0x01, 0x00];
  if (ICO_SIG.every((b, i) => buf[i] === b)) return "image/x-icon";

  // Fallback — ненадійний!
  return file.type || "";
}

export function isSvgFile(file: File) {
  return /\.svg$/i.test(file.name) || file.type === "image/svg+xml";
}

export function isRasterFile(file: File) {
  const ext = file.name.toLowerCase();
  return /\.(png|jpe?g|webp|ico)$/i.test(ext) || RASTER_TYPES.has(file.type);
}

// ---------------------------------------------
// 2. SVG Санітизація (мінімальна, але безпечна)
// ---------------------------------------------

function sanitizeSvg(svg: string): string {
  let out = svg;

  // видалити <!-- коментарі -->
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // видалити <script>...</script>
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");

  // видалити foreignObject (небезпечний для XSS)
  out = out.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");

  // видалити inline on*="..."
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");

  // заборонити зовнішні посилання
  out = out.replace(
    /\s(href|xlink:href)\s*=\s*(['"])\s*https?:.*?\2/gi,
    ' $1=""'
  );

  // заборонити url(http...) у стилях
  out = out.replace(/url\(\s*['"]?https?:.*?\)/gi, "none");

  return out.trim();
}

// ---------------------------------------------
// 3. Читання SVG Як Текст
// ---------------------------------------------

async function readAsText(file: File): Promise<string> {
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result || ""));
    fr.readAsText(file);
  });
}

// ---------------------------------------------
// 4. Читання растра як ImageBitmap (ICO-friendly)
// ---------------------------------------------

async function readAsBitmap(file: File): Promise<ImageBitmap> {
  // createImageBitmap(file) інколи падає на ICO → робимо Blob URL
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      return bmp;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

// ---------------------------------------------
// 5. Рендер растра → PNG DataURL у квадрат
// ---------------------------------------------

async function rasterToPngDataURL(
  img: ImageBitmap,
  dim: number,
  paddingPct = 0
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, dim, dim);

  const pad = Math.max(0, Math.min(0.2, paddingPct));
  const box = dim * (1 - pad * 2);
  const scale = Math.min(box / img.width, box / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (dim - w) / 2;
  const y = (dim - h) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, w, h);

  return canvas.toDataURL("image/png");
}

// ---------------------------------------------
// 6. Обгортання PNG → SVG
// ---------------------------------------------

export function wrapPngInSvg(pngDataURL: string, dim: number): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg"
     width="${dim}" height="${dim}"
     viewBox="0 0 ${dim} ${dim}">
  <image href="${pngDataURL}"
         x="0" y="0"
         width="${dim}" height="${dim}"
         preserveAspectRatio="xMidYMid meet"/>
</svg>`.trim();
}

// ---------------------------------------------
// 7. Універсальний імпорт файлу
// ---------------------------------------------

export async function importIconFile(
  file: File,
  dim = 512,
  paddingPct = 0
): Promise<ImportedSource> {
  const mime = await sniffMime(file);

  // SVG
  if (mime === "image/svg+xml") {
    const raw = await readAsText(file);
    const safe = sanitizeSvg(raw);
    return { kind: "svg", svgText: safe };
  }

  // RASTER → SVG
  if (isRasterFile(file)) {
    const bmp = await readAsBitmap(file);
    const dataURL = await rasterToPngDataURL(bmp, dim, paddingPct);
    const svg = wrapPngInSvg(dataURL, dim);
    return { kind: "raster-svg", svgText: svg };
  }

  throw new Error("Непідтримуваний формат. Обери SVG/PNG/JPG/WEBP/ICO.");
}
