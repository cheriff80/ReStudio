import jsPDF from "jspdf";
import { getImage } from "./imageStorage";
import {
  paginateDocument,
  MARGIN,
  CONTENT_WIDTH,
  PAGE_HEIGHT,
  LINE_HEIGHT,
  PARAGRAPH_AFTER,
  IMAGE_TOP_MARGIN,
  IMAGE_BOTTOM_MARGIN,
  type PaginationPage,
  type PaginationTextBlock,
  type PaginationImageBlock,
} from "./documentPagination";

type TextBlock = { id: number; type: "text"; content: string };
type ImageBlock = { id: number; type: "image"; name: string; imageId: string; url?: string; width?: number; aspectRatio?: number };
type PageBreakBlock = { id: number; type: "pageBreak" };
type ContentBlock = TextBlock | ImageBlock | PageBreakBlock;
type Concept = { id: number; title: string; level: number; showNumber?: boolean; content: ContentBlock[] };

type TextStyle = { bold: boolean; italic: boolean; underline: boolean; color: [number, number, number] };
type Run = { text: string; style: TextStyle };
type Word = { text: string; style: TextStyle; width: number; unicode: boolean };
const DEFAULT_COLOR: [number, number, number] = [45, 55, 72];

function colorOf(value: string): [number, number, number] {
  const v = value.trim().toLowerCase();
  if (v.startsWith("#")) {
    const h = v.slice(1);
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
    if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : DEFAULT_COLOR;
}

function styleFor(el: HTMLElement, parent: TextStyle): TextStyle {
  const style = { ...parent };
  const tag = el.tagName.toLowerCase();
  if (tag === "b" || tag === "strong") style.bold = true;
  if (tag === "i" || tag === "em") style.italic = true;
  if (tag === "u") style.underline = true;
  const inline = el.getAttribute("style") || "";
  const fontWeight = inline.match(/(?:^|;)\\s*font-weight\\s*:\\s*([^;]+)/i);
  if (fontWeight) {
    const value = fontWeight[1].trim().toLowerCase();
    style.bold = value === "bold" || value === "bolder" || /^[6-9]00$/.test(value);
  }
  const fontStyleValue = inline.match(/(?:^|;)\\s*font-style\\s*:\\s*([^;]+)/i);
  if (fontStyleValue && /italic|oblique/i.test(fontStyleValue[1])) {
    style.italic = true;
  }
  const textDecoration = inline.match(/(?:^|;)\\s*text-decoration(?:-line)?\\s*:\\s*([^;]+)/i);
  if (textDecoration && /underline/i.test(textDecoration[1])) {
    style.underline = true;
  }
  const color = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (color) style.color = colorOf(color[1]);
  return style;
}

function fontStyle(style: TextStyle): "normal" | "bold" | "italic" | "bolditalic" {
  if (style.bold && style.italic) return "bolditalic";
  if (style.bold) return "bold";
  if (style.italic) return "italic";
  return "normal";
}

function extractRunsFromLine(html: string): Run[] {
  const root = document.createElement("div");
  root.innerHTML = html;
  const line = root.querySelector("[data-restudio-line]") as HTMLElement | null;
  if (!line) return [];
  const runs: Run[] = [];
  const walk = (node: Node, parent: TextStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) runs.push({ text, style: { ...parent } });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const style = styleFor(el, parent);
    for (const child of Array.from(el.childNodes)) walk(child, style);
  };
  for (const child of Array.from(line.childNodes)) walk(child, { bold: false, italic: false, underline: false, color: DEFAULT_COLOR });
  return runs;
}

function measureSpaceWidth(pdf: jsPDF, style: TextStyle): number {
  pdf.setFont("helvetica", fontStyle(style));
  pdf.setFontSize(10);
  return Math.max(pdf.getTextWidth(" "), pdf.getTextWidth("A A") - pdf.getTextWidth("AA"), 0.8);
}

function containsUnicode(text: string): boolean {
  return /[^\x00-\xFF]/.test(text);
}

function browserTextWidth(text: string, style: TextStyle): number {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 2.2;
  const weight = style.bold ? "700" : "400";
  const italic = style.italic ? "italic" : "normal";
  ctx.font = `${italic} ${weight} 13.333px Arial, "Noto Sans", "DejaVu Sans", sans-serif`;
  return ctx.measureText(text).width * 25.4 / 96;
}

