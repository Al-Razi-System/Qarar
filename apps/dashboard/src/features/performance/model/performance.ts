import type { CsvCell } from "@/shared/lib/csv";
import type { Metric } from "@/shared/ui/metric-strip";
import type { RhythmSession, SessionOutcome } from "@/shared/ui/session-rhythm";
import type { Share } from "@/shared/ui/share-bar";

export type CouncilState = "stalled" | "attention" | "regular" | "inactive";

export type CouncilRow = {
  id: string;
  name_ar: string;
  parent_name_ar: string | null;
  state: CouncilState;
  leads?: boolean;
  follows?: boolean;
  sessions: { on_time: number; late: number; missed: number; overdue: number; upcoming: number; cancelled: number; due: number };
  marks: Array<{ meeting_id: string; outcome: SessionOutcome; late_days: number; due_on: string }>;
  next_due: string | null;
  attendance: { present: number; recorded: number };
  minutes: { avg_days: number | null; pending: number };
  tasks: { total: number; done: number; overdue: number };
  decisions: number;
  violations: { open: number; escalated: number };
  decision_stats: {
    total: number; untyped: number; needs_execution: number; executed: number; overdue_execution: number;
    by_outcome: Array<{ kind: string; count: number }>; by_type: Array<{ name_ar: string; count: number }>;
    executors: { people: number; units: number };
  };
  topics: { total: number; regulated: number; direct: number; exception: number; legacy: number; ungoverned: number; discussed: number };
};

export type Overview = {
  academic_year_start: string;
  academic_years: string[];
  summary: { total: number; regular: number; attention: number; stalled: number; inactive: number };
  councils: CouncilRow[];
};

export type SessionRow = {
  meeting_id: string;
  title_ar: string;
  sequence_no: number | null;
  planned_on: string;
  due_on: string;
  scheduled_on: string;
  held_on: string | null;
  status: string;
  outcome: SessionOutcome;
  late_days: number;
  present: number | null;
  recorded: number | null;
  minutes_approved_on: string | null;
  decisions: number;
  link: string;
};

export type CouncilPerformance = {
  academic_year_start: string;
  council: CouncilRow & { chair_name_ar: string | null; member_count: number };
  sessions: SessionRow[];
  violations: Array<{ id: string; rule_name_ar: string; subject_label: string; link: string | null; due_since: string; escalation_level: number }>;
};

const locale = "ar-SA-u-ca-gregory-nu-latn";
const day = (value: string) => new Date(`${value}T00:00:00`);

export const stateLabel: Record<CouncilState, string> = { stalled: "متعثر", attention: "يحتاج متابعة", regular: "منتظم", inactive: "غير مفعّل" };
export const stateTone: Record<CouncilState, "danger" | "warning" | "success" | "neutral"> = { stalled: "danger", attention: "warning", regular: "success", inactive: "neutral" };

/** «يوم واحد»، «يومان»، «3 أيام»، «11 يومًا». */
export function days(count: number) {
  if (count === 1) return "يوم واحد";
  if (count === 2) return "يومان";
  return count >= 3 && count <= 10 ? `${count} أيام` : `${count} يومًا`;
}

export const shortDate = (value: string) => day(value).toLocaleDateString(locale, { day: "numeric", month: "long" });
export const monthName = (value: string) => day(value).toLocaleDateString(locale, { month: "long" });
/** «2026–2027» from the day the academic year starts. */
export const academicYearLabel = (start: string) => { const year = day(start).getFullYear(); return `${year}–${year + 1}`; };
export const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

