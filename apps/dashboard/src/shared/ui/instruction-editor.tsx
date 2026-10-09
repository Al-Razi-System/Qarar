"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { TableKit } from "@tiptap/extension-table";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Bold, Italic, Underline, List, ListOrdered, Quote, Undo2, Redo2, Upload, Eraser, Code2, Eye, Pencil } from "lucide-react";
import { InstructionContent } from "@/shared/content/instruction-content";
import { encodeInstruction, instructionHtml, instructionSource, INSTRUCTION_SOURCE_LIMIT } from "@/shared/content/instruction-markdown";
import { serializeInstruction } from "@/shared/content/instruction-serialization";
import contentStyles from "@/shared/content/instruction-content.module.css";
import styles from "./instruction-editor.module.css";

const extensions = [StarterKit.configure({ link: { openOnClick: false }, heading: { levels: [1, 2, 3] } }),
  TextStyleKit.configure({ fontFamily: false, backgroundColor: false, lineHeight: false }),
  TableKit.configure({ table: { resizable: false } }), TaskList, TaskItem.configure({ nested: true })];
type Mode = "editor" | "markdown" | "preview";

export function InstructionEditor({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: string }) {
  const id = useId(); const fileInput = useRef<HTMLInputElement>(null);
  const lastValue = useRef(value); const importing = useRef(false);
  const [mode, setMode] = useState<Mode>("editor"); const [error, setError] = useState("");
  const [importPending, setImportPending] = useState(false);
  function changed(next: string) { lastValue.current = next; onChange(next); }
  const editor = useEditor({ extensions, immediatelyRender: false, shouldRerenderOnTransaction: true,
    content: instructionHtml(value),
    editorProps: { attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true", dir: "auto", class: contentStyles.content } },
    onUpdate: ({ editor: instance }) => changed(instance.isEmpty ? "" : serializeInstruction(instance.getHTML())),
  });
  useEffect(() => {
    if (!editor || (mode === "editor" && lastValue.current === value)) return;
    editor.commands.setContent(instructionHtml(value), { emitUpdate: false }); lastValue.current = value;
  }, [editor, value, mode]);
  async function importFile(file?: File) {
    if (!file || importing.current) return;
    importing.current = true; setImportPending(true); setError("");
    try {
      if (!/\.md$/i.test(file.name) || file.size > 40000) throw new Error("اختر ملف .md نصيًا، بحجم لا يتجاوز 40 كيلوبايت.");
      const source = await file.text();
      if (source.includes("\0") || source.length > INSTRUCTION_SOURCE_LIMIT) throw new Error("الملف غير نصي أو يتجاوز الحد المتاح للتعليمات.");
      const next = encodeInstruction(source); changed(next); editor?.commands.setContent(instructionHtml(next), { emitUpdate: false }); setMode("markdown");
    } catch (reason) {
      const validationMessages = ["اختر ملف .md نصيًا، بحجم لا يتجاوز 40 كيلوبايت.", "الملف غير نصي أو يتجاوز الحد المتاح للتعليمات."];
      setError(reason instanceof Error && validationMessages.includes(reason.message) ? reason.message : "تعذر قراءة الملف؛ النص السابق محفوظ.");
    }
    finally { importing.current = false; setImportPending(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  const actions = [
    { label: "عريض", icon: Bold, active: editor?.isActive("bold"), run: () => editor?.chain().focus().toggleBold().run() },
    { label: "مائل", icon: Italic, active: editor?.isActive("italic"), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: "تسطير", icon: Underline, active: editor?.isActive("underline"), run: () => editor?.chain().focus().toggleUnderline().run() },
    { label: "قائمة نقطية", icon: List, active: editor?.isActive("bulletList"), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: "قائمة مرقمة", icon: ListOrdered, active: editor?.isActive("orderedList"), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: "اقتباس", icon: Quote, active: editor?.isActive("blockquote"), run: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: "مسح التنسيق", icon: Eraser, run: () => editor?.chain().focus().unsetAllMarks().clearNodes().run() },
    { label: "تراجع", icon: Undo2, disabled: !editor?.can().undo(), run: () => editor?.chain().focus().undo().run() },
    { label: "إعادة", icon: Redo2, disabled: !editor?.can().redo(), run: () => editor?.chain().focus().redo().run() },
  ];
  return <section className={styles.field} aria-label={`محرر ${label}`}>
    <header className={styles.heading}><strong id={`${id}-title`}>{label}</strong><small>اختياري</small></header>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <div className={styles.tabs} role="tablist" aria-label={`وضع ${label}`}>
          {([['editor', 'محرر', Pencil], ['markdown', 'Markdown', Code2], ['preview', 'عرض', Eye]] as const).map(([key, title, Icon]) => <button type="button" key={key} role="tab" aria-selected={mode === key} aria-controls={`${id}-panel`} id={`${id}-${key}`} onClick={() => setMode(key)}><Icon size={15}/>{title}</button>)}
        </div>
        <button type="button" className={styles.import} disabled={importPending} onClick={() => fileInput.current?.click()}><Upload size={15}/>{importPending ? "جارٍ الاستيراد…" : "استيراد .md"}</button>
        <input ref={fileInput} type="file" accept=".md,text/markdown,text/plain" className={styles.file} aria-label={`استيراد ملف ${label}`} onChange={event => void importFile(event.target.files?.[0])}/>
      </div>
      {mode === "editor" && <div className={styles.toolbar} role="toolbar" aria-label={`تنسيق ${label}`}>
        <select aria-label={`نمط النص في ${label}`} disabled={!editor} value={editor?.isActive("heading", { level: 1 }) ? "1" : editor?.isActive("heading", { level: 2 }) ? "2" : editor?.isActive("heading", { level: 3 }) ? "3" : "0"} onChange={event => event.target.value === "0" ? editor?.chain().focus().setParagraph().run() : editor?.chain().focus().setHeading({ level: Number(event.target.value) as 1 | 2 | 3 }).run()}><option value="0">نص عادي</option><option value="1">عنوان رئيسي</option><option value="2">عنوان فرعي</option><option value="3">عنوان صغير</option></select>
        <select aria-label={`حجم النص في ${label}`} disabled={!editor} value={editor?.getAttributes("textStyle").fontSize ?? ""} onChange={event => event.target.value ? editor?.chain().focus().setFontSize(event.target.value).run() : editor?.chain().focus().unsetFontSize().run()}><option value="">الحجم</option>{[12,14,16,18,20,24,28,32].map(size => <option key={size} value={`${size}px`}>{size}</option>)}</select>
        <label className={styles.color} title="لون النص"><span>اللون</span><input type="color" aria-label={`لون النص في ${label}`} disabled={!editor} defaultValue="#0066cc" onChange={event => editor?.chain().focus().setColor(event.target.value).run()}/></label>
        {actions.map(action => <button type="button" key={action.label} aria-label={action.label} title={action.label} aria-pressed={action.active} disabled={!editor || action.disabled} onMouseDown={event => event.preventDefault()} onClick={action.run}><action.icon size={17}/></button>)}
      </div>}
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`} className={styles.body}>
        <div hidden={mode !== "editor"}><EditorContent editor={editor}/>{!editor && <p role="status">جارٍ تجهيز المحرر…</p>}</div>
        {mode === "markdown" && <textarea aria-label={`مصدر Markdown — ${label}`} dir="auto" maxLength={INSTRUCTION_SOURCE_LIMIT} value={instructionSource(value)} onChange={event => { setError(""); changed(encodeInstruction(event.target.value)); }} placeholder="# عنوان التعليمات" spellCheck={false}/>}
        {mode === "preview" && (value.trim() ? <InstructionContent value={value}/> : <p className={styles.empty}>اكتب التعليمات لمعاينة طريقة عرضها هنا.</p>)}
      </div>
      <footer><span>{hint}</span><bdi className={value.length > 10000 ? styles.limit : ""}>{instructionSource(value).length} / {INSTRUCTION_SOURCE_LIMIT}</bdi></footer>
    </div>
    {(error || value.length > 10000) && <p role="alert" className={styles.error}>{error || "التعليمات طويلة؛ اختصر النص أو التنسيق قبل الحفظ."}</p>}
    {mode === "markdown" && <small>الألوان والأحجام تحفظ بوسوم تنسيق بسيطة داخل Markdown.</small>}
  </section>;
}
