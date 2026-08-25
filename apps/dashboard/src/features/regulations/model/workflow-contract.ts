import type { WorkflowTemplate } from "./types";

export function workflowTemplatesFromResponse(value: unknown): WorkflowTemplate[] {
  if (!value || typeof value !== "object" || !("items" in value)) {
    throw new Error("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
  }
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
  return items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
    }
    const template = item as WorkflowTemplate;
    if (!Array.isArray(template.versions)) {
      throw new Error("WORKFLOW_TEMPLATE_RESPONSE_INVALID");
    }
    return {
      ...template,
      versions: template.versions.map((version) => ({
        ...version,
        steps: Array.isArray(version.steps) ? version.steps : [],
        transitions: Array.isArray(version.transitions) ? version.transitions : [],
      })),
    };
  });
}