/** One sentence for a council's rhythm, said the way a follower would. */
export function rhythmSentence(sessions: CouncilRow["sessions"], marks: CouncilRow["marks"]) {
  if (sessions.due === 0) return sessions.upcoming > 0 ? "لم يحِن موعد أي جلسة بعد" : "لا جلسات في هذا العام";
  const notHeld = sessions.missed + sessions.overdue;
  if (notHeld === 0 && sessions.late === 0) return "كل الجلسات في موعدها";
  const parts: string[] = [];
  if (sessions.late > 0) {
    const worst = Math.max(...marks.filter((mark) => mark.outcome === "late").map((mark) => mark.late_days));
    parts.push(sessions.late === 1 ? `جلسة تأخرت ${days(worst)}` : `${sessions.late} جلسات تأخرت، أطولها ${days(worst)}`);
  }
  if (notHeld > 0) parts.push(notHeld === 1 ? "جلسة لم تنعقد" : notHeld === 2 ? "جلستان لم تنعقدا" : `${notHeld} جلسات لم تنعقد`);
  return parts.join("، و");
}

export function outcomeCaption(session: Pick<SessionRow, "outcome" | "late_days" | "due_on">) {
  switch (session.outcome) {
    case "on_time": return "في موعدها";
    case "late": return `تأخرت ${days(session.late_days)}`;
    case "missed": return "لم تنعقد";
    case "overdue": return `لم تنعقد، مضى ${days(session.late_days)}`;
    case "cancelled": return "أُلغيت أو أُجّلت";
    default: return shortDate(session.due_on);
  }
}

export const compactRhythm = (row: CouncilRow): RhythmSession[] =>
  row.marks.map((mark) => ({ key: mark.meeting_id, outcome: mark.outcome, lateDays: mark.late_days }));

export const fullRhythm = (sessions: SessionRow[]): RhythmSession[] =>
  sessions.map((session) => ({ key: session.meeting_id, outcome: session.outcome, lateDays: session.late_days, heading: monthName(session.due_on), caption: outcomeCaption(session) }));

/** Targets the bars are drawn against. They describe good practice; they are not database rules. */
export const targets = { onTime: 0.9, attendance: 0.75, minutesDays: 7, tasks: 0.8 } as const;

export function councilMetrics(row: CouncilRow): Metric[] {
  const { sessions, attendance, minutes, tasks } = row;
  const onTime = sessions.due > 0 ? sessions.on_time / sessions.due : null;
  const attended = attendance.recorded > 0 ? attendance.present / attendance.recorded : null;
  const done = tasks.total > 0 ? tasks.done / tasks.total : null;
  return [
    {
      label: "الانعقاد في الموعد", value: sessions.due > 0 ? `${sessions.on_time} من ${sessions.due}` : "—",
      note: "المستهدف 9 من كل 10 جلسات", ratio: onTime, target: targets.onTime,
      tone: onTime != null && onTime < 0.5 ? "danger" : onTime != null && onTime < targets.onTime ? "accent" : "primary",
    },
    {
      label: "متوسط الحضور", value: percent(attendance.present, attendance.recorded),
      note: attended == null ? "لم يُسجَّل حضور بعد" : attended >= targets.attendance ? "أعلى من المستهدف 75%" : "أقل من المستهدف 75%",
      ratio: attended, target: targets.attendance, tone: attended != null && attended < targets.attendance ? "accent" : "primary",
    },
    {
      label: "اعتماد المحضر", value: minutes.avg_days == null ? "—" : days(Math.round(minutes.avg_days)),
      note: minutes.pending > 0 ? `${minutes.pending === 1 ? "محضر واحد" : `${minutes.pending} محاضر`} بانتظار الاعتماد، والمهلة 7 أيام` : "المهلة 7 أيام",
      ratio: minutes.avg_days == null ? null : minutes.avg_days / (targets.minutesDays * 2), target: 0.5,
      tone: minutes.avg_days != null && minutes.avg_days > targets.minutesDays ? "accent" : "primary",
    },
    {
      label: "تنفيذ التكليفات", value: tasks.total > 0 ? `${tasks.done} من ${tasks.total}` : "—",
      note: tasks.total === 0 ? "لا تكليفات هذا العام" : tasks.overdue > 0 ? `${tasks.overdue === 1 ? "واحد تجاوز" : `${tasks.overdue} تجاوزت`} موعده` : "لا تكليفات متأخرة",
      ratio: done, target: targets.tasks, tone: tasks.overdue > 0 ? "accent" : "primary",
    },
  ];
}

