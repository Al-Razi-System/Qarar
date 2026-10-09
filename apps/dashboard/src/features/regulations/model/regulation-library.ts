import type { Policy, PolicyItem } from "./types";

export type LibraryCapabilities = { can_manage: boolean; can_approve: boolean };
export type LibraryList = { items: Policy[]; total: number; capabilities: LibraryCapabilities };
export type LibraryDetail = {
  policy: Policy;
  revision: string;
  capabilities: LibraryCapabilities;
  editable_version_ids: string[];
  approvable_version_ids: string[];
  direct_activation_version_ids?: string[];
  item_action_version_ids?: string[];
  item_publications?: Record<string, PolicyItem>;
  working_version_id?: string | null;
  published_version_id?: string | null;
  selected_version_id?: string | null;
  item_id?: string | null;
};
export type LibraryAction = "create" | "save_identity" | "begin_edit" | "save_item" | "remove_item" | "submit" | "approve" | "return" | "activate" | "set_status" | "publish" | "set_item_active" | "set_item_publication";
