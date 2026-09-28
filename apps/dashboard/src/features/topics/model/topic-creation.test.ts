import { describe, expect, it } from "vitest";
import {
  resolveCreationStep,
  resolveDefaultGovernanceMethod,
  type TopicGovernanceMethodAvailability,
} from "./topic-creation";

describe("topic creation model", () => {
  it("يفضل المسار اللائحي عندما يكون جاهزاً", () => {
    const availability: TopicGovernanceMethodAvailability = {
      regulation: { available: true, reason: "جاهز" },
      custom: { available: true, reason: "مسموح" },
      exception: { available: false, reason: "غير مطلوب" },
    };

    expect(resolveDefaultGovernanceMethod(availability)).toBe("regulation");
  });

  it("ينتقل للمسار المخصص عند غياب مسار لائحي", () => {
    const availability: TopicGovernanceMethodAvailability = {
      regulation: { available: false, reason: "غير موجود" },
      custom: { available: true, reason: "مسموح" },
      exception: { available: false, reason: "غير مطلوب" },
    };

    expect(resolveDefaultGovernanceMethod(availability)).toBe("custom");
  });

  it("يبقي البدائل الخاضعة للمراجعة قابلة للاختيار", () => {
    const availability: TopicGovernanceMethodAvailability = {
      regulation: { available: true, reason: "جاهز" },
      custom: { available: true, reason: "يتطلب اعتماداً" },
      exception: { available: true, reason: "يتطلب صلاحية" },
    };

    expect(availability.custom.available).toBe(true);
    expect(availability.exception.available).toBe(true);
  });

  it("يحول حالات المعالج الداخلية إلى أربع خطوات مفهومة", () => {
    expect(resolveCreationStep({ hasMatchedGovernance: false, isReadyForReview: false, isCreated: false })).toBe(1);
    expect(resolveCreationStep({ hasMatchedGovernance: true, isReadyForReview: false, isCreated: false })).toBe(2);
    expect(resolveCreationStep({ hasMatchedGovernance: true, isReadyForReview: true, isCreated: false })).toBe(3);
    expect(resolveCreationStep({ hasMatchedGovernance: true, isReadyForReview: true, isCreated: true })).toBe(4);
  });
});
