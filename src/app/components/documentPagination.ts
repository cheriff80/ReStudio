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

export type PaginationPageBreakBlock = {
  id: number;
  type: "pageBreak";
};

export type PaginationBlock = PaginationTextBlock | PaginationImageBlock | PaginationPageBreakBlock;

export type PaginationConcept = {
  id: number;
  title: string;
  level: number;
  content: PaginationBlock[];
  showTitle?: boolean;
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
  if (block.type === "pageBreak") return 0;

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

  const pushFragment = (
    concept: PaginationConcept,
    content: PaginationBlock[],
    showTitle: boolean
  ) => {
    if (!content.length) return;

    current.push({
      ...concept,
      content,
      showTitle,
    });

    height +=
      (showTitle ? TITLE_HEIGHT : 0) +
      content.reduce(
        (sum, block) => sum + estimateBlockHeight(block),
        0
      ) +
      CONCEPT_SPACING;
  };

  for (const concept of concepts) {
    let fragment: PaginationBlock[] = [];
    let showTitle = true;
    let fragmentHeight = TITLE_HEIGHT;
    let hasRenderedContent = false;

    const flushFragment = () => {
      if (!fragment.length) return;
      pushFragment(concept, fragment, showTitle);
      fragment = [];
      fragmentHeight = 0;
      showTitle = false;
    };

    for (const block of concept.content) {
      if (block.type === "pageBreak") {
        // Un salto al principio de un concepto no debe separar
        // el título de su primer contenido. Los saltos útiles
        // son los que aparecen entre bloques de contenido.
        if (!hasRenderedContent && fragment.length === 0) {
          continue;
        }

        flushFragment();
        newPage();

        showTitle = false;
        fragmentHeight = 0;
        continue;
      }

      const blockHeight = estimateBlockHeight(block);

      if (
        fragment.length > 0 &&
        fragmentHeight + blockHeight > PAGE_HEIGHT
      ) {
        flushFragment();
        newPage();
        showTitle = false;
        fragmentHeight = 0;
      }

      fragment.push(block);
      fragmentHeight += blockHeight;
      hasRenderedContent = true;

      if (fragment.length === 1 && fragmentHeight > PAGE_HEIGHT) {
        flushFragment();
        newPage();
        showTitle = false;
        fragmentHeight = 0;
      }
    }

    flushFragment();
  }

  newPage();
  return pages.length ? pages : [{ concepts: [] }];
}
