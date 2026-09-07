"use client";

import { ReactNode } from "react";
import { useSortable } from "@dnd-kit/react/sortable";

type SortableBlockProps = {
  id: number;
  index: number;
  conceptId: number;
  children: ReactNode;
  onDelete: () => void;
};

export default function SortableBlock({
  id,
  index,
  conceptId,
  children,
  onDelete,
}: SortableBlockProps) {
  const {
    ref,
    handleRef,
    isDragging,
    isDropTarget,
  } = useSortable({
    id,
    index,
    data: {
      conceptId,
    },
  });

  return (
    <div
      ref={ref}
      className={`group relative rounded-xl border transition ${
        isDragging
          ? "z-20 border-indigo-300 bg-indigo-50/50 opacity-70 shadow-lg"
          : isDropTarget
            ? "border-indigo-400 bg-indigo-50/30"
            : "border-transparent hover:border-slate-200"
      }`}
    >
      {/* ASA DE ARRASTRE */}

      <button
        ref={handleRef}
        type="button"
        title="Arrastrar bloque"
        className="absolute -left-10 top-3 z-10 flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-lg text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-indigo-600 group-hover:opacity-100 active:cursor-grabbing"
      >
        ⋮⋮
      </button>

      {/* CONTENIDO */}

      <div className="p-1">
        {children}
      </div>

      {/* ELIMINAR */}

      <button
        type="button"
        onClick={onDelete}
        className="absolute right-2 top-2 hidden rounded-lg border border-red-100 bg-white px-2.5 py-1 text-xs font-medium text-red-500 shadow-sm group-hover:block hover:bg-red-50"
      >
        Eliminar
      </button>
    </div>
  );
}