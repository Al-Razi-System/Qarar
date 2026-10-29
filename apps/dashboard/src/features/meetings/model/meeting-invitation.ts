import { BarcodeFormat, EncodeHintType, QRCodeWriter } from "@zxing/library";
import type { MeetingDetail } from "./meeting";

export type MeetingInvitationSnapshot = {
  meeting_id?: string;
  meeting_no?: string | null;
  title_ar: string;
  governance_unit_name_ar?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location_type?: string | null;
  location_details?: string | null;
  recipient_name_ar?: string | null;
  agenda_titles?: Array<string | { title_ar?: string | null }>;
  meeting_url?: string | null;
};

export function meetingInvitationSnapshot(meeting: MeetingDetail, overrides: { startTime?: string; endTime?: string; meetingUrl?: string } = {}): MeetingInvitationSnapshot {
  return {
    meeting_id: meeting.id,
    meeting_no: meeting.meeting_no,
    title_ar: meeting.title_ar,
    governance_unit_name_ar: meeting.governance_unit_name_ar ?? meeting.unit_name_ar,
    scheduled_date: meeting.scheduled_date ?? "",
    start_time: overrides.startTime ?? meeting.start_time,
    end_time: overrides.endTime ?? meeting.end_time,
    location_type: meeting.location_type,
    location_details: meeting.location_details,
    agenda_titles: (meeting.agenda_items ?? []).map((item) => item.topic?.title_ar ?? "بند اجتماع"),
    meeting_url: overrides.meetingUrl,
  };
}

export function invitationAgenda(snapshot: MeetingInvitationSnapshot) {
  return (snapshot.agenda_titles ?? []).map((item) => typeof item === "string" ? item : item?.title_ar ?? "").filter(Boolean);
}

export function invitationLocation(snapshot: MeetingInvitationSnapshot) {
  return snapshot.location_details || ({ onsite: "حضوري", physical: "حضوري", online: "عن بُعد", hybrid: "هجين" } as Record<string, string>)[snapshot.location_type ?? ""] || "يحدد في نظام قرار";
}

export function invitationDate(value: string) {
  if (!value) return "غير محدد";
  return new Intl.DateTimeFormat("ar-YE-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Aden" }).format(new Date(`${value}T12:00:00Z`));
}

export function invitationTime(snapshot: MeetingInvitationSnapshot) {
  const value = (time?: string | null) => time?.slice(0, 5) || null;
  return [value(snapshot.start_time), value(snapshot.end_time)].filter(Boolean).join(" – ") || "غير محدد";
}

export function invitationQrSvg(url?: string | null) {
  if (!url) return null;
  const hints = new Map(); hints.set(EncodeHintType.MARGIN, 1);
  const matrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, 188, 188, hints);
  const modules: string[] = [];
  for (let y = 0; y < matrix.getHeight(); y += 1) for (let x = 0; x < matrix.getWidth(); x += 1) if (matrix.get(x, y)) modules.push(`M${x} ${y}h1v1h-1z`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.getWidth()} ${matrix.getHeight()}" width="188" height="188"><rect width="100%" height="100%" fill="#fff"/><path d="${modules.join("")}" fill="#082d59"/></svg>`;
}

export function invitationQrDataUri(url?: string | null) {
  const svg = invitationQrSvg(url);
  return svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null;
}

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function lines(value: string, length = 48, max = 2) {
  const words = value.trim().split(/\s+/); const result: string[] = []; let line = "";
  for (const word of words) {
    const next = `${line} ${word}`.trim();
    if (next.length > length && line) { result.push(line); line = word; if (result.length === max - 1) break; }
    else line = next;
  }
  if (line && result.length < max) result.push(line);
  return result;
}

