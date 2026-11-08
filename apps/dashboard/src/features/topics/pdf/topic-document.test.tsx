// @vitest-environment node
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@react-pdf/renderer", () => ({
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
  StyleSheet: { create: <T,>(value: T) => value },
  Document: ({ children }: { children: ReactNode }) => <article>{children}</article>,
  Page: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  View: ({ children }: { children?: ReactNode }) => <section>{children}</section>,
  Text: ({ children, render }: { children?: ReactNode; render?: (value: { pageNumber: number; totalPages: number }) => ReactNode }) => <span>{children ?? render?.({ pageNumber: 1, totalPages: 1 })}</span>,
  Image: () => <span data-image="logo" />,
}));

import { TopicDocument, type TopicPdfData } from "./topic-document";

function data(): TopicPdfData {
  return {
    topic: {
      id: "topic-1",
      topic_no: "TOP-2026-000123",
      title_ar: "اعتماد الخطة الأكاديمية",
      description: "وصف الموضوع الرسمي",
      status: "under_review",
      priority: "high",
      submitted_at: "2026-10-27T09:00:00Z",
      governance_unit: { name_ar: "مجلس الجامعة" },
      submitted_by: { full_name_ar: "مقدم الموضوع" },
      typed_creation_request: { snapshot: {
        topic_type_name_ar: "اعتماد خطة",
        classification_name_ar: "شؤون أكاديمية",
        authorities: [{ source_document_name: "لائحة الجامعة", article_number: "12", authority_text: "السند النظامي" }],
      } },
    },
    attachments: [{ id: "attachment-1", file_name: "الخطة.pdf" }],
    requirements: { ready_for_review: true, items: [{ code: "REQ", name: "إفادة القسم", mandatory: true, status: "fulfilled" }] },
    references: [],
    workflow: { status: "active", steps: [{ id: "step-1", sequence_no: 1, status: "completed", outcome_code: "approved", snapshot: { name_ar: "مجلس القسم" } }] },
    referrals: [{ id: "referral-1", from_unit_name_ar: "مجلس القسم", to_unit_name_ar: "مجلس الكلية", referral_reason: "استكمال المسار" }],
    meetings: [{
      agenda_item_id: "agenda-1", agenda_status: "discussed",
      discussion_notes: "خلاصة المناقشة",
      meeting: { title: "اجتماع مجلس القسم", meeting_no: "MTG-2026-000010", unit_name: "مجلس القسم" },
      voting_rounds: [{ id: "vote-1", status: "closed", approve_count: 5, reject_count: 0, abstain_count: 1 }],
      decisions: [{ id: "decision-1", decision_no: "DEC-2026-000010", decision_text: "الموافقة على الخطة" }],
    }],
    activity: [{ id: "activity-1", action: "agenda.item.add", actor_name_ar: "مقرر المجلس", occurred_at: "2026-10-27T10:00:00Z" }],
    printedBy: "مدير النظام",
    printedAt: "2026-10-27T11:00:00Z",
    logo: "data:image/jpeg;base64,bG9nbw==",
  };
}

it("contains the important topic details and the print line", () => {
  const html = renderToStaticMarkup(TopicDocument(data()));
  for (const expected of [
    "اعتماد الخطة الأكاديمية", "وصف الموضوع الرسمي", "السند النظامي", "لائحة الجامعة", "الخطة.pdf",
    "موقع الموضوع في المسار", "ما سبق اتخاذه بشأن الموضوع", "DEC-2026-000010", "الموافقة على الخطة", "مدير النظام", "نظام قرار - جامعة الرازي",
  ]) expect(html).toContain(expected);
});

it("leaves out the audit trail, requirements checklist and referrals", () => {
  const html = renderToStaticMarkup(TopicDocument(data()));
  for (const unwanted of ["سجل الرحلة", "إدراج الموضوع في جدول", "طباعة ملف الموضوع", "إفادة القسم", "الإحالات"]) expect(html).not.toContain(unwanted);
});

it("does not list a meeting where the topic was only added to the agenda", () => {
  const scheduled = data();
  scheduled.meetings = [{ agenda_item_id: "agenda-2", agenda_status: "pending", meeting: { title: "اجتماع مجلس الكلية الثاني" }, voting_rounds: [], decisions: [] }];
  const html = renderToStaticMarkup(TopicDocument(scheduled));
  expect(html).not.toContain("اجتماع مجلس الكلية الثاني");
  expect(html).not.toContain("ما سبق اتخاذه");
});

it("omits sections that have nothing to say", () => {
  const empty = data();
  empty.attachments = []; empty.references = []; empty.topic.typed_creation_request = null; empty.workflow = null; empty.meetings = [];
  const html = renderToStaticMarkup(TopicDocument(empty));
  for (const absent of ["السند النظامي", "المرفقات", "موقع الموضوع في المسار", "ما سبق اتخاذه"]) expect(html).not.toContain(absent);
});
