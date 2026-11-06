import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

Font.register({
  family: "QararArabic",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

type Named = { name_ar?: string | null };
export type TopicPdfData = {
  topic: {
    id: string; topic_no?: string; title_ar: string; description?: string | null; status?: string;
    priority?: string; created_at?: string; submitted_at?: string; category?: Named | null;
    governance_unit?: Named | null; submitted_by?: { full_name_ar?: string | null } | null;
    typed_creation_request?: { snapshot?: { topic_type_name_ar?: string; classification_name_ar?: string; authorities?: Array<{ source_document_name?: string; article_number?: string; authority_text?: string }> } } | null;
  };
  attachments: Array<{ id: string; file_name: string; description?: string | null }>;
  requirements: { items?: Array<{ code: string; name: string; mandatory?: boolean; status?: string; note?: string | null }>; ready_for_review?: boolean } | null;
  references: Array<{ id: string; label?: string; policy_name?: string; item_title?: string; item_code?: string | null; is_primary?: boolean }>;
  workflow: { status?: string; steps?: Array<{ id: string; sequence_no?: number; status?: string; outcome_code?: string | null; snapshot?: { name_ar?: string } }> } | null;
  referrals: Array<{ id: string; from_unit_name_ar?: string; to_unit_name_ar?: string; status?: string; referral_reason?: string }>;
  meetings: Array<{
    agenda_item_id: string; discussion_notes?: string | null;
    meeting: { meeting_no?: string; title: string; scheduled_date?: string; unit_name?: string };
    voting_rounds?: Array<{ id: string; status?: string; result?: string | null; approve_count?: number; reject_count?: number; abstain_count?: number }>;
    decisions?: Array<{ id: string; decision_no: string; decision_text: string; decision_status?: string }>;
  }>;
  activity: Array<{ id: string; action?: string; summary?: string | null; occurred_at?: string; actor_name_ar?: string | null }>;
  printedBy: string;
  printedAt: string;
  logo: string;
};

const palette = { navy: "#082d59", blue: "#0877d6", orange: "#f58220", ink: "#172a42", muted: "#63788e", line: "#d9e5ef", pale: "#f4f9fd", green: "#07865f" };
const styles = StyleSheet.create({
  page: { fontFamily: "QararArabic", fontSize: 9, color: palette.ink, backgroundColor: "#ffffff", paddingTop: 38, paddingBottom: 46, paddingHorizontal: 40, direction: "rtl" },
  topRule: { position: "absolute", top: 0, right: 0, left: 0, height: 8, backgroundColor: palette.blue },
  orangeRule: { position: "absolute", top: 8, right: 0, width: 135, height: 4, backgroundColor: palette.orange },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: palette.line },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  logo: { width: 49, height: 61, objectFit: "contain" },
  university: { textAlign: "right", fontSize: 13, fontWeight: 700, color: palette.navy },
  universityEn: { marginTop: 2, textAlign: "right", fontSize: 6.5, letterSpacing: 1, color: palette.muted },
  badge: { borderRadius: 10, backgroundColor: palette.pale, paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#cfe1ef" },
  badgeText: { fontSize: 8, fontWeight: 700, color: palette.blue, textAlign: "center" },
  titleBlock: { marginTop: 20, alignItems: "center" },
  eyebrow: { fontSize: 8, fontWeight: 700, color: palette.orange, textAlign: "center" },
  title: { marginTop: 7, fontSize: 19, fontWeight: 700, color: palette.navy, textAlign: "center", lineHeight: 1.55 },
  subtitle: { marginTop: 5, fontSize: 8.5, color: palette.muted, textAlign: "center" },
  metaGrid: { marginTop: 18, flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  meta: { width: "48.8%", borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.pale, padding: 9 },
  metaLabel: { fontSize: 6.5, color: palette.muted, textAlign: "right" },
  metaValue: { marginTop: 4, fontSize: 8.5, fontWeight: 700, color: palette.navy, textAlign: "right" },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 7, marginBottom: 8 },
  marker: { width: 4, height: 18, borderRadius: 2, backgroundColor: palette.orange },
  sectionTitle: { fontSize: 11.5, fontWeight: 700, color: palette.navy, textAlign: "right" },
  box: { borderRadius: 9, borderWidth: 1, borderColor: palette.line, backgroundColor: "#ffffff", padding: 12 },
  text: { fontSize: 8.5, lineHeight: 1.8, textAlign: "right" },
  empty: { color: palette.muted, fontSize: 8, textAlign: "right" },
  row: { marginBottom: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.pale, padding: 9 },
  rowTitle: { fontSize: 8.5, fontWeight: 700, color: palette.navy, textAlign: "right" },
  rowMeta: { marginTop: 3, fontSize: 7, color: palette.muted, textAlign: "right", lineHeight: 1.6 },
  decision: { marginTop: 6, borderRightWidth: 3, borderRightColor: palette.green, paddingRight: 8 },
  decisionNo: { fontSize: 7, fontWeight: 700, color: palette.green, textAlign: "right" },
  decisionText: { marginTop: 3, fontSize: 8.5, lineHeight: 1.7, textAlign: "right" },
  printReceipt: { marginTop: 18, borderRadius: 9, backgroundColor: palette.navy, padding: 11 },
  printTitle: { color: "#ffffff", fontSize: 8, fontWeight: 700, textAlign: "right" },
  printText: { marginTop: 4, color: "#c6def2", fontSize: 7, textAlign: "right" },
  footer: { position: "absolute", bottom: 18, left: 40, right: 40, flexDirection: "row-reverse", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 6 },
  footerText: { fontSize: 6.5, color: palette.muted },
});

const statusLabels: Record<string, string> = { draft: "مسودة", new: "بانتظار المراجعة", under_review: "قيد المراجعة", approved: "معتمد للمسار", returned: "مطلوب استكمال", rejected: "مرفوض", active: "المرحلة الحالية", pending: "بانتظار دورها", completed: "مكتملة", fulfilled: "مستوفى", waived: "مستثنى" };
const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const outcomeLabels: Record<string, string> = { approved: "موافقة", recommended: "توصية بالموافقة", rejected: "رفض", returned: "إعادة للاستكمال", deferred: "تأجيل", completed: "مكتملة", tied: "تعادل" };

export function TopicDocument(data: TopicPdfData) {
  const { topic } = data;
  const snapshot = topic.typed_creation_request?.snapshot;
  const typeName = snapshot?.topic_type_name_ar ?? topic.category?.name_ar ?? "موضوع عام";
  const classification = snapshot?.classification_name_ar ?? topic.category?.name_ar ?? "غير محدد";
  return <Document title={`ملف ${topic.title_ar}`} author="جامعة الرازي - نظام قرار" subject="ملف موضوع رسمي" language="ar">
    <Page size="A4" style={styles.page}>
      <View style={styles.topRule} fixed /><View style={styles.orangeRule} fixed />
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image has no alt prop. */}
          <Image src={data.logo} style={styles.logo} />
          <View><Text style={styles.university}>جامعة الرازي</Text><Text style={styles.universityEn}>AL-RAZI UNIVERSITY</Text></View>
        </View>
        <View style={styles.badge}><Text style={styles.badgeText}>ملف موضوع رسمي</Text></View>
      </View>
      <View style={styles.titleBlock}><Text style={styles.eyebrow}>سجل الحوكمة المتكامل</Text><Text style={styles.title}>{topic.title_ar}</Text><Text style={styles.subtitle}>{topic.topic_no ?? "موضوع مسجل"} · {topic.governance_unit?.name_ar ?? "الجهة المختصة"}</Text></View>
      <View style={styles.metaGrid}>
        <Meta label="نوع الطلب" value={typeName} /><Meta label="تصنيف الموضوع" value={classification} />
        <Meta label="مقدم الموضوع" value={topic.submitted_by?.full_name_ar ?? "غير متاح"} /><Meta label="تاريخ التقديم" value={formatDate(topic.submitted_at ?? topic.created_at)} />
        <Meta label="الحالة" value={statusLabels[topic.status ?? ""] ?? "حالة محفوظة في النظام"} /><Meta label="الأولوية" value={priorityLabels[topic.priority ?? ""] ?? "غير محددة"} />
      </View>

      <Section title="وصف الموضوع"><Text style={styles.text}>{plainText(topic.description) || "لم يسجل وصف إضافي للموضوع."}</Text></Section>
      <Section title="السند والمراجع التنظيمية">
        {snapshot?.authorities?.length ? snapshot.authorities.map((authority, index) => <Row key={`${authority.article_number}-${index}`} title={[authority.source_document_name, authority.article_number].filter(Boolean).join(" · ") || "سند تنظيمي"} meta={plainText(authority.authority_text) || "لم يسجل نص السند."} />)
          : data.references.length ? data.references.map((reference) => <Row key={reference.id} title={reference.label ?? reference.item_title ?? reference.policy_name ?? "مرجع تنظيمي"} meta={[reference.is_primary ? "المرجع الحاكم" : "مرجع مساند", reference.item_code].filter(Boolean).join(" · ")} />)
            : <Empty>لا توجد مراجع تنظيمية مسجلة.</Empty>}
      </Section>
      <Section title="المتطلبات والمرفقات">
        {data.requirements?.items?.length ? data.requirements.items.map((item) => <Row key={item.code} title={item.name} meta={`${item.mandatory ? "إلزامي" : "اختياري"} · ${statusLabels[item.status ?? ""] ?? "بانتظار الاستيفاء"}${item.note ? ` · ${item.note}` : ""}`} />) : <Empty>لا توجد متطلبات تنفيذية إضافية.</Empty>}
        <View style={{ marginTop: 7 }}>{data.attachments.length ? data.attachments.map((file) => <Row key={file.id} title={file.file_name} meta={file.description ?? "مرفق بالموضوع"} />) : <Empty>لا توجد مرفقات مرتبطة بالموضوع.</Empty>}</View>
      </Section>
      <Section title="مراحل المسار">
        {data.workflow?.steps?.length ? [...data.workflow.steps].sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0)).map((step) => <Row key={step.id} title={`${step.sequence_no ?? "•"}. ${step.snapshot?.name_ar ?? "مرحلة في المسار"}`} meta={`${statusLabels[step.status ?? ""] ?? "حالة محفوظة"}${step.outcome_code ? ` · النتيجة: ${outcomeLabels[step.outcome_code] ?? "نتيجة موثقة"}` : ""}`} />) : <Empty>لم تبدأ مراحل المسار بعد.</Empty>}
      </Section>
      <Section title="الإحالات">
        {data.referrals.length ? data.referrals.map((referral) => <Row key={referral.id} title={`${referral.from_unit_name_ar ?? "جهة سابقة"} ← ${referral.to_unit_name_ar ?? "جهة محال إليها"}`} meta={referral.referral_reason ?? "دون ملاحظة إحالة"} />) : <Empty>لا توجد إحالات مسجلة.</Empty>}
      </Section>
      <Section title="المجالس والقرارات السابقة">
        {data.meetings.length ? data.meetings.map((entry) => <View key={entry.agenda_item_id} style={styles.row} wrap={false}>
          <Text style={styles.rowTitle}>{entry.meeting.title}</Text><Text style={styles.rowMeta}>{[entry.meeting.unit_name, entry.meeting.meeting_no, formatDate(entry.meeting.scheduled_date)].filter(Boolean).join(" · ")}</Text>
          {entry.discussion_notes && <Text style={styles.rowMeta}>خلاصة المناقشة: {plainText(entry.discussion_notes)}</Text>}
          {(entry.voting_rounds ?? []).filter((round) => round.status === "closed").map((round) => <Text key={round.id} style={styles.rowMeta}>التصويت: {round.approve_count ?? 0} موافق · {round.reject_count ?? 0} غير موافق · {round.abstain_count ?? 0} ممتنع</Text>)}
          {(entry.decisions ?? []).map((decision) => <View key={decision.id} style={styles.decision}><Text style={styles.decisionNo}>{decision.decision_no}</Text><Text style={styles.decisionText}>{plainText(decision.decision_text)}</Text></View>)}
        </View>) : <Empty>لا توجد اجتماعات أو قرارات سابقة لهذا الموضوع.</Empty>}
      </Section>
      <Section title="سجل الرحلة المختصر">
        {data.activity.length ? data.activity.slice(-20).map((item) => <Row key={item.id} title={item.summary ?? actionLabel(item.action)} meta={`${item.actor_name_ar ?? "النظام"} · ${formatDateTime(item.occurred_at)}`} />) : <Empty>لا توجد أحداث إضافية في سجل الرحلة.</Empty>}
      </Section>
      <View style={styles.printReceipt} wrap={false}><Text style={styles.printTitle}>بيانات إصدار النسخة</Text><Text style={styles.printText}>طبع بواسطة: {data.printedBy} · {formatDateTime(data.printedAt)}</Text></View>
      <View style={styles.footer} fixed><Text style={styles.footerText}>نظام قرار - جامعة الرازي</Text><Text style={styles.footerText} render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`} /></View>
    </Page>
  </Document>;
}

function Meta({ label, value }: { label: string; value: string }) { return <View style={styles.meta}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>; }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.section}><View style={styles.sectionHeader} wrap={false}><View style={styles.marker} /><Text style={styles.sectionTitle}>{title}</Text></View><View style={styles.box}>{children}</View></View>; }
function Row({ title, meta }: { title: string; meta?: string }) { return <View style={styles.row} wrap={false}><Text style={styles.rowTitle}>{title}</Text>{meta && <Text style={styles.rowMeta}>{meta}</Text>}</View>; }
function Empty({ children }: { children: React.ReactNode }) { return <Text style={styles.empty}>{children}</Text>; }
function plainText(value?: string | null) { return (value ?? "").replace(/<[^>]*>/g, " ").replace(/[`*_#>~-]+/g, " ").replace(/\s+/g, " ").trim(); }
function formatDate(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(value.length === 10 ? `${value}T00:00:00` : value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "long" }).format(date); }
function formatDateTime(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(date); }
function actionLabel(value?: string) { return ({ "topics.create": "إنشاء الموضوع", "agenda.item.add": "إدراج الموضوع في جدول أعمال", "meetings.agenda.discussion.complete": "اكتمال مناقشة الموضوع", "voting.close": "إغلاق التصويت وتثبيت النتيجة", "decision.create_from_vote": "إنشاء القرار", "topics.pdf.export": "طباعة ملف الموضوع" } as Record<string, string>)[value ?? ""] ?? "إجراء محفوظ على الموضوع"; }
