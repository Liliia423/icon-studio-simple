import { useEffect, useMemo, useRef, useState } from "react";
import { ensureResvg, svgToPng } from "../lib/generate";

type MaskKind = "none" | "circle" | "squircle" | "rounded" | "teardrop";

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
  outsideMaskTint?: string; // rgba(255,0,0,.06)
  /** Кольори шахматки */
  checkerColorA?: string;
  checkerColorB?: string;
}

/* =========================
   Утиліти для малювання
   ========================= */

function drawSuperellipsePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  p = 4,
  steps = 256
) {
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    // sign-preserving power
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
  r: number
) {
  // Симетрична «крапля»: верх гостріший, низ округлий.
  const top = { x: cx, y: cy - r * 0.95 };
  const right = { x: cx + r * 0.92, y: cy - r * 0.05 };
  const bottom = { x: cx, y: cy + r * 0.98 };
  const left = { x: cx - r * 0.92, y: cy - r * 0.05 };

  ctx.beginPath();
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

/** Uint8Array -> ImageBitmap без конфліктів типів */
async function bytesToBitmap(bytes: Uint8Array): Promise<ImageBitmap> {
  // створюємо новий ArrayBuffer (не SharedArrayBuffer)
  const view = new Uint8Array(bytes.byteLength); // view.buffer: ArrayBuffer
  view.set(bytes); // копіюємо байти

  const blob = new Blob([view], { type: "image/png" }); // BlobPart = ArrayBufferView<ArrayBuffer>
  return await createImageBitmap(blob);
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

      canvas.width = dim;
      canvas.height = dim;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // фон: шахматка
      drawChecker(ctx, dim, 16, checkerColorA, checkerColorB);

      try {
        await ensureResvg();
        const pngBytes = await svgToPng(svgText, dim);
        if (cancelled) return;

        const img = await bytesToBitmap(pngBytes);
        if (cancelled) return;

        // маска
        const cx = dim / 2;
        const cy = dim / 2;
        const radius = dim / 2;

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
              drawSuperellipsePath(ctx, cx, cy, radius, radius, 4, 360);
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
              drawTeardropPath(ctx, cx, cy, radius * 0.98);
              ctx.clip();
              break;
          }
        }

        // зображення
        ctx.drawImage(img, 0, 0, dim, dim);
        ctx.restore();

        // тінт поза маскою — “can be masked away”
        if (mask !== "none") {
          ctx.save();
          ctx.fillStyle = outsideMaskTint;

          ctx.beginPath();
          ctx.rect(0, 0, dim, dim);

          switch (mask) {
            case "circle":
              ctx.moveTo(cx + radius, cy);
              ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
              break;
            case "squircle":
              drawSuperellipsePath(ctx, cx, cy, radius, radius, 4, 360);
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
              drawTeardropPath(ctx, cx, cy, radius * 0.98);
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
  ]);

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
      }}
    >
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
      {error && (
        <div
          style={{
            color: "#b00020",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco",
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          color: "#666",
          fontSize: 12,
          userSelect: "none",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        Mask: <code>{mask}</code> • {dim}×{dim}px • bleed{" "}
        {Math.round(bleedPct * 100)}% • safe {Math.round(safePct * 100)}% • key{" "}
        {Math.round(keyPct * 100)}%
      </div>
    </div>
  );
}
