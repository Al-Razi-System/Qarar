import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { PeopleFollowUp, PersonRow } from "../model/performance";
import { PeopleFollowUpView } from "./people-follow-up";

const person = (extra: Partial<PersonRow>): PersonRow => ({
  user_id: "u1", full_name_ar: "د. أحمد", state: "attention",
  councils: [{ id: "c1", name_ar: "مجلس الكلية", role_code: "council_chair", role_name_ar: "رئيس المجلس" }, { id: "c2", name_ar: "مجلس الجامعة", role_code: "council_member", role_name_ar: "عضو" }],
  attendance: { present: 1, recorded: 4 }, votes: { eligible: 3, voted: 3 }, minutes: { total: 2, signed: 1, pending: 1 },
  tasks: { total: 3, done: 1, overdue: 2 }, topics_submitted: 2, ...extra,
});
const data: PeopleFollowUp = {
  academic_year_start: "2026-09-01",
  summary: { total: 2, attention: 1, regular: 1, no_activity: 0, present: 5, recorded: 8, voted: 6, eligible: 6, pending_signatures: 1, tasks: 3, tasks_done: 1, tasks_overdue: 2 },
  councils: [{ id: "c1", name_ar: "مجلس الكلية" }, { id: "c2", name_ar: "مجلس الجامعة" }],
  people: [person({}), person({ user_id: "u2", full_name_ar: "د. سلمى", state: "regular", councils: [{ id: "c2", name_ar: "مجلس الجامعة", role_code: "council_member", role_name_ar: "عضو" }],
    attendance: { present: 4, recorded: 4 }, minutes: { total: 2, signed: 2, pending: 0 }, tasks: { total: 0, done: 0, overdue: 0 }, topics_submitted: 0 })],
};
const rows = () => within(screen.getByRole("region", { name: "الأعضاء" })).getAllByRole("row").slice(1);

describe("PeopleFollowUpView", () => {
  it("shows each member's attendance, voting, signatures and tasks, and says why one needs attention", () => {
    render(<PeopleFollowUpView data={data} />);
    expect(rows()[0]).toHaveTextContent("د. أحمد");
    expect(rows()[0]).toHaveTextContent("رئيس المجلس، مجلس الكلية، ومجلس آخر");
    expect(rows()[0]).toHaveTextContent("25%");
    expect(rows()[0]).toHaveTextContent("3 من 3");
    expect(rows()[0]).toHaveTextContent("1 بانتظاره");
    expect(rows()[0]).toHaveTextContent("2 متأخرة");
    expect(rows()[0]).toHaveTextContent("2 تكليفات متأخرة، محضر ينتظر توقيعه، غاب عن أكثر الجلسات");
    expect(within(rows()[1]).getByText("منتظم")).toBeInTheDocument();
  });

  it("adds the members up against the targets", () => {
    render(<PeopleFollowUpView data={data} />);
    const strip = screen.getByRole("region", { name: "مؤشرات الأعضاء" });
    expect(strip).toHaveTextContent("الحضور63%");
    expect(strip).toHaveTextContent("المشاركة في التصويت100%");
    expect(strip).toHaveTextContent("تنفيذ التكليفات1 من 3");
  });

  it("filters by state and by council, and opens on a council when linked from its page", async () => {
    const { unmount } = render(<PeopleFollowUpView data={data} />);
    await userEvent.click(screen.getByRole("radio", { name: "منتظمون 1" }));
    expect(rows()).toHaveLength(1);
    await userEvent.selectOptions(screen.getByLabelText("المجلس"), "مجلس الكلية");
    expect(screen.getByText("لا أعضاء بهذه التصفية.")).toBeInTheDocument();
    unmount();
    render(<PeopleFollowUpView data={data} initialCouncilId="c1" />);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("د. أحمد");
  });

  it("says so when there is no member in scope", () => {
    render(<PeopleFollowUpView data={{ ...data, summary: { ...data.summary, total: 0 }, people: [] }} />);
    expect(screen.getByText(/لا أعضاء في المجالس/)).toBeInTheDocument();
  });
});
