import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design tokens add `text-q-*` sizes next to `text-q-*` colours. Without
// naming the sizes here, tailwind-merge treats both as colours and silently
// drops one of them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["q-caption", "q-ui", "q-body", "q-h3", "q-h2", "q-h1"],
      radius: ["q-control", "q-card"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
