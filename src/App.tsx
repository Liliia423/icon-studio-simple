// src/App.tsx
import { useState, useRef } from "react";
import MaskPreview from "./components/MaskPreview";
import { buildZip, downloadBlob } from "./lib/generate";
import { importIconFile } from "./lib/fileImport"; // якщо вже додавали імпорт файлів (можна прибрати)
import styles from "./App.module.css";

// Безпечне отримання повідомлення з unknown
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

// ---------------------------------------------------------
// Маски
// ---------------------------------------------------------
const MASKS = ["none", "circle", "squircle", "rounded", "teardrop"] as const;
export type MaskKind = (typeof MASKS)[number];

function isMaskKind(v: string): v is MaskKind {
  return (MASKS as readonly string[]).includes(v);
}

// ---------------------------------------------------------
// Санітизація SVG — захист від скриптів та небезпечних атрибутів
// ---------------------------------------------------------
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
}

// ---------------------------------------------------------
// Компонент
// ---------------------------------------------------------
export default function App() {
  const [svgText, setSvg] = useState<string>("<svg></svg>");
  const [mask, setMask] = useState<MaskKind>("circle");
  const [size, setSize] = useState<number>(512);

  // Якщо використаєш Upload-функціонал:
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function onChooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const imported = await importIconFile(f, size, 0.1);
      setSvg(sanitizeSvg(imported.svgText));
    } catch (err: unknown) {
      alert("Помилка імпорту: " + errMsg(err));
    } finally {
      e.target.value = "";
    }
  }

  async function onGenerate() {
    try {
      const cleaned = sanitizeSvg(svgText);
      const blob = await buildZip(cleaned, "Icon Studio");
      downloadBlob(blob, "icons.zip");
    } catch (e) {
      alert("Помилка генерації: " + (e as Error).message);
    }
  }

  return (
    <div className={styles.page}>
      <h2>Icon Studio</h2>

      {/* ========= SVG TEXT AREA ========= */}
      <label className={styles.svglable}>SVG</label>
      <textarea
        className={styles.textareafield}
        value={svgText}
        onChange={(e) => setSvg(sanitizeSvg(e.target.value))}
        rows={8}
      />

      {/* ========= FILE UPLOAD (опціонально) ========= */}
      <div>
        <button
          className={styles.uploadbutton}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload SVG/PNG/JPG/WEBP/ICO
        </button>
        <input
          className={styles.inputfield}
          ref={fileInputRef}
          type="file"
          accept=".svg,.png,.jpg,.jpeg,.webp,.ico"
          onChange={onChooseFile}
        />
      </div>

      {/* ========= CONTROL PANEL ========= */}
      <div className={styles.controlpanel}>
        <div>
          <label className={styles.controllabel}>Mask</label>

          <select
            value={mask}
            onChange={(e) => {
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

        {/* SIZE INPUT */}
        <div>
          <label className={styles.controllabel}>Size</label>

          <input
            type="number"
            min={64}
            max={1024}
            step={16}
            value={size}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value || "512", 10);
              const clamped = Number.isFinite(n)
                ? Math.min(1024, Math.max(64, n))
                : 512;
              setSize(clamped);
            }}
          />
        </div>
      </div>

      {/* ========= PREVIEW ========= */}
      <div className={styles.preview}>
        <MaskPreview svgText={svgText} size={size} mask={mask} />
      </div>

      {/* ========= GENERATE BUTTON ========= */}
      <button className={styles.generatebutton} onClick={onGenerate}>
        Generate ZIP
      </button>
    </div>
  );
}
