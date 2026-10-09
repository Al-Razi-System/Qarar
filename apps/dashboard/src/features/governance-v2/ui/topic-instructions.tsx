import { BookOpen } from "lucide-react";
import styles from "./topic-instructions.module.css";
import { InstructionContent } from "@/shared/content/instruction-content";

export function TopicInstructions({ title, text }: { title: string; text?: string | null }) {
  if (!text?.trim()) return null;
  return <section className={styles.panel} aria-label={title}>
    <div className={styles.heading}><BookOpen size={18} aria-hidden="true"/><h3>{title}</h3><span>إرشادات</span></div>
    <InstructionContent value={text}/>
  </section>;
}
