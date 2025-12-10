import { useEffect, useMemo, useRef, useState } from "react";

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
}
