"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";

let activeEditor: Editor | null = null;

export function undoActiveEditor() {
  activeEditor?.chain().focus().undo().run();
}

export function redoActiveEditor() {
  activeEditor?.chain().focus().redo().run();
}

type RichTextEditorProps = {
  content: string;
  onChange: (content: string) => void;
};

const GREEK_SYMBOLS = [
  { group: "Minúsculas", symbols: "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω" },
  { group: "Mayúsculas", symbols: "Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω" },
  { group: "Variantes", symbols: "ϑ ϕ ϖ ϱ ς ϵ ϰ" },
];

const MATH_SYMBOLS = [
  { group: "Operadores", symbols: "± × ÷ · ∓ √ ∛ ∜ ∑ ∏ ∫ ∬ ∭ ∮" },
  { group: "Relaciones", symbols: "= ≠ ≈ ≃ ≅ ≡ < > ≤ ≥ ≪ ≫ ∼ ∝" },
  { group: "Conjuntos", symbols: "∈ ∉ ∋ ∌ ⊂ ⊃ ⊆ ⊇ ∅ ∪ ∩ ∖" },
  { group: "Lógica", symbols: "¬ ∧ ∨ ⊕ ⇒ ⇔ → ← ↔ ∀ ∃" },
  { group: "Otros", symbols: "∞ ∂ ∇ ℕ ℤ ℚ ℝ ℂ | ‖ ⟂ ∠ °" },
];

export default function RichTextEditor({
  content,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      Underline,
    ],
    content: content || "<p></p>",
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    return () => {
      if (activeEditor === editor) {
        activeEditor = null;
      }
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const currentContent = editor.getHTML();
    if (content && content !== currentContent) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold ${editor.isActive("bold") ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-200"}`}>
          B
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded-lg px-3 py-1.5 text-sm italic ${editor.isActive("italic") ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-200"}`}>
          I
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`rounded-lg px-3 py-1.5 text-sm underline ${editor.isActive("underline") ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-200"}`}>
          U
        </button>

        <div className="mx-1 h-6 w-px bg-slate-300" />

        <label title="Color del texto"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-200">
          A
          <input
            type="color"
            value={editor.getAttributes("textStyle").color || "#334155"}
            onChange={(event) =>
              editor.chain().focus().setColor(event.target.value).run()
            }
            className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </label>

        <button type="button" onClick={() => editor.chain().focus().unsetColor().run()}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200">
          Color normal
        </button>

        <div className="mx-1 h-6 w-px bg-slate-300" />

        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded-lg px-3 py-1.5 text-sm ${editor.isActive("bulletList") ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-200"}`}>
          • Lista
        </button>

        <div className="relative ml-1">
          <details className="group">
            <summary
              className="flex cursor-pointer list-none items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 [&::-webkit-details-marker]:hidden"
              title="Insertar símbolos"
            >
              Ω Σ
              <span className="text-[10px]">▼</span>
            </summary>

            <div className="absolute left-0 top-full z-50 mt-1 max-h-[70vh] w-[min(92vw,720px)] max-w-[92vw] overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Letras griegas
              </div>

              <div className="space-y-2">
                {GREEK_SYMBOLS.map((section) => (
                  <div key={section.group} className="flex flex-wrap items-center gap-1">
                    <span className="mr-2 w-20 shrink-0 text-xs text-slate-400">
                      {section.group}
                    </span>
                    {section.symbols.split(" ").map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        title={`Insertar ${symbol}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          editor.chain().focus().insertContent(symbol).run();
                        }}
                        className="flex h-8 min-w-8 items-center justify-center rounded-md border border-transparent px-1.5 text-base text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                ))}
              </div>

              <div className="my-3 border-t border-slate-100" />

              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Símbolos matemáticos
              </div>

              <div className="space-y-2">
                {MATH_SYMBOLS.map((section) => (
                  <div key={section.group} className="flex flex-wrap items-center gap-1">
                    <span className="mr-2 w-20 shrink-0 text-xs text-slate-400">
                      {section.group}
                    </span>
                    {section.symbols.split(" ").map((symbol) => (
                      <button
                        key={symbol}
                        type="button"
                        title={`Insertar ${symbol}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          editor.chain().focus().insertContent(symbol).run();
                        }}
                        className="flex h-8 min-w-8 items-center justify-center rounded-md border border-transparent px-1.5 text-base text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {symbol}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>

      <EditorContent
        editor={editor}
        onFocus={() => {
          activeEditor = editor;
        }}
        className="rich-text-editor min-h-[90px] p-4 text-base leading-7 text-slate-700 outline-none"
      />
    </div>
  );
}
