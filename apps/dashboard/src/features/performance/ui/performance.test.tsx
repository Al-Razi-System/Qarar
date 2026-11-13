import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { academicYearLabel, councilMetrics, councilReasons, councilReport, days, rhythmSentence, type Activity, type CouncilPerformance, type CouncilRow, type Overview } from "../model/performance";
import { CouncilPerformanceView } from "./council-performance";
import { OversightOverview } from "./oversight-overview";

const graphics: CouncilRow = {
  id: "c1", name_ar: "مجلس قسم الجرافيكس", parent_name_ar: "كلية الحاسبات", state: "attention", leads: false, follows: true,
  sessions: { on_time: 1, late: 1, missed: 0, overdue: 1, upcoming: 7, cancelled: 0, due: 3 },
  marks: [
    { meeting_id: "m1", outcome: "on_time", late_days: 0, due_on: "2026-09-13" },
    { meeting_id: "m2", outcome: "late", late_days: 6, due_on: "2026-10-11" },
    { meeting_id: "m3", outcome: "overdue", late_days: 4, due_on: "2026-11-08" },
  ],
  next_due: "2026-12-13", attendance: { present: 15, recorded: 18 }, minutes: { avg_days: 4, pending: 1 },
  tasks: { total: 8, done: 5, overdue: 1 }, decisions: 10, violations: { open: 1, escalated: 0 },
  decision_stats: {
    total: 10, untyped: 7, needs_execution: 6, executed: 4, overdue_execution: 1,
    by_outcome: [{ kind: "approval", count: 7 }, { kind: "postponement", count: 2 }, { kind: "rejection", count: 1 }],
    by_type: [{ name_ar: "توصية", count: 3 }], executors: { people: 4, units: 1 },
  },
  topics: { total: 12, regulated: 9, direct: 2, exception: 0, legacy: 1, ungoverned: 3, discussed: 10 },
};
const college: CouncilRow = {
  ...graphics, id: "c2", name_ar: "مجلس الكلية", parent_name_ar: null, state: "regular",
  sessions: { on_time: 3, late: 0, missed: 0, overdue: 0, upcoming: 7, cancelled: 0, due: 3 },
  marks: graphics.marks.map((mark) => ({ ...mark, meeting_id: `k${mark.meeting_id}`, outcome: "on_time" as const, late_days: 0 })),
  minutes: { avg_days: 2, pending: 0 }, tasks: { total: 0, done: 0, overdue: 0 }, violations: { open: 0, escalated: 0 },
};
const overview: Overview = {
  academic_year_start: "2026-09-01", academic_years: ["2026-09-01"],
  summary: { total: 2, regular: 1, attention: 1, stalled: 0, inactive: 0 }, councils: [graphics, college],
};

describe("performance wording", () => {
  it("counts days the Arabic way", () => {
    expect([1, 2, 3, 10, 11].map(days)).toEqual(["يوم واحد", "يومان", "3 أيام", "10 أيام", "11 يومًا"]);
  });

  it("says a council's rhythm in one sentence", () => {
    expect(rhythmSentence(graphics.sessions, graphics.marks)).toBe("جلسة تأخرت 6 أيام، وجلسة لم تنعقد");
    expect(rhythmSentence(college.sessions, college.marks)).toBe("كل الجلسات في موعدها");
    expect(rhythmSentence({ ...college.sessions, on_time: 0, due: 0 }, [])).toBe("لم يحِن موعد أي جلسة بعد");
  });

  it("measures each indicator against its target and flags what falls short", () => {
    const [onTime, attendance, minutes, tasks] = councilMetrics(graphics);
    expect(onTime).toMatchObject({ value: "1 من 3", tone: "danger", target: 0.9 });
    expect(attendance).toMatchObject({ value: "83%", note: "أعلى من المستهدف 75%", tone: "primary" });
    expect(minutes).toMatchObject({ value: "4 أيام", note: "محضر واحد بانتظار الاعتماد، والمهلة 7 أيام" });
    expect(tasks).toMatchObject({ value: "5 من 8", note: "واحد تجاوز موعده", tone: "accent" });
    expect(councilMetrics(college)[3]).toMatchObject({ value: "—", note: "لا تكليفات هذا العام", ratio: null });
  });

  it("names the academic year by both calendar years", () => {
    expect(academicYearLabel("2026-09-01")).toBe("2026–2027");
  });
});

