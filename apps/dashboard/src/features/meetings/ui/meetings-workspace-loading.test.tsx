import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../api/meetings-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/meetings-client")>();
  return { ...actual, meetingRpc: rpc };
});

import { MeetingApiError } from "../api/meetings-client";
import { MeetingsWorkspace } from "./meetings-workspace";

afterEach(() => vi.clearAllMocks());

it("keeps a failed meeting load visible with its reason and an in-place retry", async () => {
  let searchAttempts = 0;
  rpc.mockImplementation((contract: string) => {
    if (contract === "list_meeting_series") return Promise.resolve([]);
    searchAttempts += 1;
    if (searchAttempts === 1) return Promise.reject(new MeetingApiError(
      "استغرق تحميل الاجتماعات وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات.",
      503,
      "QUERY_TIMEOUT",
      "request-123",
    ));
    return Promise.resolve({ items: [], total: 0 });
  });
  render(<MeetingsWorkspace />);

  expect(await screen.findByRole("alert")).toHaveTextContent("استغرق تحميل الاجتماعات وقتًا أطول من المتوقع");
  const retry = screen.getByRole("button", { name: "إعادة تحميل الاجتماعات" });

  fireEvent.click(retry);

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("search_meetings_v2", expect.any(Object), expect.objectContaining({ signal: expect.any(AbortSignal) })));
});

it("shows meeting results without waiting for the secondary recurrence list", async () => {
  let resolveSeries: (value: unknown[]) => void = () => undefined;
  const seriesPending = new Promise<unknown[]>((resolve) => { resolveSeries = resolve; });
  rpc.mockImplementation((contract: string) => contract === "search_meetings_v2"
    ? Promise.resolve({ items: [{
        id: "meeting-1",
        title_ar: "اجتماع الأداء",
        status: "scheduled",
        scheduled_date: "2026-10-22",
      }], total: 1 })
    : seriesPending);

  render(<MeetingsWorkspace />);

  expect(await screen.findByText("اجتماع الأداء")).toBeVisible();
  resolveSeries([]);
});

it("keeps plan occurrences ahead of their cycle in their own tab, counted on the server", async () => {
  const future = { id: "future-cycle", title_ar: "اجتماع يونيو 2027", status: "draft",
    scheduled_date: "2027-06-08", planned_window_start: "2027-06-08", planned_window_end: "2027-06-14" };
  rpc.mockImplementation((contract: string, params: Record<string, unknown>) => {
    if (contract === "search_meetings_v2") return Promise.resolve(params.p_stage === "future"
      ? { items: [future], total: 1, counts: { future: 1 } }
      : { items: [], total: 0, counts: { future: 1 } });
    if (contract === "list_meeting_series") return Promise.resolve([]);
    return Promise.resolve([]);
  });

  render(<MeetingsWorkspace/>);

  expect(await screen.findByText("لا توجد اجتماعات حالية")).toBeVisible();
  expect(screen.getByText(/1 اجتماع مستقبلي في تبويب «المستقبلية»/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /اجتماع يونيو 2027/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^المستقبلية/ }));
  expect(await screen.findByRole("button", { name: /اجتماع يونيو 2027/ })).toBeVisible();
  expect(rpc).toHaveBeenCalledWith("search_meetings_v2", expect.objectContaining({ p_stage: "future" }), expect.anything());
});

it("opens the dedicated meeting journey without loading the legacy detail panel", async () => {
  const meeting = {
    id: "meeting-early",
    meeting_no: "MTG-2026-000777",
    title_ar: "اجتماع مبكر",
    status: "ready_to_start",
    scheduled_date: "2026-10-27",
    start_time: "10:00:00",
    end_time: "12:00:00",
    updated_at: "2026-10-26T20:00:00Z",
    unit_name_ar: "مجلس الجامعة",
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "search_meetings_v2") return Promise.resolve({ items: [meeting], total: 1 });
    if (contract === "list_meeting_series") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: /اجتماع مبكر/ }));
  expect(push).toHaveBeenCalledWith(`/admin/meetings/${meeting.id}`);
  expect(rpc).not.toHaveBeenCalledWith("get_meeting_detail", expect.anything(), expect.anything());
});

