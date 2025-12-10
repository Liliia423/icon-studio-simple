// src/lib/fileImport.ts (SIMPLE)
// Приймаємо лише PNG → повертаємо ImageBitmap з перевірками

export interface ImportPngOptions {
  /** Максимальний розмір файлу у байтах (за замовч. 10 МБ) */
  maxBytes?: number;
  /**
   * Обов’язковий розмір зображення. Якщо вказано — перевіримо width/height.
   * Можна задати числом (квадрат) або об’єктом { width, height }.
   */
  requireSize?: number | { width: number; height: number };
}

/** Швидка перевірка за MIME/розширенням */
export function isPngFile(file: File): boolean {
  return file.type === "image/png" || /\.png$/i.test(file.name);
}

/** Перевіряємо PNG-сигнатуру (перші 8 байтів) */
async function hasPngSignature(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIG.length; i++) {
    if (head[i] !== SIG[i]) return false;
  }
  return true;
}

/** Надійно створюємо ImageBitmap із File (є fallback через <img>) */
async function fileToBitmap(file: File): Promise<ImageBitmap> {
  // Браузери сучасні: цього достатньо
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback через blob URL + HTMLImageElement
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Не вдалося завантажити PNG."));
        el.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Імпорт PNG з усіма перевірками.
 * Повертає декодоване зображення як ImageBitmap.
 */
export async function importPngBitmap(
  file: File,
  opts: ImportPngOptions = {}
): Promise<ImageBitmap> {
  const { maxBytes = 10 * 1024 * 1024, requireSize } = opts;

  // 1) Перевірка типу
  if (!isPngFile(file)) {
    throw new Error("Будь ласка, обери файл PNG (.png).");
  }

  // 2) Ліміт розміру
  if (file.size > maxBytes) {
    throw new Error("Файл завеликий. Обери файл до 10 МБ.");
  }

  // 3) Сигнатура PNG
  const okSig = await hasPngSignature(file);
  if (!okSig) {
    throw new Error("Файл не схожий на справжній PNG (помилкова сигнатура).");
  }

  // 4) Декодуємо у ImageBitmap
  const bmp = await fileToBitmap(file);

  // 5) Якщо задано — перевіряємо точний розмір
  if (requireSize) {
    const needW =
      typeof requireSize === "number" ? requireSize : requireSize.width;
    const needH =
      typeof requireSize === "number" ? requireSize : requireSize.height;
    if (bmp.width !== needW || bmp.height !== needH) {
      bmp.close?.();
      throw new Error(
        `Очікувався розмір ${needW}×${needH}px, отримано ${bmp.width}×${bmp.height}px.`
      );
    }
  }

  return bmp;
}
