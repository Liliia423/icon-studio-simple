import { useEffect, useMemo, useRef, useState } from "react";
import { computeDarkCentroidFromImageBitmap } from "../lib/centroid";
import type { DarkCentroid } from "../lib/centroid";
import type { DeepPoint } from "../lib/deepPoint";

export interface BoundsPreviewProps {
  image: ImageBitmap | null;
  size?: number;
  alphaThreshold?: number;

  showGuides?: boolean; // сірі перехрестя по центру
  showCanvasFrame?: boolean; // червона рамка полотна
  showImageBounds?: boolean; // фіолетові bounds PNG

  checkerA?: string;
  checkerB?: string;

  showDarkCentroid?: boolean; // показувати глобальний центроїд
  deepPoint?: DeepPoint | null;
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

function getAlphaBoundsFromImage(
  image: ImageBitmap,
  dim: number,
  alphaThreshold: number
) {
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
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export default function BoundsPreview({
  image,
  size = 512,
  alphaThreshold = 1,

  showGuides = true,
  showCanvasFrame = true,
  showImageBounds = true,

  checkerA = "#fafafa",
  checkerB = "#efefef",
  showDarkCentroid = true,
  deepPoint = null,
}: BoundsPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);

  const [err, setErr] = useState<string | null>(null);
  const [centroid, setCentroid] = useState<DarkCentroid | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = () => {
      setErr(null);
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
      drawChecker(ctx, dim, 16, checkerA, checkerB);

      // якщо зображення відсутнє — лише рамка
      if (!image || cancelled) {
        if (showCanvasFrame) {
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, dim - 2, dim - 2);
        }
        if (!cancelled) setCentroid(null);
        return;
      }

      // PNG 1:1
      ctx.drawImage(image, 0, 0, dim, dim);

      // малі осі у куті
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
      if (showCanvasFrame) {
        ctx.strokeStyle = "#e53935";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, dim - 2, dim - 2);
      }

      // bounds PNG
      if (showImageBounds) {
        const b = getAlphaBoundsFromImage(image, dim, alphaThreshold);
        if (b) {
          ctx.save();
          ctx.setLineDash([8, 4]);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#8e24aa";
          ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
          ctx.restore();
        }
      }

      // глобальний центроїд
      if (showDarkCentroid) {
        const c1 = computeDarkCentroidFromImageBitmap(
          image,
          dim,
          alphaThreshold
        );
        if (!cancelled) setCentroid(c1);

        if (c1) {
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
        }
      } else {
        if (!cancelled) setCentroid(null);
      }

      // deepest-dark point (фіолетовий ромб + точка)
      if (deepPoint) {
        const { x, y } = deepPoint;
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#7c3aed";
        ctx.fillStyle = "#7c3aed";
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
    showCanvasFrame,
    showImageBounds,
    checkerA,
    checkerB,
    showDarkCentroid,
    deepPoint,
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
      {err && <div style={{ color: "#b00020", fontSize: 14 }}>{err}</div>}

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