const outcome: Record<string, { label: string; tone: Share["tone"] }> = {
  approval: { label: "موافقة", tone: "primary" }, rejection: { label: "رفض", tone: "danger" }, postponement: { label: "تأجيل", tone: "accent" },
  referral: { label: "إحالة", tone: "link" }, return: { label: "إعادة", tone: "warning" }, undecided: { label: "بلا حسم", tone: "muted" },
};

/** Decisions split by what the council decided. An outcome the product does not name yet is shown as «غير مصنف». */
export const decisionShares = (stats: CouncilRow["decision_stats"]): Share[] =>
  stats.by_outcome.map(({ kind, count }) => ({ key: kind, count, label: outcome[kind]?.label ?? "غير مصنف", tone: outcome[kind]?.tone ?? "muted" }));

/** Topics the council handled, governed ones apart from the three kinds that bypass a governed route. */
export const topicShares = (topics: CouncilRow["topics"]): Share[] => [
  { key: "regulated", label: "محوكمة بمسار معتمد", count: topics.regulated, tone: "primary" },
  { key: "direct", label: "مباشرة بلا مسار", count: topics.direct, tone: "accent" },
  { key: "exception", label: "باستثناء", count: topics.exception, tone: "warning" },
  { key: "legacy", label: "قديمة بلا مسار", count: topics.legacy, tone: "muted" },
];

export function executorsText({ people, units }: CouncilRow["decision_stats"]["executors"]) {
  const parts = [people > 0 ? (people === 1 ? "شخص واحد" : `${people} أشخاص`) : null, units > 0 ? (units === 1 ? "جهة واحدة" : `${units} جهات`) : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" و") : "لا أحد بعد";
}

export type Activity = {
  topics: Array<{ id: string; topic_no: string | null; title_ar: string; governance_source: string; agenda_status: string; meeting_id: string; meeting_title_ar: string; meeting_date: string; decision_no: string | null; outcome_kind: string | null; link: string }>;
  decisions: Array<{ id: string; decision_no: string | null; decision_text: string; outcome_kind: string; type_name_ar: string | null; issued_at: string; meeting_id: string | null; meeting_title_ar: string | null; topic_title_ar: string | null; tasks: number; tasks_done: number; link: string | null }>;
  tasks: Array<{ id: string; action_no: string | null; title_ar: string; status: string; due_date: string | null; overdue: boolean; assignee_name_ar: string | null; assignee_unit_ar: string | null; decision_no: string | null; meeting_id: string | null; link: string }>;
};

export const outcomeLabel = (kind: string | null) => (kind ? outcome[kind]?.label ?? "غير مصنف" : "—");
export const isGoverned = (source: string) => source === "regulated";
export const governanceLabel = (source: string) => ({ regulated: "محوكم", custom: "مباشر", exception: "باستثناء" } as Record<string, string>)[source] ?? "قديم بلا مسار";
export const agendaLabel = (status: string) => (status === "discussed" ? "نوقش" : status === "pending" ? "لم يُناقش بعد" : "في الجدول");
export const taskDone = (status: string) => status === "completed" || status === "closed";
export const taskStatusLabel = (status: string) => ({ new: "جديد", in_progress: "قيد التنفيذ", submitted: "بانتظار التحقق", completed: "منجز", closed: "مغلق", overdue: "متأخر" } as Record<string, string>)[status] ?? "قيد التنفيذ";

