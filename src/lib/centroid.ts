/// src/lib/centroid.ts

export type DarkCentroid = {
  x: number; // canvas Y-down
  y: number;
  x_bl: number; // від лівого-нижнього кута
  y_bl: number;
  x_pct: number;
  y_pct: number;
} | null;

// допоміжна: обчислюємо «темряву» пікселя
function pixelDarkness(r: number, g: number, b: number) {
  // лінійна яскравість
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - lum; // чим більше — тим темніше
}

/**
 * Центр мас усіх темних пікселів (зважений по темряві).
 * Це той центроїд, який у тебе вже був.
 */
export function computeDarkCentroidFromImageBitmap(
  image: ImageBitmap,
  dim: number,
  alphaThreshold = 1
): DarkCentroid {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;
  const tctx = tmp.getContext("2d");
  if (!tctx) return null;

  tctx.clearRect(0, 0, dim, dim);
  tctx.drawImage(image, 0, 0, dim, dim);

  const { data, width, height } = tctx.getImageData(0, 0, dim, dim);

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      const a = data[off + 3];
      if (a <= alphaThreshold) continue;

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

  const x_bl = cx;
  const y_bl = height - 1 - cy;

  const x_pct = (x_bl / (width - 1)) * 100;
  const y_pct = (y_bl / (height - 1)) * 100;

  return { x: cx, y: cy, x_bl, y_bl, x_pct, y_pct };
}

/**
 * Центр мас *найтемнішої області*:
 * 1) шукаємо максимальну "темряву" (darknessMax)
 * 2) беремо пікселі з темрявою >= darknessMax - band
 * 3) рахуємо їх геометричний центроїд
 */
export function computeDarkestRegionCentroidFromImageBitmap(
  image: ImageBitmap,
  dim: number,
  alphaThreshold = 1,
  band: number = 6 // ширина «коридору» навколо найтемніших
): DarkCentroid {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;
  const tctx = tmp.getContext("2d");
  if (!tctx) return null;

  tctx.clearRect(0, 0, dim, dim);
  tctx.drawImage(image, 0, 0, dim, dim);

  const { data, width, height } = tctx.getImageData(0, 0, dim, dim);

  let darknessMax = 0;

  // 1-й прохід — знайти максимально темний піксель
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      const a = data[off + 3];
      if (a <= alphaThreshold) continue;

      const d = pixelDarkness(r, g, b);
      if (d > darknessMax) darknessMax = d;
    }
  }

  if (darknessMax <= 0) return null;

  const threshold = darknessMax - band;

  // 2-й прохід — центроїд тільки найтемніших пікселів
  let count = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      const a = data[off + 3];
      if (a <= alphaThreshold) continue;

      const d = pixelDarkness(r, g, b);
      if (d < threshold) continue;

      count++;
      sumX += x;
      sumY += y;
    }
  }

  if (count === 0) return null;

  const cx = sumX / count;
  const cy = sumY / count;

  const x_bl = cx;
  const y_bl = height - 1 - cy;

  const x_pct = (x_bl / (width - 1)) * 100;
  const y_pct = (y_bl / (height - 1)) * 100;

  return { x: cx, y: cy, x_bl, y_bl, x_pct, y_pct };
}
