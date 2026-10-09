import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { InlineMessage } from "./inline-message";
import { MemberSeat } from "./member-seat";
import { SegmentedControl } from "./segmented-control";

describe("Button", () => {
  it("is a real button that does not submit a form unless asked to", () => {
    render(<Button>حفظ القرار</Button>);
    expect(screen.getByRole("button", { name: "حفظ القرار" })).toHaveAttribute("type", "button");
  });

  it("blocks a second submission and announces the pending state", async () => {
    const onClick = vi.fn();
    render(<Button pending pendingLabel="جارٍ الحفظ…" onClick={onClick}>حفظ القرار</Button>);
    const button = screen.getByRole("button", { name: "جارٍ الحفظ…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the 44px minimum target and reads its colours from tokens", () => {
    render(<Button variant="danger">إلغاء الجولة</Button>);
    const classes = screen.getByRole("button").className;
    expect(classes).toContain("min-h-11");
    expect(classes).toContain("bg-q-danger");
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});

describe("Badge and InlineMessage", () => {
  it("always carries the status as text", () => {
    render(<Badge tone="live">الجاري الآن</Badge>);
    expect(screen.getByText("الجاري الآن").className).toContain("text-q-live");
  });

  it("announces an error immediately and other feedback politely", () => {
    render(<><InlineMessage tone="error">حدد موعداً قبل الحفظ.</InlineMessage><InlineMessage tone="success">تم الحفظ.</InlineMessage></>);
    expect(screen.getByRole("alert")).toHaveTextContent("حدد موعداً قبل الحفظ.");
    expect(screen.getByRole("status")).toHaveTextContent("تم الحفظ.");
  });
});

describe("Card", () => {
  it("marks only the live card with the live edge", () => {
    render(<><Card data-testid="plain">بند</Card><Card live data-testid="live">البند الجاري</Card></>);
    expect(screen.getByTestId("plain").className).not.toContain("border-t-q-live");
    expect(screen.getByTestId("live").className).toContain("border-t-q-live");
  });
});

describe("SegmentedControl", () => {
  function Harness() {
    const [value, setValue] = useState<"person" | "unit">("person");
    return <><SegmentedControl label="التكليف موجّه إلى" value={value} onChange={setValue} options={[{ value: "person", label: "شخص" }, { value: "unit", label: "وحدة" }]} /><output>{value}</output></>;
  }

  it("exposes one named group with exactly one checked option", async () => {
    render(<Harness />);
    expect(screen.getByRole("radiogroup", { name: "التكليف موجّه إلى" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "شخص" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "وحدة" }));
    expect(screen.getByRole("radio", { name: "وحدة" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "شخص" })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("unit");
  });

  it("does not fire a change for the option that is already selected", async () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="النوع" value="person" onChange={onChange} options={[{ value: "person", label: "شخص" }, { value: "unit", label: "وحدة" }]} />);
    await userEvent.click(screen.getByRole("radio", { name: "شخص" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("MemberSeat", () => {
  it("shows that a member voted without any direction", () => {
    render(<MemberSeat name="د. خالد" status="voted" roleLabel="عضو" />);
    expect(screen.getByText("صوّت")).toBeInTheDocument();
    expect(screen.queryByText(/موافق|غير موافق|ممتنع/)).not.toBeInTheDocument();
  });

  it("uses the name after the title for the initial and shows the role when idle", () => {
    render(<MemberSeat name="د. منصور" status="present" roleLabel="الرئيس" chair />);
    expect(screen.getByText("م")).toBeInTheDocument();
    expect(screen.getByText("الرئيس")).toBeInTheDocument();
  });

  it("opens the contact card only when a handler is provided", async () => {
    const onOpen = vi.fn();
    const { rerender } = render(<MemberSeat name="د. هدى" status="present" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<MemberSeat name="د. هدى" status="present" onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: "بطاقة د. هدى" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says so when attendance is not confirmed yet, whatever the role", () => {
    render(<MemberSeat name="د. ريم" status="pending" roleLabel="عضو" />);
    expect(screen.getByText("لم يثبت حضوره")).toBeInTheDocument();
    expect(screen.queryByText("عضو")).not.toBeInTheDocument();
  });

  it("states absence in words and dims the seat", () => {
    render(<MemberSeat name="د. طارق" status="absent" roleLabel="عضو" />);
    expect(screen.getByText("غائب")).toBeInTheDocument();
  });
});
