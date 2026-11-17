import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useConfirm } from "./confirm-dialog";

function Harness({ onResult }: { onResult: (value: boolean) => void }) {
  const [confirm, dialog] = useConfirm();
  return <><button type="button" onClick={async () => onResult(await confirm("سيُحذف الإصدار نهائيًا.", { confirmLabel: "احذف", danger: true }))}>ابدأ</button>{dialog}</>;
}

describe("useConfirm", () => {
  it("resolves true only when the person confirms, and false when they cancel or close", async () => {
    const results: boolean[] = [];
    render(<Harness onResult={(value) => results.push(value)} />);
    await userEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    expect(screen.getByRole("dialog", { name: "تأكيد الإجراء" })).toHaveTextContent("سيُحذف الإصدار نهائيًا.");
    await userEvent.click(screen.getByRole("button", { name: "احذف" }));
    await userEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    await userEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    await userEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    await act(async () => { await userEvent.keyboard("{Escape}"); });
    expect(results).toEqual([true, false, false]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
