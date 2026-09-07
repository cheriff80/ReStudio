export type PaginationTextBlock = {
  id: number;
  type: "text";
  content: string;
};

export type PaginationImageBlock = {
  id: number;
  type: "image";
  name: string;
  imageId: string;
  url?: string;
  width?: number;
};

export type PaginationBlock = PaginationTextBlock | PaginationImageBlock;

export type PaginationConcept = {
  id: number;
  title: string;
  level: number;
  content: PaginationBlock[];
};

export type PaginationPage = {
  concepts: PaginationConcept[];
};

const PAGE_HEIGHT = 1030;
const TITLE_HEIGHT = 95;
const BLOCK_SPACING = 22;
const CONCEPT_SPACING = 34;

function stripHtml(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ");
  }
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent || "";
}

function estimateTextHeight(html: string): number {
  const text = stripHtml(html).trim();
  if (!text) return 0;

  const paragraphs = Math.max(1, (html.match(/<p\b/gi) || []).length);
  const lines = Math.max(1, Math.ceil(text.length / 78));

  return Math.max(70, lines * 24 + (paragraphs - 1) * 12);
}

function estimateBlockHeight(block: PaginationBlock): number {
  if (block.type === "image") {
    const width = Math.max(25, Math.min(100, block.width ?? 75));
    return 280 * (width / 75) + BLOCK_SPACING;
  }

  return estimateTextHeight(block.content) + BLOCK_SPACING;
}

function estimateConceptHeight(concept: PaginationConcept): number {
  return (
    TITLE_HEIGHT +
    concept.content.reduce(
      (sum, block) => sum + estimateBlockHeight(block),
      0
    ) +
    CONCEPT_SPACING
  );
}

export function paginateDocument(
  concepts: PaginationConcept[]
): PaginationPage[] {
  const pages: PaginationPage[] = [];
  let current: PaginationConcept[] = [];
  let height = 0;

  const newPage = () => {
    if (current.length) pages.push({ concepts: current });
    current = [];
    height = 0;
  };

  for (const concept of concepts) {
    const full = estimateConceptHeight(concept);

    if (height + full <= PAGE_HEIGHT) {
      current.push(concept);
      height += full;
      continue;
    }

    if (current.length) newPage();

    if (full <= PAGE_HEIGHT) {
      current.push(concept);
      height = full;
      continue;
    }

    let partial: PaginationConcept = { ...concept, content: [] };
    let partialHeight = TITLE_HEIGHT;

    for (const block of concept.content) {
      const blockHeight = estimateBlockHeight(block);

      if (
        partial.content.length > 0 &&
        partialHeight + blockHeight > PAGE_HEIGHT
      ) {
        current.push(partial);
        height += partialHeight + CONCEPT_SPACING;
        newPage();
        partial = { ...concept, content: [] };
        partialHeight = TITLE_HEIGHT;
      }

      partial.content.push(block);
      partialHeight += blockHeight;
    }

    if (partial.content.length) {
      current.push(partial);
      height += partialHeight + CONCEPT_SPACING;
    }
  }

  newPage();
  return pages.length ? pages : [{ concepts: [] }];
}
