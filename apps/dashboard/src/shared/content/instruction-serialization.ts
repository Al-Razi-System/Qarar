import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { encodeInstruction, safeInstructionStyle } from "./instruction-markdown";

/** Browser-only conversion from the editor schema, not a general HTML ingestion API. */
export function serializeInstruction(html: string) {
  const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  converter.use(gfm);
  converter.addRule("instructionTextStyle", {
    filter: "span",
    replacement(content, node) {
      const element = node as HTMLElement;
      let color = element.style.color;
      const rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (rgb) color = "#" + rgb.slice(1).map(part => Number(part).toString(16).padStart(2, "0")).join("");
      const style = safeInstructionStyle(`color: ${color}; font-size: ${element.style.fontSize}`);
      const attributes = [style.color ? `color: ${style.color}` : "", style.fontSize ? `font-size: ${style.fontSize}` : ""].filter(Boolean).join("; ");
      return attributes && content ? `<span style="${attributes}">${content}</span>` : content;
    },
  });
  converter.addRule("instructionUnderline", { filter: "u", replacement: content => content ? `<u>${content}</u>` : "" });
  return encodeInstruction(converter.turndown(html));
}
