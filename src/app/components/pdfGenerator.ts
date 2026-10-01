import jsPDF from "jspdf";
import { getImage } from "./imageStorage";
import { paginateDocument, type PaginationPage } from "./documentPagination";

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
  showNumber?: boolean;
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
const IMAGE_TOP_MARGIN = 1.0;
const IMAGE_BOTTOM_MARGIN = 5.3;

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
  const color = inline.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
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
      style: {
        bold: false,
        italic: false,
        underline: false,
        color: DEFAULT_COLOR,
      },
    }]];
  }

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

  const walk = (
    node: Node,
    parentStyle: TextStyle,
    insideListItem = false
  ) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent || "";

      // Los saltos de línea que pueda contener el texto fuente se
      // consideran espacios. Los saltos reales se representan mediante
      // <p>, <div> o <br>.
      text = text.replace(/\s+/g, " ");

      if (text) {
        // No añadimos espacios de indentación que solo procedan del HTML.
        if (!current.length && !text.trim()) return;
        current.push({
          text,
          style: { ...parentStyle },
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const style = styleFor(el, parentStyle);

    if (tag === "br") {
      // Un <br> representa una nueva línea real, incluso aunque no haya
      // contenido antes de él.
      finish(true);
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

    const childInsideListItem = insideListItem || tag === "li";

    for (const child of Array.from(el.childNodes)) {
      walk(child, style, childInsideListItem);
    }

    // Estos elementos representan bloques independientes en Tiptap.
    // Dentro de un <li> no cerramos el párrafo al encontrar un <p>
    // anidado, para mantener viñeta y contenido en la misma línea.
    if (
      ["p", "div", "h1", "h2", "h3", "h4", "blockquote", "li"].includes(tag) &&
      !insideListItem
    ) {
      finish(true);
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

  while (
    result.length > 0 &&
    result[result.length - 1].length === 0
  ) {
    result.pop();
  }

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
  const lineHeight = 5.2;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  const spaceWidth = pdf.getTextWidth(" ");

  type Word = { text: string; style: TextStyle; width: number };

  const makeWords = (paragraph: Run[]): Word[] => {
    const words: Word[] = [];

    for (const run of paragraph) {
      for (const token of run.text.trim().split(/\s+/)) {
        if (!token) continue;

        pdf.setFont("helvetica", fontStyle(run.style));
        pdf.setFontSize(10);

        words.push({
          text: token,
          style: run.style,
          width: pdf.getTextWidth(token),
        });
      }
    }

    return words;
  };

  const drawLine = (
    words: Word[],
    lineX: number,
    lineWidth: number,
    justify: boolean
  ) => {
    if (!words.length) return;

    const totalWordsWidth = words.reduce(
      (sum, word) => sum + word.width,
      0
    );
    const gaps = Math.max(0, words.length - 1);

    const gap =
      justify && gaps > 0
        ? Math.max(spaceWidth, (lineWidth - totalWordsWidth) / gaps)
        : spaceWidth;

    let cursor = lineX;

    for (const word of words) {
      pdf.setFont("helvetica", fontStyle(word.style));
      pdf.setFontSize(10);
      pdf.setTextColor(...word.style.color);
      pdf.text(word.text, cursor, y);

      if (word.style.underline) {
        pdf.setDrawColor(...word.style.color);
        pdf.setLineWidth(0.2);
        pdf.line(
          cursor,
          y + 0.8,
          cursor + word.width,
          y + 0.8
        );
      }

      cursor += word.width + gap;
    }
  };

  for (const paragraph of paragraphs) {
    if (
      paragraph.length === 1 &&
      paragraph[0].text === "__RESTUDIO_PAGE_BREAK__"
    ) {
      y = startNewPage();
      continue;
    }

    const words = makeWords(paragraph);

    if (!words.length) {
      y += lineHeight;
      continue;
    }

    const isList =
      words[0].text === "•" ||
      /^\d+\.$/.test(words[0].text);

    let subsequentX = x;

    if (isList) {
      pdf.setFont("helvetica", fontStyle(words[0].style));
      pdf.setFontSize(10);

      // Sangría francesa: las líneas posteriores empiezan
      // exactamente donde comienza el texto tras la viñeta/número.
      subsequentX = x + words[0].width + 3;
    }

    const lines: Word[][] = [];
    let currentLine: Word[] = [];
    let currentWidth = 0;

    for (const word of words) {
      const lineX =
        lines.length === 0 ? x : subsequentX;
      const availableWidth = width - (lineX - x);

      const proposedWidth =
        currentWidth +
        (currentLine.length > 0 ? spaceWidth : 0) +
        word.width;

      if (
        currentLine.length > 0 &&
        proposedWidth > availableWidth
      ) {
        lines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
      }

      currentLine.push(word);
      currentWidth +=
        word.width +
        (currentLine.length > 1 ? spaceWidth : 0);
    }

    if (currentLine.length) {
      lines.push(currentLine);
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const lineX =
        isList && lineIndex > 0
          ? subsequentX
          : x;

      const availableWidth = width - (lineX - x);

      if (y > pageHeight - BOTTOM) {
        y = startNewPage();
      }

      // Se justifican todas las líneas salvo la última del párrafo.
      const justify =
        lineIndex < lines.length - 1 &&
        line.length > 1;

      drawLine(line, lineX, availableWidth, justify);
      y += lineHeight;
    }

    y += 1.5;
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

  const pageHeight = pdf.internal.pageSize.getHeight();

  // En jsPDF el texto se dibuja desde la línea base. Por eso un margen
  // numéricamente igual arriba y abajo no produce la misma distancia visual.
  // Estos valores compensan esa diferencia para que el hueco visible resulte
  // equivalente.
  if (
    y + IMAGE_TOP_MARGIN + height >
    pageHeight - BOTTOM
  ) {
    y = startNewPage();
  }

  y += IMAGE_TOP_MARGIN;

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

  return y + height + IMAGE_BOTTOM_MARGIN;
}

function safeName(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\\\|?*]/g, "-")
      .replace(/\s+/g, "-")
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

    let titleLineCount = 0;

    if (showTitle) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(22);
      pdf.setTextColor(30, 41, 59);

      const titleLines = pdf.splitTextToSize(
        title || "Mis apuntes",
        contentWidth * 0.68
      );

      titleLineCount = Math.max(1, titleLines.length);

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

    // La línea se coloca DESPUÉS de todas las líneas del título.
    // jsPDF dibuja el texto desde la línea base; por eso una posición
    // fija como MARGIN + 7 podía atravesar la segunda línea del título.
    const lineY = showTitle
      ? headerY + titleLineCount * 9 + 3
      : MARGIN + 5;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.25);
    pdf.line(MARGIN, lineY, pageWidth - MARGIN, lineY);

    // Más separación entre la línea y el primer concepto.
    return lineY + 12;
  }

  /*
   * IMPORTANTE:
   * Modo Estudio y PDF utilizan EXACTAMENTE el mismo plan.
   */
  const pages: PaginationPage[] =
    paginateDocument(concepts);

  // Renderizar exactamente las páginas planificadas.
  let unexpectedPhysicalPageBreak = false;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    if (pageIndex > 0) {
      pdf.addPage();
    }

    let y = drawPageHeader(pageIndex === 0);

    const startNewPage = () => {
      /*
       * El plan ya ha decidido la página.
       * Este callback solo existe como protección contra un desajuste
       * de medidas de renderizado. Se registra para no ocultarlo.
       */
      unexpectedPhysicalPageBreak = true;
      pdf.addPage();
      return drawPageHeader(false);
    };

    for (const concept of pages[pageIndex].concepts) {
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

      if (concept.showTitle) {
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
          `${concept.showNumber !== false && concept.number ? `${concept.number} ` : ""}${concept.title || "Sin título"}`;

        for (const line of pdf.splitTextToSize(
          heading,
          width
        )) {
          pdf.text(line, x, y);
          y += fontSize * 0.45;
        }

        y += 4;
      }

      for (let blockIndex = 0; blockIndex < concept.content.length; blockIndex++) {
        const block = concept.content[blockIndex];
        const nextBlock = concept.content[blockIndex + 1];

        // Los pageBreaks no se renderizan: ya han determinado la página
        // durante la planificación.
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

          // No añadimos el espaciado genérico cuando la siguiente pieza
          // es una imagen: la imagen aporta por sí sola su margen superior.
          if (nextBlock?.type !== "image") {
            y += 3;
          }
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

      const lastBlock =
        concept.content[concept.content.length - 1];

      if (lastBlock?.type !== "image") {
        y += 2;
      }
    }
  }

  const totalPages =
    pdf.getNumberOfPages();

  /*
   * Invariante de ReStudio:
   * el número físico de páginas debe ser exactamente el del plan común.
   */
  if (
    unexpectedPhysicalPageBreak ||
    totalPages !== pages.length
  ) {
    throw new Error(
      `La maquetación PDF no coincide con Modo Estudio. Plan=${pages.length}, PDF=${totalPages}.`
    );
  }

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