export type TopicState = "stalled" | "returned" | "in_progress" | "finished";
export type TopicRow = {
  id: string; topic_no: string | null; title_ar: string; category_name_ar: string | null; governance_source: string; state: TopicState;
  at_council_id: string | null; at_council_name_ar: string | null; waiting_days: number | null; age_days: number; created_on: string;
  steps_total: number; steps_done: number; listed_count: number; decision_no: string | null; outcome_kind: string | null;
  tasks: number; tasks_done: number; link: string;
};
export type TopicsFollowUp = {
  academic_year_start: string;
  summary: { total: number; in_progress: number; stalled: number; returned: number; finished: number; ungoverned: number; avg_days_to_finish: number | null; avg_waiting_days: number | null };
  by_council: Array<{ id: string; name_ar: string; open: number; stalled: number; longest_wait: number }>;
  by_category: Array<{ name_ar: string; total: number; finished: number; avg_days_to_finish: number | null }>;
  topics: TopicRow[];
};

export const topicStateLabel: Record<TopicState, string> = { stalled: "متوقف", returned: "مُعاد", in_progress: "قيد المعالجة", finished: "محسوم" };
export const topicStateTone: Record<TopicState, "danger" | "warning" | "info" | "success"> = { stalled: "danger", returned: "warning", in_progress: "info", finished: "success" };

export function topicsMetrics({ summary }: TopicsFollowUp): Metric[] {
  const open = summary.total - summary.finished;
  return [
    { label: "قيد المعالجة الآن", value: String(open), note: summary.stalled > 0 ? `${summary.stalled} منها متوقف` : "لا موضوعات متوقفة",
      ratio: open > 0 ? summary.stalled / open : null, tone: "accent" },
    { label: "متوسط الانتظار الحالي", value: summary.avg_waiting_days == null ? "—" : days(Math.round(summary.avg_waiting_days)), note: "يُعد الموضوع متوقفًا بعد 30 يومًا",
      ratio: summary.avg_waiting_days == null ? null : summary.avg_waiting_days / 60, target: 0.5, tone: (summary.avg_waiting_days ?? 0) > 30 ? "accent" : "primary" },
    { label: "حُسم", value: summary.total > 0 ? `${summary.finished} من ${summary.total}` : "—",
      note: summary.avg_days_to_finish == null ? "لم يُحسم موضوع بعد" : `متوسط مدة الحسم ${days(Math.round(summary.avg_days_to_finish))}`,
      ratio: summary.total > 0 ? summary.finished / summary.total : null },
    { label: "غير محوكمة", value: summary.total > 0 ? `${summary.ungoverned} من ${summary.total}` : "—", note: "مباشرة أو باستثناء أو قديمة بلا مسار",
      ratio: summary.total > 0 ? summary.ungoverned / summary.total : null, tone: "accent" },
  ];
}

export type PersonState = "attention" | "regular" | "no_activity";
export type PersonRow = {
  user_id: string; full_name_ar: string; state: PersonState;
  councils: Array<{ id: string; name_ar: string; role_code: string; role_name_ar: string }>;
  attendance: { present: number; recorded: number }; votes: { eligible: number; voted: number };
  minutes: { total: number; signed: number; pending: number }; tasks: { total: number; done: number; overdue: number }; topics_submitted: number;
};
export type PeopleFollowUp = {
  academic_year_start: string;
  summary: { total: number; attention: number; regular: number; no_activity: number; present: number; recorded: number; voted: number; eligible: number; pending_signatures: number; tasks: number; tasks_done: number; tasks_overdue: number };
  councils: Array<{ id: string; name_ar: string }>;
  people: PersonRow[];
};

export const personStateLabel: Record<PersonState, string> = { attention: "يحتاج متابعة", regular: "منتظم", no_activity: "بلا نشاط بعد" };
export const personStateTone: Record<PersonState, "warning" | "success" | "neutral"> = { attention: "warning", regular: "success", no_activity: "neutral" };

