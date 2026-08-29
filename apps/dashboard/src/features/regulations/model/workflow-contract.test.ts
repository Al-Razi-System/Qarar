import { describe, expect, it } from "vitest";

import { workflowTemplatesFromResponse } from "./workflow-contract";

describe("workflowTemplatesFromResponse", () => {
  it("يقرأ عناصر الاستجابة المرقمة", () => {
    const items = [{ id: "workflow-1", versions: [] }];
    expect(workflowTemplatesFromResponse({ items, total: 1 })).toStrictEqual(items);
  });

  it("يرفض عقد المصفوفة القديم والاستجابات المشوهة", () => {
    expect(() => workflowTemplatesFromResponse([])).toThrow("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
    expect(() => workflowTemplatesFromResponse({ items: null })).toThrow("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
  });

  it("يطبع تفاصيل الإصدار الناقصة لمنع سقوط الواجهة أثناء الترقية", () => {
    const [template] = workflowTemplatesFromResponse({
      items: [{ id: "workflow-1", versions: [{ id: "version-1" }] }],
    });

    expect(template.versions[0].steps).toEqual([]);
    expect(template.versions[0].transitions).toEqual([]);
  });
});
