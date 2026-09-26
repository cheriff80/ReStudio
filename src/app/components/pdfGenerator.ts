import jsPDF from "jspdf";
import { getImage } from "./imageStorage";

type TextBlock = {
  id: number;
  type: "text";
  content: string;
};

type ImageBlock = {
  id: number;
  type: "image";
  name: string;
  imageId: string;
  url?: string;
  width?: number;
};

type PageBreakBlock = {
  id: number;
  type: "pageBreak";
};

type ContentBlock = TextBlock | ImageBlock | PageBreakBlock;

type Concept = {
  id: number;
  title: string;
  level: number;
  content: ContentBlock[];
};

type TextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: [number, number, number];
};

const DEFAULT_COLOR: [number, number, number] = [45, 55, 72];
const MARGIN = 18;
const BOTTOM = 18;

function colorOf(value: string): [number, number, number] {
  const v = value.trim().toLowerCase();

  if (v.startsWith("#")) {
    const h = v.slice(1);
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    if (h.length >= 6) {
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
  }

  const rgb = v.match(
  /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  return DEFAULT_COLOR;
}

function styleFor(el: HTMLElement, parent: TextStyle): TextStyle {
  const s = { ...parent };
  const tag = el.tagName.toLowerCase();

  if (tag === "b" || tag === "strong") s.bold = true;
  if (tag === "i" || tag === "em") s.italic = true;
  if (tag === "u") s.underline = true;

  const inline = el.getAttribute("style") || "";
  const color = inline.match(/(?:^|;)\\s*color\\s*:\\s*([^;]+)/i);
  if (color) s.color = colorOf(color[1]);

  return s;
}

function fontStyle(s: TextStyle): "normal" | "bold" | "italic" | "bolditalic" {
  if (s.bold && s.italic) return "bolditalic";
  if (s.bold) return "bold";
  if (s.italic) return "italic";
  return "normal";
}

type Run = { text: string; style: TextStyle };

function htmlToParagraphs(html: string): Run[][] {
  if (typeof document === "undefined") {
    return [[{
      text: html.replace(/<[^>]*>/g, ""),
      style: { bold: false, italic: false, underline: false, color: DEFAULT_COLOR },
    }]];
  }

  const root = document.createElement("div");
  root.innerHTML = html;

  const result: Run[][] = [];
  let current: Run[] = [];

  const finish = () => {
    if (current.length) {
      result.push(current);
      current = [];
    }
  };

  const walk = (node: Node, parentStyle: TextStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) current.push({ text, style: { ...parentStyle } });
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = styleFor(el, parentStyle);

    if (tag === "br") {
      finish();
      return;
    }

    if (el.hasAttribute("data-page-break")) {
      finish();
      result.push([{
        text: "__RESTUDIO_PAGE_BREAK__",
        style,
      }]);
      return;
    }

    if (tag === "li") {
      const ordered = el.parentElement?.tagName.toLowerCase() === "ol";
      const siblings = el.parentElement
        ? Array.from(el.parentElement.children)
        : [];
      const number = siblings.indexOf(el) + 1;

      current.push({
        text: ordered ? `${number}. ` : "• ",
        style,
      });
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, style);
    }

    if (["p", "div", "h1", "h2", "h3", "h4", "blockquote", "li"].includes(tag)) {
      finish();
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child, {
      bold: false,
      italic: false,
      underline: false,
      color: DEFAULT_COLOR,
    });
  }

  finish();
  return result;
}

function drawRichText(
  pdf: jsPDF,
  html: string,
  x: number,
  y: number,
  width: number,
  pageHeight: number,
  startNewPage: () => number
): number {
  const paragraphs = htmlToParagraphs(html);

  for (const paragraph of paragraphs) {
    if (paragraph.length === 1 && paragraph[0].text === "__RESTUDIO_PAGE_BREAK__") {
      y = startNewPage();
      continue;
    }

    let cursor = x;

    for (const run of paragraph) {
      for (const token of run.text.split(/(\\s+)/)) {
        if (!token) continue;

        pdf.setFont("helvetica", fontStyle(run.style));
        pdf.setFontSize(10);

        const tokenWidth = pdf.getTextWidth(token);

        if (cursor !== x && cursor + tokenWidth > x + width) {
          y += 5.2;
          cursor = x;
        }

        if (y > pageHeight - BOTTOM) {
          y = startNewPage();
          cursor = x;
        }

        pdf.setTextColor(...run.style.color);
        pdf.text(token, cursor, y);

        if (run.style.underline) {
          pdf.setDrawColor(...run.style.color);
          pdf.setLineWidth(0.2);
          pdf.line(cursor, y + 0.8, cursor + tokenWidth, y + 0.8);
        }

        cursor += tokenWidth;
      }
    }

    y += 5.2;
  }

  return y;
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
      if (!ctx) {
        reject(new Error("No se pudo crear canvas"));
        return;
      }

      ctx.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    image.src = source;
  });
}

