import { useEffect, useMemo, useRef } from "react";

type LightPreviewProps = {
  //ImageBitmap з PNG (може бути null, тоді просто шахматка)
  image: ImageBitmap | null;
  //Логічний розмір полотна (px)
  size?: number;

  //Колірні налаштування
  checkerColorA?: string;
  checkerColorB?: string;

  //Порог альфи для визначення меж (0..255). За замовч. 1
  alphaThreshold?: number;

  //Показувати допоміжні лінії (рамка, центр)
  showGuides?: boolean;
  //Показувати фіолетові реальні межі зображення
  showBounds?: boolean;
};

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

//Рахуємо межі непрозорих пікселів на канвасі (у логічних px)
function getAlphaBoundsFromCanvas(
  srcCanvas: HTMLCanvasElement,
  dim: number,
  alphaThreshold = 1
) {
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

  for (let y = 0; y < height; y++) {
    const off = y * width * 4;
    for (let x = 0; x < width; x++) {
      const a = data[off + x * 4 + 3];
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

export default function LightPreview({
  image,
  size = 512,
  checkerColorA = "#fafafa",
  checkerColorB = "#efefef",
  alphaThreshold = 1,
  showGuides = true,
  showBounds = true,
}: LightPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dim = useMemo(() => Math.max(64, Math.round(size)), [size]);

  useEffect(() => {
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

    // 1) фон-шахматка
    drawChecker(ctx, dim, 16, checkerColorA, checkerColorB);

    // 2) просто малюємо PNG 1:1 у весь квадрат (без масок/скейлів)
    if (image) {
      ctx.drawImage(image, 0, 0, dim, dim);
    }

    // 3) допоміжні гіди
    if (showGuides) {
      // червона рамка по краю
      ctx.save();
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, dim - 2, dim - 2);
      ctx.restore();

      // центр
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#9e9e9e";
      ctx.beginPath();
      ctx.moveTo(dim / 2, 0);
      ctx.lineTo(dim / 2, dim);
      ctx.moveTo(0, dim / 2);
      ctx.lineTo(dim, dim / 2);
      ctx.stroke();
      ctx.restore();
    }

    // 4) реальні межі (фіолетова пунктирна)
    if (showBounds && image) {
      const b = getAlphaBoundsFromCanvas(canvas, dim, alphaThreshold);
      if (b) {
        ctx.save();
        ctx.setLineDash([8, 4]);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#8e24aa";
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        ctx.restore();
      }
    }
  }, [
    image,
    dim,
    checkerColorA,
    checkerColorB,
    alphaThreshold,
    showGuides,
    showBounds,
  ]);

  return (
    <div
      style={{
        display: "inline-block",
        borderRadius: 12,
        boxShadow: "0 6px 18px rgba(0,0,0,.08)",
      }}
    >
      <canvas ref={canvasRef} width={dim} height={dim} />
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: "#475569",
          textAlign: "center",
          userSelect: "none",
        }}
      >
        {dim}×{dim}px • bounds: {showBounds ? "on" : "off"}
      </div>
    </div>
  );
}
