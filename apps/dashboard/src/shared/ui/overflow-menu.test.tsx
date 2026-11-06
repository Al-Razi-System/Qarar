import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OverflowMenu } from "./overflow-menu";

describe("OverflowMenu", () => {
  const items = (onRefer = vi.fn()) => [
    { key: "refer", label: "إحالة البند", onSelect: onRefer },
    { key: "postpone", label: "تأجيل البند", hint: "يحتاج سبباً موثقاً", disabled: true, onSelect: vi.fn() },
    { key: "theme", label: "الوضع الليلي", checked: false, onSelect: vi.fn() },
  ];

  it("keeps secondary actions behind one labelled button, and runs the chosen one", async () => {
    const onRefer = vi.fn();
    render(<OverflowMenu label="خيارات أخرى للبند" items={items(onRefer)} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "خيارات أخرى للبند" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: /تأجيل البند/ })).toBeDisabled();
    expect(screen.getByText("يحتاج سبباً موثقاً")).toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "الوضع الليلي" })).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("menuitem", { name: "إحالة البند" }));
    expect(onRefer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("moves with the arrow keys, skips disabled items and closes on Escape back to its button", async () => {
    render(<OverflowMenu label="خيارات أخرى للبند" items={items()} />);
    const trigger = screen.getByRole("button", { name: "خيارات أخرى للبند" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "إحالة البند" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemcheckbox", { name: "الوضع الليلي" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "إحالة البند" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes when the viewer clicks elsewhere", async () => {
    render(<div><p>خارج القائمة</p><OverflowMenu label="خيارات" items={items()} /></div>);
    await userEvent.click(screen.getByRole("button", { name: "خيارات" }));
    await userEvent.click(screen.getByText("خارج القائمة"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
