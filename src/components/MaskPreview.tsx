import { useEffect, useMemo, useRef, useState } from "react";
import { ensureResvg, svgToPng } from "../lib/generate";
import styles from "./MaskPreview.module.css";

/** Типи */
type MaskKind = "none" | "circle" | "squircle" | "rounded" | "teardrop";
type BoundsMode = "pre" | "post";
type ImageMode = "contain" | "cover" | "manual";

export interface MaskPreviewProps {
  svgText: string;
  /** Розмір полотна (квадрат), px */
  size?: number;
  /** Тип маски */
  mask?: MaskKind;
  /** Показувати гіди 70%/80% + bleed */
  showGuides?: boolean;
  /** Частка зовнішнього bleed (може бути обрізано системою) */
  bleedPct?: number; // 0.10 → 10%
  /** Безпечна зона — повна іконка має вміститись сюди */
  safePct?: number; // 0.80 → 80%
  /** Ключова зона — ядро композиції */
  keyPct?: number; // 0.70 → 70%
  /** Колір тінту поза маскою (імітація “can be masked away”) */
  outsideMaskTint?: string;
  /** Кольори шахматки */
  checkerColorA?: string;
  checkerColorB?: string;

  /** Показувати рамки реальних меж зображення */
  showBounds?: boolean;
  /** Де міряти межі: до маски (pre) / після (post) */
  boundsMode?: BoundsMode;

  /** Масштаб маски відносно розміру canvas (0..1). 1 = по краю */
  maskScale?: number;

  /** Як вписувати картинку у canvas */
  imageMode?: ImageMode; // "contain" | "cover" | "manual"
  /** Масштаб картинки для режиму "manual" (1 = 100%) */
  imageScale?: number;
}

/* =========================
   Утиліти
   ========================= */

function drawSuperellipsePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  p = 4,
  steps = 256,
  startNewPath = true
) {
  if (startNewPath) ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p) * rx;
    const y = Math.sign(st) * Math.pow(Math.abs(st), 2 / p) * ry;
    const px = cx + x;
    const py = cy + y;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawTeardropPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  startNewPath = true
) {
  const top = { x: cx, y: cy - r * 0.95 };
  const right = { x: cx + r * 0.92, y: cy - r * 0.05 };
  const bottom = { x: cx, y: cy + r * 0.98 };
  const left = { x: cx - r * 0.92, y: cy - r * 0.05 };

  if (startNewPath) ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.quadraticCurveTo(cx + r * 0.75, cy - r * 0.75, right.x, right.y);
  ctx.quadraticCurveTo(cx + r * 0.85, cy + r * 0.6, bottom.x, bottom.y);
  ctx.quadraticCurveTo(cx - r * 0.85, cy + r * 0.6, left.x, left.y);
  ctx.quadraticCurveTo(cx - r * 0.75, cy - r * 0.75, top.x, top.y);
  ctx.closePath();
}

function drawChecker(
  ctx: CanvasRenderingContext2D,
  size: number,
  cell = 16,
  a = "#fafafa",
  b = "#efefef"
) {
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const even = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
      ctx.fillStyle = even ? a : b;
      ctx.fillRect(x, y, cell, cell);
    }
  }
}

/** Uint8Array -> ImageBitmap */
async function bytesToBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  const view = new Uint8Array(bytes.byteLength);
  view.set(bytes);
  const blob = new Blob([view], { type: "image/png" });
  return await createImageBitmap(blob);
}

