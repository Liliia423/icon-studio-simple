/*import { useEffect, useMemo, useRef, useState } from "react";

export type BoundsMode = "pre" | "post";

export interface BoundsPreviewProps {
  image: ImageBitmap | null;
  size?: number;
  showGuides?: boolean; // тільки центр-хрест
  showCanvasFrame?: boolean; // червона рамка полотна
  showImageBounds?: boolean; // фіолетова рамка PNG (alpha>threshold)
  boundsMode?: BoundsMode;
  alphaThreshold?: number; // 0..255
  checkerA?: string;
  checkerB?: string;
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
      const a = data[row + x * 4 + 3];
      if (a > alphaThreshold) {
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

export default function BoundsPreview({
  image,
  size = 512,
  showGuides = true,
  showCanvasFrame = true,
  showImageBounds = true,
  boundsMode = "pre",
  alphaThreshold = 1,
  checkerA = "#fafafa",
  checkerB = "#efefef",
}: BoundsPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);
  const [err, setErr] = useState<string | null>(null);

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

      // якщо картинки нема — лише фон і, за бажанням, рамка полотна
      if (!image || cancelled) {
        if (showCanvasFrame) {
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, dim - 2, dim - 2);
        }
        return;
      }

      // малюємо PNG 1:1
      ctx.drawImage(image, 0, 0, dim, dim);

      // guides: тільки центр-хрест
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

      // рамка реального контенту PNG (alpha > threshold)
      if (showImageBounds) {
        const b =
          boundsMode === "pre"
            ? getAlphaBoundsFromImage(image, dim, alphaThreshold)
            : getAlphaBoundsFromImage(image, dim, alphaThreshold);

        if (b) {
          ctx.save();
          ctx.setLineDash([8, 4]);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = "#8e24aa";
          ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
          ctx.restore();
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [
    image,
    dim,
    showGuides,
    showCanvasFrame,
    showImageBounds,
    boundsMode,
    alphaThreshold,
    checkerA,
    checkerB,
  ]);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
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
    </div>
  );
}*/

// src/components/BoundsPreview.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeDarkCentroidFromImageBitmap,
  computeDarkestRegionCentroidFromImageBitmap,
} from "../lib/centroid";
import type { DarkCentroid } from "../lib/centroid"; // ⬅ тип імпортуємо окремо

export interface BoundsPreviewProps {
  image: ImageBitmap | null;
  size?: number;
  alphaThreshold?: number;

  showGuides?: boolean;
  showCanvasFrame?: boolean;
  showImageBounds?: boolean;

  checkerA?: string;
  checkerB?: string;

  showDarkCentroid?: boolean; // обидва центри
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
}: BoundsPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);

  const [err, setErr] = useState<string | null>(null);
  const [centroid, setCentroid] = useState<DarkCentroid>(null);
  const [darkestCentroid, setDarkestCentroid] = useState<DarkCentroid>(null);

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

      if (!image || cancelled) {
        if (showCanvasFrame) {
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, dim - 2, dim - 2);
        }
        if (!cancelled) {
          setCentroid(null);
          setDarkestCentroid(null);
        }
        return;
      }

      // малюємо PNG
      ctx.drawImage(image, 0, 0, dim, dim);

      // вісі координат (0,0 у верхньому лівому куті)
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(dim - 6, 0); // вісь X
      ctx.moveTo(0, 0);
      ctx.lineTo(0, dim - 6); // вісь Y
      ctx.stroke();

      // стрілочки
      ctx.beginPath();
      // стрілка X
      ctx.moveTo(dim - 6, 0);
      ctx.lineTo(dim - 12, -3);
      ctx.moveTo(dim - 6, 0);
      ctx.lineTo(dim - 12, 3);
      // стрілка Y
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

      // guides (центр)
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

      if (showDarkCentroid) {
        const c1 = computeDarkCentroidFromImageBitmap(
          image,
          dim,
          alphaThreshold
        );
        const c2 = computeDarkestRegionCentroidFromImageBitmap(
          image,
          dim,
          alphaThreshold
        );

        if (!cancelled) {
          setCentroid(c1);
          setDarkestCentroid(c2);
        }

        // 1) глобальний темний центроїд (фіолетовий)
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

        // 2) центроїд найтемнішої області (помаранчевий)
        if (c2) {
          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#ef6c00";
          ctx.beginPath();
          ctx.moveTo(c2.x - 7, c2.y);
          ctx.lineTo(c2.x + 7, c2.y);
          ctx.moveTo(c2.x, c2.y - 7);
          ctx.lineTo(c2.x, c2.y + 7);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(c2.x, c2.y, 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      } else {
        if (!cancelled) {
          setCentroid(null);
          setDarkestCentroid(null);
        }
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

      {/* рядок з координатами */}
      {centroid && (
        <div style={{ color: "#334", fontSize: 13 }}>
          all-dark centroid:&nbsp; x={centroid.x_bl.toFixed(1)}px (
          {centroid.x_pct.toFixed(2)}%),&nbsp; y={centroid.y_bl.toFixed(1)}px (
          {centroid.y_pct.toFixed(2)}%)
        </div>
      )}
      {darkestCentroid && (
        <div style={{ color: "#663300", fontSize: 13 }}>
          darkest-region centroid:&nbsp; x={darkestCentroid.x_bl.toFixed(1)}px (
          {darkestCentroid.x_pct.toFixed(2)}%),&nbsp; y=
          {darkestCentroid.y_bl.toFixed(1)}px (
          {darkestCentroid.y_pct.toFixed(2)}%)
        </div>
      )}
    </div>
  );
}
