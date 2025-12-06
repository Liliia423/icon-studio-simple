/*import { useState } from "react";
import { buildZip, downloadBlob } from "./lib/generate";

export default function App() {
  const [svgText, setSvgText] = useState<string>("");

  async function onGenerate() {
    if (!svgText.trim()) return;
    const zip = await buildZip(svgText, "My App");
    downloadBlob(zip, "icons.zip");
  }

  return (
    <>
      <textarea
        placeholder="Встав SVG тут"
        value={svgText}
        onChange={(e) => setSvgText(e.target.value)}
        rows={12}
        style={{ width: "100%" }}
      />
      <button onClick={onGenerate}>Generate ZIP</button>
    </>
  );
}*/

// src/App.tsx
import { useState } from "react";
import MaskPreview from "./components/MaskPreview";
import { buildZip, downloadBlob } from "./lib/generate";

// ---------------------------------------------------------
// Типи для масок
// ---------------------------------------------------------
const MASKS = ["none", "circle", "squircle", "rounded", "teardrop"] as const;
export type MaskKind = (typeof MASKS)[number];

function isMaskKind(v: string): v is MaskKind {
  return (MASKS as readonly string[]).includes(v);
}

// ---------------------------------------------------------
// Компонент
// ---------------------------------------------------------
export default function App() {
  const [svgText, setSvg] = useState<string>("<svg></svg>");
  const [mask, setMask] = useState<MaskKind>("circle");
  const [size, setSize] = useState<number>(512);

  async function onGenerate() {
    try {
      const blob = await buildZip(svgText, "Icon Studio");
      downloadBlob(blob, "icons.zip");
    } catch (e) {
      alert("Помилка генерації: " + (e as Error).message);
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h2>Icon Studio</h2>

      {/* SVG Input */}
      <label>SVG</label>
      <textarea
        value={svgText}
        onChange={(e) => setSvg(e.target.value)}
        rows={10}
        style={{
          width: "100%",
          fontFamily: "ui-monospace, SF Mono, Menlo, Monaco",
          resize: "vertical",
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 20,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* ---------------- MASK SELECT ---------------- */}
        <div>
          <label>Mask</label>
          <br />
          <select
            value={mask}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const v = e.target.value;
              if (isMaskKind(v)) setMask(v);
            }}
          >
            {MASKS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {/* ---------------- SIZE INPUT ---------------- */}
        <div>
          <label style={{ marginLeft: 12 }}>Size</label>
          <br />
          <input
            type="number"
            min={64}
            max={1024}
            step={16}
            value={size}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const n = Number.parseInt(e.target.value || "512", 10);
              const clamped = Number.isFinite(n)
                ? Math.min(1024, Math.max(64, n))
                : 512;
              setSize(clamped);
            }}
          />
        </div>
      </div>

      {/* ---------------- PREVIEW ---------------- */}
      <div style={{ marginTop: 20 }}>
        <MaskPreview svgText={svgText} size={size} mask={mask} />
      </div>

      {/* ---------------- GENERATE BUTTON ---------------- */}
      <button
        onClick={onGenerate}
        style={{
          marginTop: 20,
          padding: "10px 14px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Generate ZIP
      </button>
    </div>
  );
}