async function drawImage(
  pdf: jsPDF,
  source: string,
  x: number,
  y: number,
  availableWidth: number,
  widthPercent: number,
  startNewPage: () => number
): Promise<number> {
  const dataUrl = await toDataUrl(source);

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo medir la imagen"));
    image.src = dataUrl;
  });

  const width = availableWidth * Math.max(0.25, Math.min(1, widthPercent / 100));
  const ratio = image.naturalHeight / image.naturalWidth;
  let height = width * ratio;

  const maxHeight = 90;
  if (height > maxHeight) {
    height = maxHeight;
  }

  if (y + height > pdf.internal.pageSize.getHeight() - BOTTOM) {
    y = startNewPage();
  }

  const realWidth = height / ratio;
  const imageX = x + (availableWidth - realWidth) / 2;

  pdf.addImage(
    dataUrl,
    dataUrl.toLowerCase().startsWith("data:image/jpeg") ? "JPEG" : "PNG",
    imageX,
    y,
    realWidth,
    height
  );

  return y + height + 8;
}

function numberOf(concepts: Concept[], index: number): string {
  const counters: number[] = [];

  for (let i = 0; i <= index; i++) {
    const level = concepts[i].level;
    counters[level] = (counters[level] || 0) + 1;
    counters.splice(level + 1);
  }

  return counters.join(".");
}

function safeName(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\\\|?*]/g, "-")
      .replace(/\\s+/g, "-")
      .slice(0, 100) || "mis-apuntes"
  );
}


export function generatePDF(
  title: string,
  concepts: Concept[]
): Promise<void>;
export function generatePDF(
  title: string,
  author: string,
  subject: string,
  concepts: Concept[]
): Promise<void>;

