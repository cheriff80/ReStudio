import jsPDF from "jspdf";
import { getImage } from "./imageStorage";

export type PaginationTextBlock = { id: number; type: "text"; content: string; justify?: boolean; lineWidth?: number; xOffset?: number };
export type PaginationImageBlock = { id: number; type: "image"; name: string; imageId: string; url?: string; width?: number; aspectRatio?: number };
export type PaginationPageBreakBlock = { id: number; type: "pageBreak" };
export type PaginationBlock = PaginationTextBlock | PaginationImageBlock | PaginationPageBreakBlock;
export type PaginationConcept = { id: number; title: string; level: number; content: PaginationBlock[]; showTitle?: boolean; number?: string; showNumber?: boolean };
export type PaginationPage = { concepts: PaginationConcept[] };
export type PaginationDocumentOptions = { title?: string; author?: string; subject?: string; faculty?: string };

export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const MARGIN = 18;
export const BOTTOM = 18;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const LINE_HEIGHT = 5.2;
export const PARAGRAPH_AFTER = 1.5;
export const IMAGE_TOP_MARGIN = 1.0;
export const IMAGE_BOTTOM_MARGIN = 5.3;
export const CONCEPT_AFTER = 2;

type TextStyle = { bold: boolean; italic: boolean; underline: boolean; color: [number, number, number] };
type Run = { text: string; style: TextStyle };
const DEFAULT_COLOR: [number, number, number] = [45, 55, 72];

function fontStyle(s: TextStyle): "normal" | "bold" | "italic" | "bolditalic" {
  if (s.bold && s.italic) return "bolditalic";
  if (s.bold) return "bold";
  if (s.italic) return "italic";
  return "normal";
}

function styleFor(el: HTMLElement, parent: TextStyle): TextStyle {
  const s = { ...parent };
  const tag = el.tagName.toLowerCase();
  if (tag === "b" || tag === "strong") s.bold = true;
  if (tag === "i" || tag === "em") s.italic = true;
  if (tag === "u") s.underline = true;
  const inline = el.getAttribute("style") || "";
  const color = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  if (color) {
    const v = color[1].trim().toLowerCase();
    const h = v.startsWith("#") ? v.slice(1) : "";
    const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (h.length === 3) s.color = [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    else if (h.length >= 6) s.color = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    else if (rgb) s.color = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return s;
}

function htmlToParagraphs(html: string): Run[][] {
  const root = document.createElement("div");
  root.innerHTML = html;
  const result: Run[][] = [];
  let current: Run[] = [];

  const finish = (forceEmpty = false) => {
    if (current.length) {
      result.push(current);
      current = [];
    } else if (forceEmpty) {
      result.push([]);
    }
  };

  const walk = (node: Node, parentStyle: TextStyle, insideListItem = false) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || "").replace(/\s+/g, " ");
      if (text) current.push({ text, style: { ...parentStyle } });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = styleFor(el, parentStyle);

    if (tag === "br") {
      finish(true);
      return;
    }

    if (tag === "li") {
      const ordered = el.parentElement?.tagName.toLowerCase() === "ol";
      const siblings = el.parentElement ? Array.from(el.parentElement.children) : [];
      const number = siblings.indexOf(el) + 1;
      current.push({ text: ordered ? `${number}. ` : "• ", style });
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, style, insideListItem || tag === "li");
    }

    if (["p", "div", "h1", "h2", "h3", "h4", "blockquote", "li"].includes(tag) && !insideListItem) {
      finish(true);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child, { bold: false, italic: false, underline: false, color: DEFAULT_COLOR });
  }

  finish();
  while (result.length && result[result.length - 1].length === 0) result.pop();
  return result;
}

type Word = { text: string; style: TextStyle; width: number };

function measureSpaceWidth(pdf: jsPDF, style: TextStyle): number {
  pdf.setFont("helvetica", fontStyle(style));
  pdf.setFontSize(10);
  const direct = pdf.getTextWidth(" ");
  const measured = pdf.getTextWidth("A A") - pdf.getTextWidth("AA");
  return Math.max(direct, measured, 0.8);
}

