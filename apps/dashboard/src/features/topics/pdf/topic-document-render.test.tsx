// @vitest-environment node
import { renderToBuffer } from "@react-pdf/renderer";
import { expect, it } from "vitest";
import { TopicDocument, type TopicPdfData } from "./topic-document";

it("renders a non-empty Arabic PDF with the bundled production fonts", async () => {
  const data: TopicPdfData = {
    topic: {
      id: "topic-render",
      topic_no: "TOP-2026-000123",
      title_ar: "اعتماد الخطة الأكاديمية",
      description: "وصف عربي للتحقق من سلامة الخط والاتجاه.",
      status: "approved",
      governance_unit: { name_ar: "مجلس الجامعة" },
      submitted_by: { full_name_ar: "مقدم الموضوع" },
    },
    attachments: [], requirements: null, references: [], workflow: null,
    referrals: [], meetings: [], activity: [],
    printedBy: "مدير النظام",
    printedAt: "2026-10-27T11:00:00Z",
    logo: `data:image/jpeg;base64,${Buffer.from(
      // One-pixel JPEG used only to exercise the production Image path.
      "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
      "base64",
    ).toString("base64")}`,
  };

  const buffer = await renderToBuffer(TopicDocument(data));
  expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
  expect(buffer.byteLength).toBeGreaterThan(5_000);
});
