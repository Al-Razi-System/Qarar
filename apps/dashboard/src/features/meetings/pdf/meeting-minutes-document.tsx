import path from "node:path";
import { Document, Font, Image, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { MeetingDetail, MeetingMinutes, MinuteApproval, SignatureStrokes } from "../model/meeting";

Font.register({
  family: "QararArabic",
  fonts: [
    { src: path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Bold.ttf"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const palette = { navy: "#082d59", blue: "#0877d6", cyan: "#22a5d8", orange: "#f58220", ink: "#172a42", muted: "#63788e", line: "#d9e5ef", pale: "#f4f9fd", green: "#07865f" };
const styles = StyleSheet.create({
  page: { fontFamily: "QararArabic", fontSize: 9, color: palette.ink, backgroundColor: "#ffffff", paddingTop: 42, paddingBottom: 48, paddingHorizontal: 42, direction: "rtl" },
  topRule: { position: "absolute", top: 0, right: 0, left: 0, height: 9, backgroundColor: palette.blue },
  orangeRule: { position: "absolute", top: 9, right: 0, width: 130, height: 4, backgroundColor: palette.orange },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: palette.line },
  brand: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  logo: { width: 58, height: 72, objectFit: "contain" },
  university: { textAlign: "right", fontSize: 14, fontWeight: 700, color: palette.navy },
  universityEn: { marginTop: 3, textAlign: "right", fontSize: 7.5, letterSpacing: 1.3, color: palette.muted },
  documentBadge: { borderRadius: 12, backgroundColor: palette.pale, paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: "#cfe1ef" },
  documentBadgeText: { fontSize: 8, fontWeight: 700, color: palette.blue, textAlign: "center" },
  titleBlock: { marginTop: 25, alignItems: "center" },
  eyebrow: { fontSize: 8, fontWeight: 700, color: palette.orange, textAlign: "center" },
  title: { marginTop: 8, fontSize: 21, fontWeight: 700, color: palette.navy, textAlign: "center", lineHeight: 1.6 },
  subtitle: { marginTop: 5, fontSize: 9, color: palette.muted, textAlign: "center" },
  status: { marginTop: 14, borderRadius: 14, backgroundColor: "#e8f8f2", color: palette.green, paddingVertical: 6, paddingHorizontal: 14, fontSize: 8, fontWeight: 700 },
  metaGrid: { marginTop: 24, flexDirection: "row-reverse", flexWrap: "wrap", gap: 9 },
  metaCard: { width: "48.8%", borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.pale, padding: 11 },
  metaLabel: { fontSize: 7, color: palette.muted, textAlign: "right" },
  metaValue: { marginTop: 5, fontSize: 9, fontWeight: 700, color: palette.navy, textAlign: "right" },
  section: { marginTop: 22 },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionMarker: { width: 4, height: 20, borderRadius: 3, backgroundColor: palette.orange },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: palette.navy, textAlign: "right" },
  sectionHint: { marginTop: 2, fontSize: 7, color: palette.muted, textAlign: "right" },
  attendanceGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  attendanceCard: { width: "48.8%", position: "relative", minHeight: 38, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: palette.line, paddingVertical: 8, paddingRight: 43, paddingLeft: 10 },
  attendanceIndex: { position: "absolute", right: 10, top: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: "#e8f3fc", color: palette.blue, fontSize: 8, fontWeight: 700, textAlign: "center", paddingTop: 5 },
  attendanceName: { width: "100%", fontSize: 8, fontWeight: 700, textAlign: "right" },
  bodyBox: { borderRadius: 10, borderWidth: 1, borderColor: palette.line, padding: 15, backgroundColor: "#ffffff" },
  paragraph: { marginBottom: 9, fontSize: 9, lineHeight: 1.9, textAlign: "right", color: "#263d55" },
  agendaItem: { marginBottom: 8, position: "relative", minHeight: 46, justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: palette.line, paddingVertical: 10, paddingRight: 52, paddingLeft: 12, backgroundColor: palette.pale },
  agendaNo: { position: "absolute", right: 10, top: 9, width: 28, height: 28, borderRadius: 8, backgroundColor: palette.blue, color: "#ffffff", fontSize: 10, fontWeight: 700, textAlign: "center", paddingTop: 7 },
  agendaTitle: { width: "100%", fontSize: 8.5, fontWeight: 700, textAlign: "right" },
  minutesLead: { marginBottom: 11, borderRadius: 10, borderWidth: 1, borderColor: "#c9deef", backgroundColor: "#f4f9fd", padding: 13 },
  minutesLeadTitle: { fontSize: 9, fontWeight: 700, color: palette.navy, textAlign: "right" },
  minutesLeadText: { marginTop: 5, fontSize: 8, lineHeight: 1.8, color: palette.muted, textAlign: "right" },
  decisionCard: { marginBottom: 10, overflow: "hidden", borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: "#ffffff" },
  decisionHead: { position: "relative", minHeight: 43, justifyContent: "center", backgroundColor: palette.pale, paddingVertical: 9, paddingRight: 52, paddingLeft: 12 },
  decisionNo: { position: "absolute", right: 10, top: 8, width: 28, height: 28, borderRadius: 8, backgroundColor: palette.navy, color: "#ffffff", fontSize: 10, fontWeight: 700, textAlign: "center", paddingTop: 7 },
  decisionTitle: { width: "100%", fontSize: 9, fontWeight: 700, color: palette.navy, textAlign: "right" },
  resultBox: { borderTopWidth: 1, borderTopColor: "#dce9e4", backgroundColor: "#f2fbf7", paddingVertical: 10, paddingHorizontal: 12 },
  resultLabel: { fontSize: 7, fontWeight: 700, color: palette.green, textAlign: "right" },
  resultText: { marginTop: 4, fontSize: 8.5, lineHeight: 1.8, color: "#25483e", textAlign: "right" },
  certification: { marginTop: 20, borderRadius: 10, borderWidth: 1, borderColor: "#a9ddc8", backgroundColor: "#effbf6", padding: 13 },
  certificationTitle: { fontSize: 9, fontWeight: 700, color: palette.green, textAlign: "right" },
  certificationText: { marginTop: 5, fontSize: 7.5, lineHeight: 1.8, color: "#3f695d", textAlign: "right" },
  signatureGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9 },
  signatureCard: { width: "48.8%", minHeight: 112, borderRadius: 10, borderWidth: 1, borderColor: "#cfe1db", backgroundColor: "#fbfffd", padding: 10 },
  signatureHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  signatureName: { maxWidth: 170, fontSize: 8.5, fontWeight: 700, textAlign: "right" },
  signedBadge: { borderRadius: 8, backgroundColor: "#e3f7ef", color: palette.green, paddingVertical: 3, paddingHorizontal: 7, fontSize: 6.5, fontWeight: 700 },
  signatureCanvas: { marginTop: 7, height: 50, borderRadius: 7, borderWidth: 1, borderColor: "#e0ece7", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  signatureDate: { marginTop: 5, fontSize: 6.5, color: palette.muted, textAlign: "right" },
  auditBox: { marginTop: 17, borderRadius: 9, backgroundColor: palette.navy, padding: 12 },
  auditTitle: { color: "#ffffff", fontSize: 8, fontWeight: 700, textAlign: "right" },
  auditHash: { marginTop: 5, color: "#b9d9f4", fontSize: 6.5, textAlign: "left" },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, flexDirection: "row-reverse", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 7 },
  footerText: { fontSize: 6.5, color: palette.muted },
});

export function MeetingMinutesDocument({ meeting, minutes, logo }: { meeting: MeetingDetail; minutes: MeetingMinutes; logo: string }) {
  const approvals = minutes.approvals ?? [];
  const paragraphs = (minutes.content_final ?? "").split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const minuteDecisions = extractMinuteDecisions(minutes.content_final ?? "", meeting.agenda_items ?? []);
  const date = formatDate(meeting.scheduled_date);
  const time = [meeting.start_time, meeting.end_time].filter(Boolean).join(" - ") || "غير محدد";

  return <Document title={`محضر ${meeting.title_ar}`} author="جامعة الرازي - نظام قرار" subject="محضر اجتماع معتمد" language="ar">
    <Page size="A4" style={styles.page}>
      <View style={styles.topRule} fixed /><View style={styles.orangeRule} fixed />
      <View style={styles.header}>
        <View style={styles.brand}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image does not expose an alt prop. */}
          <Image src={logo} style={styles.logo} />
          <View><Text style={styles.university}>جامعة الرازي</Text><Text style={styles.universityEn}>AL-RAZI UNIVERSITY</Text></View>
        </View>
        <View style={styles.documentBadge}><Text style={styles.documentBadgeText}>محضر اجتماع رسمي</Text></View>
      </View>
      <View style={styles.titleBlock}><Text style={styles.eyebrow}>الوثيقة الختامية المعتمدة</Text><Text style={styles.title}>{meeting.title_ar}</Text><Text style={styles.subtitle}>{meeting.governance_unit_name_ar ?? meeting.unit_name_ar ?? "مجلس الجامعة"}</Text><Text style={styles.status}>معتمد ومغلق</Text></View>
      <View style={styles.metaGrid}>
        <Meta label="رقم الاجتماع" value={meeting.meeting_no ?? "غير محدد"} /><Meta label="تاريخ الاجتماع" value={date} />
        <Meta label="وقت الاجتماع" value={time} /><Meta label="مكان الاجتماع" value={meeting.location_details ?? locationLabel(meeting.location_type)} />
      </View>
      <SectionHeader title="الحضور المعتمد" hint={`${approvals.length} أعضاء صادقوا على النسخة النهائية`} />
      <View style={styles.attendanceGrid}>{approvals.map((approval, index) => <View key={approval.id} style={styles.attendanceCard}><Text style={styles.attendanceIndex}>{index + 1}</Text><Text style={styles.attendanceName}>{approval.name_ar ?? "عضو حاضر"}</Text></View>)}</View>
      {!!meeting.agenda_items?.length && <View style={styles.section}><View wrap={false}><SectionHeader title="جدول الأعمال" hint="البنود حسب ترتيب مناقشتها في الجلسة" compact /><AgendaRow item={meeting.agenda_items[0]} /></View>{meeting.agenda_items.slice(1).map((item) => <AgendaRow key={item.id} item={item} />)}</View>}
      <View style={styles.section}>
        <SectionHeader title="نص المحضر والقرارات" hint="النتائج النهائية التي صادق عليها الحاضرون" compact />
        {minuteDecisions.length ? <>
          <View style={styles.minutesLead} wrap={false}><Text style={styles.minutesLeadTitle}>خلاصة الجلسة</Text><Text style={styles.minutesLeadText}>استعرض المجلس بنود جدول الأعمال حسب ترتيبها، وبعد المناقشة والتصويت أثبت النتائج والقرارات التالية في النسخة النهائية للمحضر.</Text></View>
          {minuteDecisions.map(({ item, result }) => <View key={item.id} style={styles.decisionCard} wrap={false}><View style={styles.decisionHead}><Text style={styles.decisionNo}>{item.agenda_order}</Text><Text style={styles.decisionTitle}>{item.topic?.title_ar ?? "بند الاجتماع"}</Text></View><View style={styles.resultBox}><Text style={styles.resultLabel}>النتيجة والقرار المعتمد</Text><Text style={styles.resultText}>{result}</Text></View></View>)}
        </> : <View style={styles.bodyBox}>{paragraphs.map((paragraph, index) => <Text key={`${index}-${paragraph.slice(0, 12)}`} style={styles.paragraph}>{paragraph}</Text>)}</View>}
      </View>
      <View break>
        <View style={styles.certification} wrap={false}><Text style={styles.certificationTitle}>إقرار اعتماد الوثيقة</Text><Text style={styles.certificationText}>تم تثبيت هذه النسخة بعد انتهاء الاجتماع، وصادق عليها جميع الحاضرين بتواقيعهم الإلكترونية المبينة أدناه. أي تعديل على المحتوى ينتج بصمة مختلفة ويلغي مطابقة التواقيع.</Text></View>
        <SectionHeader title="سجل المصادقات والتواقيع" hint="تواقيع الحاضرين المرتبطة ببصمة النسخة النهائية" compact />
        <View style={styles.signatureGrid}>{approvals.map((approval) => <SignatureCard key={approval.id} approval={approval} />)}</View>
      </View>
      <View style={styles.auditBox} wrap={false}><Text style={styles.auditTitle}>بصمة التحقق الرقمية للمحضر</Text><Text style={styles.auditHash}>{minutes.final_content_hash ?? "غير متاحة"}</Text></View>
      <View style={styles.footer} fixed><Text style={styles.footerText}>نظام قرار - جامعة الرازي</Text><Text style={styles.footerText} render={({ pageNumber, totalPages }) => `صفحة ${pageNumber} من ${totalPages}`} /></View>
    </Page>
  </Document>;
}

function Meta({ label, value }: { label: string; value: string }) { return <View style={styles.metaCard}><Text style={styles.metaLabel}>{label}</Text><Text style={styles.metaValue}>{value}</Text></View>; }
function SectionHeader({ title, hint, compact = false }: { title: string; hint: string; compact?: boolean }) { return <View style={[styles.sectionHeader, compact ? {} : { marginTop: 22 }]}><View style={styles.sectionMarker} /><View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionHint}>{hint}</Text></View></View>; }
function AgendaRow({ item }: { item: NonNullable<MeetingDetail["agenda_items"]>[number] }) { return <View style={styles.agendaItem} wrap={false}><Text style={styles.agendaNo}>{item.agenda_order}</Text><Text style={styles.agendaTitle}>{item.topic?.title_ar ?? "بند الاجتماع"}</Text></View>; }
function SignatureCard({ approval }: { approval: MinuteApproval }) { return <View style={styles.signatureCard} wrap={false}><View style={styles.signatureHead}><Text style={styles.signatureName}>{approval.name_ar ?? "عضو حاضر"}</Text><Text style={styles.signedBadge}>مصادق</Text></View><View style={styles.signatureCanvas}><SignatureMark strokes={approval.signature_strokes ?? []} /></View><Text style={styles.signatureDate}>وقت المصادقة: {formatDateTime(approval.signed_at)}</Text></View>; }
function SignatureMark({ strokes }: { strokes: SignatureStrokes }) {
  const paths = fitSignature(strokes, 150, 45, 3);
  if (!paths.length) return <Text style={{ fontSize: 7, color: palette.muted }}>توقيع إلكتروني موثق</Text>;
  return <Svg width={150} height={45} viewBox="0 0 150 45">{paths.map((points, index) => <Path key={index} d={points.map(([x, y], pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`).join(" ")} stroke={palette.navy} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}</Svg>;
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
function extractMinuteDecisions(content: string, items: NonNullable<MeetingDetail["agenda_items"]>) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return items.map((item, itemIndex) => {
    const title = item.topic?.title_ar?.trim() ?? "";
    const titleLine = lines.findIndex((line) => title && normalizeArabic(line).includes(normalizeArabic(title)));
    const nextTitle = items[itemIndex + 1]?.topic?.title_ar?.trim();
    const endLine = nextTitle ? lines.findIndex((line, index) => index > titleLine && normalizeArabic(line).includes(normalizeArabic(nextTitle))) : lines.length;
    const resultLine = titleLine >= 0 ? lines.slice(titleLine + 1, endLine > titleLine ? endLine : lines.length).find((line) => /^(النتيجة|القرار)\s*[:：]/.test(line)) : undefined;
    return { item, result: resultLine?.replace(/^(النتيجة|القرار)\s*[:：]\s*/, "") || item.discussion_notes?.trim() || "تمت مناقشة البند وإثبات نتيجته في سجل الجلسة المعتمد." };
  });
}
function normalizeArabic(value: string) { return value.replace(/[\s\d٠-٩۰-۹.,،:：؛;()\-_/]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي"); }
function formatDate(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "long" }).format(date); }
function formatDateTime(value?: string | null) { if (!value) return "غير محدد"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function locationLabel(value?: string) { return value === "virtual" ? "اجتماع افتراضي" : value === "hybrid" ? "اجتماع هجين" : "مقر المجلس"; }
