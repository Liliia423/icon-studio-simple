// src/lib/fileImport.ts
export type ImportedSource =
  | { kind: "svg"; svgText: string }
  | { kind: "raster-svg"; svgText: string }; // растр, загорнутий у SVG

const RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/x-icon", // .ico
  "image/vnd.microsoft.icon",
]);

export function isSvgFile(file: File) {
  return file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
}

export function isRasterFile(file: File) {
  return (
    RASTER_TYPES.has(file.type) || /\.(png|jpe?g|webp|ico)$/i.test(file.name)
  );
}

/** Прочитати файл як текст */
async function readAsText(file: File): Promise<string> {
  return await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error);
    fr.onload = () => res(String(fr.result || ""));
    fr.readAsText(file);
  });
}

/** Прочитати файл як ImageBitmap */
async function readAsImageBitmap(file: File): Promise<ImageBitmap> {
  return await createImageBitmap(file);
}

/** Намалювати растрове зображення у квадратному canvas і повернути dataURL PNG */
async function rasterToPngDataURL(
  img: ImageBitmap,
  dim: number,
  paddingPct = 0 // 0..0.2 (наприклад, 0.1 = 10%)
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, dim, dim);

  // вписуємо зі збереженням пропорцій
  const pad = Math.max(0, Math.min(0.2, paddingPct));
  const box = dim * (1 - 2 * pad);
  const scale = Math.min(box / img.width, box / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const x = Math.round((dim - w) / 2);
  const y = Math.round((dim - h) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, w, h);

  return canvas.toDataURL("image/png"); // data:image/png;base64,...
}

/** Обгорнути PNG-dataURL у SVG квадрат dim×dim */
export function wrapPngInSvg(pngDataURL: string, dim: number): string {
  // preserveAspectRatio="xMidYMid meet" залишає пусті поля, якщо пропорції не 1:1
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}">
  <image href="${pngDataURL}" x="0" y="0" width="${dim}" height="${dim}" preserveAspectRatio="xMidYMid meet"/>
</svg>`.trim();
}

/** Універсальний імпорт одного файлу у потрібний формат для пайплайна */
export async function importIconFile(
  file: File,
  dim = 512,
  paddingPct = 0
): Promise<ImportedSource> {
  if (isSvgFile(file)) {
    const txt = await readAsText(file);
    return { kind: "svg", svgText: txt };
  }
  if (isRasterFile(file)) {
    const bmp = await readAsImageBitmap(file);
    const dataURL = await rasterToPngDataURL(bmp, dim, paddingPct);
    const svg = wrapPngInSvg(dataURL, dim);
    return { kind: "raster-svg", svgText: svg };
  }
  throw new Error("Непідтримуваний формат. Обери SVG/PNG/JPG/WEBP/ICO.");
}