/** Межі непрозорих пікселів у логічному розмірі dim×dim */
function getAlphaBoundsFromCanvas(srcCanvas: HTMLCanvasElement, dim: number) {
  const tmp = document.createElement("canvas");
  tmp.width = dim;
  tmp.height = dim;
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(srcCanvas, 0, 0, dim, dim);

  const { data, width, height } = tctx.getImageData(0, 0, dim, dim);
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  const TH = 1;

  for (let y = 0; y < height; y++) {
    const off = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = data[off + x * 4 + 3];
      if (a > TH) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/* =========================
   Компонент
   ========================= */

export default function MaskPreview({
  svgText,
  size = 512,
  mask = "circle",
  showGuides = true,
  bleedPct = 0.1,
  safePct = 0.8,
  keyPct = 0.7,
  outsideMaskTint = "rgba(255,0,0,0.06)",
  checkerColorA = "#fafafa",
  checkerColorB = "#efefef",
  showBounds = false,
  boundsMode = "post",
  maskScale = 1,
  imageMode = "contain",
  imageScale = 1,
}: MaskPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      setError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(dim * dpr);
      canvas.height = Math.round(dim * dpr);
      canvas.style.width = `${dim}px`;
      canvas.style.height = `${dim}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // фон
      drawChecker(ctx, dim, 16, checkerColorA, checkerColorB);

      if (!svgText.trim()) return;

      try {
        try {
          await ensureResvg();
        } catch {
          if (!cancelled)
            setError("resvg (WASM) не завантажився. Онови сторінку.");
          return;
        }

        const pngBytes = await svgToPng(svgText, dim);
        if (cancelled) return;

        const img = await bytesToBitmap(pngBytes);
        if (cancelled) {
          img.close?.();
          return;
        }

        // межі ДО маски (pre) — якщо потрібно
        let preBounds: { x: number; y: number; w: number; h: number } | null =
          null;
        if (showBounds && boundsMode === "pre") {
          const tmp = document.createElement("canvas");
          tmp.width = dim;
          tmp.height = dim;
          const tctx = tmp.getContext("2d")!;
          tctx.drawImage(img, 0, 0, dim, dim);
          preBounds = getAlphaBoundsFromCanvas(tmp, dim);
        }

        // маска
        const cx = dim / 2;
        const cy = dim / 2;
        const fullRadius = dim / 2;
        const radius = fullRadius * Math.max(0, Math.min(1, maskScale));

        ctx.save();
        if (mask !== "none") {
          switch (mask) {
            case "circle":
              ctx.beginPath();
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
              ctx.closePath();
              ctx.clip();
              break;
            case "squircle":
              drawSuperellipsePath(ctx, cx, cy, radius, radius, 4, 360, true);
              ctx.clip();
              break;
            case "rounded": {
              const r = Math.min(dim * 0.22, radius);
              const x = 0,
                y = 0,
                w = dim,
                h = dim;
              ctx.beginPath();
              ctx.moveTo(x + r, y);
              ctx.arcTo(x + w, y, x + w, y + h, r);
              ctx.arcTo(x + w, y + h, x, y + h, r);
              ctx.arcTo(x, y + h, x, y, r);
              ctx.arcTo(x, y, x + w, y, r);
              ctx.closePath();
              ctx.clip();
              break;
            }
            case "teardrop":
              drawTeardropPath(ctx, cx, cy, radius * 0.98, true);
              ctx.clip();
              break;
          }
        }

        // як малювати картинку (незалежно від маски)
        let dx = 0,
          dy = 0,
          dw = dim,
          dh = dim;

        if (imageMode === "contain") {
          // resvg уже дав квадрат dim×dim — залишаємо 1:1
          dw = dh = dim;
          dx = dy = 0;
        } else if (imageMode === "cover") {
          // трохи збільшуємо, щоб точно покрити круглу/сквіркульну маску
          const k = Math.SQRT2; // ~1.414 — гарантовано покриває коло всередині квадрата
          dw = dh = dim * k;
          dx = (dim - dw) / 2;
          dy = (dim - dh) / 2;
        } else if (imageMode === "manual") {
          const k = Math.max(0.1, imageScale);
          dw = dh = dim * k;
          dx = (dim - dw) / 2;
          dy = (dim - dh) / 2;
        }

        ctx.drawImage(img, dx, dy, dw, dh);
        img.close?.();
        ctx.restore();

        // підсвітка поза маскою
        if (mask !== "none") {
          ctx.save();
          ctx.fillStyle = outsideMaskTint;
          ctx.beginPath();
          ctx.rect(0, 0, dim, dim); // зовнішній контур
          switch (mask) {
            case "circle":
              ctx.moveTo(cx + radius, cy);
              ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
              break;
            case "squircle":
              drawSuperellipsePath(ctx, cx, cy, radius, radius, 4, 360, false);
              break;
            case "rounded": {
              const r = Math.min(dim * 0.22, radius);
              const x = 0,
                y = 0,
                w = dim,
                h = dim;
              ctx.moveTo(x + r, y);
              ctx.arcTo(x + w, y, x + w, y + h, r);
              ctx.arcTo(x + w, y + h, x, y + h, r);
              ctx.arcTo(x, y + h, x, y, r);
              ctx.arcTo(x, y, x + w, y, r);
              ctx.closePath();
              break;
            }
            case "teardrop":
              drawTeardropPath(ctx, cx, cy, radius * 0.98, false);
              break;
          }
          ctx.fill("evenodd");
          ctx.restore();
        }

        // гіди
        if (showGuides) {
          const line = (color: string, width: number, dash: number[] = []) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.setLineDash(dash);
          };

          // рамка
          line("#888", 1);
          ctx.strokeRect(0.5, 0.5, dim - 1, dim - 1);

          // bleed
          const bleedInset = dim * bleedPct;
          const bleedSize = dim - bleedInset * 2;
          line("#2e7d32", 2, [6, 6]);
          ctx.strokeRect(
            0.5 + bleedInset,
            0.5 + bleedInset,
            bleedSize - 1,
            bleedSize - 1
          );

          // safe 80%
          const safe = dim * safePct;
          const safeXY = (dim - safe) / 2;
          line("#1565c0", 2, [10, 6]);
          ctx.strokeRect(0.5 + safeXY, 0.5 + safeXY, safe - 1, safe - 1);

          // key 70%
          const key = dim * keyPct;
          const keyXY = (dim - key) / 2;
          line("#ef6c00", 2, [4, 6]);
          ctx.strokeRect(0.5 + keyXY, 0.5 + keyXY, key - 1, key - 1);

          // центр
          line("#999", 1, [4, 4]);
          ctx.beginPath();
          ctx.moveTo(dim / 2, 0);
          ctx.lineTo(dim / 2, dim);
          ctx.moveTo(0, dim / 2);
          ctx.lineTo(dim, dim / 2);
          ctx.stroke();
        }

        // рамки меж (bounds)
        if (showBounds) {
          // 🔴 область вписування (весь квадрат превʼю)
          ctx.save();
          ctx.setLineDash([]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#e53935";
          ctx.strokeRect(1, 1, dim - 2, dim - 2);
          ctx.restore();

          // 🔵 межі контенту
          const b =
            boundsMode === "pre"
              ? preBounds
              : getAlphaBoundsFromCanvas(canvas, dim);

          if (b) {
            ctx.save();
            ctx.setLineDash([8, 4]);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#8e24aa"; // фіолетова рамка bounds
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);

            // маленький ярличок у кутку, щоб знати pre/post
            ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI";
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            const label = boundsMode === "pre" ? "bounds: pre" : "bounds: post";
            const pad = 6;
            const tw = ctx.measureText(label).width;
            const th = 14;
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillRect(b.x + 1, b.y - th - 2, tw + pad * 2, th + 2);
            ctx.fillStyle = "#5e35b1";
            ctx.fillText(label, b.x + pad + 1, b.y - 6);
            ctx.restore();
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [
    svgText,
    dim,
    mask,
    showGuides,
    bleedPct,
    safePct,
    keyPct,
    outsideMaskTint,
    checkerColorA,
    checkerColorB,
    showBounds,
    boundsMode,
    maskScale,
    imageMode,
    imageScale,
  ]);

  return (
    <div className={styles.maskpreview}>
      <canvas
        ref={canvasRef}
        width={dim}
        height={dim}
        className={styles.canvas}
        style={{
          width: dim,
          height: dim,
          borderRadius: 12,
          boxShadow: "0 6px 18px rgba(0,0,0,.08)",
        }}
      />
      {error && <div className={styles.maskerror}>{error}</div>}
      <div className={styles.masksize}>
        Mask: <code>{mask}</code> • {dim}×{dim}px • bleed{" "}
        {Math.round(bleedPct * 100)}% • safe {Math.round(safePct * 100)}% • key{" "}
        {Math.round(keyPct * 100)}%
      </div>
    </div>
  );
}
