import Link from "next/link";
import type { ReactNode } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ClipboardCheck, ClipboardList, Eye, FileSignature, FileText, Gavel, Users, Vote,
} from "lucide-react";
import { Badge } from "@/shared/ui/badge";

type Item = { link: string; [key: string]: unknown };
export type HomeData = {
  user: { name_ar: string | null } | null;
  meetings: { count: number; items: Array<Item & { title_ar: string; scheduled_date: string; start_time: string | null; status: string; council_name_ar: string }> };
  votes: { count: number; items: Array<Item & { meeting_title_ar: string; topic_title_ar: string | null }> };
  signatures: { count: number; items: Array<Item & { meeting_title_ar: string }> };
  tasks: { open: number; overdue: number; to_verify: number; items: Array<Item & { action_no: string; title_ar: string; due_date: string | null; overdue: boolean }> };
  topics: { returned: number; to_review: number; items: Array<Item & { topic_no: string; title_ar: string; kind: "returned" | "to_review" }> };
  leadership: { councils: number; open: number } | null;
  oversight: {
    councils: number; open: number; escalated: number;
    by_rule: Array<{ name_ar: string; count: number }>;
    oldest: Array<{ council_name_ar: string; rule_name_ar: string; subject_label: string; days_open: number; link: string }>;
  } | null;
  organization: {
    active_councils: number; meetings_next_14_days: number; meetings_held_30_days: number; topics_in_process: number;
    decisions_30_days: number; open_tasks: number; overdue_tasks: number; open_violations: number;
  } | null;
};

const n = (value: number) => value.toLocaleString("ar-SA-u-nu-latn");

