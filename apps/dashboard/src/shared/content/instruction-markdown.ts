import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Root, Element } from "hast";

export const INSTRUCTION_MARKDOWN_PREFIX = "qarar:markdown:v1\n";
export const INSTRUCTION_SOURCE_LIMIT = 10000 - INSTRUCTION_MARKDOWN_PREFIX.length;
export const instructionSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []).filter(name => !["img", "input"].includes(name)), "u"],
  attributes: { ...defaultSchema.attributes, span: ["style"] },
  protocols: { ...defaultSchema.protocols, href: ["https", "http", "mailto"] },
};
export function instructionSource(value: string) { return value.startsWith(INSTRUCTION_MARKDOWN_PREFIX) ? value.slice(INSTRUCTION_MARKDOWN_PREFIX.length) : value; }
/** Compatibility for old rich HTML imports containing escaped block Markdown.
 * Presentation only: keep the persisted source and inline escapes unchanged.
 * Container layout is owned by the reader, not by imported HTML/CSS.
 */
export function instructionDisplaySource(value: string) {
  const source = instructionSource(value);
  const lines = source.split("\n");
  const literal = new Set<number>();
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fence || marker) literal.add(index);
    if (marker && !fence) fence = marker;
    else if (marker && fence && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
  });
  const prose = lines.filter((line, index) => !literal.has(index) && !line.includes("`")).join("\n");
  const escapedBlockCount = prose.match(/^\s*\\(?:#{1,6}\s|[-*+]\s|---\s*$|>\s)/gm)?.length ?? 0;
  const legacyEscapedMarkdown = value.startsWith(INSTRUCTION_MARKDOWN_PREFIX) && escapedBlockCount >= 2;
  return lines.map((line, index) => {
    if (literal.has(index)) return line;
    if (!line.includes("`")) line = line.replace(/<\/?div\b[^>]*>/gi, "\n\n");
    if (!legacyEscapedMarkdown) return line;
    return line.replace(/^(\s*)\\(?=#{1,6}\s|[-*+]\s|---\s*$|>\s)/, "$1")
      .replace(/^(\s*\d+)\\([.)])(?=\s)/, "$1$2")
      .replace(/^(\s*[-*+]\s+)\\\[([ xX])\\\]/, "$1[$2]");
  }).filter((line, index) => {
    if (literal.has(index) || line.trim()) return true;
    let before = index - 1; let after = index + 1;
    while (before >= 0 && !lines[before].trim()) before--;
    while (after < lines.length && !lines[after].trim()) after++;
    return !(lines[before]?.trim().startsWith("|") && lines[after]?.trim().startsWith("|"));
  }).join("\n");
}
export function encodeInstruction(source: string) { return source.trim() ? INSTRUCTION_MARKDOWN_PREFIX + source : ""; }

/** Do not trust CSS from imported Markdown. Only color and bounded text size survive. */
export function safeInstructionStyle(value: unknown) {
  const style: { color?: string; fontSize?: string } = {};
  if (typeof value !== "string") return style;
  for (const declaration of value.split(";")) {
    const [key, raw] = declaration.split(":"); const text = raw?.trim();
    if (key.trim() === "color" && text && /^#[0-9a-f]{6}$/i.test(text)) style.color = text;
    if (key.trim() === "font-size" && text && /^(12|14|16|18|20|24|28|32)px$/.test(text)) style.fontSize = text;
  }
  return style;
}
export function restrictInstructionStyles() {
  return (tree: Root) => {
    function visit(node: Root | Element) {
      if (node.type === "element" && "style" in node.properties) {
        const style = safeInstructionStyle(node.properties.style);
        node.properties.style = [style.color ? `color: ${style.color}` : "", style.fontSize ? `font-size: ${style.fontSize}` : ""].filter(Boolean).join("; ");
      }
      for (const child of node.children) if (child.type === "element") visit(child);
    }
    visit(tree);
  };
}
export function instructionHtml(value: string) {
  if (!value.startsWith(INSTRUCTION_MARKDOWN_PREFIX)) {
    const text = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    return `<p>${text.replaceAll("\n", "<br>")}</p>`;
  }
  return String(unified().use(remarkParse).use(remarkGfm).use(remarkBreaks)
    .use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw)
    .use(rehypeSanitize, instructionSchema).use(restrictInstructionStyles).use(rehypeStringify)
    .processSync(instructionDisplaySource(value)));
}
