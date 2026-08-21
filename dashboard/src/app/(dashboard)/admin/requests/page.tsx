import type { Metadata } from "next";
import { ApprovalRequestsWorkspace } from "@/features/approvals/ui/approval-requests-workspace";

export const metadata: Metadata = { title: "طلبات الاعتماد" };

export default function RequestsPage() {
  return <ApprovalRequestsWorkspace />;
}
