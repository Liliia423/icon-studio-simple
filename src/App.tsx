/*import { useCallback, useRef, useState } from "react";
import BoundsPreview from "./components/BoundsPreview";

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  const blob = file.slice(0, file.size, file.type || "image/png");
  return await createImageBitmap(blob);
}

export default function App() {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [alphaThreshold, setAlphaThreshold] = useState<number>(1);

  const [showGuides, setShowGuides] = useState(true);
  const [showCanvasFrame, setShowCanvasFrame] = useState(true);
  const [showImageBounds, setShowImageBounds] = useState(true);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickFile = () => fileRef.current?.click();

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png" && !/\.png$/i.test(f.name)) {
      alert("Будь ласка, обери PNG-файл.");
      e.target.value = "";
      return;
    }
    try {
      const bmp = await fileToBitmap(f);
      setImage((old) => {
        old?.close?.();
        return bmp;
      });
    } catch (err) {
      console.error(err);
      alert("Не вдалося прочитати PNG.");
    } finally {
      e.target.value = "";
    }
  }, []);

  const clearImage = () => {
    image?.close?.();
    setImage(null);
  };

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: 0 }}>Icon Studio — Alpha Bounds Only</h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          margin: "16px 0 24px",
        }}
      >
        <button
          onClick={pickFile}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #222",
            background: "#1f1f1f",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Upload PNG (512×512)
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".png,image/png"
          onChange={onFile}
          style={{ display: "none" }}
        />

        <button
          onClick={clearImage}
          disabled={!image}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #bbb",
            background: "#f3f3f3",
            color: "#222",
            cursor: image ? "pointer" : "not-allowed",
          }}
        >
          Clear
        </button>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showGuides}
            onChange={(e) => setShowGuides(e.target.checked)}
          />
          Guides
        </label>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showCanvasFrame}
            onChange={(e) => setShowCanvasFrame(e.target.checked)}
          />
          Canvas frame
        </label>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showImageBounds}
            onChange={(e) => setShowImageBounds(e.target.checked)}
          />
          PNG bounds
        </label>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          α-threshold:
          <input
            type="range"
            min={0}
            max={255}
            value={alphaThreshold}
            onChange={(e) => setAlphaThreshold(Number(e.target.value))}
          />
          <span style={{ minWidth: 32, textAlign: "right" }}>
            {alphaThreshold}
          </span>
        </label>
      </div>

      <BoundsPreview
        image={image}
        size={512}
        showGuides={showGuides}
        showCanvasFrame={showCanvasFrame}
        showImageBounds={showImageBounds}
        alphaThreshold={alphaThreshold}
      />
    </div>
  );
}*/
// src/App.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import BoundsPreview from "./components/BoundsPreview";

import {
  computeDeepestDarkPointFromImageBitmap,
  type DeepPoint,
} from "./lib/deepPoint";

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  const blob = file.slice(0, file.size, file.type || "image/png");
  return await createImageBitmap(blob);
}

export default function App() {
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [alphaThreshold, setAlphaThreshold] = useState<number>(1);

  const [showGuides, setShowGuides] = useState(true);
  //const [showCanvasFrame, setShowCanvasFrame] = useState(true);
  const [showImageBounds, setShowImageBounds] = useState(true);

  // NEW: результат deepest-point
  const [deepPoint, setDeepPoint] = useState<DeepPoint | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const pickFile = () => fileRef.current?.click();

  const onFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "image/png" && !/\.png$/i.test(f.name)) {
      alert("Будь ласка, обери PNG-файл.");
      e.target.value = "";
      return;
    }
    try {
      const bmp = await fileToBitmap(f);
      setImage((old) => {
        old?.close?.();
        return bmp;
      });
    } catch (err) {
      console.error(err);
      alert("Не вдалося прочитати PNG.");
    } finally {
      e.target.value = "";
    }
  }, []);

  {
    /*const clearImage = () => {
    image?.close?.();
    setImage(null);
    setDeepPoint(null);
  };*/
  }

  // NEW: рахуємо deepest-dark point при зміні зображення/порогу
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!image) {
        setDeepPoint(null);
        return;
      }
      try {
        const dp = await computeDeepestDarkPointFromImageBitmap(
          image,
          512, // той самий dim, що й у <BoundsPreview size={512}/>
          {
            alphaThreshold, // беремо з UI
            // нижче — опції з твоїми дефолтами; можна не передавати
            // darkThreshold: 0.35,
            // gamma: 2.2,
            // pDark: 1.0,
            // pDist: 1.0,
            // erodePx: 0,
            // clipCirclePct: 0,
          }
        );
        if (!cancelled) setDeepPoint(dp);
      } catch (err) {
        console.error(err);
        if (!cancelled) setDeepPoint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [image, alphaThreshold]);

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ margin: 0 }}>Icon Studio — Alpha Bounds Only</h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          margin: "16px 0 24px",
        }}
      >
        <button
          onClick={pickFile}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #222",
            background: "#1f1f1f",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Upload PNG (512×512)
        </button>

        <input
          ref={fileRef}
          type="file"
          accept=".png,image/png"
          onChange={onFile}
          style={{ display: "none" }}
        />

        {/*<button
          onClick={clearImage}
          disabled={!image}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #bbb",
            background: "#f3f3f3",
            color: "#222",
            cursor: image ? "pointer" : "not-allowed",
          }}
        >
          Clear
        </button>*/}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showGuides}
            onChange={(e) => setShowGuides(e.target.checked)}
          />
          Guides
        </label>

        {/*<label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showCanvasFrame}
            onChange={(e) => setShowCanvasFrame(e.target.checked)}
          />
          Canvas frame
        </label>*/}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={showImageBounds}
            onChange={(e) => setShowImageBounds(e.target.checked)}
          />
          PNG bounds
        </label>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          α-threshold:
          <input
            type="range"
            min={0}
            max={255}
            value={alphaThreshold}
            onChange={(e) => setAlphaThreshold(Number(e.target.value))}
          />
          <span style={{ minWidth: 32, textAlign: "right" }}>
            {alphaThreshold}
          </span>
        </label>
      </div>

      <BoundsPreview
        image={image}
        size={512}
        showGuides={showGuides}
        //showCanvasFrame={showCanvasFrame}
        showImageBounds={showImageBounds}
        alphaThreshold={alphaThreshold}
        deepPoint={deepPoint} // NEW
        showClipMask={true}
        safeRatio={0.9} // заміна insetPct/cornerPct: частка радіуса
      />

      {/* NEW: показуємо результат deep-point під канвасом */}
      {deepPoint && (
        <div style={{ marginTop: 8, color: "#334", fontSize: 13 }}>
          deepest-dark point:&nbsp; x={deepPoint.x.toFixed(1)}px (
          {deepPoint.x_pct.toFixed(2)}%),&nbsp; y={deepPoint.y.toFixed(1)}px (
          {deepPoint.y_pct.toFixed(2)}%),&nbsp; score=
          {deepPoint.score.toFixed(4)}
        </div>
      )}
    </div>
  );
}
