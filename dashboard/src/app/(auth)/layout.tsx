import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f5f8fc]">
      <div className="grid min-h-screen lg:grid-cols-[1fr_1.08fr]">{children}</div>
    </main>
  );
}