function paragraphWords(pdf: jsPDF, paragraph: Run[]): Word[] {
  const words: Word[] = [];
  for (const run of paragraph) {
    for (const token of run.text.trim().split(/\s+/)) {
      if (!token) continue;
      pdf.setFont("helvetica", fontStyle(run.style));
      pdf.setFontSize(10);
      words.push({ text: token, style: run.style, width: pdf.getTextWidth(token) });
    }
  }
  return words;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function runHtml(run: Run): string {
  const style = [
    run.style.bold ? "font-weight:700" : "",
    run.style.italic ? "font-style:italic" : "",
    run.style.underline ? "text-decoration:underline" : "",
    `color:rgb(${run.style.color.join(",")})`,
  ].filter(Boolean).join(";");
  return `<span style="${style}">${escapeHtml(run.text)}</span>`;
}

function lineHtml(words: Word[], justify: boolean, gap: number, xOffset = 0): string {
  if (!words.length) return `<div style="height:${LINE_HEIGHT}mm;line-height:${LINE_HEIGHT}mm">&nbsp;</div>`;
  const space = measureSpaceWidth(new jsPDF({ unit: "mm" }), words[0].style);
  const extraWordSpacing = Math.max(0, gap - space);
  const style = [
    `height:${LINE_HEIGHT}mm`,
    `line-height:${LINE_HEIGHT}mm`,
    "font-size:10pt",
    "font-family:Arial,Helvetica,sans-serif",
    "white-space:nowrap",
    "overflow:hidden",
    xOffset > 0 ? `margin-left:${xOffset}mm;width:calc(100% - ${xOffset}mm)` : "",
    justify && extraWordSpacing > 0 ? `word-spacing:${extraWordSpacing}mm` : "",
  ].filter(Boolean).join(";");
  return `<div data-restudio-line="true" data-restudio-justify="${justify ? "true" : "false"}" style="${style}">${words.map((w, i) => `${i ? " " : ""}${runHtml({ ...w, text: w.text })}`).join("")}</div>`;
}

type SplitResult = { blocks: PaginationTextBlock[]; height: number };

function splitTextIntoPdfLines(pdf: jsPDF, html: string, width: number, idBase: number): SplitResult {
  const paragraphs = htmlToParagraphs(html);
  const blocks: PaginationTextBlock[] = [];
  let id = idBase;

  for (const paragraph of paragraphs) {
    const words = paragraphWords(pdf, paragraph);
    if (!words.length) {
      blocks.push({ id: id++, type: "text", content: lineHtml([], false, 0), justify: false, lineWidth: width, xOffset: 0 });
      continue;
    }

    const isList = words[0].text === "•" || /^\d+\.$/.test(words[0].text);
    const subsequentOffset = isList ? words[0].width + 3 : 0;
    const lines: Word[][] = [];
    let current: Word[] = [];
    let currentWidth = 0;

    for (const word of words) {
      const available = width - (current.length > 0 && isList ? subsequentOffset : 0);
      const spaceWidth = measureSpaceWidth(pdf, current[0]?.style ?? word.style);
      const proposed = currentWidth + (current.length ? spaceWidth : 0) + word.width;
      if (current.length && proposed > available) {
        lines.push(current);
        current = [];
        currentWidth = 0;
      }
      current.push(word);
      currentWidth += word.width + (current.length > 1 ? spaceWidth : 0);
    }
    if (current.length) lines.push(current);

    lines.forEach((line, index) => {
      const firstLine = index === 0;
      const lineWidth = width - (!firstLine && isList ? subsequentOffset : 0);
      const spaceWidth = measureSpaceWidth(pdf, line[0].style);
      const totalWordsWidth = line.reduce((sum, word) => sum + word.width, 0);
      const gaps = Math.max(0, line.length - 1);
      const justify = index < lines.length - 1 && gaps > 0;
      const gap = justify ? Math.max(spaceWidth, (lineWidth - totalWordsWidth) / gaps) : spaceWidth;
      const xOffset = !firstLine && isList ? subsequentOffset : 0;
      blocks.push({
        id: id++,
        type: "text",
        content: lineHtml(line, justify, gap, xOffset) + (index === lines.length - 1 ? `<div style="height:${PARAGRAPH_AFTER}mm"></div>` : ""),
        justify,
        lineWidth,
        xOffset,
      });
    });
  }

  return { blocks, height: blocks.length * LINE_HEIGHT + paragraphs.length * PARAGRAPH_AFTER };
}

async function imageHeight(pdf: jsPDF, block: PaginationImageBlock, availableWidth: number): Promise<number> {
  let source = block.url;
  if (!source) source = await getImage(block.imageId) ?? undefined;
  if (!source) return 0;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    image.src = source!;
  });

  const width = availableWidth * Math.max(0.25, Math.min(1, (block.width ?? 75) / 100));
  const ratio = image.naturalHeight / image.naturalWidth;
  const height = Math.min(width * ratio, 90);
  return IMAGE_TOP_MARGIN + height + IMAGE_BOTTOM_MARGIN;
}