function wordsFromRuns(pdf: jsPDF, runs: Run[]): Word[] {
  const words: Word[] = [];
  for (const run of runs) {
    for (const token of run.text.trim().split(/\s+/)) {
      if (!token) continue;
      const unicode = containsUnicode(token);
      pdf.setFont("helvetica", fontStyle(run.style));
      pdf.setFontSize(10);
      const width = unicode ? browserTextWidth(token, run.style) : pdf.getTextWidth(token);
      words.push({ text: token, style: run.style, width, unicode });
    }
  }
  return words;
}

function drawUnicodeWord(pdf: jsPDF, word: Word, x: number, baselineY: number): void {
  const scale = 4;
  const fontPx = 13.333;
  const paddingPx = 3;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return;

  const weight = word.style.bold ? "700" : "400";
  const italic = word.style.italic ? "italic" : "normal";
  const family = 'Arial, "Noto Sans", "DejaVu Sans", sans-serif';
  measure.font = `${italic} ${weight} ${fontPx}px ${family}`;
  const measured = Math.max(1, Math.ceil(measure.measureText(word.text).width));

  canvas.width = (measured + paddingPx * 2) * scale;
  canvas.height = 20 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.font = `${italic} ${weight} ${fontPx}px ${family}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = `rgb(${word.style.color[0]}, ${word.style.color[1]}, ${word.style.color[2]})`;
  ctx.fillText(word.text, paddingPx, 14);

  const dataUrl = canvas.toDataURL("image/png");
  const imageHeight = 5.3;
  const imageWidth = (canvas.width / scale) * 25.4 / 96;
  pdf.addImage(dataUrl, "PNG", x - paddingPx * 25.4 / 96, baselineY - 3.75, imageWidth, imageHeight, undefined, "FAST");
}

function drawTextLine(pdf: jsPDF, block: PaginationTextBlock, x: number, y: number): number {
  const words = wordsFromRuns(pdf, extractRunsFromLine(block.content));
  if (words.length) {
    const lineX = x + (block.xOffset ?? 0);
    const lineWidth = block.lineWidth ?? CONTENT_WIDTH;
    const spaceWidth = measureSpaceWidth(pdf, words[0].style);
    const total = words.reduce((sum, word) => sum + word.width, 0);
    const gaps = Math.max(0, words.length - 1);
    const gap = block.justify && gaps > 0 ? Math.max(spaceWidth, (lineWidth - total) / gaps) : spaceWidth;
    let cursor = lineX;
    for (const word of words) {
      pdf.setFont("helvetica", fontStyle(word.style));
      pdf.setFontSize(10);
      pdf.setTextColor(...word.style.color);
      if (word.unicode) drawUnicodeWord(pdf, word, cursor, y);
      else pdf.text(word.text, cursor, y);
      if (word.style.underline) {
        pdf.setDrawColor(...word.style.color);
        pdf.setLineWidth(0.2);
        pdf.line(cursor, y + 0.8, cursor + word.width, y + 0.8);
      }
      cursor += word.width + gap;
    }
  }
  return y + (block.content.includes(`height:${PARAGRAPH_AFTER}mm`) ? LINE_HEIGHT + PARAGRAPH_AFTER : LINE_HEIGHT);
}

async function toDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) return source;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo crear canvas"));
      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    image.src = source;
  });
}

async function drawPlannedImage(pdf: jsPDF, block: PaginationImageBlock, x: number, y: number, availableWidth: number): Promise<number> {
  const source = block.url ?? await getImage(block.imageId);
  if (!source) return y;
  const dataUrl = await toDataUrl(source);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo medir la imagen"));
    image.src = dataUrl;
  });
  const width = availableWidth * Math.max(0.25, Math.min(1, (block.width ?? 75) / 100));
  const ratio = image.naturalHeight / image.naturalWidth;
  const height = Math.min(width * ratio, 90);
  const imageY = y + IMAGE_TOP_MARGIN;
  const imageX = x + (availableWidth - width) / 2;
  pdf.addImage(dataUrl, dataUrl.toLowerCase().startsWith("data:image/jpeg") ? "JPEG" : "PNG", imageX, imageY, width, height);
  return imageY + height + IMAGE_BOTTOM_MARGIN;
}

function drawPageHeader(pdf: jsPDF, title: string, author: string, subject: string, faculty: string, firstPage: boolean): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const headerY = MARGIN;
  let titleLines: string[] = [];
  if (firstPage && title.trim()) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(30, 41, 59);
    titleLines = pdf.splitTextToSize(title, CONTENT_WIDTH * 0.68);
    titleLines.forEach((line: string, index: number) => pdf.text(line, MARGIN, headerY + index * 9));
  }
  if (faculty.trim() || subject.trim() || author.trim()) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    let metaY = headerY;
    if (faculty.trim()) { pdf.text(faculty.trim(), pageWidth - MARGIN, metaY, { align: "right" }); metaY += 4.5; }
    if (subject.trim()) { pdf.text(subject.trim(), pageWidth - MARGIN, metaY, { align: "right" }); metaY += 4.5; }
    if (author.trim()) pdf.text(author.trim(), pageWidth - MARGIN, metaY, { align: "right" });
  }
  const metaHeight = [faculty, subject, author].filter((value) => value.trim()).length * 4.5;
  const lineY = headerY + Math.max(titleLines.length * 9, metaHeight) + 3;
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.25);
  pdf.line(MARGIN, lineY, pageWidth - MARGIN, lineY);
  return lineY + 12;
}

async function renderPage(pdf: jsPDF, page: PaginationPage, index: number, title: string, author: string, subject: string, faculty: string): Promise<void> {
  let y = drawPageHeader(pdf, title, author, subject, faculty, index === 0);
  const pageWidth = pdf.internal.pageSize.getWidth();

  for (const concept of page.concepts) {
    const indent = Math.min(concept.level * 7, 45);
    const x = MARGIN + indent;
    const width = CONTENT_WIDTH - indent;

    if (concept.showTitle !== false) {
      const fontSize = Math.max(14 - concept.level, 9);
      const heading = `${concept.showNumber !== false && concept.number ? `${concept.number} ` : ""}${concept.title || ""}`;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(fontSize);
      pdf.setTextColor(15, 23, 42);
      const headingLines = pdf.splitTextToSize(heading, width);
      for (const line of headingLines) { pdf.text(line, x, y); y += fontSize * 0.45; }
      y += 2;
    }

    for (const block of concept.content) {
      if (block.type === "text") y = drawTextLine(pdf, block, x + 2, y);
      else if (block.type === "image") y = await drawPlannedImage(pdf, block, x, y, width);
    }
    y += 2;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`ReStudio · ${index + 1}`, pageWidth / 2, PAGE_HEIGHT - 7, { align: "center" });
}

export function generatePDF(title: string, concepts: Concept[]): Promise<void>;
export function generatePDF(title: string, author: string, subject: string, concepts: Concept[]): Promise<void>;
export function generatePDF(title: string, author: string, subject: string, faculty: string, concepts: Concept[]): Promise<void>;

export async function generatePDF(title: string, authorOrConcepts: string | Concept[], subjectOrUndefined?: string, facultyOrConcepts?: string | Concept[], conceptsOrUndefined?: Concept[]): Promise<void> {
  const author = typeof authorOrConcepts === "string" ? authorOrConcepts : "";
  const subject = typeof authorOrConcepts === "string" ? subjectOrUndefined ?? "" : "";
  const faculty = typeof authorOrConcepts === "string" && typeof facultyOrConcepts === "string" ? facultyOrConcepts : "";
  const concepts = typeof authorOrConcepts === "string"
    ? (Array.isArray(facultyOrConcepts) ? facultyOrConcepts : conceptsOrUndefined ?? [])
    : authorOrConcepts;

  const pages = await paginateDocument(concepts.map((concept) => ({ ...concept, content: concept.content.map((block) => ({ ...block })) })), { title, author, subject, faculty });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    await renderPage(pdf, pages[i], i, title, author, subject, faculty);
  }

  if (pdf.getNumberOfPages() !== pages.length) {
    throw new Error(`La maquetación PDF no coincide con Modo Estudio. Plan=${pages.length}, PDF=${pdf.getNumberOfPages()}.`);
  }

  pdf.save(`${title.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, "-").slice(0, 100) || "mis-apuntes"}.pdf`);
}