export async function generatePDF(
  title: string,
  authorOrConcepts: string | Concept[],
  subjectOrUndefined?: string,
  conceptsOrUndefined?: Concept[]
): Promise<void> {
  const author =
    typeof authorOrConcepts === "string"
      ? authorOrConcepts
      : "";
  const subject =
    typeof authorOrConcepts === "string"
      ? subjectOrUndefined ?? ""
      : "";
  const concepts =
    typeof authorOrConcepts === "string"
      ? conceptsOrUndefined ?? []
      : authorOrConcepts;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;

  function drawPageHeader(showTitle: boolean): number {
    const headerY = MARGIN;

    if (showTitle) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(30, 41, 59);

      const titleLines = pdf.splitTextToSize(
        title || "Mis apuntes",
        contentWidth * 0.68
      );

      titleLines.forEach((line: string, index: number) => {
        pdf.text(line, MARGIN, headerY + index * 9);
      });
    }

    if (author.trim() || subject.trim()) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);

      let metaY = headerY;
      if (author.trim()) {
        pdf.text(author.trim(), pageWidth - MARGIN, metaY, {
          align: "right",
        });
        metaY += 4.5;
      }
      if (subject.trim()) {
        pdf.text(subject.trim(), pageWidth - MARGIN, metaY, {
          align: "right",
        });
      }
    }

    // La separación título -> línea se mantiene.
    const lineY = MARGIN + (showTitle ? 7 : 5);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN, lineY, pageWidth - MARGIN, lineY);

    // Más separación entre la línea y el primer concepto.
    return lineY + 12;
  }

  /*
   * IMPORTANTE:
   * La Vista previa y el PDF deben usar la misma planificación.
   * Aquí reproducimos exactamente la lógica de documentPagination.ts
   * mediante una copia local de sus constantes/estimaciones, para que
   * la distribución de conceptos y bloques sea la misma.
   */
  const PAGE_HEIGHT_PX = 1030;
  const TITLE_HEIGHT_PX = 95;
  const BLOCK_SPACING_PX = 22;
  const CONCEPT_SPACING_PX = 34;

  function stripHtmlForPagination(html: string): string {
    if (typeof document === "undefined") {
      return html.replace(/<[^>]*>/g, " ");
    }
    const el = document.createElement("div");
    el.innerHTML = html;
    return el.textContent || "";
  }

  function estimateTextHeightForPagination(html: string): number {
    const text = stripHtmlForPagination(html).trim();
    if (!text) return 0;

    const paragraphs = Math.max(
      1,
      (html.match(/<p\b/gi) || []).length
    );
    const lines = Math.max(
      1,
      Math.ceil(text.length / 78)
    );

    return Math.max(
      70,
      lines * 24 + (paragraphs - 1) * 12
    );
  }

  function estimateBlockHeightForPagination(
    block: ContentBlock
  ): number {
    if (block.type === "pageBreak") return 0;

    if (block.type === "image") {
      const width = Math.max(
        25,
        Math.min(100, block.width ?? 75)
      );
      return (
        280 * (width / 75) +
        BLOCK_SPACING_PX
      );
    }

    return (
      estimateTextHeightForPagination(block.content) +
      BLOCK_SPACING_PX
    );
  }

  type PDFFragment = {
    concept: Concept;
    content: ContentBlock[];
    showTitle: boolean;
  };

  const pages: PDFFragment[][] = [];
  let currentPage: PDFFragment[] = [];
  let height = 0;

  const newPagePlan = () => {
    if (currentPage.length) {
      pages.push(currentPage);
    }
    currentPage = [];
    height = 0;
  };

  const pushFragment = (
    concept: Concept,
    content: ContentBlock[],
    showTitle: boolean
  ) => {
    if (!content.length) return;

    currentPage.push({
      concept,
      content,
      showTitle,
    });

    height +=
      (showTitle ? TITLE_HEIGHT_PX : 0) +
      content.reduce(
        (sum, block) =>
          sum +
          estimateBlockHeightForPagination(block),
        0
      ) +
      CONCEPT_SPACING_PX;
  };

  // MISMA PLANIFICACIÓN QUE LA VISTA PREVIA.
  for (const concept of concepts) {
    let fragment: ContentBlock[] = [];
    let showTitle = true;
    let fragmentHeight = TITLE_HEIGHT_PX;
    let hasRenderedContent = false;

    const flushFragment = () => {
      if (!fragment.length) return;

      pushFragment(
        concept,
        fragment,
        showTitle
      );

      fragment = [];
      fragmentHeight = 0;
      showTitle = false;
    };

    for (const block of concept.content) {
      if (block.type === "pageBreak") {
        if (
          !hasRenderedContent &&
          fragment.length === 0
        ) {
          continue;
        }

        flushFragment();
        newPagePlan();

        showTitle = false;
        fragmentHeight = 0;
        continue;
      }

      const blockHeight =
        estimateBlockHeightForPagination(block);

      if (
        fragment.length > 0 &&
        fragmentHeight + blockHeight >
          PAGE_HEIGHT_PX
      ) {
        flushFragment();
        newPagePlan();
        showTitle = false;
        fragmentHeight = 0;
      }

      fragment.push(block);
      fragmentHeight += blockHeight;
      hasRenderedContent = true;

      if (
        fragment.length === 1 &&
        fragmentHeight > PAGE_HEIGHT_PX
      ) {
        flushFragment();
        newPagePlan();
        showTitle = false;
        fragmentHeight = 0;
      }
    }

    flushFragment();
  }

  newPagePlan();

  if (!pages.length) {
    pages.push([]);
  }

  // Renderizar exactamente las páginas planificadas.
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    let y = drawPageHeader(pageIndex === 0);

    const startNewPage = () => {
      /*
       * La paginación ya está decidida por el plan de Vista previa.
       * Si un bloque concreto necesita más espacio del estimado,
       * permitimos un salto físico de emergencia, pero nunca por
       * un pageBreak que ya haya sido tratado por el plan.
       */
      pdf.addPage();
      return drawPageHeader(false);
    };

    for (const fragment of pages[pageIndex]) {
      const concept = fragment.concept;
      const indent = Math.min(
        concept.level * 7,
        45
      );
      const x = MARGIN + indent;
      const width = contentWidth - indent;
      const fontSize = Math.max(
        14 - concept.level,
        9
      );

      if (fragment.showTitle) {
        pdf.setFont(
          "helvetica",
          "bold"
        );
        pdf.setFontSize(fontSize);
        pdf.setTextColor(
          15,
          23,
          42
        );

        const heading =
          `${numberOf(
            concepts,
            concepts.indexOf(concept)
          )} ${concept.title || "Sin título"}`;

        for (const line of pdf.splitTextToSize(
          heading,
          width
        )) {
          pdf.text(line, x, y);
          y += fontSize * 0.45;
        }

        y += 4;
      }

      for (const block of fragment.content) {
        // Los pageBreaks no se renderizan : ils ont déjà déterminé
        // la página durante la planificación.
        if (block.type === "pageBreak") {
          continue;
        }

        if (block.type === "text") {
          if (!block.content.trim()) continue;

          y = drawRichText(
            pdf,
            block.content,
            x + 2,
            y,
            width - 2,
            pageHeight,
            startNewPage
          );
          y += 3;
        }

        if (block.type === "image") {
          try {
            const imageUrl =
              block.url ??
              (await getImage(
                block.imageId
              ));

            if (!imageUrl) continue;

            y = await drawImage(
              pdf,
              imageUrl,
              x,
              y,
              width,
              block.width ?? 75,
              startNewPage
            );
          } catch (error) {
            console.error(
              "Error añadiendo imagen al PDF:",
              error
            );
          }
        }
      }

      y += 2;
    }
  }

  const totalPages =
    pdf.getNumberOfPages();

  for (
    let page = 1;
    page <= totalPages;
    page++
  ) {
    pdf.setPage(page);
    pdf.setFont(
      "helvetica",
      "normal"
    );
    pdf.setFontSize(8);
    pdf.setTextColor(
      148,
      163,
      184
    );
    pdf.text(
      `ReStudio · ${page} / ${totalPages}`,
      pageWidth / 2,
      pageHeight - 7,
      { align: "center" }
    );
  }

  pdf.save(
    `${safeName(title)}.pdf`
  );
}
