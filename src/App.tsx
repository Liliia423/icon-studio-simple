import { useCallback, useRef, useState } from "react";
import MaskPreview from "./components/MaskPreview";
import { buildZip, downloadBlob } from "./lib/generate";
import { importIconFile } from "./lib/fileImport";
import styles from "./App.module.css";

const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

const MASKS = ["none", "circle", "squircle", "rounded", "teardrop"] as const;
export type MaskKind = (typeof MASKS)[number];
function isMaskKind(v: string): v is MaskKind {
  return (MASKS as readonly string[]).includes(v);
}

function sanitizeSvg(svg: string): string {
  let out = svg;
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(
    /\s(href|xlink:href)\s*=\s*(['"])\s*https?:.*?\2/gi,
    ' $1=""'
  );
  out = out.replace(/url\(\s*['"]?https?:.*?\)/gi, "none");
  return out.trim();
}

export default function App() {
  const [svgText, setSvg] = useState<string>("<svg></svg>");
  const [mask, setMask] = useState<MaskKind>("circle");
  const [size, setSize] = useState<number>(512);

  // Bounds UI
  const [showBounds, setShowBounds] = useState(false);
  const [boundsMode, setBoundsMode] = useState<"pre" | "post">("post");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onChooseFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;

      const MAX_BYTES = 10 * 1024 * 1024;
      if (f.size > MAX_BYTES) {
        alert("Файл завеликий. Обери файл до 10 МБ.");
        e.target.value = "";
        return;
      }

      try {
        const imported = await importIconFile(f, size, 0);
        setSvg(sanitizeSvg(imported.svgText));
      } catch (err: unknown) {
        alert("Помилка імпорту: " + errMsg(err));
      } finally {
        e.target.value = "";
      }
    },
    [size]
  );

  const onGenerate = useCallback(async () => {
    try {
      const cleaned = sanitizeSvg(svgText);
      const blob = await buildZip(cleaned, "Icon Studio");
      downloadBlob(blob, "icons.zip");
    } catch (e) {
      alert("Помилка генерації: " + errMsg(e));
    }
  }, [svgText]);

  return (
    <div className={styles.page}>
      <h2>Icon Studio</h2>

      {/* ========= SVG TEXT AREA ========= */}
      <label className={styles.svglable} htmlFor="svg-input">
        SVG
      </label>
      <textarea
        id="svg-input"
        className={styles.textareafield}
        value={svgText}
        onChange={(e) => setSvg(sanitizeSvg(e.target.value))}
        rows={8}
        spellCheck={false}
      />

      {/* ========= FILE UPLOAD ========= */}
      <div>
        <button
          className={styles.uploadbutton}
          onClick={() => fileInputRef.current?.click()}
          type="button"
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
          <label className={styles.controllabel} htmlFor="mask-select">
            Mask
          </label>
          <select
            id="mask-select"
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

        <div>
          <label className={styles.controllabel} htmlFor="size-input">
            Size
          </label>
          <input
            id="size-input"
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

        {/* Bounds controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label className={styles.controllabel}>
            <input
              type="checkbox"
              checked={showBounds}
              onChange={(e) => setShowBounds(e.target.checked)}
            />{" "}
            Show real image bounds
          </label>

          <label className={styles.controllabel} htmlFor="bounds-mode">
            Bounds:
          </label>
          <select
            id="bounds-mode"
            value={boundsMode}
            onChange={(e) => setBoundsMode(e.target.value as "pre" | "post")}
            disabled={!showBounds}
          >
            <option value="post">post (after mask)</option>
            <option value="pre">pre (before mask)</option>
          </select>
        </div>
      </div>

      {/* ========= PREVIEW ========= */}
      <div className={styles.preview}>
        <MaskPreview
          svgText={svgText}
          size={size}
          mask={mask}
          showBounds={showBounds}
          boundsMode={boundsMode}
        />
      </div>

      {/* ========= GENERATE BUTTON ========= */}
      <button
        className={styles.generatebutton}
        onClick={onGenerate}
        type="button"
      >
        Generate ZIP
      </button>
    </div>
  );
}
