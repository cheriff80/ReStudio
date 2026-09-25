"use client";

import { useEffect, useRef, useState } from "react";

type MenuBarProps = {
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onExportPdf?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onEditMode?: () => void;
  onPreview?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
};

type MenuKey =
  | "archivo"
  | "editar"
  | "insertar"
  | "ver"
  | "ayuda"
  | null;

function MenuButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-11 px-3 text-sm font-medium transition",
        active
          ? "bg-slate-100 text-slate-900"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function MenuItem({
  label,
  shortcut,
  onClick,
}: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-8 px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100"
    >
      <span>{label}</span>
      {shortcut ? (
        <span className="text-xs text-slate-400">{shortcut}</span>
      ) : null}
    </button>
  );
}

function MenuSeparator() {
  return <div className="my-1 border-t border-slate-200" />;
}

export default function MenuBar(props: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpenMenu(null);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () =>
      document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function run(action?: () => void) {
    setOpenMenu(null);
    action?.();
  }

  return (
    <div
      ref={menuRef}
      className="relative z-50 border-b border-slate-200 bg-white shadow-sm"
    >
      <div className="flex h-11 items-center px-4">
        <div className="mr-6 text-lg font-bold tracking-tight text-slate-800">
          ReStudio
        </div>

        <MenuButton
          label="Archivo"
          active={openMenu === "archivo"}
          onClick={() =>
            setOpenMenu(openMenu === "archivo" ? null : "archivo")
          }
        />
        <MenuButton
          label="Editar"
          active={openMenu === "editar"}
          onClick={() =>
            setOpenMenu(openMenu === "editar" ? null : "editar")
          }
        />
        <MenuButton
          label="Insertar"
          active={openMenu === "insertar"}
          onClick={() =>
            setOpenMenu(openMenu === "insertar" ? null : "insertar")
          }
        />
        <MenuButton
          label="Ver"
          active={openMenu === "ver"}
          onClick={() =>
            setOpenMenu(openMenu === "ver" ? null : "ver")
          }
        />
        <MenuButton
          label="Ayuda"
          active={openMenu === "ayuda"}
          onClick={() =>
            setOpenMenu(openMenu === "ayuda" ? null : "ayuda")
          }
        />
      </div>

      {openMenu === "archivo" && (
        <div className="absolute left-[116px] top-11 w-60 rounded-b-lg border border-t-0 border-slate-200 bg-white py-1 shadow-xl">
          <MenuItem label="📄 Nuevo" onClick={() => run(props.onNew)} />
          <MenuItem label="📂 Abrir .rtd" onClick={() => run(props.onOpen)} />
          <MenuSeparator />
          <MenuItem label="💾 Guardar" onClick={() => run(props.onSave)} />
          <MenuItem
            label="💾 Guardar como..."
            onClick={() => run(props.onSaveAs)}
          />
          <MenuSeparator />
          <MenuItem
            label="📤 Exportar PDF"
            onClick={() => run(props.onExportPdf)}
          />
        </div>
      )}

      {openMenu === "editar" && (
        <div className="absolute left-[184px] top-11 w-56 rounded-b-lg border border-t-0 border-slate-200 bg-white py-1 shadow-xl">
          <MenuItem label="↶ Deshacer" shortcut="Ctrl+Z" onClick={() => run(props.onUndo)} />
          <MenuItem label="↷ Rehacer" shortcut="Ctrl+Y" onClick={() => run(props.onRedo)} />
          <MenuSeparator />
          <MenuItem label="✂ Cortar" shortcut="Ctrl+X" onClick={() => run(props.onCut)} />
          <MenuItem label="📋 Copiar" shortcut="Ctrl+C" onClick={() => run(props.onCopy)} />
          <MenuItem label="📌 Pegar" shortcut="Ctrl+V" onClick={() => run(props.onPaste)} />
        </div>
      )}

      {openMenu === "ver" && (
        <div className="absolute left-[245px] top-11 w-56 rounded-b-lg border border-t-0 border-slate-200 bg-white py-1 shadow-xl">
          <MenuItem
            label="✏️ Modo edición"
            onClick={() => run(props.onEditMode)}
          />
          <MenuItem
            label="👁️ Vista previa"
            onClick={() => run(props.onPreview)}
          />
          <MenuSeparator />
          <MenuItem
            label="↕ Expandir todo"
            onClick={() => run(props.onExpandAll)}
          />
          <MenuItem
            label="↕ Contraer todo"
            onClick={() => run(props.onCollapseAll)}
          />
        </div>
      )}

      {openMenu === "ayuda" && (
        <div className="absolute left-[315px] top-11 w-56 rounded-b-lg border border-t-0 border-slate-200 bg-white py-1 shadow-xl">
          <MenuItem
            label="ℹ️ Acerca de ReStudio"
            onClick={() => {
              setOpenMenu(null);
              window.alert(
                "ReStudio\n\nCrea, organiza y exporta tus apuntes."
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