export function renderMeetingInvitationSvg(snapshot: MeetingInvitationSnapshot, logoDataUri: string, qrDataUri?: string | null) {
  const agenda = invitationAgenda(snapshot).slice(0, 6);
  const qr = qrDataUri === undefined ? invitationQrDataUri(snapshot.meeting_url) : qrDataUri;
  const titleLines = lines(snapshot.title_ar, 38, 2);
  const agendaRows = agenda.map((title, index) => `<g transform="translate(0 ${index * 72})" font-family="QararArabic"><rect x="94" y="0" width="892" height="56" rx="16" fill="#f4f9fd"/><circle cx="948" cy="28" r="19" fill="#0877d6"/><text x="948" y="36" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">${index + 1}</text><text x="912" y="36" text-anchor="end" direction="rtl" font-size="23" font-weight="600" fill="#172a42">${escapeXml(lines(title, 60, 1)[0])}</text></g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <rect width="1080" height="1350" fill="#fff"/><rect width="1080" height="18" fill="#0877d6"/><rect x="780" y="18" width="300" height="7" fill="#f58220"/>
  <image href="${logoDataUri}" x="855" y="66" width="120" height="140" preserveAspectRatio="xMidYMid meet"/>
  <text x="820" y="112" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="32" font-weight="700" fill="#082d59">جامعة الرازي</text>
  <text x="820" y="148" text-anchor="end" font-family="QararArabic" font-size="18" letter-spacing="3" fill="#63788e">AL-RAZI UNIVERSITY</text>
  <rect x="92" y="78" width="220" height="58" rx="29" fill="#e8f3fc"/><text x="202" y="116" text-anchor="middle" direction="rtl" font-family="QararArabic" font-size="23" font-weight="700" fill="#0877d6">دعوة اجتماع رسمية</text>
  <line x1="92" y1="228" x2="988" y2="228" stroke="#d9e5ef" stroke-width="2"/>
  <text x="540" y="296" text-anchor="middle" direction="rtl" font-family="QararArabic" font-size="23" font-weight="700" fill="#f58220">${escapeXml(snapshot.governance_unit_name_ar ?? "مجلس الجامعة")}</text>
  ${titleLines.map((line, index) => `<text x="540" y="${350 + index * 52}" text-anchor="middle" direction="rtl" font-family="QararArabic" font-size="38" font-weight="700" fill="#082d59">${escapeXml(line)}</text>`).join("")}
  <rect x="92" y="475" width="896" height="154" rx="24" fill="#082d59"/>
  <text x="942" y="520" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="18" fill="#9fc9ec">التاريخ والوقت</text><text x="942" y="560" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="25" font-weight="700" fill="#fff">${escapeXml(invitationDate(snapshot.scheduled_date))}</text><text x="942" y="596" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="23" fill="#fff">${escapeXml(invitationTime(snapshot))}</text>
  <line x1="540" y1="500" x2="540" y2="605" stroke="#31557c"/><text x="496" y="520" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="18" fill="#9fc9ec">المكان</text><text x="496" y="565" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="25" font-weight="700" fill="#fff">${escapeXml(invitationLocation(snapshot))}</text>
  <text x="986" y="692" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="27" font-weight="700" fill="#082d59">جدول الأعمال</text>
  <g transform="translate(0 724)">${agendaRows || '<text x="986" y="40" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="22" fill="#63788e">يعرض جدول الأعمال في نظام قرار</text>'}</g>
  ${qr ? `<rect x="92" y="1110" width="212" height="212" rx="20" fill="#fff" stroke="#d9e5ef"/><image href="${qr}" x="104" y="1122" width="188" height="188"/>` : ""}
  <text x="988" y="1165" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="22" font-weight="700" fill="#082d59">${escapeXml(snapshot.recipient_name_ar ? `السيد/ة ${snapshot.recipient_name_ar}` : "أعضاء المجلس المحترمون")}</text>
  <text x="988" y="1206" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="20" fill="#63788e">يرجى الاطلاع على التفاصيل وتأكيد الحضور عبر نظام قرار.</text>
  <text x="988" y="1266" text-anchor="end" direction="rtl" font-family="QararArabic" font-size="18" fill="#63788e">المرجع: ${escapeXml(snapshot.meeting_no ?? snapshot.meeting_id ?? "—")}</text>
  <line x1="92" y1="1304" x2="988" y2="1304" stroke="#d9e5ef"/><text x="540" y="1332" text-anchor="middle" direction="rtl" font-family="QararArabic" font-size="16" fill="#8aa0b4">نظام قرار - جامعة الرازي</text>
  </svg>`;
}
