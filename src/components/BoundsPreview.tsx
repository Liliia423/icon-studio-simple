import { useEffect, useMemo, useRef, useState } from "react";
import { computeDarkCentroidFromImageBitmap } from "../lib/centroid";
import type { DarkCentroid } from "../lib/centroid";
import type { DeepPoint } from "../lib/deepPoint";
import { extractDarkComponentBoundsFromDeepPoint } from "../lib/darkComponent";

// ===================== constants (stable) =====================
const DEFAULT_MASK_DASH: number[] = [6, 4];
const DEFAULT_CENTROID_DASH: number[] = [4, 3];

// ============================ helpers ========================
type Rect = { x: number; y: number; w: number; h: number } | null;

function pixelDarkness(r: number, g: number, b: number) {
  // перцептивна яскравість → темрява
  return 255 - (0.2126 * r + 0.7152 * g + 0.0722 * b);
}

function drawChecker(
  ctx: CanvasRenderingContext2D,
  dim: number,
  cell = 16,
  a = "#fafafa",
  b = "#efefef"
) {
  for (let y = 0; y < dim; y += cell) {
    for (let x = 0; x < dim; x += cell) {
      const even = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
      ctx.fillStyle = even ? a : b;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

// Bounds лише по пікселях з alpha > threshold І темрявою >= minDarkness
function getDarkBoundsFromImage(
  image: ImageBitmap,
  dim: number,
  alphaThreshold: number,
  minDarkness: number
): Rect {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;
  const tctx = tmp.getContext("2d")!;
  tctx.clearRect(0, 0, dim, dim);
  tctx.drawImage(image, 0, 0, dim, dim);

  const { data, width, height } = tctx.getImageData(0, 0, dim, dim);

  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      const off = row + x * 4;
      const a = data[off + 3];
      if (a <= alphaThreshold) continue;

      const d = pixelDarkness(data[off], data[off + 1], data[off + 2]);
      if (d < minDarkness) continue; // відсікаємо світле

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function drawCircularClipMask(
  ctx: CanvasRenderingContext2D,
  dim: number,
  center: { cx: number; cy: number },
  radius: number,
  opts: { outsideAlpha?: number; dash?: number[] } = {}
) {
  const outside = Math.max(0, Math.min(1, opts.outsideAlpha ?? 0.16));
  ctx.save();
  // приглушити все полотно
  ctx.fillStyle = `rgba(0,0,0,${outside})`;
  ctx.fillRect(0, 0, dim, dim);
  // вирізати круглу safe-зону
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
  ctx.fill();
  // контур safe-зони
  ctx.globalCompositeOperation = "source-over";
  if (opts.dash?.length) ctx.setLineDash([...opts.dash]); // копія
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(center.cx, center.cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function strokeDashedCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color = "#6a1b9a",
  dash: number[] = [4, 3],
  lineWidth = 2
) {
  ctx.save();
  if (dash.length) ctx.setLineDash([...dash]); // копія
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// порівняння центроїдів, щоб не викликати setState без потреби
function sameCentroid(
  a: DarkCentroid | null,
  b: DarkCentroid | null,
  eps = 0.01
) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

// ============================ component =======================
export interface BoundsPreviewProps {
  image: ImageBitmap | null;
  size?: number;
  alphaThreshold?: number;

  showGuides?: boolean;
  //showCanvasFrame?: boolean;
  showImageBounds?: boolean;

  checkerA?: string;
  checkerB?: string;

  showDarkCentroid?: boolean;
  deepPoint?: DeepPoint | null;

  // clip-mask (центр = deepPoint)
  showClipMask?: boolean;
  safeRatio?: number; // 0..1 — частка від доступного r всередині PNG-bounds
  outsideAlpha?: number; // прозорість приглушення поза колом
  dash?: number[]; // пунктир для маски

  // виділення найтемнішого елемента
  focusBand?: number;
  minFocusArea?: number;

  // фіолетовий bound: відсікаємо світлі пікселі
  minDarkness?: number; // 0..255

  // коло навколо all-dark centroid
  showCentroidCircle?: boolean;
  centroidCircleRatio?: number; // 0..1
  centroidCircleDash?: number[];
  centroidCircleColor?: string;
}

export default function BoundsPreview({
  image,
  size = 512,
  alphaThreshold = 1,

  showGuides = true,
  //showCanvasFrame = false,
  showImageBounds = true,

  checkerA = "#fafafa",
  checkerB = "#efefef",
  showDarkCentroid = true,
  deepPoint = null,

  showClipMask = true,
  safeRatio = 0.9,
  outsideAlpha = 0.16,
  dash = DEFAULT_MASK_DASH,

  focusBand = 6,
  minFocusArea = 16,

  minDarkness = 24,

  showCentroidCircle = true,
  centroidCircleRatio = 0.9,
  centroidCircleDash = DEFAULT_CENTROID_DASH,
  centroidCircleColor = "#6a1b9a",
}: BoundsPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);

  // стабільні "ключі" замість масивів у залежностях useEffect
  const dashKey = useMemo(() => (dash ?? DEFAULT_MASK_DASH).join(","), [dash]);
  const cDashKey = useMemo(
    () => (centroidCircleDash ?? DEFAULT_CENTROID_DASH).join(","),
    [centroidCircleDash]
  );

  const [centroid, setCentroid] = useState<DarkCentroid | null>(null);
  const centroidRef = useRef<DarkCentroid | null>(null);

  useEffect(() => {
    let cancelled = false;

    // відновлюємо масиви з ключів — щоб не тягнути їх у deps
    const dashArr =
      dashKey.length > 0
        ? dashKey
            .split(",")
            .map(Number)
            .filter((n) => !Number.isNaN(n))
        : [];
    const cDashArr =
      cDashKey.length > 0
        ? cDashKey
            .split(",")
            .map(Number)
            .filter((n) => !Number.isNaN(n))
        : [];

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.max(1, (window.devicePixelRatio as number) || 1);
      canvas.width = Math.round(dim * dpr);
      canvas.height = Math.round(dim * dpr);
      canvas.style.width = `${dim}px`;
      canvas.style.height = `${dim}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // фон
      drawChecker(ctx, dim, 16, checkerA, checkerB);

      if (!image || cancelled) {
        {
          /*if (showCanvasFrame) {
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, dim - 2, dim - 2);
        }*/
        }
        if (!cancelled) {
          setCentroid(null);
          centroidRef.current = null;
        }
        return;
      }

      // PNG
      ctx.drawImage(image, 0, 0, dim, dim);

      // ФІОЛЕТОВИЙ bounds: тільки достатньо темні пікселі
      const b = getDarkBoundsFromImage(image, dim, alphaThreshold, minDarkness);
      if (showImageBounds && b) {
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#1E88E5";
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        ctx.restore();
      }

      // bounds найтемнішого елемента (від deepPoint)
      if (deepPoint) {
        const rb = extractDarkComponentBoundsFromDeepPoint(
          image,
          dim,
          deepPoint.x,
          deepPoint.y,
          alphaThreshold,
          focusBand,
          minFocusArea
        );
        if (rb) {
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#d32f2f";
          ctx.strokeRect(rb.x + 0.5, rb.y + 0.5, rb.w - 1, rb.h - 1);
          ctx.restore();
        }
      }

      // SAFE-ZONE маска (центр = deepPoint)
      if (showClipMask) {
        let cx = dim / 2,
          cy = dim / 2,
          r = (dim / 2) * safeRatio;
        if (deepPoint) {
          cx = deepPoint.x;
          cy = deepPoint.y;
          if (b) {
            const distL = cx - b.x;
            const distR = b.x + b.w - cx;
            const distT = cy - b.y;
            const distB = b.y + b.h - cy;
            const rMax = Math.max(0, Math.min(distL, distR, distT, distB));
            r = Math.max(8, rMax * safeRatio);
          }
        }
        drawCircularClipMask(ctx, dim, { cx, cy }, r, {
          outsideAlpha,
          dash: dashArr,
        });
      }

      // осі у куті
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dim - 6, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, dim - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dim - 6, 0);
      ctx.lineTo(dim - 12, -3);
      ctx.moveTo(dim - 6, 0);
      ctx.lineTo(dim - 12, 3);
      ctx.moveTo(0, dim - 6);
      ctx.lineTo(-3, dim - 12);
      ctx.moveTo(0, dim - 6);
      ctx.lineTo(3, dim - 12);
      ctx.stroke();
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText("0,0", 4, 11);
      ctx.fillText("x", dim - 14, 12);
      ctx.fillText("y", 5, dim - 8);
      ctx.restore();

      // центральні гіди
      if (showGuides) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#999";
        ctx.beginPath();
        ctx.moveTo(dim / 2, 0);
        ctx.lineTo(dim / 2, dim);
        ctx.moveTo(0, dim / 2);
        ctx.lineTo(dim, dim / 2);
        ctx.stroke();
        ctx.restore();
      }

      // рамка полотна
      {
        /*if (showCanvasFrame) {
        ctx.strokeStyle = "#e53935";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, dim - 2, dim - 2);
      }*/
      }

      // глобальний центроїд + коло
      if (showDarkCentroid) {
        const c1 = computeDarkCentroidFromImageBitmap(
          image,
          dim,
          alphaThreshold
        );

        // оновлюємо state тільки якщо суттєво змінилося
        if (!cancelled && !sameCentroid(centroidRef.current, c1)) {
          setCentroid(c1);
          centroidRef.current = c1;
        }

        if (c1) {
          // маркер центроїда
          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#6a1b9a";
          ctx.beginPath();
          ctx.moveTo(c1.x - 8, c1.y);
          ctx.lineTo(c1.x + 8, c1.y);
          ctx.moveTo(c1.x, c1.y - 8);
          ctx.lineTo(c1.x, c1.y + 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(c1.x, c1.y, 3.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // коло навколо центроїда (вписане у фіолетовий bound)
          if (showCentroidCircle && b) {
            const cx = c1.x;
            const cy = c1.y;
            const distL = cx - b.x;
            const distR = b.x + b.w - cx;
            const distT = cy - b.y;
            const distB = b.y + b.h - cy;
            const rMax = Math.max(0, Math.min(distL, distR, distT, distB));
            const r = Math.max(
              6,
              rMax * Math.max(0, Math.min(1, centroidCircleRatio))
            );
            strokeDashedCircle(
              ctx,
              cx,
              cy,
              r,
              centroidCircleColor,
              cDashArr,
              2
            );
          }
        }
      } else {
        if (!cancelled) {
          setCentroid(null);
          centroidRef.current = null;
        }
      }

      // 🔴 deepPoint (ромб + крапка)
      if (deepPoint) {
        const { x, y } = deepPoint;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#d32f2f";
        ctx.fillStyle = "#d32f2f";
        ctx.beginPath();
        ctx.moveTo(x, y - 8);
        ctx.lineTo(x + 6, y);
        ctx.lineTo(x, y + 8);
        ctx.lineTo(x - 6, y);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [
    image,
    dim,
    alphaThreshold,
    showGuides,
    //showCanvasFrame,
    showImageBounds,
    checkerA,
    checkerB,
    showDarkCentroid,
    deepPoint,
    showClipMask,
    safeRatio,
    outsideAlpha,
    focusBand,
    minFocusArea,
    minDarkness,
    showCentroidCircle,
    centroidCircleRatio,
    centroidCircleColor,
    dashKey, // стабільні ключі замість масивів
    cDashKey, // стабільні ключі замість масивів
  ]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}>
      <canvas
        ref={canvasRef}
        width={dim}
        height={dim}
        style={{
          width: dim,
          height: dim,
          borderRadius: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,.08)",
        }}
      />
      {centroid && (
        <div style={{ color: "#334", fontSize: 13 }}>
          all-dark centroid:&nbsp; x={centroid.x_bl.toFixed(1)}px (
          {centroid.x_pct.toFixed(2)}%),&nbsp; y={centroid.y_bl.toFixed(1)}px (
          {centroid.y_pct.toFixed(2)}%)
        </div>
      )}
    </div>
  );
}