function dateLabel(value: string | null | undefined, time?: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const day = days === 0 ? "اليوم" : days === 1 ? "غدًا" : days === -1 ? "أمس" : date.toLocaleDateString("ar-SA-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });
  const clock = time?.match(/^(\d{2}):(\d{2})/);
  if (!clock) return day;
  const hour = Number(clock[1]);
  return `${day} ${(hour % 12 || 12).toLocaleString("ar-SA-u-nu-latn")}:${clock[2]} ${hour < 12 ? "ص" : "م"}`;
}

function ActionCard({ icon, title, count, href, tone = "info", badge, children, empty }: {
  icon: ReactNode; title: string; count: number; href: string; tone?: "info" | "warning" | "danger"; badge?: ReactNode; children?: ReactNode; empty: string;
}) {
  return (
    <article aria-label={title} className={`flex flex-col rounded-q-card border bg-q-surface p-4 ${count > 0 ? "border-q-border" : "border-dashed border-q-border"}`}>
      <header className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-q-ui font-bold text-q-text">
          <span className={`grid h-9 w-9 place-items-center rounded-q-control ${count > 0 ? (tone === "danger" ? "bg-q-danger-soft text-q-danger" : tone === "warning" ? "bg-q-warning-soft text-q-warning" : "bg-q-surface-2 text-q-link") : "bg-q-surface-2 text-q-text-3"}`}>{icon}</span>
          {title}
        </span>
        <span className={`text-q-h2 font-black ${count > 0 ? "text-q-text" : "text-q-text-3"}`}>{n(count)}</span>
      </header>
      {badge && <div className="mt-2">{badge}</div>}
      {count > 0 ? <ul className="mt-3 space-y-1">{children}</ul> : <p className="mt-3 text-q-caption text-q-text-3">{empty}</p>}
      {count > 0 && (
        <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-3 text-q-caption font-bold text-q-link hover:underline">
          عرض الكل <ChevronLeft size={14} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}

function Row({ href, children, aside }: { href: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center justify-between gap-2 rounded-q-control px-2 py-1.5 text-q-caption text-q-text-2 hover:bg-q-surface-2">
        <span className="min-w-0 truncate">{children}</span>
        {aside && <span className="shrink-0">{aside}</span>}
      </Link>
    </li>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "danger" | "warning" }) {
  return (
    <Link href={href} className="rounded-q-card border border-q-border bg-q-surface p-4 hover:border-q-border-strong">
      <span className="block text-q-caption text-q-text-3">{label}</span>
      <span className={`mt-1 block text-q-h2 font-black ${tone === "danger" && value > 0 ? "text-q-danger" : tone === "warning" && value > 0 ? "text-q-warning" : "text-q-text"}`}>{n(value)}</span>
    </Link>
  );
}

/** The home page: what is waiting for this person, then the councils they lead and follow, then the organisation. */
export function HomeDashboard({ data }: { data: HomeData }) {
  const waiting = data.meetings.count + data.votes.count + data.signatures.count + data.tasks.open + data.tasks.to_verify + data.topics.returned + data.topics.to_review;
  const urgent = data.votes.count + data.tasks.overdue + data.signatures.count;
  return (
    <div className="space-y-6">
      <section aria-labelledby="home-waiting" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="home-waiting" className="text-q-h3 font-black text-q-text">ما ينتظر إجرائي</h2>
          <p className="text-q-caption text-q-text-3">
            {waiting === 0 ? "لا شيء ينتظرك الآن." : urgent > 0 ? `${n(urgent)} منها يحتاج إجراءً عاجلًا` : "لا شيء عاجل"}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ActionCard icon={<CalendarDays size={18} />} title="اجتماعاتي القادمة" count={data.meetings.count} href="/admin/meetings" empty="لا اجتماعات خلال أسبوعين.">
            {data.meetings.items.slice(0, 3).map((meeting) => (
              <Row key={String(meeting.link)} href={meeting.link} aside={meeting.status === "in_progress" ? <Badge tone="live">منعقد الآن</Badge> : <span className="text-q-text-3">{dateLabel(meeting.scheduled_date, meeting.start_time)}</span>}>
                {meeting.title_ar} · {meeting.council_name_ar}
              </Row>
            ))}
          </ActionCard>
          <ActionCard icon={<Vote size={18} />} title="تصويت ينتظر صوتك" count={data.votes.count} href={data.votes.items[0]?.link ?? "/admin/meetings"} tone="danger" empty="لا تصويت مفتوح لك.">
            {data.votes.items.slice(0, 3).map((vote) => <Row key={String(vote.round_id)} href={vote.link}>{vote.topic_title_ar ?? vote.meeting_title_ar}</Row>)}
          </ActionCard>
          <ActionCard icon={<FileSignature size={18} />} title="محاضر بانتظار توقيعك" count={data.signatures.count} href={data.signatures.items[0]?.link ?? "/admin/meetings"} tone="warning" empty="لا محاضر تنتظر توقيعك.">
            {data.signatures.items.slice(0, 3).map((item) => <Row key={String(item.id)} href={item.link}>{item.meeting_title_ar}</Row>)}
          </ActionCard>
          <ActionCard
            icon={<ClipboardList size={18} />} title="تكليفاتي" count={data.tasks.open} href="/admin/tasks" tone={data.tasks.overdue > 0 ? "danger" : "info"} empty="لا تكليفات مفتوحة لك."
            badge={data.tasks.overdue > 0 ? <Badge tone="danger">{n(data.tasks.overdue)} متأخر</Badge> : undefined}
          >
            {data.tasks.items.slice(0, 3).map((task) => (
              <Row key={String(task.id)} href={task.link} aside={task.overdue ? <Badge tone="danger">متأخر</Badge> : <span className="text-q-text-3">{dateLabel(task.due_date)}</span>}>
                {task.action_no} · {task.title_ar}
              </Row>
            ))}
          </ActionCard>
          <ActionCard icon={<ClipboardCheck size={18} />} title="تكليفات بانتظار تحققك" count={data.tasks.to_verify} href="/admin/follow-up" tone="warning" empty="لا تسليمات تنتظر تحققك." />
          <ActionCard icon={<FileText size={18} />} title="موضوعات تحتاج إجراءك" count={data.topics.returned + data.topics.to_review} href="/admin/topics" empty="لا موضوعات معادة إليك أو بانتظار مراجعتك.">
            {data.topics.items.slice(0, 3).map((topic) => (
              <Row key={String(topic.id)} href={topic.link} aside={<Badge tone={topic.kind === "returned" ? "warning" : "info"}>{topic.kind === "returned" ? "أُعيد إليك" : "للمراجعة"}</Badge>}>
                {topic.topic_no} · {topic.title_ar}
              </Row>
            ))}
          </ActionCard>
        </div>
      </section>

      {(data.leadership?.councils ?? 0) > 0 || data.oversight ? (
        <section aria-labelledby="home-councils" className="grid gap-3 lg:grid-cols-2">
          <h2 id="home-councils" className="sr-only">المجالس</h2>
          {(data.leadership?.councils ?? 0) > 0 && (
            <article aria-label="المجالس التي أقودها" className="rounded-q-card border border-q-border bg-q-surface p-4">
              <h3 className="flex items-center gap-2 text-q-ui font-bold text-q-text"><Gavel size={18} aria-hidden="true" className="text-q-link" /> المجالس التي أقودها</h3>
              <p className="mt-2 text-q-ui text-q-text-2">
                {n(data.leadership!.councils)} {data.leadership!.councils === 1 ? "مجلس" : "مجالس"} ·{" "}
                {data.leadership!.open > 0
                  ? <Link href="/admin/violations" className="font-bold text-q-danger hover:underline">{n(data.leadership!.open)} تجاوز مفتوح</Link>
                  : <span className="inline-flex items-center gap-1 text-q-success"><CheckCircle2 size={16} aria-hidden="true" /> لا تجاوزات</span>}
              </p>
            </article>
          )}
          {data.oversight && (
            <article aria-label="نطاق متابعتي" className="rounded-q-card border border-q-border bg-q-surface p-4">
              <h3 className="flex items-center gap-2 text-q-ui font-bold text-q-text"><Eye size={18} aria-hidden="true" className="text-q-link" /> نطاق متابعتي</h3>
              <p className="mt-2 text-q-ui text-q-text-2">
                تتابع {n(data.oversight.councils)} مجلسًا ·{" "}
                {data.oversight.open > 0
                  ? <Link href="/admin/violations" className="font-bold text-q-danger hover:underline">{n(data.oversight.open)} تجاوز مفتوح</Link>
                  : <span className="text-q-success">لا تجاوزات مفتوحة</span>}
                {data.oversight.escalated > 0 && <> · <span className="text-q-warning">{n(data.oversight.escalated)} صُعّد إليك أو أعلى</span></>}
              </p>
              {data.oversight.by_rule.length > 0 && (
                <ul aria-label="التجاوزات حسب النوع" className="mt-3 flex flex-wrap gap-2">
                  {data.oversight.by_rule.map((rule) => <li key={rule.name_ar}><Badge tone="warning">{rule.name_ar}: {n(rule.count)}</Badge></li>)}
                </ul>
              )}
              {data.oversight.oldest.length > 0 && (
                <>
                  <p className="mt-3 text-q-caption font-bold text-q-text-3">الأقدم</p>
                  <ul className="mt-1 space-y-1">
                    {data.oversight.oldest.map((item) => (
                      <Row key={`${item.link}-${item.rule_name_ar}`} href={item.link} aside={<span className="text-q-danger">{n(item.days_open)} يومًا</span>}>
                        <AlertTriangle size={14} aria-hidden="true" className="me-1 inline text-q-warning" />{item.council_name_ar} · {item.subject_label}
                      </Row>
                    ))}
                  </ul>
                </>
              )}
            </article>
          )}
        </section>
      ) : null}

      {data.organization && (
        <section aria-labelledby="home-organization" className="space-y-3">
          <h2 id="home-organization" className="flex items-center gap-2 text-q-h3 font-black text-q-text"><Users size={20} aria-hidden="true" /> مؤشرات المؤسسة</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="مجالس مفعّلة" value={data.organization.active_councils} href="/admin/councils" />
            <Stat label="اجتماعات خلال أسبوعين" value={data.organization.meetings_next_14_days} href="/admin/meetings" />
            <Stat label="اجتماعات انعقدت آخر 30 يومًا" value={data.organization.meetings_held_30_days} href="/admin/meetings" />
            <Stat label="قرارات آخر 30 يومًا" value={data.organization.decisions_30_days} href="/admin/follow-up" />
            <Stat label="موضوعات قيد المعالجة" value={data.organization.topics_in_process} href="/admin/topics" />
            <Stat label="تكليفات مفتوحة" value={data.organization.open_tasks} href="/admin/follow-up" />
            <Stat label="تكليفات متأخرة" value={data.organization.overdue_tasks} href="/admin/follow-up" tone="danger" />
            <Stat label="تجاوزات مفتوحة" value={data.organization.open_violations} href="/admin/violations" tone="warning" />
          </div>
        </section>
      )}
    </div>
  );
}
