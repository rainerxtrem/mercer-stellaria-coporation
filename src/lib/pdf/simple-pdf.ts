type PdfFont = "regular" | "bold" | "italic";
type PdfColor = [number, number, number];

type TextOptions = {
  size?: number;
  font?: PdfFont;
  color?: PdfColor;
  align?: "left" | "right" | "center";
  maxWidth?: number;
  lineHeight?: number;
};

type Page = {
  width: number;
  height: number;
  ops: string[];
};

const FONT_REFS: Record<PdfFont, string> = {
  regular: "F1",
  bold: "F2",
  italic: "F3",
};

const WIN_ANSI: Record<string, number> = {
  "€": 0x80,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
  "œ": 0x9c,
  "Œ": 0x8c,
  "Ÿ": 0x9f,
};

export const PDF_COLORS = {
  navy: [0.09, 0.15, 0.29] as PdfColor,
  navyDeep: [0.04, 0.08, 0.18] as PdfColor,
  gold: [0.72, 0.55, 0.15] as PdfColor,
  gray: [0.42, 0.43, 0.48] as PdfColor,
  lightGray: [0.94, 0.95, 0.97] as PdfColor,
  border: [0.78, 0.8, 0.84] as PdfColor,
  white: [1, 1, 1] as PdfColor,
  black: [0, 0, 0] as PdfColor,
  green: [0.2, 0.62, 0.34] as PdfColor,
  amber: [0.86, 0.48, 0.12] as PdfColor,
  red: [0.78, 0.2, 0.28] as PdfColor,
};

type PdfImage = { ref: string; bytes: Uint8Array; width: number; height: number };

export class SimplePdfDocument {
  private pages: Page[] = [];
  private currentPage: Page;
  private images: PdfImage[] = [];

  constructor(width = 595.28, height = 841.89) {
    this.currentPage = this.addPage(width, height);
  }

  addPage(width = 595.28, height = 841.89): Page {
    const page = { width, height, ops: [] };
    this.pages.push(page);
    this.currentPage = page;
    return page;
  }

  get pageCount() {
    return this.pages.length;
  }

  /** Repositionne le curseur d'écriture sur une page existante (index 0-based). */
  selectPage(index: number) {
    const page = this.pages[Math.max(0, Math.min(index, this.pages.length - 1))];
    if (page) this.currentPage = page;
    return this.currentPage;
  }

  /** Enregistre une image JPEG (DCTDecode) et retourne sa référence XObject. */
  addJpeg(bytes: Uint8Array): string {
    const size = jpegSize(bytes);
    const ref = `Im${this.images.length + 1}`;
    this.images.push({ ref, bytes, width: size.width, height: size.height });
    return ref;
  }

  /** Dessine une image enregistrée (coordonnées PDF, origine en bas à gauche). */
  drawImage(ref: string, x: number, y: number, width: number, height: number) {
    this.currentPage.ops.push(
      `q ${fmt(width)} 0 0 ${fmt(height)} ${fmt(x)} ${fmt(y)} cm /${ref} Do Q`,
    );
  }


  get pageWidth() {
    return this.currentPage.width;
  }

  get pageHeight() {
    return this.currentPage.height;
  }

  text(raw: unknown, x: number, y: number, options: TextOptions = {}) {
    const size = options.size ?? 10;
    const font = options.font ?? "regular";
    const color = options.color ?? PDF_COLORS.navy;
    const text = normalizeText(String(raw ?? ""));
    if (!text) return;

    let tx = x;
    const width = measureText(text, size, font);
    if (options.align === "right") tx = x - width;
    if (options.align === "center") tx = x - width / 2;

    this.currentPage.ops.push(
      `BT /${FONT_REFS[font]} ${fmt(size)} Tf ${rgb(color, "fill")} ${fmt(tx)} ${fmt(y)} Td ${encodeTextHex(text)} Tj ET`,
    );
  }

  wrappedText(raw: unknown, x: number, y: number, maxWidth: number, options: TextOptions = {}) {
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? size + 3;
    const lines = wrapText(String(raw ?? ""), maxWidth, size, options.font ?? "regular");
    let cursor = y;
    for (const line of lines) {
      this.text(line, x, cursor, options);
      cursor -= lineHeight;
    }
    return cursor;
  }

