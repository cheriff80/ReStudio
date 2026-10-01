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

export type PaginationBlock =
  | PaginationTextBlock
  | PaginationImageBlock
  | PaginationPageBreakBlock;

export type PaginationConcept = {
  id: number;
  title: string;
  level: number;
  content: PaginationBlock[];
  showTitle?: boolean;
  number?: string;
  showNumber?: boolean;
};

export type PaginationPage = {
  concepts: PaginationConcept[];
};

/**
 * Numeración jerárquica:
 * 1, 1.1, 1.2, 2, 2.1, 2.1.1...
 */
export function getConceptNumber(
  concepts: PaginationConcept[],
  index: number
): string {
  const counters: number[] = [];

  for (let i = 0; i <= index; i++) {
    // Solo los conceptos marcados como "Numerar" consumen un número.
    if (concepts[i].showNumber === false) {
      continue;
    }

    // Si no existe todavía una rama numerada que justifique este nivel,
    // este concepto inicia la numeración disponible desde el nivel 0.
    const requestedLevel = Math.max(0, concepts[i].level);
    const level = Math.min(requestedLevel, counters.length);

    // Si es el primer concepto numerado de la rama, comienza en 1.
    counters[level] =
      (counters[level] ?? 0) + 1;

    // Al bajar de nivel, se reinician los contadores de niveles inferiores.
    counters.length = level + 1;
  }

  // Si no hay ningún concepto numerado anterior, este es el primero: 1.
  return counters.length ? counters.join(".") : "1";
}

/*
 * ÚNICA FUENTE DE VERDAD PARA LA PAGINACIÓN.
 *
 * Modo Estudio y PDF consumen exactamente este resultado.
 * No hay un segundo algoritmo de paginación en el generador PDF.
 */
export const PAGE_HEIGHT = 1030;
export const TITLE_HEIGHT = 95;
export const BLOCK_SPACING = 22;
export const CONCEPT_SPACING = 34;

function stripHtml(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, " ");
  }

  const element = document.createElement("div");
  element.innerHTML = html;

  return element.textContent || "";
}

function estimateTextHeight(html: string): number {
  const text = stripHtml(html).trim();

  if (!text) {
    return 0;
  }

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

export function estimateBlockHeight(
  block: PaginationBlock
): number {
  if (block.type === "pageBreak") {
    return 0;
  }

  if (block.type === "image") {
    const width = Math.max(
      25,
      Math.min(100, block.width ?? 75)
    );

    return (
      280 * (width / 75) +
      BLOCK_SPACING
    );
  }

  return (
    estimateTextHeight(block.content) +
    BLOCK_SPACING
  );
}

/*
 * Devuelve las páginas finales.
 *
 * Importante:
 * - Tiene en cuenta lo que YA ocupa la página.
 * - Un pageBreak siempre comienza la siguiente página.
 * - Un concepto que continúa en una página posterior no vuelve
 *   a mostrar su título.
 */
export function paginateDocument(
  concepts: PaginationConcept[]
): PaginationPage[] {
  const pages: PaginationPage[] = [];

  let currentConcepts: PaginationConcept[] = [];
  let usedHeight = 0;

  let fragment: PaginationBlock[] = [];
  let fragmentHeight = 0;
  let currentConcept: PaginationConcept | null = null;
  let showTitle = true;
  let hasRenderedContent = false;

  const fragmentOffset = () =>
    currentConcepts.length > 0
      ? CONCEPT_SPACING
      : 0;

  const flushFragment = () => {
    if (
      !currentConcept ||
      fragment.length === 0
    ) {
      return;
    }

    const offset = fragmentOffset();

    currentConcepts.push({
      ...currentConcept,
      content: [...fragment],
      showTitle,
    });

    usedHeight +=
      offset + fragmentHeight;

    fragment = [];
    fragmentHeight = 0;
  };

  const newPage = () => {
    flushFragment();

    if (currentConcepts.length > 0) {
      pages.push({
        concepts: currentConcepts,
      });
    }

    currentConcepts = [];
    usedHeight = 0;
  };

  for (
    let conceptIndex = 0;
    conceptIndex < concepts.length;
    conceptIndex++
  ) {
    const concept: PaginationConcept = {
      ...concepts[conceptIndex],
      number: getConceptNumber(
        concepts,
        conceptIndex
      ),
    };

    currentConcept = concept;
    fragment = [];
    fragmentHeight = TITLE_HEIGHT;
    showTitle = true;
    hasRenderedContent = false;

    for (const block of concept.content) {
      /*
       * SALTO DE PÁGINA EXPLÍCITO
       */
      if (block.type === "pageBreak") {
        if (
          !hasRenderedContent &&
          fragment.length === 0
        ) {
          continue;
        }

        flushFragment();
        newPage();

        /*
         * El contenido posterior pertenece al mismo concepto,
         * pero continúa en la nueva página sin repetir su título.
         */
        showTitle = false;
        fragmentHeight = 0;
        hasRenderedContent = false;

        continue;
      }

      const blockHeight =
        estimateBlockHeight(block);

      /*
       * ¿El bloque actual cabe considerando TODO lo que ya
       * ocupa esta página?
       */
      const offset =
        fragmentOffset();

      const projectedHeight =
        usedHeight +
        offset +
        fragmentHeight +
        blockHeight;

      if (
        fragment.length > 0 &&
        projectedHeight > PAGE_HEIGHT
      ) {
        /*
         * Cerramos el fragmento actual y pasamos de página.
         */
        flushFragment();
        newPage();

        showTitle = false;
        fragmentHeight = 0;
        hasRenderedContent = false;
      } else if (
        fragment.length === 0 &&
        projectedHeight > PAGE_HEIGHT &&
        usedHeight > 0
      ) {
        /*
         * El nuevo concepto no cabe en el espacio restante.
         * Empieza completo en la siguiente página.
         */
        newPage();

        showTitle = true;
        fragmentHeight = TITLE_HEIGHT;
        hasRenderedContent = false;
      }

      fragment.push(block);
      fragmentHeight += blockHeight;
      hasRenderedContent = true;

      /*
       * Un bloque individual que supera la página no puede dividirse
       * estructuralmente aquí. Se deja como fragmento único para que
       * ambos renderizadores reciban exactamente la misma decisión.
       */
    }

    flushFragment();

    currentConcept = null;
    fragment = [];
    fragmentHeight = 0;
    showTitle = true;
    hasRenderedContent = false;
  }

  if (currentConcepts.length > 0) {
    pages.push({
      concepts: currentConcepts,
    });
  }

  return pages.length
    ? pages
    : [{ concepts: [] }];
}