it("opens agenda continuation as a focused workspace for the requested meeting", async () => {
  const meeting = {
    id: "meeting-draft",
    meeting_no: "MTG-2026-000007",
    title_ar: "اجتماع مجلس الكلية",
    status: "draft",
    scheduled_date: "2026-10-08",
    updated_at: "2026-10-31T18:00:00Z",
    unit_name_ar: "مجلس كلية العلوم الإدارية والإنسانية",
    agenda_items: [],
    capabilities: { can_manage: true, can_manage_agenda: true, can_add_direct_topic: true },
    submitted_suggestions: { items: [], total: 1 },
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "get_meeting_detail") return Promise.resolve(meeting);
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: false, checks: [] });
    if (contract === "search_eligible_agenda_topics") return Promise.resolve({ items: [], total: 1 });
    if (contract === "list_meeting_topic_attachments" || contract === "list_meeting_series") return Promise.resolve([]);
    if (contract === "search_meetings_v2") return Promise.resolve({ items: [], total: 0 });
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace initialMeetingId={meeting.id}/>);

  expect(await screen.findByRole("heading", { name: meeting.title_ar })).toBeVisible();
  expect(screen.getByRole("button", { name: "عرض 1 موضوعات مقترحة" })).toBeVisible();
  expect(screen.getByRole("button", { name: "موضوع مباشر" })).toBeVisible();
  expect(screen.queryByRole("table", { name: "أيام الفترة" })).not.toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("get_meeting_detail", { p_meeting_id: meeting.id }, { timeoutMs: 12_000 });
  expect(rpc).not.toHaveBeenCalledWith("search_meetings_v2", expect.anything(), expect.anything());
  expect(rpc).not.toHaveBeenCalledWith("list_meetings_calendar_v2", expect.anything(), expect.anything());

  fireEvent.click(screen.getByRole("button", { name: "عرض 1 موضوعات مقترحة" }));
  const proposals = await screen.findByRole("dialog", { name: "الموضوعات المقترحة" });
  expect(proposals).toBeVisible();
  fireEvent.click(within(proposals).getAllByRole("button", { name: "إغلاق" }).at(-1)!);
  fireEvent.click(screen.getByRole("button", { name: "موضوع مباشر" }));
  expect(await screen.findByRole("dialog", { name: "إضافة موضوع مباشر" })).toBeVisible();
});

it("keeps the loaded agenda visible while it refreshes after returning to the browser tab", async () => {
  let detailReads = 0;
  let resolveRefresh: (value: unknown) => void = () => undefined;
  const refreshPending = new Promise((resolve) => { resolveRefresh = resolve; });
  const meeting = {
    id: "meeting-background-refresh",
    meeting_no: "MTG-2026-000090",
    title_ar: "اجتماع ثابت أثناء التحديث",
    status: "scheduled",
    scheduled_date: "2026-11-11",
    updated_at: "2026-11-11T10:00:00Z",
    agenda_items: [],
    capabilities: { can_manage: true, can_manage_agenda: true },
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "get_meeting_detail") {
      detailReads += 1;
      return detailReads === 1 ? Promise.resolve(meeting) : refreshPending;
    }
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: false, checks: [] });
    if (contract === "search_eligible_agenda_topics") return Promise.resolve({ items: [], total: 0 });
    if (contract === "list_meeting_topic_attachments") return Promise.resolve([]);
    return Promise.resolve([]);
  });

  render(<MeetingsWorkspace initialMeetingId={meeting.id}/>);
  expect(await screen.findByRole("heading", { name: meeting.title_ar })).toBeVisible();

  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(detailReads).toBe(2));
  expect(screen.getByRole("heading", { name: meeting.title_ar })).toBeVisible();
  expect(screen.queryByText("جارٍ فتح جدول أعمال الاجتماع…")).not.toBeInTheDocument();

  resolveRefresh({ ...meeting, updated_at: "2026-11-11T10:01:00Z" });
  await waitFor(() => expect(screen.getByRole("heading", { name: meeting.title_ar })).toBeVisible());
});

it("keeps the proposal browser visible when the current eligible count is zero", async () => {
  const meeting = {
    id: "meeting-without-current-proposals",
    meeting_no: "MTG-2026-000008",
    title_ar: "اجتماع ينتظر المقترحات",
    status: "draft",
    scheduled_date: "2026-11-05",
    updated_at: "2026-11-05T18:00:00Z",
    unit_name_ar: "مجلس قسم التمريض",
    agenda_items: [],
    capabilities: { can_manage: true, can_manage_agenda: true, can_add_direct_topic: false },
    submitted_suggestions: { items: [], total: 0 },
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "get_meeting_detail") return Promise.resolve(meeting);
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: false, checks: [] });
    if (contract === "search_eligible_agenda_topics") return Promise.resolve({ items: [], total: 0 });
    if (contract === "list_meeting_topic_attachments" || contract === "list_meeting_series") return Promise.resolve([]);
    if (contract === "search_meetings_v2") return Promise.resolve({ items: [], total: 0 });
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace initialMeetingId={meeting.id}/>);

  const openProposals = await screen.findByRole("button", { name: "عرض 0 موضوعات مقترحة" });
  expect(openProposals).toBeVisible();
  fireEvent.click(openProposals);

  const proposals = await screen.findByRole("dialog", { name: "الموضوعات المقترحة" });
  expect(within(proposals).getByRole("heading", { name: "لا توجد موضوعات مؤهلة حاليًا" })).toBeVisible();
  expect(within(proposals).getByRole("link", { name: "فتح الموضوعات والتحقق من المسار" })).toBeVisible();
});