  rect(x: number, y: number, width: number, height: number, options: { fill?: PdfColor; stroke?: PdfColor; lineWidth?: number } = {}) {
    if (options.fill) {
      this.currentPage.ops.push(`${rgb(options.fill, "fill")} ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re f`);
    }
    if (options.stroke) {
      this.currentPage.ops.push(`${rgb(options.stroke, "stroke")} ${fmt(options.lineWidth ?? 1)} w ${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)} re S`);
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: PdfColor = PDF_COLORS.border, lineWidth = 1) {
    this.currentPage.ops.push(`${rgb(color, "stroke")} ${fmt(lineWidth)} w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }

  drawQr(matrix: boolean[][], x: number, y: number, size: number, color: PdfColor = PDF_COLORS.black) {
    const count = matrix.length;
    if (count === 0) return;
    const cell = size / count;
    this.rect(x, y, size, size, { fill: PDF_COLORS.white });
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (matrix[row]?.[col]) {
          this.rect(x + col * cell, y + (count - 1 - row) * cell, cell + 0.01, cell + 0.01, { fill: color });
        }
      }
    }
  }

  save(): Uint8Array {
    type Obj = string | { head: string; stream: Uint8Array };
    const objects: Obj[] = [];
    const pageCount = this.pages.length;
    const imageCount = this.images.length;
    const firstPageObj = 6 + imageCount;
    const pageObjectNumbers = this.pages.map((_, index) => firstPageObj + index * 2);

    objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`;
    objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";

    this.images.forEach((img, index) => {
      objects[5 + index] = {
        head: `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>`,
        stream: img.bytes,
      };
    });

    const xobjectDict = imageCount
      ? ` /XObject << ${this.images.map((img, i) => `/${img.ref} ${6 + i} 0 R`).join(" ")} >>`
      : "";

    this.pages.forEach((page, index) => {
      const pageObj = pageObjectNumbers[index]!;
      const contentObj = pageObj + 1;
      const stream = new TextEncoder().encode(page.ops.join("\n"));
      objects[pageObj - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(page.width)} ${fmt(page.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${xobjectDict} >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj - 1] = { head: `<< /Length ${stream.length} >>`, stream };
    });

    const chunks: Uint8Array[] = [];
    let length = 0;
    const push = (part: Uint8Array | string) => {
      const bytes = typeof part === "string" ? new TextEncoder().encode(part) : part;
      chunks.push(bytes);
      length += bytes.length;
    };

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const offsets: number[] = [0];
    objects.forEach((body, index) => {
      offsets[index + 1] = length;
      push(`${index + 1} 0 obj\n`);
      if (typeof body === "string") {
        push(`${body}\n`);
      } else {
        push(`${body.head}\nstream\n`);
        push(body.stream);
        push("\nendstream\n");
      }
      push("endobj\n");
    });
    const xrefAt = length;
    push(`xref\n0 ${objects.length + 1}\n`);
    push("0000000000 65535 f \n");
    for (let i = 1; i <= objects.length; i += 1) {
      push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    }
    push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);

    const out = new Uint8Array(length);
    let cursor = 0;
    for (const chunk of chunks) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    }
    return out;
  }
}

/** Lit la taille d'une image JPEG (segment SOF). */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = ((bytes[i + 2]! << 8) | bytes[i + 3]!) || 0;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      const width = (bytes[i + 7]! << 8) | bytes[i + 8]!;
      return { width: width || 1, height: height || 1 };
    }
    i += 2 + len;
  }
  return { width: 1, height: 1 };
}


export function makeQrMatrix(qrcodeFactory: unknown, value: string): boolean[][] {
  if (typeof qrcodeFactory !== "function") return [];
  const qr = qrcodeFactory(0, "M");
  qr.addData(value);
  qr.make();
  const count: number = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => Boolean(qr.isDark(row, col))),
  );
}

export function formatMoney(value: unknown, currency = "USD") {
  const amount = Number(value || 0).toFixed(2);
  return `${amount} ${currency}`;
}

export function measureText(raw: string, size: number, font: PdfFont = "regular") {
  const factor = font === "bold" ? 0.56 : 0.52;
  return normalizeText(raw).length * size * factor;
}

export function wrapText(raw: string, maxWidth: number, size: number, font: PdfFont = "regular") {
  const normalized = normalizeText(raw).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, size, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/…/g, "...");
}

function encodeTextHex(value: string) {
  const bytes: number[] = [];
  for (const char of value) {
    const mapped = WIN_ANSI[char];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    const code = char.charCodeAt(0);
    bytes.push(code <= 255 ? code : 0x3f);
  }
  return `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}>`;
}

function rgb(color: PdfColor, mode: "fill" | "stroke") {
  return `${fmt(color[0])} ${fmt(color[1])} ${fmt(color[2])} ${mode === "fill" ? "rg" : "RG"}`;
}

function fmt(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(3)).toString() : "0";
}