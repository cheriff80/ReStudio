"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import StarterKit from "@tiptap/starter-kit";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";

type RichTextEditorProps = {
  content: string;
  onChange: (content: string) => void;
};

export default function RichTextEditor({
  content,
  onChange,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        orderedList: false,
      }),
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
    const currentContent = editor.getHTML();
    if (content && content !== currentContent) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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

      </div>

      <EditorContent
        editor={editor}
        className="rich-text-editor min-h-[90px] p-4 text-base leading-7 text-slate-700 outline-none"
      />
    </div>
  );
}

