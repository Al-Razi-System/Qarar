import { ExternalLink } from "lucide-react";
import type { PolicyAttachment } from "../model/types";
import styles from "./regulation-library.module.css";

export function sourceFileUrl(value: string): string | null {
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function RegulationSourceFiles({ attachments }: { attachments: PolicyAttachment[] }) {
  return <ul className={styles.sourceFiles}>{attachments.map((attachment) => {
    const href = sourceFileUrl(attachment.file_url);
    return <li key={attachment.id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden size={15} />{attachment.file_name}</a> : <span>{attachment.file_name} · رابط المصدر غير متاح</span>}{attachment.description && <small>{attachment.description}</small>}</li>;
  })}</ul>;
}
