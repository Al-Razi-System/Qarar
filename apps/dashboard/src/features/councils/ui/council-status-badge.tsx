import type { CouncilStatus } from "../model/types";
import { Badge } from "@/shared/ui/badge";

const status = {
  active: { label: "نشط", tone: "success" },
  inactive: { label: "غير نشط", tone: "warning" },
  archived: { label: "مؤرشف", tone: "neutral" },
} satisfies Record<CouncilStatus, { label: string; tone: "success" | "warning" | "neutral" }>;

export function CouncilStatusBadge({ value }: { value: CouncilStatus }) {
  const item = status[value] ?? status.inactive;
  return <Badge tone={item.tone}>{item.label}</Badge>;
}
