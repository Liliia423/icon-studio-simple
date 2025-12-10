/// src/lib/centroid.ts

export type DarkCentroid = {
  /** canvas X-right */
  x: number;
  /** canvas Y-down */
  y: number;

  /** X від лівого-нижнього кута (bottom-left) */
  x_bl: number;
  /** Y від лівого-нижнього кута (bottom-left) */
  y_bl: number;

  /** X у відсотках від ширини [0..100] */
  x_pct: number;
  /** Y у відсотках від висоти [0..100] */
  y_pct: number;
} | null;

/** Обчислюємо «темряву» пікселя (чим більше — тим темніше). */
function pixelDarkness(r: number, g: number, b: number): number {
  // Перцептивна лінійна яскравість (sRGB)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - lum;
}

/**
 * Центр мас усіх *непрозорих* (α > alphaThreshold) пікселів,
 * зважений за темрявою (чим темніше, тим більша вага).
 *
 * @param image ImageBitmap з іконкою
 * @param dim   розмір квадратного канваса (наприклад, 512)
 * @param alphaThreshold поріг прозорості (0..255), пікселі з α <= threshold ігноруються
 * @returns координати центроїда або null, якщо не знайдено валідних пікселів
 */
export function computeDarkCentroidFromImageBitmap(
  image: ImageBitmap,
  dim: number,
  alphaThreshold = 1
): DarkCentroid {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;

  const ctx = tmp.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, dim, dim);
  ctx.drawImage(image, 0, 0, dim, dim);

  const { data, width, height } = ctx.getImageData(0, 0, dim, dim);

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;

      const a = data[off + 3];
      if (a <= alphaThreshold) continue;

      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];

      const w = pixelDarkness(r, g, b);
      if (w <= 0) continue;

      sumW += w;
      sumX += x * w;
      sumY += y * w;
    }
  }

  if (sumW === 0) return null;

  const cx = sumX / sumW;
  const cy = sumY / sumW;

  // Перевід у систему з відліком від лівого-нижнього кута
  const x_bl = cx;
  const y_bl = height - 1 - cy;

  // Відсоткові координати
  const x_pct = (x_bl / (width - 1)) * 100;
  const y_pct = (y_bl / (height - 1)) * 100;

  return { x: cx, y: cy, x_bl, y_bl, x_pct, y_pct };
}
