import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { instructionSchema, instructionSource, INSTRUCTION_MARKDOWN_PREFIX, restrictInstructionStyles, safeInstructionStyle } from "./instruction-markdown";
import styles from "./instruction-content.module.css";

export function InstructionContent({ value }: { value: string }) {
  return <div className={styles.content} dir="auto">
    {value.startsWith(INSTRUCTION_MARKDOWN_PREFIX) ? <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw, [rehypeSanitize, instructionSchema], restrictInstructionStyles]}
      components={{ span: ({ node, children }) => <span style={safeInstructionStyle(node?.properties.style)}>{children}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>
      {instructionSource(value)}
    </Markdown> : <p className={styles.plain}>{value}</p>}
  </div>;
}
