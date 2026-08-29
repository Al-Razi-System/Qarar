import { z } from "zod";
import type { PolicyItem } from "./types";

const optionalText = z.string().trim().max(2_000).optional().or(z.literal(""));

export const policyIdentitySchema = z.object({
  name_ar: z.string().trim().min(3, "اسم اللائحة يجب ألا يقل عن 3 أحرف.").max(250),
  name_en: optionalText,
  description: z.string().trim().max(5_000).optional().or(z.literal("")),
  owner_user_id: z.string().uuid().optional().or(z.literal("")),
  owner_governance_unit_id: z.string().uuid().optional().or(z.literal("")),
  legal_reference: optionalText,
  decision_number: z.string().trim().max(250).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "archived"]),
});

export const versionDraftSchema = z.object({
  label: z.string().trim().min(1, "أدخل وسم الإصدار.").max(100),
  summary: z.string().trim().min(5, "اكتب ملخصاً واضحاً للتغييرات.").max(2_000),
});

export const policyItemDraftSchema = z
  .object({
    code: z.string().trim().min(1, "رمز العنصر مطلوب.").max(100),
    title: z.string().trim().min(3, "عنوان العنصر يجب ألا يقل عن 3 أحرف.").max(500),
    type: z.enum(["chapter", "section", "article", "clause", "procedure", "definition"]),
    parentId: z.string().uuid().optional().or(z.literal("")),
    sortOrder: z.coerce.number().int().min(1, "الترتيب يجب أن يكون رقماً موجباً."),
    body: z.string().trim().max(50_000).optional().or(z.literal("")),
    officialText: z.string().trim().max(50_000).optional().or(z.literal("")),
    interpretationText: z.string().trim().max(50_000).optional().or(z.literal("")),
    sourceLocator: z.string().trim().max(500).optional().or(z.literal("")),
    sourcePageFrom: z.coerce.number().int().positive().optional().or(z.literal("")),
    sourcePageTo: z.coerce.number().int().positive().optional().or(z.literal("")),
    governanceMode: z.enum([
      "regulation_required",
      "regulated_fallback_allowed",
      "custom_route_allowed",
    ]),
    topicCategoryId: z.string().uuid().optional().or(z.literal("")),
    criteriaText: z.string().trim().default("{}"),
    isActive: z.boolean(),
    requiresExecutableRule: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.sourcePageFrom &&
      value.sourcePageTo &&
      Number(value.sourcePageTo) < Number(value.sourcePageFrom)
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourcePageTo"],
        message: "صفحة النهاية يجب أن تكون بعد صفحة البداية.",
      });
    }
    try {
      const criteria = JSON.parse(value.criteriaText || "{}");
      if (!criteria || Array.isArray(criteria) || typeof criteria !== "object") throw new Error();
    } catch {
      context.addIssue({
        code: "custom",
        path: ["criteriaText"],
        message: "شروط الانطباق يجب أن تكون كائن JSON صالحاً.",
      });
    }
  });

export const policyScopeDraftSchema = z
  .object({
    type: z.enum([
      "organization",
      "governance_unit",
      "governance_class",
      "governance_unit_type",
      "governance_level",
      "unit_subtree",
    ]),
    targetId: z.string().uuid().optional().or(z.literal("")),
    governanceLevel: z.string().max(100).optional().or(z.literal("")),
    includeDescendants: z.boolean(),
    priority: z.coerce.number().int().min(0).max(10_000),
    validFrom: z.string().optional().or(z.literal("")),
    validTo: z.string().optional().or(z.literal("")),
  })
  .superRefine((value, context) => {
    if (
      ["governance_unit", "governance_class", "governance_unit_type", "unit_subtree"].includes(value.type) &&
      !value.targetId
    ) {
      context.addIssue({ code: "custom", path: ["targetId"], message: "اختر الجهة أو التصنيف المطلوب." });
    }
    if (value.type === "governance_level" && !value.governanceLevel) {
      context.addIssue({ code: "custom", path: ["governanceLevel"], message: "اختر المستوى التنظيمي." });
    }
    if (value.validTo && !value.validFrom) {
      context.addIssue({ code: "custom", path: ["validFrom"], message: "حدد بداية السريان قبل نهايته." });
    }
    if (value.validFrom && value.validTo && value.validTo < value.validFrom) {
      context.addIssue({ code: "custom", path: ["validTo"], message: "نهاية السريان يجب ألا تسبق بدايته." });
    }
  });

export function firstValidationMessage(result: { success: boolean; error?: z.ZodError }) {
  return result.success ? null : (result.error?.issues[0]?.message ?? "راجع البيانات المدخلة.");
}

export function policyItemDescendantIds(items: PolicyItem[], itemId: string) {
  const descendants = new Set<string>();
  let frontier = [itemId];
  while (frontier.length) {
    const parents = new Set(frontier);
    frontier = items
      .filter((item) => item.parent_item_id && parents.has(item.parent_item_id) && !descendants.has(item.id))
      .map((item) => item.id);
    frontier.forEach((id) => descendants.add(id));
  }
  return descendants;
}

export function parsePolicyCriteria(criteriaText: string) {
  return JSON.parse(criteriaText || "{}") as Record<string, unknown>;
}
