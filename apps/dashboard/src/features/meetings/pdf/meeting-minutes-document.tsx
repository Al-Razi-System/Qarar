import path from "node:path";
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { MeetingDetail, MeetingMinutes, MinuteApproval, SignatureStrokes } from "../model/meeting";

Font.register({
  family: "QararArabic",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/ReadexPro-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/assets/fonts/ReadexPro-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const c = { navy: "#0a2a52", blue: "#0b63b6", ink: "#1b2a3b", muted: "#5d6f82", line: "#c9d5e1", soft: "#eef3f8", rule: "#0b63b6" };
const s = StyleSheet.create({
  page: { fontFamily: "QararArabic", fontSize: 9.5, color: c.ink, backgroundColor: "#ffffff", paddingTop: 36, paddingBottom: 54, paddingHorizontal: 40, direction: "rtl" },
  letterhead: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: c.rule },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  logo: { width: 44, height: 54, objectFit: "contain" },
  university: { textAlign: "right", fontSize: 13, fontWeight: 700, color: c.navy },
  universityEn: { marginTop: 2, textAlign: "right", fontSize: 7, letterSpacing: 1.2, color: c.muted },
  docMeta: { alignItems: "flex-start" },
  docMetaText: { fontSize: 8, color: c.muted, textAlign: "left" },
  titleBlock: { marginTop: 18, alignItems: "center" },
  docType: { fontSize: 11, fontWeight: 700, color: c.blue, textAlign: "center" },
  title: { marginTop: 5, fontSize: 17, fontWeight: 700, color: c.navy, textAlign: "center", lineHeight: 1.5 },
  subtitle: { marginTop: 3, fontSize: 10, color: c.muted, textAlign: "center" },
  infoTable: { marginTop: 16, borderWidth: 1, borderColor: c.line },
  infoRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: c.line },
  infoRowLast: { flexDirection: "row-reverse" },
  infoCell: { flex: 1, flexDirection: "row-reverse", alignItems: "center" },
  infoLabel: { width: 70, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: c.soft, fontSize: 8, fontWeight: 700, color: c.navy, textAlign: "right" },
  infoValue: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, fontSize: 9, textAlign: "right" },
  notice: { marginTop: 10, borderWidth: 1, borderColor: "#e0b45a", backgroundColor: "#fff8e8", padding: 8 },
  noticeTitle: { fontSize: 8.5, fontWeight: 700, color: "#7a4e00", textAlign: "right" },
  noticeText: { marginTop: 2, fontSize: 8.5, lineHeight: 1.7, color: "#5a3d06", textAlign: "right" },
  sectionTitle: { marginTop: 18, marginBottom: 7, fontSize: 11.5, fontWeight: 700, color: c.navy, textAlign: "right", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: c.line },
  th: { flexDirection: "row-reverse", backgroundColor: c.navy },
  thText: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 8, fontWeight: 700, color: "#ffffff", textAlign: "right" },
  tr: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: c.line, borderLeftWidth: 1, borderLeftColor: c.line, borderRightWidth: 1, borderRightColor: c.line },
  td: { paddingVertical: 5, paddingHorizontal: 7, fontSize: 9, textAlign: "right" },
  item: { marginTop: 10, borderWidth: 1, borderColor: c.line },
  itemHead: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: c.soft, paddingVertical: 6, paddingHorizontal: 8, gap: 8 },
  itemNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.navy, color: "#ffffff", fontSize: 9.5, fontWeight: 700, textAlign: "center", paddingTop: 5 },
  itemTitle: { flex: 1, fontSize: 10.5, fontWeight: 700, color: c.navy, textAlign: "right" },
  itemRef: { fontSize: 7.5, color: c.muted },
  field: { flexDirection: "row-reverse", borderTopWidth: 1, borderTopColor: c.line },
  fieldLabel: { width: 78, paddingVertical: 5, paddingHorizontal: 8, fontSize: 8, fontWeight: 700, color: c.muted, textAlign: "right" },
  fieldValue: { flex: 1, paddingVertical: 5, paddingHorizontal: 8, fontSize: 9, lineHeight: 1.7, textAlign: "right" },
  signRow: { flexDirection: "row-reverse", borderBottomWidth: 1, borderBottomColor: c.line, borderLeftWidth: 1, borderLeftColor: c.line, borderRightWidth: 1, borderRightColor: c.line, alignItems: "center", minHeight: 44 },
  certification: { marginTop: 14, fontSize: 8.5, lineHeight: 1.8, color: c.muted, textAlign: "right" },
  verification: { marginTop: 10, fontSize: 7, color: c.muted, textAlign: "right" },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row-reverse", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 },
  footerText: { fontSize: 7, color: c.muted },
});

