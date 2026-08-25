import type { Policy, ReferenceOption } from "../model/types";

type RpcEnvelope<T> = { data?: T; error?: { message?: string } };

export async function regulationsRpc<T>(
  contract: string,
  params: Record<string, unknown> = {},
) {
  const response = await fetch("/api/admin/regulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = (await response.json().catch(() => ({}))) as RpcEnvelope<T>;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية. حاول مجدداً.");
  }
  return payload.data as T;
}

export function getPolicyDetail(policyId: string) {
  return regulationsRpc<Policy>("admin_get_policy_detail", {
    p_policy_id: policyId,
  });
}

export type PolicyAuthoringReferences = {
  units: ReferenceOption[];
  classes: ReferenceOption[];
  unitTypes: ReferenceOption[];
  categories: ReferenceOption[];
  users: ReferenceOption[];
  governanceLevels: Array<{ value: string; label: string }>;
};

type ListResponse = { items: ReferenceOption[] };

export async function getPolicyAuthoringReferences(): Promise<PolicyAuthoringReferences> {
  const [units, classes, unitTypes, categories, options] = await Promise.all([
    regulationsRpc<ListResponse>("admin_list_governance_units", {
      p_query: null,
      p_status: "active",
      p_unit_type_id: null,
      p_governance_class_id: null,
      p_parent_unit_id: null,
      p_limit: 200,
      p_offset: 0,
    }),
    regulationsRpc<ListResponse>("admin_list_governance_unit_classes", {
      p_query: null,
      p_is_active: true,
      p_limit: 200,
      p_offset: 0,
    }),
    regulationsRpc<ListResponse>("admin_list_governance_unit_types", {
      p_query: null,
      p_active_only: true,
    }),
    regulationsRpc<ListResponse>("admin_list_topic_categories", {
      p_query: null,
      p_is_active: true,
      p_limit: 200,
      p_offset: 0,
    }),
    regulationsRpc<{
      users: ReferenceOption[];
      governance_levels: Array<{ value: string; label: string }>;
    }>("get_policy_form_options"),
  ]);
  return {
    units: units.items ?? [],
    classes: classes.items ?? [],
    unitTypes: unitTypes.items ?? [],
    categories: categories.items ?? [],
    users: options.users ?? [],
    governanceLevels: options.governance_levels ?? [],
  };
}
