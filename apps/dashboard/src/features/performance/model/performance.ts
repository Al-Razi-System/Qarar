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