describe("reports and reasons", () => {
  it("says why a council is not regular", () => {
    expect(councilReasons(graphics)).toEqual(["جلسة لم تنعقد", "تكليف متأخر"]);
    expect(councilReasons({ ...college, state: "attention", marks: [{ meeting_id: "x", outcome: "late", late_days: 22, due_on: "2026-10-14" }], attendance: { present: 3, recorded: 8 } }))
      .toEqual(["آخر جلسة تأخرت 22 يومًا", "الحضور 38%"]);
  });

  it("builds a council report with a summary sheet and one sheet per list when they were loaded", () => {
    const base = { academic_year_start: "2026-09-01", council: { ...graphics, chair_name_ar: "د. أحمد", member_count: 9 }, sessions: [], violations: [] };
    expect(councilReport(base, null).sheets.map((sheet) => sheet.name)).toEqual(["الملخص", "الجلسات"]);
    const full = councilReport(base, { topics: [], decisions: [], tasks: [] });
    expect(full.sheets.map((sheet) => sheet.name)).toEqual(["الملخص", "الجلسات", "الموضوعات", "القرارات", "التكليفات"]);
    expect(full.filename).toBe("تقرير-مجلس قسم الجرافيكس-2026–2027");
    const summary = full.sheets[0];
    expect(summary.rows[0]).toHaveLength(summary.columns.length);
    expect(summary.rows[0].slice(0, 4)).toEqual(["مجلس قسم الجرافيكس", "كلية الحاسبات", "يحتاج متابعة", "جلسة لم تنعقد، تكليف متأخر"]);
  });
});