it("includes periodic obligations in the proposal count and proposal browser", async () => {
  const meeting = {
    id: "inactive-department-council-meeting",
    meeting_no: "MTG-2026-000003",
    title_ar: "الاجتماع الأول لمجلس قسم التخدير",
    status: "draft",
    scheduled_date: "2026-11-05",
    updated_at: "2026-11-05T18:00:00Z",
    unit_name_ar: "مجلس قسم التخدير",
    agenda_items: [],
    capabilities: { can_manage: true, can_manage_agenda: true, can_add_direct_topic: false },
    submitted_suggestions: { items: [], total: 0 },
    scheduled_suggestions: [{
      occurrence_id: "occurrence-1",
      reference_number: "SCH-2026-000001",
      period_key: "month:2026-11",
      topic_type_version_id: "topic-type-version-1",
      title_ar: "اعتماد البرنامج الأكاديمي",
      available_from: "2026-11-01",
      due_on: "2026-11-07",
      timing_status: "due",
      required_attachment_count: 1,
    }],
  };
  rpc.mockImplementation((contract: string) => {
    if (contract === "get_meeting_detail") return Promise.resolve(meeting);
    if (contract === "get_meeting_readiness") return Promise.resolve({ ready: false, checks: [] });
    if (contract === "search_eligible_agenda_topics") return Promise.resolve({ items: [], total: 0 });
    if (contract === "list_meeting_topic_attachments" || contract === "list_meeting_series") return Promise.resolve([]);
    return Promise.reject(new Error(`unexpected contract: ${contract}`));
  });

  render(<MeetingsWorkspace initialMeetingId={meeting.id}/>);

  const openProposals = await screen.findByRole("button", { name: "عرض 1 موضوعات مقترحة" });
  fireEvent.click(openProposals);

  const proposals = await screen.findByRole("dialog", { name: "الموضوعات المقترحة" });
  expect(within(proposals).getByRole("heading", { name: "مقترحات دورية مستحقة لهذا الاجتماع" })).toBeVisible();
  expect(within(proposals).getByRole("heading", { name: "اعتماد البرنامج الأكاديمي" })).toBeVisible();
  expect(within(proposals).getByRole("button", { name: "استكمال وإدراج اعتماد البرنامج الأكاديمي" })).toBeVisible();
  expect(within(proposals).queryByRole("heading", { name: "لا توجد موضوعات مؤهلة حاليًا" })).not.toBeInTheDocument();
});

it("replaces a failed focused meeting load with its cause and an in-place retry", async () => {
  rpc.mockRejectedValueOnce(new MeetingApiError(
    "تعذر الوصول إلى خادم قرار. تحقق من الاتصال ثم أعد المحاولة.",
    0,
    "NETWORK_UNREACHABLE",
  ));

  render(<MeetingsWorkspace initialMeetingId="meeting-unavailable"/>);

  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الوصول إلى خادم قرار");
  expect(screen.queryByText("جارٍ فتح جدول أعمال الاجتماع…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
});

it("keeps the same search, council and status filters in the calendar", async () => {
  const today = new Date(); const key = (day: number) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const calendar = [
    { id: "c1", title_ar: "اجتماع مجلس الجامعة", status: "draft", scheduled_date: key(10), governance_unit_id: "u1", unit_name_ar: "مجلس الجامعة" },
    { id: "c2", title_ar: "اجتماع مجلس الكلية", status: "closed", scheduled_date: key(12), governance_unit_id: "u2", unit_name_ar: "مجلس الكلية" },
  ];
  rpc.mockImplementation((contract: string) => {
    if (contract === "list_meeting_series") return Promise.resolve([]);
    if (contract === "list_meetings_calendar_v2") return Promise.resolve(calendar);
    return Promise.resolve({ items: [], total: 0 });
  });
  render(<MeetingsWorkspace />);
  fireEvent.click(await screen.findByRole("radio", { name: "شهر" }));
  const table = await screen.findByRole("table", { name: "أيام الفترة" });
  expect(await within(table).findByRole("button", { name: /اجتماع مجلس الجامعة/ })).toBeVisible();

  fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "completed" } });
  expect(within(table).queryByRole("button", { name: /اجتماع مجلس الجامعة/ })).not.toBeInTheDocument();
  expect(within(table).getByRole("button", { name: /اجتماع مجلس الكلية/ })).toBeVisible();

  fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "all" } });
  fireEvent.change(screen.getByLabelText("البحث"), { target: { value: "الجامعة" } });
  expect(within(table).getByRole("button", { name: /اجتماع مجلس الجامعة/ })).toBeVisible();
  expect(within(table).queryByRole("button", { name: /اجتماع مجلس الكلية/ })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("المجلس"), { target: { value: "u2" } });
  await waitFor(() => expect(rpc).toHaveBeenCalledWith("list_meetings_calendar_v2", expect.objectContaining({ p_unit_ids: ["u2"] }), expect.anything()));
});