function headerHeight(pdf: jsPDF, options: PaginationDocumentOptions, firstPage: boolean): number {
  const title = options.title || "";
  const metaLines = [options.faculty, options.subject, options.author].filter((value) => value?.trim()).length;
  const titleLines = firstPage && title.trim() ? pdf.splitTextToSize(title, CONTENT_WIDTH * 0.68).length : 0;
  const titleHeight = titleLines * 9;
  const metaHeight = metaLines * 4.5;
  const lineY = MARGIN + Math.max(titleHeight, metaHeight, 0) + 3;
  return lineY + 12;
}

export function getConceptNumber(concepts: PaginationConcept[], index: number): string {
  const counters: number[] = [];
  for (let i = 0; i <= index; i++) {
    if (concepts[i].showNumber === false) continue;
    const requestedLevel = Math.max(0, concepts[i].level);
    const level = Math.min(requestedLevel, counters.length);
    counters[level] = (counters[level] ?? 0) + 1;
    counters.length = level + 1;
  }
  return counters.length ? counters.join(".") : "1";
}

export async function paginateDocument(
  concepts: PaginationConcept[],
  options: PaginationDocumentOptions = {}
): Promise<PaginationPage[]> {
  if (typeof document === "undefined") throw new Error("paginateDocument necesita ejecutarse en navegador");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pages: PaginationPage[] = [];
  let current: PaginationConcept[] = [];
  let y = headerHeight(pdf, options, true);
  let firstPage = true;
  let pageHasContent = false;
  let nextId = 100000;

  const pushPage = () => {
    if (current.length) pages.push({ concepts: current });
    current = [];
    firstPage = false;
    y = headerHeight(pdf, options, false);
    pageHasContent = false;
  };

  for (let ci = 0; ci < concepts.length; ci++) {
    const source = { ...concepts[ci], number: getConceptNumber(concepts, ci) };
    const indent = Math.min(source.level * 7, 45);
    const width = CONTENT_WIDTH - indent;
    const heading = `${source.showNumber !== false && source.number ? `${source.number} ` : ""}${source.title || ""}`;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(Math.max(14 - source.level, 9));
    const headingLines = pdf.splitTextToSize(heading, width);
    const headingHeight = headingLines.length * Math.max(14 - source.level, 9) * 0.45 + 2;
    const hasRenderable = source.content.some(b => b.type !== "pageBreak");
    const shouldShowConcept: boolean =
    source.showNumber !== false ||
    source.title.trim().length > 0 ||
    hasRenderable;

    if (shouldShowConcept && pageHasContent && y + headingHeight > PAGE_HEIGHT - BOTTOM) {
      pushPage();
    }

    let showTitle = shouldShowConcept;
    let fragment: PaginationBlock[] = [];

    if (shouldShowConcept) {
      y += headingHeight;
      pageHasContent = true;
    }

    for (let bi = 0; bi < source.content.length; bi++) {
      const block = source.content[bi];

      if (block.type === "pageBreak") {
        if (fragment.length) {
          current.push({ ...source, content: fragment, showTitle });
          fragment = [];
        }
        if (pageHasContent || current.length) pushPage();
        showTitle = false;
        continue;
      }

      if (block.type === "image") {
        const h = await imageHeight(pdf, block, width);
        if (pageHasContent && y + h > PAGE_HEIGHT - BOTTOM) {
          if (fragment.length) current.push({ ...source, content: fragment, showTitle });
          pushPage();
          showTitle = false;
          fragment = [];
        }

        fragment.push(block);
        y += h;
        pageHasContent = true;
        continue;
      }

      if (block.type === "text") {
        if (!block.content.trim()) continue;

        const split = splitTextIntoPdfLines(pdf, block.content, width - 2, nextId);
        nextId += split.blocks.length + 1;

        for (const lineBlock of split.blocks) {
          const lineHeight = lineBlock.content.includes(`height:${PARAGRAPH_AFTER}mm`) ? LINE_HEIGHT + PARAGRAPH_AFTER : LINE_HEIGHT;
          if (pageHasContent && y + lineHeight > PAGE_HEIGHT - BOTTOM) {
            if (fragment.length) current.push({ ...source, content: fragment, showTitle });
            pushPage();
            showTitle = false;
            fragment = [];
          }

          fragment.push(lineBlock);
          y += lineHeight;
          pageHasContent = true;
        }
      }
    }

    if (fragment.length) {
      current.push({ ...source, content: fragment, showTitle });
      const last = fragment[fragment.length - 1];
      y += last.type === "image" ? 0 : CONCEPT_AFTER;
    } else if (shouldShowConcept) {
      // Un concepto puede ser únicamente un título (por ejemplo, "Tema 1").
      // Debe formar parte del plan aunque no tenga contenido propio.
      current.push({ ...source, content: [], showTitle });
      y += CONCEPT_AFTER;
    }
  }

  if (current.length) pages.push({ concepts: current });
  return pages.length ? pages : [{ concepts: [] }];
}
