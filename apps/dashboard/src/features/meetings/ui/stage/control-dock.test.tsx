import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlDock } from "./control-dock";

describe("stage-specific chair controls", () => {
  it("shows only the next step; alternatives remain accessible and completion waits", () => {
    const action = vi.fn();
    render(<ControlDock item={null} actions={[{ kind: "end", label: "إنهاء المناقشة" }, { kind: "refer", label: "إحالة البند" }]} note={null} busy={false} blockers={["استكمال التصويت"]} onAction={action} onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "إنهاء المناقشة" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إحالة البند" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إنهاء الجلسة والانتقال إلى إعداد المحضر" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "خيارات أخرى للبند" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "إحالة البند" }));
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ kind: "refer" }));
  });
});
