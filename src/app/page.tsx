"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { DragDropProvider } from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";

import RichTextEditor from "./components/RichTextEditor";
import SortableBlock from "./components/SortableBlock";

import {
  saveImage,
  getImage,
  deleteImage,
} from "./components/imageStorage";

import { generatePDF } from "./components/pdfGenerator";
import { paginateDocument, type PaginationPage } from "./components/documentPagination";
import MenuBar from "./components/MenuBar";

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

type ContentBlock =
  | TextBlock
  | ImageBlock
  | PageBreakBlock;

type RTDFile = {
  format: "rtd";
  version: 1;
  title: string;
  author: string;
  subject: string;
  concepts: Concept[];
};

type Concept = {
  id: number;
  title: string;
  level: number;
  content: ContentBlock[];
};

type SavedDocument = {
  title: string;
  author?: string;
  subject?: string;
  concepts: Concept[];
};

const STORAGE_KEY =
  "restudio-documento";

const INITIAL_CONCEPTS: Concept[] = [
  {
    id: 1,
    title: "",
    level: 0,
    content: [
      {
        id: 2,
        type: "text",
        content: "",
      },
    ],
  },
];

export default function Home() {
  const [title, setTitle] =
    useState("");

  const [author, setAuthor] =
    useState("");

  const [subject, setSubject] =
    useState("");

  const [concepts, setConcepts] =
    useState<Concept[]>([]);

  const [isLoaded, setIsLoaded] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [lastSaved, setLastSaved] =
    useState<Date | null>(null);

  const [isGeneratingPDF, setIsGeneratingPDF] =
    useState(false);

  const [collapsedConcepts, setCollapsedConcepts] =
    useState<Set<number>>(
      new Set()
    );

  const [isPreview, setIsPreview] =
    useState(false);

  const [previewPages, setPreviewPages] =
    useState<PaginationPage[]>([]);

  const fileInputRefs = useRef<
    Record<
      number,
      HTMLInputElement | null
    >
  >({});

  const saveTimeout =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  // ---------------------------------------------
  // CARGAR DOCUMENTO
  // ---------------------------------------------

  const rtdFileInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadDocument() {
      try {
        const saved =
          localStorage.getItem(
            STORAGE_KEY
          );

        if (!saved) {
          setConcepts(
            INITIAL_CONCEPTS
          );

          return;
        }

        const parsed: SavedDocument =
          JSON.parse(saved);

        if (
          typeof parsed.title ===
          "string"
        ) {
          setTitle(parsed.title);
        }

        if (
          typeof parsed.author ===
          "string"
        ) {
          setAuthor(parsed.author);
        }

        if (
          typeof parsed.subject ===
          "string"
        ) {
          setSubject(parsed.subject);
        }

        if (
          !Array.isArray(
            parsed.concepts
          )
        ) {
          setConcepts(
            INITIAL_CONCEPTS
          );

          return;
        }

        const loadedConcepts =
          await Promise.all(
            parsed.concepts.map(
              async (concept) => {
                const loadedContent =
                  await Promise.all(
                    concept.content.map(
                      async (block) => {
                        if (
                          block.type !==
                          "image"
                        ) {
                          return block;
                        }

                        if (
                          !block.imageId
                        ) {
                          return block;
                        }

                        try {
                          const url =
                            await getImage(
                              block.imageId
                            );

                          return {
                            ...block,
                            width: block.width ?? 75,
                            url:
                              url ??
                              undefined,
                          };
                        } catch (error) {
                          console.error(
                            "Error cargando imagen:",
                            error
                          );

                          return block;
                        }
                      }
                    )
                  );

                return {
                  ...concept,
                  content:
                    loadedContent,
                };
              }
            )
          );

        setConcepts(
          loadedConcepts
        );
      } catch (error) {
        console.error(
          "Error al cargar el documento:",
          error
        );

        setConcepts(
          INITIAL_CONCEPTS
        );
      } finally {
        setIsLoaded(true);
      }
    }

    loadDocument();
  }, []);

  // ---------------------------------------------
  // GUARDADO AUTOMÁTICO
  // ---------------------------------------------

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (
      saveTimeout.current
    ) {
      clearTimeout(
        saveTimeout.current
      );
    }

    setIsSaving(true);

    saveTimeout.current =
      setTimeout(() => {
        try {
          const documentData: SavedDocument =
            {
              title,
              author,
              subject,

              concepts:
                concepts.map(
                  (concept) => ({
                    ...concept,

                    content:
                      concept.content.map(
                        (block) => {
                          if (
                            block.type ===
                            "image"
                          ) {
                            return {
                              id: block.id,
                              type: "image",
                              name: block.name,
                              imageId:
                                block.imageId,
                              width:
                                block.width ?? 75,
                            };
                          }

                          return block;
                        }
                      ),
                  })
                ),
            };

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(
              documentData
            )
          );

          setLastSaved(
            new Date()
          );

          setIsSaving(false);
        } catch (error) {
          console.error(
            "Error al guardar:",
            error
          );

          setIsSaving(false);
        }
      }, 500);

    return () => {
      if (
        saveTimeout.current
      ) {
        clearTimeout(
          saveTimeout.current
        );
      }
    };
  }, [
    title,
    author,
    subject,
    concepts,
    isLoaded,
  ]);

  // ---------------------------------------------
  // GENERAR PDF
  // ---------------------------------------------

  async function handleGeneratePDF() {
    if (
      isGeneratingPDF
    ) {
      return;
    }

    try {
      setIsGeneratingPDF(true);

      await generatePDF(
        title,
        author,
        subject,
        concepts
      );
    } catch (error) {
      console.error(
        "Error generando PDF:",
        error
      );

      alert(
        "No se pudo generar el PDF. Revisa la consola para obtener más información."
      );
    } finally {
      setIsGeneratingPDF(false);
    }
  }

  // ---------------------------------------------
  // PLEGAR / DESPLEGAR CONCEPTO
  // ---------------------------------------------

  function toggleConcept(
    conceptId: number
  ) {
    setCollapsedConcepts(
      (current) => {
        const next =
          new Set(current);

        if (
          next.has(conceptId)
        ) {
          next.delete(
            conceptId
          );
        } else {
          next.add(
            conceptId
          );
        }

        return next;
      }
    );
  }

  // ---------------------------------------------
  // COMPROBAR SI UN CONCEPTO ESTÁ OCULTO
  // POR UN PADRE PLEGADO
  // ---------------------------------------------

  function isConceptHidden(
    index: number
  ): boolean {
    let currentLevel =
      concepts[index].level;

    if (
      currentLevel === 0
    ) {
      return false;
    }

    for (
      let i = index - 1;
      i >= 0;
      i--
    ) {
      const previous =
        concepts[i];

      if (
        previous.level <
        currentLevel
      ) {
        if (
          collapsedConcepts.has(
            previous.id
          )
        ) {
          return true;
        }

        if (
          previous.level === 0
        ) {
          return false;
        }

        currentLevel =
          previous.level;
      }
    }

    return false;
  }

  // ---------------------------------------------
  // ACTUALIZAR TÍTULO
  // ---------------------------------------------

  function updateConceptTitle(
    id: number,
    value: string
  ) {
    setConcepts(
      (current) =>
        current.map(
          (concept) =>
            concept.id === id
              ? {
                  ...concept,
                  title: value,
                }
              : concept
        )
    );
  }

  // ---------------------------------------------
  // ACTUALIZAR TEXTO
  // ---------------------------------------------

  function updateTextBlock(
    conceptId: number,
    blockId: number,
    value: string
  ) {
    setConcepts(
      (current) =>
        current.map(
          (concept) => {
            if (
              concept.id !==
              conceptId
            ) {
              return concept;
            }

            return {
              ...concept,

              content:
                concept.content.map(
                  (block) =>
                    block.id ===
                      blockId &&
                    block.type ===
                      "text"
                      ? {
                          ...block,
                          content:
                            value,
                        }
                      : block
                ),
            };
          }
        )
    );
  }

  // ---------------------------------------------
  // AÑADIR CONCEPTO
  // ---------------------------------------------

  function addConcept(
    index: number,
    level: number
  ) {
    const now =
      Date.now();

    const newConcept: Concept = {
      id: now,
      title: "",
      level,

      content: [
        {
          id: now + 1,
          type: "text",
          content: "",
        },
      ],
    };

    setConcepts(
      (current) => {
        const result = [
          ...current,
        ];

        result.splice(
          index + 1,
          0,
          newConcept
        );

        return result;
      }
    );
  }

  // ---------------------------------------------
  // AUMENTAR NIVEL
  // ---------------------------------------------

  function increaseLevel(
    index: number
  ) {
    setConcepts(
      (current) => {
        if (index === 0) {
          return current;
        }

        const result = [
          ...current,
        ];

        const previous =
          result[index - 1];

        const currentConcept =
          result[index];

        if (
          currentConcept.level <
          previous.level + 1
        ) {
          result[index] = {
            ...currentConcept,
            level:
              currentConcept.level +
              1,
          };
        }

        return result;
      }
    );
  }

  // ---------------------------------------------
  // DISMINUIR NIVEL
  // ---------------------------------------------

  function decreaseLevel(
    index: number
  ) {
    setConcepts(
      (current) => {
        const result = [
          ...current,
        ];

        if (
          result[index].level >
          0
        ) {
          result[index] = {
            ...result[index],
            level:
              result[index].level -
              1,
          };
        }

        return result;
      }
    );
  }

  // ---------------------------------------------
  // ELIMINAR CONCEPTO
  // ---------------------------------------------

  function deleteConcept(
    index: number
  ) {
    setConcepts(
      (current) => {
        if (
          current.length === 1
        ) {
          return [
            {
              id: Date.now(),
              title: "",
              level: 0,

              content: [
                {
                  id:
                    Date.now() + 1,
                  type: "text",
                  content: "",
                },
              ],
            },
          ];
        }

        const level =
          current[index].level;

        let end =
          index + 1;

        while (
          end <
            current.length &&
          current[end].level >
            level
        ) {
          end++;
        }

        return [
          ...current.slice(
            0,
            index
          ),
          ...current.slice(
            end
          ),
        ];
      }
    );

    setCollapsedConcepts(
      (current) => {
        const next =
          new Set(current);

        next.delete(
          concepts[index].id
        );

        return next;
      }
    );
  }

  // ---------------------------------------------
  // NUMERACIÓN
  // ---------------------------------------------

  function getNumber(
    index: number
  ) {
    const counters: number[] =
      [];

    for (
      let i = 0;
      i <= index;
      i++
    ) {
      const level =
        concepts[i].level;

      if (
        counters[level] ===
        undefined
      ) {
        counters[level] = 1;
      } else {
        counters[level]++;
      }

      counters.splice(
        level + 1
      );
    }

    return counters.join(".");
  }

  // ---------------------------------------------
  // AÑADIR TEXTO
  // ---------------------------------------------

  function addTextBlock(
    conceptId: number
  ) {
    setConcepts(
      (current) =>
        current.map(
          (concept) => {
            if (
              concept.id !==
              conceptId
            ) {
              return concept;
            }

            return {
              ...concept,

              content: [
                ...concept.content,

                {
                  id:
                    Date.now() +
                    Math.random(),

                  type: "text",

                  content: "",
                },
              ],
            };
          }
        )
    );
  }

  // ---------------------------------------------
  // AÑADIR SALTO DE PÁGINA
  // ---------------------------------------------

  function addPageBreakBlock(conceptId: number) {
    setConcepts((current) =>
      current.map((concept) => {
        if (concept.id !== conceptId) return concept;

        return {
          ...concept,
          content: [
            ...concept.content,
            {
              id: Date.now() + Math.random(),
              type: "pageBreak",
            },
          ],
        };
      })
    );
  }

  // ---------------------------------------------
  // AÑADIR IMAGEN
  // ---------------------------------------------

  async function addImageBlock(
    event: React.ChangeEvent<HTMLInputElement>,
    conceptId: number
  ) {
    const files =
      event.target.files;

    if (
      !files ||
      files.length === 0
    ) {
      return;
    }

    try {
      const newBlocks:
        ImageBlock[] = [];

      for (
        const file of Array.from(
          files
        )
      ) {
        if (
          !file.type.startsWith(
            "image/"
          )
        ) {
          continue;
        }

        const imageId =
          await saveImage(file);

        const url =
          await getImage(
            imageId
          );

        newBlocks.push({
          id:
            Date.now() +
            Math.random(),

          type: "image",

          name: file.name,

          imageId,

          width: 75,

          url:
            url ??
            undefined,
        });
      }

      if (
        newBlocks.length ===
        0
      ) {
        return;
      }

      setConcepts(
        (current) =>
          current.map(
            (concept) =>
              concept.id ===
              conceptId
                ? {
                    ...concept,

                    content: [
                      ...concept.content,
                      ...newBlocks,
                    ],
                  }
                : concept
          )
      );
    } catch (error) {
      console.error(
        "Error al guardar la imagen:",
        error
      );
    } finally {
      event.target.value = "";
    }
  }

  // ---------------------------------------------
  // CAMBIAR TAMAÑO DE IMAGEN
  // ---------------------------------------------

  function updateImageWidth(
    conceptId: number,
    blockId: number,
    width: number
  ) {
    setConcepts((current) =>
      current.map((concept) => {
        if (concept.id !== conceptId) return concept;

        return {
          ...concept,
          content: concept.content.map((block) =>
            block.id === blockId && block.type === "image"
              ? { ...block, width }
              : block
          ),
        };
      })
    );
  }

  // ---------------------------------------------
  // ELIMINAR BLOQUE
  // ---------------------------------------------

  async function deleteBlock(
    conceptId: number,
    blockId: number
  ) {
    let imageIdToDelete:
      string | null = null;

    setConcepts(
      (current) =>
        current.map(
          (concept) => {
            if (
              concept.id !==
              conceptId
            ) {
              return concept;
            }

            const block =
              concept.content.find(
                (item) =>
                  item.id ===
                  blockId
              );

            if (
              block?.type ===
              "image"
            ) {
              imageIdToDelete =
                block.imageId;
            }

            const newContent =
              concept.content.filter(
                (item) =>
                  item.id !==
                  blockId
              );

            return {
              ...concept,

              content:
                newContent.length >
                0
                  ? newContent
                  : [
                      {
                        id:
                          Date.now(),
                        type: "text",
                        content: "",
                      },
                    ],
            };
          }
        )
    );

    if (imageIdToDelete) {
      try {
        await deleteImage(
          imageIdToDelete
        );
      } catch (error) {
        console.error(
          "Error eliminando imagen:",
          error
        );
      }
    }
  }

  // ---------------------------------------------
  // SELECTOR DE IMAGEN
  // ---------------------------------------------

  function openImageSelector(
    conceptId: number
  ) {
    fileInputRefs.current[
      conceptId
    ]?.click();
  }

  // ---------------------------------------------
  // REORDENAR BLOQUES
  // ---------------------------------------------

  function reorderBlocks(
    conceptId: number,
    initialIndex: number,
    newIndex: number
  ) {
    if (
      initialIndex === newIndex
    ) {
      return;
    }

    setConcepts(
      (current) =>
        current.map(
          (concept) => {
            if (
              concept.id !==
              conceptId
            ) {
              return concept;
            }

            const newContent =
              [
                ...concept.content,
              ];

            const [
              movedBlock,
            ] =
              newContent.splice(
                initialIndex,
                1
              );

            newContent.splice(
              newIndex,
              0,
              movedBlock
            );

            return {
              ...concept,
              content:
                newContent,
            };
          }
        )
    );
  }

  // ---------------------------------------------
  // ATAJOS DE TECLADO
  // ---------------------------------------------

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number
  ) {
    if (
      event.key === "Enter"
    ) {
      event.preventDefault();

      addConcept(
        index,
        concepts[index].level
      );

      return;
    }

    if (
      event.key === "Tab"
    ) {
      event.preventDefault();

      if (event.shiftKey) {
        decreaseLevel(index);
      } else {
        increaseLevel(index);
      }
    }
  }

  // ---------------------------------------------
  // ARCHIVOS RTD
  // ---------------------------------------------

  function sanitizeRTDFileName(name: string): string {
    return (
      name
        .trim()
        .replace(/[<>:"/\\|?*]/g, "-")
        .replace(/\s+/g, "-")
        .slice(0, 100) || "mis-apuntes"
    );
  }


  async function exportRTD() {
    const data: RTDFile = {
      format: "rtd",
      version: 1,
      title,
      author,
      subject,
      concepts,
    };

    const content = JSON.stringify(
      data,
      null,
      2
    );

    const fileName =
      `${sanitizeRTDFileName(
        title || "mis-apuntes"
      )}.rtd`;

    /*
     * Edge / Chrome:
     * mostramos el diálogo nativo de "Guardar como".
     */
    if (
      "showSaveFilePicker" in window
    ) {
      try {
        const picker =
          (
            window as Window & {
              showSaveFilePicker?: (
                options?: unknown
              ) => Promise<{
                createWritable: () => Promise<{
                  write: (
                    data: string
                  ) => Promise<void>;
                  close: () => Promise<void>;
                }>;
              }>;
            }
          ).showSaveFilePicker;

        if (!picker) {
          throw new Error(
            "File System Access API no disponible"
          );
        }

        const handle =
          await picker({
            suggestedName:
              fileName,
            types: [
              {
                description:
                  "Documento ReStudio",
                accept: {
                  "application/octet-stream":
                    [".rtd"],
                },
              },
            ],
          });

        const writable =
          await handle.createWritable();

        await writable.write(
          content
        );

        await writable.close();

        return;
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.warn(
          "No se pudo utilizar el diálogo nativo:",
          error
        );
      }
    }

    /*
     * Firefox:
     * utilizamos su sistema de descarga.
     * Si está activado "Preguntar siempre dónde guardar
     * los archivos", Firefox mostrará su ventana
     * de selección de carpeta/nombre.
     */
    const blob =
      new Blob(
        [content],
        {
          type:
            "application/octet-stream",
        }
      );

    const url =
      URL.createObjectURL(
        blob
      );

    const link =
      document.createElement(
        "a"
      );

    link.href = url;
    link.download =
      fileName;

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    setTimeout(
      () => {
        URL.revokeObjectURL(
          url
        );
      },
      1000
    );
  }

  async function openRTD() {
    /*
     * Edge / Chrome:
     * selector nativo de archivos.
     */
    if (
      "showOpenFilePicker" in window
    ) {
      try {
        const picker =
          (
            window as Window & {
              showOpenFilePicker?: (
                options?: unknown
              ) => Promise<
                Array<{
                  getFile: () => Promise<File>;
                }>
              >;
            }
          ).showOpenFilePicker;

        if (!picker) {
          throw new Error(
            "File System Access API no disponible"
          );
        }

        const handles =
          await picker({
            multiple: false,
            types: [
              {
                description:
                  "Documento ReStudio",
                accept: {
                  "application/octet-stream":
                    [".rtd"],
                },
              },
            ],
          });

        if (
          handles.length
        ) {
          const file =
            await handles[0]
              .getFile();

          await loadRTDFile(
            file
          );
        }

        return;
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.warn(
          "No se pudo utilizar el selector nativo:",
          error
        );
      }
    }

    /*
     * Firefox y otros navegadores:
     * usamos el selector de archivos HTML.
     */
    rtdFileInputRef.current?.click();
  }

  async function loadRTDFile(file: File) {
    if (
      !file.name
        .toLowerCase()
        .endsWith(".rtd")
    ) {
      alert(
        "Selecciona un archivo .rtd de ReStudio."
      );
      return;
    }

    try {
      const text = await file.text();

      const parsed = JSON.parse(
        text
      ) as Partial<RTDFile>;

      if (
        parsed.format !== "rtd" ||
        !Array.isArray(parsed.concepts)
      ) {
        throw new Error(
          "Formato RTD no válido."
        );
      }

      setTitle(
        typeof parsed.title === "string"
          ? parsed.title
          : ""
      );

      setAuthor(
        typeof parsed.author === "string"
          ? parsed.author
          : ""
      );

      setSubject(
        typeof parsed.subject === "string"
          ? parsed.subject
          : ""
      );

      setConcepts(
        parsed.concepts as Concept[]
      );
    } catch (error) {
      console.error(
        "Error abriendo RTD:",
        error
      );

      alert(
        "No se ha podido abrir el archivo RTD."
      );
    }
  }

  function handleRTDFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) return;

    void loadRTDFile(file);
  }

  // ---------------------------------------------
  // ACCIONES DEL MENÚ
  // ---------------------------------------------

  function handleNewDocument() {
    const hasContent =
      title.trim() !== "" ||
      author.trim() !== "" ||
      subject.trim() !== "" ||
      concepts.some(
        (concept) =>
          concept.title.trim() !== "" ||
          concept.content.some(
            (block) =>
              block.type === "image" ||
              block.type === "pageBreak" ||
              (block.type === "text" &&
                block.content.replace(/<[^>]*>/g, "").trim() !== "")
          )
      );

    if (
      hasContent &&
      !window.confirm(
        "¿Crear un documento nuevo? Se perderán los cambios del documento actual."
      )
    ) {
      return;
    }

    const now = Date.now();

    setTitle("");
    setAuthor("");
    setSubject("");
    setConcepts([
      {
        id: now,
        title: "",
        level: 0,
        content: [
          {
            id: now + 1,
            type: "text",
            content: "",
          },
        ],
      },
    ]);
    setCollapsedConcepts(new Set());
    setIsPreview(false);
  }

  function handleUndo() {
    document.execCommand("undo");
  }

  function handleRedo() {
    document.execCommand("redo");
  }

  function handleCut() {
    document.execCommand("cut");
  }

  function handleCopy() {
    document.execCommand("copy");
  }

  async function handlePaste() {
    try {
      const clipboardText =
        await navigator.clipboard.readText();

      document.execCommand(
        "insertText",
        false,
        clipboardText
      );
    } catch {
      document.execCommand("paste");
    }
  }

  function handleExpandAll() {
    setCollapsedConcepts(new Set());
  }

  function handleCollapseAll() {
    setCollapsedConcepts(
      new Set(concepts.map((concept) => concept.id))
    );
  }

  function handleEditMode() {
    setIsPreview(false);
  }

  function handlePreview() {
    setIsPreview(true);
  }

  // ---------------------------------------------
  // PAGINACIÓN DE LA VISTA PREVIA
  // ---------------------------------------------

  useEffect(() => {
    if (!isPreview) return;
    setPreviewPages(paginateDocument(concepts));
  }, [isPreview, concepts]);

  // ---------------------------------------------
  // PAGINACIÓN DE LA VISTA PREVIA
  // ---------------------------------------------

  // ---------------------------------------------
  // CARGANDO
  // ---------------------------------------------

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">

        <div className="rounded-xl bg-white px-6 py-4 text-slate-500 shadow-sm">
        <input
          ref={rtdFileInputRef}
          type="file"
          accept=".rtd"
          className="hidden"
          onChange={handleRTDFile}
        />

          Cargando ReStudio...
        </div>

      </main>
    );
  }

  // ---------------------------------------------
  // VISTA PREVIA
  // ---------------------------------------------

  if (isPreview) {
    return (
      <main className="min-h-screen bg-slate-300 text-slate-800">
        <div className="sticky top-0 z-50">
          <MenuBar
            onNew={handleNewDocument}
            onOpen={openRTD}
            onSave={exportRTD}
            onSaveAs={exportRTD}
            onExportPdf={handleGeneratePDF}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onCut={handleCut}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onEditMode={handleEditMode}
            onPreview={handlePreview}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />
        </div>



        {/* CONTENEDOR DE HOJAS */}

        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">

          {/* HOJAS A4 */}

          <div className="space-y-10">
            {previewPages.map((previewPage, pageIndex) => (
              <div
                key={`preview-page-${pageIndex}`}
                className="mx-auto bg-white shadow-2xl"
                style={{
                  width: "210mm",
                  minHeight: "297mm",
                  maxWidth: "100%",
                }}
              >
                <article
                  className="bg-white"
                  style={{
                    minHeight: "297mm",
                    padding: "22mm 20mm 18mm 20mm",
                    boxSizing: "border-box",
                  }}
                >
                  <header className="mb-8 border-b-2 border-slate-200 pb-4">
                    <div className="flex items-start justify-between gap-6">
                      {pageIndex === 0 ? (
                        <h1 className="text-4xl font-bold leading-tight text-slate-900">
                          {title || "Mis apuntes"}
                        </h1>
                      ) : (
                        <div />
                      )}

                      {(author.trim() || subject.trim()) && (
                        <div className="shrink-0 text-right text-xs leading-5 text-slate-500">
                          {author.trim() && <div>{author}</div>}
                          {subject.trim() && <div>{subject}</div>}
                        </div>
                      )}
                    </div>
                  </header>

                  <div className="space-y-7">
                    {previewPage.concepts.map((concept) => {
                      const originalIndex = concepts.findIndex(
                        (item) => item.id === concept.id
                      );

                      const indentation = Math.min(
                        concept.level * 12,
                        55
                      );

                      return (
                        <section
                          key={`${pageIndex}-${concept.id}-${concept.content.length}`}
                          style={{
                            marginLeft: `${indentation}px`,
                          }}
                        >
                          {concept.showTitle !== false && (
                            <h2
                              className="mb-3 font-semibold leading-tight text-slate-900"
                              style={{
                                fontSize: `${Math.max(
                                  22 - concept.level * 2,
                                  15
                                )}px`,
                              }}
                            >
                              <span className="font-bold text-indigo-600">
                                {originalIndex >= 0
                                  ? getNumber(originalIndex)
                                  : ""}
                                {" "}
                              </span>
                              <span>
                                {concept.title || "Sin título"}
                              </span>
                            </h2>
                          )}

                          <div className="space-y-5">
                            {concept.content.map((block) => {
                              if (block.type === "text") {
                                return (
                                  <div
                                    key={block.id}
                                    className="restudio-preview-text text-[15px] leading-7 text-slate-700"
                                    dangerouslySetInnerHTML={{
                                      __html: block.content,
                                    }}
                                  />
                                );
                              }

                              if (block.type === "image") {
                                return (
                                  <figure
                                    key={block.id}
                                    className="my-5 flex justify-center"
                                  >
                                    {block.url ? (
                                      <img
                                        src={block.url}
                                        alt={block.name}
                                        style={{
                                          width: `${block.width ?? 75}%`,
                                          maxWidth: "100%",
                                          maxHeight: "245mm",
                                          objectFit: "contain",
                                        }}
                                      />
                                    ) : (
                                      <div className="flex h-32 w-full items-center justify-center rounded-lg bg-slate-100 text-sm text-slate-400">
                                        Cargando imagen...
                                      </div>
                                    )}
                                  </figure>
                                );
                              }

                              return null;
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  <div className="mt-8 border-t border-slate-100 pt-3 text-center text-xs text-slate-400">
                    ReStudio · Página {pageIndex + 1} de {previewPages.length}
                  </div>
                </article>
              </div>
            ))}
          </div>

          {/* INFORMACIÓN DE LA VISTA PREVIA */}

          <div className="mx-auto mt-5 flex max-w-[210mm] items-center justify-between rounded-lg bg-white/80 px-4 py-3 text-sm text-slate-500 shadow-sm">

            <span>
              Vista previa en formato A4
            </span>

            <span>
              {previewPages.length}{" "}
              {previewPages.length === 1
                ? "página"
                : "páginas"}
            </span>

          </div>

        </div>


        {/* ESTILOS DEL TEXTO ENRIQUECIDO */}

        <style jsx global>{`
          .restudio-preview-text p {
            margin: 0 0 0.7rem 0;
          }

          .restudio-preview-text p:last-child {
            margin-bottom: 0;
          }

          .restudio-preview-text strong {
            font-weight: 700;
          }

          .restudio-preview-text em {
            font-style: italic;
          }

          .restudio-preview-text u {
            text-decoration: underline;
          }

          .restudio-preview-text ul {
            margin: 0.6rem 0;
            padding-left: 1.5rem;
            list-style-type: disc;
          }

          .restudio-preview-text ol {
            margin: 0.6rem 0;
            padding-left: 1.5rem;
            list-style-type: decimal;
          }

          .restudio-preview-text li {
            margin-bottom: 0.25rem;
          }

          .restudio-preview-text h1,
          .restudio-preview-text h2,
          .restudio-preview-text h3 {
            margin-top: 1rem;
            margin-bottom: 0.5rem;
            font-weight: 700;
            color: #0f172a;
          }

          .restudio-preview-text a {
            text-decoration: underline;
          }

          @media (max-width: 800px) {
            .restudio-preview-text {
              font-size: 14px;
            }
          }
        `}</style>

      </main>
    );
  }

  // ---------------------------------------------
  // EDITOR
  // ---------------------------------------------

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <div className="sticky top-0 z-50">
        <MenuBar
          onNew={handleNewDocument}
          onOpen={openRTD}
          onSave={exportRTD}
          onSaveAs={exportRTD}
          onExportPdf={handleGeneratePDF}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onEditMode={handleEditMode}
          onPreview={handlePreview}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
      </div>



      <div className="mx-auto max-w-6xl px-6 py-10">

        <div className="mb-10">
          <div className="grid gap-6 md:grid-cols-[1fr_280px] md:items-end">
            <div>
              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Título del esquema"
                className="w-full border-b-2 border-slate-300 bg-transparent pb-4 text-4xl font-bold tracking-tight text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500"
              />

              <p className="mt-3 text-sm text-slate-500">
                Organiza el contenido por niveles y desarrolla cada concepto.
              </p>
            </div>

            <div className="space-y-3">
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Nombre"
                aria-label="Nombre"
                className="w-full border-b border-slate-300 bg-transparent px-1 pb-2 text-right text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500"
              />

              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Materia"
                aria-label="Materia"
                className="w-full border-b border-slate-300 bg-transparent px-1 pb-2 text-right text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>


        <DragDropProvider
          onDragEnd={(event) => {
            if (
              event.canceled
            ) {
              return;
            }

            const {
              source,
            } = event.operation;

            if (
              !isSortable(source)
            ) {
              return;
            }

            const conceptId =
              source.data
                ?.conceptId;

            if (
              typeof conceptId !==
              "number"
            ) {
              return;
            }

            reorderBlocks(
              conceptId,
              source.initialIndex,
              source.index
            );
          }}
        >

          <div className="space-y-5">

            {concepts.map(
              (
                concept,
                index
              ) => {

                const hidden =
                  isConceptHidden(
                    index
                  );

                const isCollapsed =
                  collapsedConcepts.has(
                    concept.id
                  );

                return (
                  <div
                    key={
                      concept.id
                    }
                    style={{
                      marginLeft:
                        `${concept.level * 45}px`,
                    }}
                    className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                  >

                    <div className="flex gap-4">

                      <div className="min-w-[45px] pt-1.5 text-lg font-bold text-indigo-500">
                        {getNumber(
                          index
                        )}
                      </div>


                      <div className="min-w-0 flex-1">

                        <div className="flex items-center gap-2">

                          <button
                            type="button"
                            onClick={() =>
                              toggleConcept(
                                concept.id
                              )
                            }
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600"
                            title={
                              isCollapsed
                                ? "Desplegar concepto"
                                : "Plegar concepto"
                            }
                          >
                            {isCollapsed
                              ? "▶"
                              : "▼"}
                          </button>


                          <input
                            value={
                              concept.title
                            }
                            onChange={(
                              event
                            ) =>
                              updateConceptTitle(
                                concept.id,
                                event.target
                                  .value
                              )
                            }
                            onKeyDown={(
                              event
                            ) =>
                              handleKeyDown(
                                event,
                                index
                              )
                            }
                            placeholder="Escribe el concepto..."
                            className="w-full border-b border-transparent bg-transparent pb-2 text-2xl font-semibold text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-indigo-300"
                          />

                        </div>


                        {!hidden &&
                          !isCollapsed && (
                            <>

                              <div className="mt-5 space-y-4">

                                {concept.content.map(
                                  (
                                    block,
                                    blockIndex
                                  ) => (

                                    <SortableBlock
                                      key={
                                        block.id
                                      }
                                      id={
                                        block.id
                                      }
                                      index={
                                        blockIndex
                                      }
                                      conceptId={
                                        concept.id
                                      }
                                      onDelete={() =>
                                        deleteBlock(
                                          concept.id,
                                          block.id
                                        )
                                      }
                                    >

                                      {block.type ===
                                        "text" && (

                                        <RichTextEditor
                                          content={
                                            block.content
                                          }
                                          onChange={(
                                            content: string
                                          ) =>
                                            updateTextBlock(
                                              concept.id,
                                              block.id,
                                              content
                                            )
                                          }
                                        />

                                      )}


                                      {block.type ===
                                        "pageBreak" && (

                                        <div className="my-4 flex items-center gap-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                                          <div className="h-px flex-1 bg-slate-300" />
                                          <span className="whitespace-nowrap rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5">
                                            Salto de página
                                          </span>
                                          <div className="h-px flex-1 bg-slate-300" />
                                        </div>

                                      )}

                                      {block.type ===
                                        "image" && (

                                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">

                                          <div className="flex justify-center">
                                            {block.url ? (
                                              <img
                                                src={block.url}
                                                alt={block.name}
                                                style={{
                                                  width: `${block.width ?? 75}%`,
                                                  maxWidth: "100%",
                                                }}
                                                className="max-h-[550px] rounded-lg object-contain"
                                              />
                                            ) : (
                                              <div className="flex h-32 w-full items-center justify-center text-sm text-slate-400">
                                                Cargando imagen...
                                              </div>
                                            )}
                                          </div>

                                          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
                                            <span className="text-xs font-semibold text-slate-500">
                                              Tamaño:
                                            </span>

                                            {[25, 50, 75, 100].map((width) => (
                                              <button
                                                key={width}
                                                type="button"
                                                onClick={() =>
                                                  updateImageWidth(
                                                    concept.id,
                                                    block.id,
                                                    width
                                                  )
                                                }
                                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                                                  (block.width ?? 75) === width
                                                    ? "bg-indigo-100 text-indigo-700"
                                                    : "bg-white text-slate-600 hover:bg-slate-100"
                                                }`}
                                              >
                                                {width === 25
                                                  ? "Pequeña"
                                                  : width === 50
                                                    ? "Mediana"
                                                    : width === 75
                                                      ? "Grande"
                                                      : "Completa"}
                                              </button>
                                            ))}

                                            <span className="ml-auto text-xs text-slate-400">
                                              {block.width ?? 75}%
                                            </span>
                                          </div>
                                        </div>

                                      )}

                                    </SortableBlock>

                                  )
                                )}

                              </div>


                              <input
                                ref={(
                                  element
                                ) => {
                                  fileInputRefs.current[
                                    concept.id
                                  ] =
                                    element;
                                }}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(
                                  event
                                ) =>
                                  addImageBlock(
                                    event,
                                    concept.id
                                  )
                                }
                              />


                              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">

                                <button
                                  type="button"
                                  onClick={() =>
                                    increaseLevel(
                                      index
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                  ➜ Subnivel
                                </button>


                                <button
                                  type="button"
                                  onClick={() =>
                                    decreaseLevel(
                                      index
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                  ← Subir nivel
                                </button>


                                <button
                                  type="button"
                                  onClick={() =>
                                    addTextBlock(
                                      concept.id
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                  + Texto
                                </button>


                                <button
                                  type="button"
                                  onClick={() =>
                                    openImageSelector(
                                      concept.id
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                  🖼️ Imagen
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    addPageBreakBlock(
                                      concept.id
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                  title="Añadir un salto de página"
                                >
                                  ↵ Salto de página
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    addConcept(
                                      index,
                                      concept.level
                                    )
                                  }
                                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                                >
                                  + Concepto
                                </button>


                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteConcept(
                                      index
                                    )
                                  }
                                  className="ml-auto rounded-lg border border-red-100 bg-white px-3.5 py-2 text-sm font-medium text-red-500 transition hover:bg-red-50"
                                >
                                  Eliminar
                                </button>

                              </div>

                            </>
                          )}

                      </div>

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </DragDropProvider>


        <button
          type="button"
          onClick={() =>
            addConcept(
              concepts.length - 1,
              0
            )
          }
          className="mt-8 w-full rounded-xl border-2 border-dashed border-slate-300 bg-white/60 px-5 py-4 font-semibold text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600"
        >
          + Añadir concepto
        </button>


        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">

          <div className="flex flex-wrap gap-x-5 gap-y-2">

            <span>
              <strong className="text-slate-700">
                Enter
              </strong>{" "}
              nuevo concepto
            </span>

            <span>
              <strong className="text-slate-700">
                Tab
              </strong>{" "}
              subnivel
            </span>

            <span>
              <strong className="text-slate-700">
                Shift + Tab
              </strong>{" "}
              subir nivel
            </span>

            <span>
              <strong className="text-slate-700">
                ▼ / ▶
              </strong>{" "}
              plegar concepto
            </span>

            <span>
              <strong className="text-slate-700">
                ⋮⋮
              </strong>{" "}
              mover bloque
            </span>

          </div>

        </div>

      </div>

    </main>
  );
}