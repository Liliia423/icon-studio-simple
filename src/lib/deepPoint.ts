// src/lib/deepPoint.ts
export interface DeepPoint {
  x: number; // canvas coords (top-left origin)
  y: number;
  x_pct: number;
  y_pct: number;
  score: number;
}

/** Параметри пошуку найглибшої темної точки */
export interface DeepPointOpts {
  alphaThreshold?: number; // >0 => піксель враховуємо
  darkThreshold?: number; // 0..1: наскільки темним вважати піксель
  gamma?: number; // 1.0..2.2 корекція яскравості
  pDark?: number; // ступінь впливу темряви
  pDist?: number; // ступінь впливу глибини
  erodePx?: number; // "сточити" краї на стільки пікселів
  clipCirclePct?: number; // 0..1 радіус кола всередині bounds; 0 => без кліпу
}

/** обчислює найглибшу темну точку (dark+distance) */
export async function computeDeepestDarkPointFromImageBitmap(
  image: ImageBitmap,
  dim: number,
  opts: DeepPointOpts = {}
): Promise<DeepPoint | null> {
  const {
    alphaThreshold = 1,
    darkThreshold = 0.35, // все темніше вважаємо кандидатами
    gamma = 2.2,
    pDark = 1.0,
    pDist = 1.0,
    erodePx = 0, // 1..3 приглушує спайки
    clipCirclePct = 0, // напр. 0.85, щоб урізати крайні "промені"
  } = opts;

  // оффскрін
  const c = document.createElement("canvas");
  c.width = dim;
  c.height = dim;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, dim, dim);
  const { data, width, height } = ctx.getImageData(0, 0, dim, dim);

  // маска кандидатів (темні & непрозорі)
  const cand = new Uint8Array(width * height);
  const alphaOK = (a: number) => a > alphaThreshold;
  const toLuma = (r: number, g: number, b: number) => {
    // sRGB -> approx luma with gamma
    const lin = (v: number) => Math.pow(v / 255, gamma);
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L; // 0..1
  };

  // межі PNG-контенту (для clipCirclePct)
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;

  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const a = data[i + 3];
      if (a <= 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const rClip =
    clipCirclePct > 0
      ? Math.min(maxX - minX, maxY - minY) * 0.5 * clipCirclePct
      : 0;

  // позначаємо кандидата
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      const a = data[i + 3];
      if (!alphaOK(a)) {
        cand[y * width + x] = 0;
        continue;
      }

      if (rClip > 0) {
        const dx = x - cx,
          dy = y - cy;
        if (dx * dx + dy * dy > rClip * rClip) {
          cand[y * width + x] = 0;
          continue;
        }
      }

      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const L = toLuma(r, g, b); // 0..1 (0=чорний)
      cand[y * width + x] = L <= darkThreshold ? 1 : 0;
    }
  }

  // легка erosion (манхеттен) щоб прибрати тонкі "промені"
  if (erodePx > 0) {
    const tmp = cand.slice();
    for (let pass = 0; pass < erodePx; pass++) {
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          if (!tmp[idx]) {
            cand[idx] = 0;
            continue;
          }
          const sum =
            tmp[idx - 1] + tmp[idx + 1] + tmp[idx - width] + tmp[idx + width];
          if (sum <= 1) cand[idx] = 0;
        }
      }
      tmp.set(cand);
    }
  }

  // distance transform до НЕ-кандидата (фон/світле/за кліпом)
  const INF = 1e9;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = cand[i] ? INF : 0;

  // 2-прохідний chamfer DT (манхеттен-|≈евклід без sqrt для швидкості)
  const w = width,
    h = height;
  // forward
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x > 0 && dist[i - 1] + 1 < d) d = dist[i - 1] + 1;
      if (y > 0 && dist[i - w] + 1 < d) d = dist[i - w] + 1;
      if (x > 0 && y > 0 && dist[i - w - 1] + 1.4142 < d)
        d = dist[i - w - 1] + 1.4142;
      if (x < w - 1 && y > 0 && dist[i - w + 1] + 1.4142 < d)
        d = dist[i - w + 1] + 1.4142;
      dist[i] = d;
    }
  }
  // backward
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x < w - 1 && dist[i + 1] + 1 < d) d = dist[i + 1] + 1;
      if (y < h - 1 && dist[i + w] + 1 < d) d = dist[i + w] + 1;
      if (x < w - 1 && y < h - 1 && dist[i + w + 1] + 1.4142 < d)
        d = dist[i + w + 1] + 1.4142;
      if (x > 0 && y < h - 1 && dist[i + w - 1] + 1.4142 < d)
        d = dist[i + w - 1] + 1.4142;
      dist[i] = Math.min(dist[i], d);
    }
  }

  // пошук максимуму score
  let bestI = -1,
    bestScore = -1,
    maxD = 0;
  for (let i = 0; i < dist.length; i++) if (dist[i] > maxD) maxD = dist[i];
  if (maxD <= 0) return null;

  for (let y = 0, k = 0; y < h; y++) {
    for (let x = 0; x < w; x++, k++) {
      if (!cand[k]) continue;
      const dNorm = dist[k] / maxD;
      // темрява знову порахуємо точніше (без порогу)
      const i = (y * w + x) * 4;
      const L = toLuma(data[i], data[i + 1], data[i + 2]);
      const darkness = Math.max(0, 1 - L);
      const score = Math.pow(darkness, pDark) * Math.pow(dNorm, pDist);
      if (score > bestScore) {
        bestScore = score;
        bestI = k;
      }
    }
  }
  if (bestI < 0) return null;

  const bx = bestI % w,
    by = (bestI / w) | 0;
  return {
    x: bx,
    y: by,
    x_pct: (bx / (w - 1)) * 100,
    y_pct: (by / (h - 1)) * 100,
    score: bestScore,
  };
}
