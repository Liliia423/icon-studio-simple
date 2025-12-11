// src/lib/darkComponent.ts
export type Rect = { x: number; y: number; w: number; h: number } | null;

function pixelDarkness(r: number, g: number, b: number) {
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 255 - lum;
}

/**
 * BFS-флуд-філ від deepPoint.
 * Включаємо пікселі з alpha > alphaThreshold і darkness >= (darkMax - band).
 * Повертає bounds знайденого компоненту або null.
 */
export function extractDarkComponentBoundsFromDeepPoint(
  image: ImageBitmap,
  dim: number,
  deepX: number,
  deepY: number,
  alphaThreshold = 1,
  band = 6,
  minArea = 16
): Rect {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;
  const ctx = tmp.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, dim, dim);
  const { data, width, height } = ctx.getImageData(0, 0, dim, dim);

  // 1) знайдемо максимальну темряву (для порога)
  let darkMax = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;
      const a = data[off + 3];
      if (a <= alphaThreshold) continue;
      const d = pixelDarkness(data[off], data[off + 1], data[off + 2]);
      if (d > darkMax) darkMax = d;
    }
  }
  if (darkMax <= 0) return null;

  const thr = darkMax - band;

  // 2) BFS від deepPoint
  const qx: number[] = [];
  const qy: number[] = [];
  const seen = new Uint8Array(width * height);
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (seen[idx]) return;

    const off = (y * width + x) * 4;
    const a = data[off + 3];
    if (a <= alphaThreshold) return;

    const d = pixelDarkness(data[off], data[off + 1], data[off + 2]);
    if (d < thr) return;

    seen[idx] = 1;
    qx.push(x);
    qy.push(y);
  };

  push(deepX | 0, deepY | 0);
  if (qx.length === 0) return null;

  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    count = 0;

  while (qx.length) {
    const x = qx.pop()!;
    const y = qy.pop()!;
    // bounds
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    count++;

    // 8-сусідство
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
    push(x + 1, y + 1);
    push(x - 1, y + 1);
    push(x + 1, y - 1);
    push(x - 1, y - 1);
  }

  if (count < minArea) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
