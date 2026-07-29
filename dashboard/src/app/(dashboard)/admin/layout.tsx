import type { ReactNode } from "react";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
