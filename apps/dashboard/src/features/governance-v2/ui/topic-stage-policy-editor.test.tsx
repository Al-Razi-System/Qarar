import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { defaultStagePolicies, TopicStagePolicyEditor } from "./topic-stage-policy-editor";

const stages = [
  { id: "one", step_key: "s1", name_ar: "مجلس القسم", sequence_no: 1 },
  { id: "two", step_key: "s2", name_ar: "مجلس الكلية", sequence_no: 2 },
];

it("uses the chair decision as the rejection default for newly authored policies", () => {
  expect(defaultStagePolicies(stages).map((policy) => policy.rejected)).toEqual(["chair_decides", "chair_decides"]);
});

it("offers the chair decision without rewriting an existing saved behavior", () => {
  const onChange = vi.fn();
  const existing = defaultStagePolicies(stages).map((policy) => ({ ...policy, rejected: "complete" as const }));
  render(<TopicStagePolicyEditor stages={stages} value={existing} onChange={onChange} />);
  expect(screen.getAllByRole("option", { name: "يقرر الرئيس بعد نتيجة التصويت" })).toHaveLength(2);
  expect(screen.getByRole("combobox", { name: "رفض الموضوع في المرحلة 1" })).toHaveValue("complete");
  fireEvent.change(screen.getByRole("combobox", { name: "رفض الموضوع في المرحلة 1" }), { target: { value: "chair_decides" } });
  expect(onChange).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ step_key: "s1", rejected: "chair_decides" })]));
});