export type MinutesAttendanceRow = { name: string; status: string };
export type MinutesQuorum = { present?: number | null; eligible?: number | null; percentage?: number | null; required?: number | null; met?: boolean };

const attendanceLabel: Record<string, string> = { present: "حاضر", late: "حاضر (متأخر)", absent: "غائب", excused: "معتذر", remote: "حاضر عن بُعد" };
const resultLabel: Record<string, string> = { approved: "موافقة المجلس", rejected: "رفض المجلس", tied: "تعادل الأصوات", no_votes: "لم يصوّت أحد", cancelled: "ألغيت الجولة" };

/** An official, printable record of the meeting: its facts, who attended, what was decided and who certified it. */
export function MeetingMinutesDocument({ meeting, minutes, logo, attendance, quorum }: { meeting: MeetingDetail; minutes: MeetingMinutes; logo: string; attendance?: MinutesAttendanceRow[]; quorum?: MinutesQuorum | null }) {
  const approvals = minutes.approvals ?? [];
  const items = [...(meeting.agenda_items ?? [])].sort((x, y) => x.agenda_order - y.agenda_order);
  const parsed = parseMinuteItems(minutes.content_final ?? "", items);
  const decisionByItem = new Map((minutes.decisions ?? []).map((decision) => [decision.agenda_item_id, decision]));
  const roster: MinutesAttendanceRow[] = attendance?.length ? attendance : approvals.map((approval) => ({ name: approval.name_ar ?? "", status: "present" }));
  const present = roster.filter((row) => ["present", "late", "remote"].includes(row.status)).length;
  const [from, to] = [meeting.start_time, meeting.end_time].map((value) => (value ? String(value).slice(0, 5) : null));
  const time = from && to ? `من ${from} إلى ${to}` : from ? `من ${from}` : "غير محدد";
  const code = (minutes.final_content_hash ?? "").slice(0, 16).toUpperCase();
  const quorumText = quorum && quorum.eligible
    ? `حضر ${quorum.present ?? present} من ${quorum.eligible}${quorum.percentage != null ? ` (${Math.round(Number(quorum.percentage))}٪)` : ""} · ${meeting.quorum_continuation ? "غير مكتمل، وانعقد بقرار رئيس المجلس" : quorum.met === false ? "غير مكتمل" : "مكتمل"}`
    : null;
  const notices = [
    meeting.quorum_continuation ? { title: "انعقاد بنصاب غير مكتمل", text: `بقرار رئيس المجلس. السبب: ${meeting.quorum_continuation.reason}` } : null,
    meeting.schedule_exception_reason ? { title: "انعقاد خارج موعد الدورة", text: `السبب: ${meeting.schedule_exception_reason}` } : null,
  ].filter((notice): notice is { title: string; text: string } => Boolean(notice));
  const info: Array<[string, string]> = [
    ["رقم الاجتماع", meeting.meeting_no ?? "غير محدد"], ["المجلس", meeting.unit_name_ar ?? meeting.governance_unit_name_ar ?? "غير محدد"],
    ["التاريخ", formatDate(meeting.scheduled_date)], ["الوقت", time],
    ["المكان", meeting.location_details ?? locationLabel(meeting.location_type)], ["الجلسة", meeting.session_sequence_no ? `الجلسة ${meeting.session_sequence_no}${meeting.academic_year_start ? ` · العام الجامعي ${academicYear(meeting.academic_year_start)}` : ""}` : "—"],
  ];
  if (quorumText) info.push(["النصاب", quorumText]);

  return <Document title={`محضر ${meeting.title_ar}`} author="جامعة الرازي - نظام قرار" subject="محضر اجتماع معتمد" language="ar">
    <Page size="A4" style={s.page}>
      <View style={s.letterhead} fixed>
        <View style={s.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image does not expose an alt prop. */}
          <Image src={logo} style={s.logo} />
          <View><Text style={s.university}>جامعة الرازي</Text><Text style={s.universityEn}>AL-RAZI UNIVERSITY</Text></View>
        </View>
        <View style={s.docMeta}><Text style={s.docMetaText}>{meeting.meeting_no ?? ""}</Text><Text style={s.docMetaText}>{formatDate(meeting.scheduled_date)}</Text></View>
      </View>

      <View style={s.titleBlock}>
        <Text style={s.docType}>محضر اجتماع</Text>
        <Text style={s.title}>{meeting.title_ar}</Text>
        <Text style={s.subtitle}>{meeting.unit_name_ar ?? meeting.governance_unit_name_ar ?? ""}</Text>
      </View>

      <View style={s.infoTable}>
        {chunk(info, 2).map((pair, index, all) => <View key={index} style={index === all.length - 1 ? s.infoRowLast : s.infoRow} wrap={false}>
          {pair.map(([label, value]) => <View key={label} style={s.infoCell}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue}>{value}</Text></View>)}
        </View>)}
      </View>
      {notices.map((notice) => <View key={notice.title} style={s.notice} wrap={false}><Text style={s.noticeTitle}>{notice.title}</Text><Text style={s.noticeText}>{notice.text}</Text></View>)}

      <Text style={s.sectionTitle} minPresenceAhead={60}>الحضور ({present} من {roster.length})</Text>
      <View style={s.th}><Text style={[s.thText, { width: 28 }]}>#</Text><Text style={[s.thText, { flex: 1 }]}>الاسم</Text><Text style={[s.thText, { width: 110 }]}>الحالة</Text></View>
      {roster.map((row, index) => <View key={`${row.name}-${index}`} style={s.tr} wrap={false}><Text style={[s.td, { width: 28 }]}>{index + 1}</Text><Text style={[s.td, { flex: 1 }]}>{row.name}</Text><Text style={[s.td, { width: 110 }]}>{attendanceLabel[row.status] ?? row.status}</Text></View>)}

      <Text style={s.sectionTitle} minPresenceAhead={80}>جدول الأعمال والقرارات</Text>
      {items.map((item) => {
        const entry = parsed.get(item.id);
        const decision = decisionByItem.get(item.id);
        const result = item.voting_result ? resultLabel[item.voting_result] ?? null : null;
        const outcome = item.agenda_status === "postponed" ? "أُجّل البند" : result;
        return <View key={item.id} style={s.item} wrap={false}>
          <View style={s.itemHead}><Text style={s.itemNo}>{item.agenda_order}</Text><Text style={s.itemTitle}>{item.topic?.title_ar ?? "بند جدول الأعمال"}</Text>{item.topic?.topic_no && <Text style={s.itemRef}>{item.topic.topic_no}</Text>}</View>
          {entry?.notes && <Field label={item.agenda_status === "postponed" ? "سبب التأجيل" : "الملخص"} value={entry.notes} />}
          {outcome && <Field label="النتيجة" value={outcome} />}
          {decision && <Field label="القرار" value={`${decision.decision_no} — ${decision.decision_text}`} />}
          {entry?.assignments.map((line, index) => <Field key={index} label={index === 0 ? "التكليفات" : ""} value={line} />)}
        </View>;
      })}

      <Text style={s.sectionTitle} minPresenceAhead={90}>المصادقة والتوقيع</Text>
      <Text style={s.certification}>صادق الموقّعون أدناه على النسخة النهائية من هذا المحضر، وحُفظت بصمتها الرقمية لضمان عدم تعديلها بعد الاعتماد.</Text>
      <View style={[s.th, { marginTop: 8 }]}><Text style={[s.thText, { flex: 1 }]}>الاسم</Text><Text style={[s.thText, { width: 170 }]}>التوقيع</Text><Text style={[s.thText, { width: 110 }]}>تاريخ المصادقة</Text></View>
      {approvals.map((approval) => <SignatureRow key={approval.id} approval={approval} />)}
      {minutes.approved_at && <Text style={s.verification}>اعتُمد المحضر في {formatDateTime(minutes.approved_at)}</Text>}
      {code && <Text style={[s.verification, { textAlign: "left" }]}>{`Verification code: ${code}`}</Text>}

      <View style={s.footer} fixed>
        <Text style={s.footerText}>محضر اجتماع {meeting.meeting_no ?? ""} · نظام قرار</Text>
        <Text style={s.footerText} render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`} />
      </View>
    </Page>
  </Document>;
}

function Field({ label, value }: { label: string; value: string }) { return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><Text style={s.fieldValue}>{value}</Text></View>; }
function SignatureRow({ approval }: { approval: MinuteApproval }) {
  return <View style={s.signRow} wrap={false}>
    <Text style={[s.td, { flex: 1, fontWeight: 700 }]}>{approval.name_ar}</Text>
    <View style={{ width: 170, alignItems: "center", justifyContent: "center" }}>{approval.signature_strokes?.length ? <SignatureMark strokes={approval.signature_strokes} /> : <Text style={{ fontSize: 7, color: c.muted }}>توقيع إلكتروني موثق</Text>}</View>
    <Text style={[s.td, { width: 110, fontSize: 8 }]}>{formatDateTime(approval.signed_at)}</Text>
  </View>;
}
function chunk<T>(list: T[], size: number) { const out: T[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }
function academicYear(value: string) { const y = new Date(`${value}T00:00:00`).getFullYear(); return Number.isFinite(y) ? `${y}/${y + 1}` : value; }

function SignatureMark({ strokes }: { strokes: SignatureStrokes }) {
  const paths = fitSignature(strokes, 150, 45, 3);
  if (!paths.length) return <Text style={{ fontSize: 7, color: c.muted }}>توقيع إلكتروني موثق</Text>;
  return <Svg width={150} height={45} viewBox="0 0 150 45">{paths.map((points, index) => <Path key={index} d={points.map(([x, y], pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} stroke={c.navy} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}</Svg>;
}
function fitSignature(strokes: SignatureStrokes, width: number, height: number, padding: number) {
  const drawable = strokes.filter((stroke) => stroke.length > 1);
  const points = drawable.flat();
  if (!points.length) return [];
  const canvasAspect = 2.5;
  const projected = points.map(([x, y]) => [x * canvasAspect, y] as [number, number]);
  const minX = Math.min(...projected.map(([x]) => x));
  const maxX = Math.max(...projected.map(([x]) => x));
  const minY = Math.min(...projected.map(([, y]) => y));
  const maxY = Math.max(...projected.map(([, y]) => y));
  const sourceWidth = Math.max(maxX - minX, 0.01);
  const sourceHeight = Math.max(maxY - minY, 0.01);
  const scale = Math.min((width - padding * 2) / sourceWidth, (height - padding * 2) / sourceHeight);
  const offsetX = (width - sourceWidth * scale) / 2;
  const offsetY = (height - sourceHeight * scale) / 2;
  let cursor = 0;
  return drawable.map((stroke) => stroke.map(() => {
    const [x, y] = projected[cursor++];
    return [(x - minX) * scale + offsetX, (y - minY) * scale + offsetY] as [number, number];
  }));
}
/**
 * The minutes text is generated per item: a title line, then the summary, the decision line and the
 * assignment lines. Reads each item's summary and assignments back out of it, without filler sentences.
 */
function parseMinuteItems(content: string, items: NonNullable<MeetingDetail["agenda_items"]>) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const starts = items.map((item) => {
    const title = normalizeArabic(item.topic?.title_ar ?? "");
    return lines.findIndex((line) => title && new RegExp(`^${item.agenda_order}\\.`).test(line) && normalizeArabic(line).includes(title));
  });
  const result = new Map<string, { notes: string | null; assignments: string[] }>();
  items.forEach((item, index) => {
    const start = starts[index];
    if (start < 0) { result.set(item.id, { notes: item.discussion_notes?.trim() || null, assignments: [] }); return; }
    const end = starts.slice(index + 1).find((value) => value > start) ?? lines.length;
    const block = lines.slice(start + 1, end).filter(Boolean);
    const assignments = block.filter((line) => /^[-•]\s*تكليف/.test(line)).map((line) => line.replace(/^[-•]\s*تكليف\s*[:：]?\s*/, ""));
    const notes = block.filter((line) => !/^[-•]\s*تكليف/.test(line) && !/^القرار\s+\S+\s*[:：]/.test(line) && !/^لم يسجل ملخص/.test(line) && !/^(النتيجة|القرار)\s*[:：]/.test(line)).join(" ").trim();
    result.set(item.id, { notes: notes || null, assignments });
  });
  return result;
}
function normalizeArabic(value: string) { return value.replace(/[\s\d٠-٩۰-۹.,،:：؛;()\-_/]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي"); }
function formatDate(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" }).format(date); }
function formatDateTime(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : `${new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long", timeZone: "Asia/Aden" }).format(date)} · ${new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Aden" }).format(date)}`; }
function locationLabel(value?: string) { return value === "virtual" ? "اجتماع افتراضي" : value === "hybrid" ? "اجتماع هجين" : "مقر المجلس"; }