/** Why a member needs attention, in the reader's words. */
export function personReasons(person: PersonRow) {
  const reasons: string[] = [];
  if (person.tasks.overdue > 0) reasons.push(person.tasks.overdue === 1 ? "تكليف متأخر" : `${person.tasks.overdue} تكليفات متأخرة`);
  if (person.minutes.pending > 0) reasons.push(person.minutes.pending === 1 ? "محضر ينتظر توقيعه" : `${person.minutes.pending} محاضر تنتظر توقيعه`);
  if (person.attendance.recorded >= 2 && person.attendance.present * 2 < person.attendance.recorded) reasons.push("غاب عن أكثر الجلسات");
  if (person.votes.eligible >= 2 && person.votes.voted * 2 < person.votes.eligible) reasons.push("لم يصوّت في أكثر الجولات");
  return reasons;
}

export function peopleMetrics({ summary }: PeopleFollowUp): Metric[] {
  const attended = summary.recorded > 0 ? summary.present / summary.recorded : null;
  return [
    { label: "الحضور", value: percent(summary.present, summary.recorded), note: attended == null ? "لم يُسجَّل حضور بعد" : `${summary.present} حضور من ${summary.recorded}، والمستهدف 75%`,
      ratio: attended, target: targets.attendance, tone: attended != null && attended < targets.attendance ? "accent" : "primary" },
    { label: "المشاركة في التصويت", value: percent(summary.voted, summary.eligible), note: summary.eligible > 0 ? `${summary.voted} صوتًا من ${summary.eligible} مستحقًا` : "لا جولات تصويت مغلقة",
      ratio: summary.eligible > 0 ? summary.voted / summary.eligible : null },
    { label: "محاضر تنتظر التوقيع", value: String(summary.pending_signatures), note: summary.pending_signatures > 0 ? "تعطّل اعتماد المحضر" : "لا توقيعات معلّقة",
      ratio: summary.pending_signatures > 0 ? 1 : 0, tone: "accent" },
    { label: "تنفيذ التكليفات", value: summary.tasks > 0 ? `${summary.tasks_done} من ${summary.tasks}` : "—", note: summary.tasks_overdue > 0 ? `${summary.tasks_overdue} متأخرة` : "لا تكليفات متأخرة",
      ratio: summary.tasks > 0 ? summary.tasks_done / summary.tasks : null, target: targets.tasks, tone: summary.tasks_overdue > 0 ? "accent" : "primary" },
  ];
}

const outcomeWord: Record<SessionOutcome, string> = { on_time: "في موعدها", late: "متأخرة", missed: "لم تنعقد", overdue: "لم تنعقد بعد", cancelled: "ملغاة أو مؤجلة", upcoming: "قادمة" };
const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export const overviewCsv = (councils: CouncilRow[]): CsvCell[][] => [
  ["المجلس", "الوحدة", "الحالة", "جلسات مستحقة", "في موعدها", "متأخرة", "لم تنعقد", "نسبة الحضور %", "متوسط اعتماد المحضر (يوم)", "محاضر معلّقة",
    "القرارات", "تحتاج تنفيذًا", "نُفّذت", "الموضوعات", "غير محوكمة", "التكليفات", "المنجزة", "المتأخرة", "تجاوزات مفتوحة"],
  ...councils.map((c) => [c.name_ar, c.parent_name_ar, stateLabel[c.state], c.sessions.due, c.sessions.on_time, c.sessions.late, c.sessions.missed + c.sessions.overdue,
    ratio(c.attendance.present, c.attendance.recorded), c.minutes.avg_days, c.minutes.pending, c.decision_stats.total, c.decision_stats.needs_execution, c.decision_stats.executed,
    c.topics.total, c.topics.ungoverned, c.tasks.total, c.tasks.done, c.tasks.overdue, c.violations.open]),
];