describe("OversightOverview", () => {
  it("lists every council with its rhythm in words, its ratios and its state, linking to the council", () => {
    render(<OversightOverview data={overview} />);
    const row = screen.getByRole("link", { name: "مجلس قسم الجرافيكس" }).closest("tr")!;
    expect(screen.getByRole("link", { name: "مجلس قسم الجرافيكس" })).toHaveAttribute("href", "/admin/performance/c1");
    expect(within(row).getByRole("img", { name: "إيقاع الانعقاد: جلسة تأخرت 6 أيام، وجلسة لم تنعقد" })).toBeInTheDocument();
    expect(row).toHaveTextContent("83%");
    expect(row).toHaveTextContent("1 بانتظار الاعتماد");
    expect(row).toHaveTextContent("5 من 8");
    expect(row).toHaveTextContent("نُفّذ 4 من 6");
    expect(row).toHaveTextContent("3 غير محوكمة");
    expect(within(row).getByText("يحتاج متابعة")).toBeInTheDocument();
  });

  it("filters by state and says so when a state has no council", async () => {
    render(<OversightOverview data={overview} />);
    await userEvent.click(screen.getByRole("radio", { name: "منتظمة 1" }));
    expect(screen.queryByRole("link", { name: "مجلس قسم الجرافيكس" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مجلس الكلية" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "متعثرة 0" }));
    expect(screen.getByText("لا مجالس بهذه الحالة.")).toBeInTheDocument();
  });

  it("tells someone who leads and follows nothing where follow-up is assigned", () => {
    render(<OversightOverview data={{ ...overview, summary: { total: 0, regular: 0, attention: 0, stalled: 0, inactive: 0 }, councils: [] }} />);
    expect(screen.getByText(/لا تقود ولا تتابع أي مجلس/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CouncilPerformanceView", () => {
  const session = (id: string, title: string, extra: Partial<CouncilPerformance["sessions"][number]>) => ({
    meeting_id: id, title_ar: title, sequence_no: 1, planned_on: "2026-10-05", due_on: "2026-10-11", scheduled_on: "2026-10-05", held_on: null,
    status: "closed", outcome: "upcoming" as const, late_days: 0, present: null, recorded: null, minutes_approved_on: null, decisions: 0, link: `/admin/meetings/${id}`, ...extra,
  });
  const data: CouncilPerformance = {
    academic_year_start: "2026-09-01",
    council: { ...graphics, chair_name_ar: "د. أحمد", member_count: 9 },
    sessions: [
      session("m1", "الجلسة الأولى", { outcome: "on_time", held_on: "2026-09-13", due_on: "2026-09-13", planned_on: "2026-09-13", present: 8, recorded: 9, minutes_approved_on: "2026-09-16", decisions: 6 }),
      session("m2", "الجلسة الثانية", { outcome: "late", late_days: 6, held_on: "2026-10-17", present: 7, recorded: 9, decisions: 4 }),
      session("m3", "الجلسة الثالثة", { outcome: "overdue", late_days: 4, status: "scheduled", due_on: "2026-11-08", planned_on: "2026-11-08" }),
      session("m4", "الجلسة الرابعة", { outcome: "upcoming", status: "draft", due_on: "2026-12-13" }),
    ],
    violations: [{ id: "v1", rule_name_ar: "اجتماع دوري لم ينعقد في موعده", subject_label: "الجلسة الثالثة", link: "/admin/meetings/m3", due_since: "2026-11-09T00:00:00Z", escalation_level: 1 }],
  };

  it("shows the whole year's rhythm with what happened to each session in words", () => {
    render(<CouncilPerformanceView data={data} />);
    const rhythm = screen.getByRole("list", { name: "إيقاع الانعقاد: جلسة تأخرت 6 أيام، وجلسة لم تنعقد" });
    expect(within(rhythm).getAllByRole("listitem")).toHaveLength(4);
    expect(within(rhythm).getByText("تأخرت 6 أيام")).toBeInTheDocument();
    expect(within(rhythm).getByText("لم تنعقد، مضى 4 أيام")).toBeInTheDocument();
    expect(screen.getByText("يرأسه د. أحمد")).toBeInTheDocument();
  });

  it("lists held and missed sessions newest first, with attendance, minutes and decisions, and leaves out those still to come", () => {
    render(<CouncilPerformanceView data={data} />);
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("الجلسة الثالثة");
    expect(rows[0]).toHaveTextContent("لم تنعقد، مضى 4 أيام");
    expect(rows[1]).toHaveTextContent("17 أكتوبر، بعد 6 أيام");
    expect(rows[1]).toHaveTextContent("7 من 9");
    expect(rows[1]).toHaveTextContent("لم يُعتمد بعد");
    expect(rows[2]).toHaveTextContent("اعتُمد بعد 3 أيام");
    expect(within(rows[2]).getByRole("link", { name: "الجلسة الأولى" })).toHaveAttribute("href", "/admin/meetings/m1");
  });

  it("breaks decisions down by outcome and type, with how many were executed and by whom", () => {
    render(<CouncilPerformanceView data={data} />);
    const decisions = screen.getByRole("region", { name: "القرارات الصادرة" });
    const outcomes = within(decisions).getByRole("list", { name: "القرارات حسب نتيجتها" });
    expect(within(outcomes).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["موافقة7", "تأجيل2", "رفض1"]);
    expect(decisions).toHaveTextContent("حسب النوع: توصية 3، بلا نوع 7.");
    expect(decisions).toHaveTextContent("تحتاج تنفيذًا6 من 10");
    expect(decisions).toHaveTextContent("نُفّذت كاملة4 من 6");
    expect(decisions).toHaveTextContent("1 تأخر تنفيذها");
    expect(decisions).toHaveTextContent("4 أشخاص وجهة واحدة");
  });

  it("separates governed topics from ungoverned ones", () => {
    render(<CouncilPerformanceView data={data} />);
    const topics = screen.getByRole("region", { name: "الموضوعات في جدول المجلس" });
    expect(within(within(topics).getByRole("list")).getAllByRole("listitem").map((item) => item.textContent))
      .toEqual(["محوكمة بمسار معتمد9", "مباشرة بلا مسار2", "قديمة بلا مسار1"]);
    expect(topics).toHaveTextContent("غير محوكمة3 من 12");
    expect(topics).toHaveTextContent("نوقشت10 من 12");
  });

  const activity: Activity = {
    topics: [
      { id: "t1", topic_no: "T-1", title_ar: "خطة القسم", governance_source: "regulated", agenda_status: "discussed", meeting_id: "m1", meeting_title_ar: "الجلسة الأولى", meeting_date: "2026-09-13", decision_no: "D-1", outcome_kind: "approval", link: "/admin/topics/t1" },
      { id: "t2", topic_no: null, title_ar: "طلب عاجل", governance_source: "custom", agenda_status: "pending", meeting_id: "m2", meeting_title_ar: "الجلسة الثانية", meeting_date: "2026-10-17", decision_no: null, outcome_kind: null, link: "/admin/topics/t2" },
    ],
    decisions: [{ id: "d1", decision_no: "D-1", decision_text: "اعتماد الخطة", outcome_kind: "approval", type_name_ar: null, issued_at: "2026-09-13T10:00:00Z", meeting_id: "m1", meeting_title_ar: "الجلسة الأولى", topic_title_ar: "خطة القسم", tasks: 2, tasks_done: 1, link: "/admin/meetings/m1" }],
    tasks: [
      { id: "k1", action_no: "A-1", title_ar: "تحديث التوصيف", status: "in_progress", due_date: "2026-11-01", overdue: true, assignee_name_ar: "د. سامي", assignee_unit_ar: null, decision_no: "D-1", meeting_id: "m1", link: "/admin/tasks?task=k1" },
      { id: "k2", action_no: "A-2", title_ar: "رفع التقرير", status: "completed", due_date: "2026-10-01", overdue: false, assignee_name_ar: null, assignee_unit_ar: "قسم الجرافيكس", decision_no: "D-1", meeting_id: "m1", link: "/admin/tasks?task=k2" },
    ],
  };
  const tableRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

  it("opens the topics, decisions and tasks behind the figures, each row linking to its record", async () => {
    render(<CouncilPerformanceView data={data} activity={activity} />);
    await userEvent.click(screen.getByRole("radio", { name: "الموضوعات 2" }));
    expect(tableRows()).toHaveLength(2);
    expect(tableRows()[0]).toHaveTextContent("خطة القسم");
    expect(tableRows()[0]).toHaveTextContent("محوكم");
    expect(tableRows()[0]).toHaveTextContent("موافقة");
    expect(tableRows()[1]).toHaveTextContent("لم يصدر قرار");
    expect(screen.getByRole("link", { name: "خطة القسم" })).toHaveAttribute("href", "/admin/topics/t1");

    await userEvent.click(screen.getByRole("radio", { name: "القرارات 1" }));
    expect(tableRows()[0]).toHaveTextContent("اعتماد الخطة");
    await userEvent.click(screen.getByRole("button", { name: "تكليفات D-1" }));
    expect(tableRows()).toHaveLength(2);
    expect(tableRows()[0]).toHaveTextContent("د. سامي");
    expect(tableRows()[0]).toHaveTextContent("متأخر");
    expect(tableRows()[1]).toHaveTextContent("قسم الجرافيكس");
    await userEvent.click(screen.getByRole("radio", { name: "متأخرة" }));
    expect(tableRows()).toHaveLength(1);
  });

  it("jumps from a figure to its list already filtered, and from a session to what happened in it", async () => {
    render(<CouncilPerformanceView data={data} activity={activity} />);
    await userEvent.click(within(screen.getByRole("region", { name: "الموضوعات في جدول المجلس" })).getByRole("button", { name: "3 من 12" }));
    expect(screen.getByRole("radio", { name: "غير محوكمة" })).toBeChecked();
    expect(tableRows()).toHaveLength(1);
    expect(tableRows()[0]).toHaveTextContent("طلب عاجل");

    await userEvent.click(within(screen.getByRole("list", { name: /إيقاع الانعقاد/ })).getAllByRole("button")[0]);
    expect(screen.getByText("تعرض ما يخص:")).toHaveTextContent("الجلسة الأولى");
    expect(screen.getByText("لا موضوعات بهذه التصفية.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "الكل" }));
    expect(tableRows()[0]).toHaveTextContent("خطة القسم");
    await userEvent.click(screen.getByRole("button", { name: "عرض كل الجلسات" }));
    expect(tableRows()).toHaveLength(2);
  });

  it("keeps the sessions usable and says so when the details could not be loaded", async () => {
    render(<CouncilPerformanceView data={data} />);
    expect(tableRows()).toHaveLength(3);
    await userEvent.click(screen.getByRole("radio", { name: "الموضوعات 0" }));
    expect(screen.getByText(/تعذر تحميل التفاصيل الآن/)).toBeInTheDocument();
  });

  it("lists what needs follow-up now with a link, or says nothing is open", () => {
    const { rerender } = render(<CouncilPerformanceView data={data} />);
    expect(screen.getByText("اجتماع دوري لم ينعقد في موعده")).toBeInTheDocument();
    expect(screen.getByText(/وصُعّد إلى المتابعين/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "فتح: الجلسة الثالثة" })).toHaveAttribute("href", "/admin/meetings/m3");
    rerender(<CouncilPerformanceView data={{ ...data, violations: [] }} />);
    expect(screen.getByText("لا شيء مفتوح على هذا المجلس الآن.")).toBeInTheDocument();
  });
});