/** One council's report: its summary, then each list under its own heading. */
export function councilCsv(data: CouncilPerformance, activity: Activity | null): CsvCell[][] {
  const { council } = data;
  const rows: CsvCell[][] = [
    ["تقرير أداء المجلس", council.name_ar], ["العام الجامعي", academicYearLabel(data.academic_year_start)], ["الحالة", stateLabel[council.state]],
    ["الرئيس", council.chair_name_ar], ["عدد الأعضاء", council.member_count], [],
    ...overviewCsv([council]), [],
    ["الجلسات"], ["الجلسة", "الموعد المخطط", "آخر موعد", "تاريخ الانعقاد", "النتيجة", "أيام التأخير", "الحاضرون", "المسجَّلون", "اعتماد المحضر", "القرارات"],
    ...data.sessions.map((x) => [x.title_ar, x.planned_on, x.due_on, x.held_on, outcomeWord[x.outcome], x.late_days, x.present, x.recorded, x.minutes_approved_on, x.decisions]),
  ];
  if (!activity) return rows;
  return [...rows, [],
    ["الموضوعات"], ["الرقم", "الموضوع", "الجلسة", "تاريخ الجلسة", "الحوكمة", "في الجلسة", "رقم القرار", "النتيجة"],
    ...activity.topics.map((x) => [x.topic_no, x.title_ar, x.meeting_title_ar, x.meeting_date, governanceLabel(x.governance_source), agendaLabel(x.agenda_status), x.decision_no, x.decision_no ? outcomeLabel(x.outcome_kind) : null]), [],
    ["القرارات"], ["الرقم", "نص القرار", "الموضوع", "النتيجة", "النوع", "الجلسة", "تاريخ الصدور", "التكليفات", "المنجز منها"],
    ...activity.decisions.map((x) => [x.decision_no, x.decision_text, x.topic_title_ar, outcomeLabel(x.outcome_kind), x.type_name_ar, x.meeting_title_ar, x.issued_at.slice(0, 10), x.tasks, x.tasks_done]), [],
    ["التكليفات"], ["الرقم", "التكليف", "المكلَّف", "الجهة", "الموعد", "الحالة", "متأخر", "رقم القرار"],
    ...activity.tasks.map((x) => [x.action_no, x.title_ar, x.assignee_name_ar, x.assignee_unit_ar, x.due_date, taskStatusLabel(x.status), x.overdue ? "نعم" : "لا", x.decision_no]),
  ];
}

export const topicsCsv = (topics: TopicRow[]): CsvCell[][] => [
  ["الرقم", "الموضوع", "التصنيف", "الحوكمة", "الحالة", "يقف عند", "أيام الانتظار", "العمر (يوم)", "مراحل المسار", "المنجز منها", "مرات الإدراج", "رقم القرار", "النتيجة", "التكليفات", "المنجز منها"],
  ...topics.map((x) => [x.topic_no, x.title_ar, x.category_name_ar, governanceLabel(x.governance_source), topicStateLabel[x.state], x.at_council_name_ar, x.waiting_days, x.age_days,
    x.steps_total, x.steps_done, x.listed_count, x.decision_no, x.decision_no ? outcomeLabel(x.outcome_kind) : null, x.tasks, x.tasks_done]),
];

export const peopleCsv = (people: PersonRow[]): CsvCell[][] => [
  ["العضو", "المجالس", "الحالة", "سبب المتابعة", "حضر", "من جلسات", "صوّت", "من جولات", "وقّع محاضر", "من محاضر", "محاضر تنتظره", "التكليفات", "المنجزة", "المتأخرة", "موضوعات قدّمها"],
  ...people.map((x) => [x.full_name_ar, x.councils.map((c) => `${c.name_ar} (${c.role_name_ar})`).join("؛ "), personStateLabel[x.state], personReasons(x).join("؛ "),
    x.attendance.present, x.attendance.recorded, x.votes.voted, x.votes.eligible, x.minutes.signed, x.minutes.total, x.minutes.pending, x.tasks.total, x.tasks.done, x.tasks.overdue, x.topics_submitted]),
];
