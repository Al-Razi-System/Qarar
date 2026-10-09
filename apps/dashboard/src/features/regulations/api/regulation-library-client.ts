import type { LibraryDetail } from "../model/regulation-library";

export class LibraryError extends Error {
  constructor(message: string, public readonly code?: string, public readonly requestId?: string) { super(message); }
}

export async function libraryRpc<T>(contract: string, params: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/admin/regulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
  } catch { throw new LibraryError("تعذر الاتصال. بياناتك محفوظة في النموذج؛ أعد المحاولة."); }
  const envelope = await response.json().catch(() => null);
  if (!response.ok) throw new LibraryError(envelope?.error?.message || "تعذر تنفيذ العملية. أعد المحاولة.", envelope?.error?.code, envelope?.error?.requestId);
  if (!envelope || !Object.hasOwn(envelope, "data")) throw new LibraryError("تعذر التحقق من نتيجة الحفظ. أعد المحاولة بنفس البيانات.");
  return envelope.data as T;
}

export function verifyLibraryDetail(value: LibraryDetail): LibraryDetail {
  if (!value?.policy?.id || !Array.isArray(value.policy.versions) || !value.revision || !value.capabilities || !Array.isArray(value.editable_version_ids) || !Array.isArray(value.approvable_version_ids) || (value.direct_activation_version_ids !== undefined && !Array.isArray(value.direct_activation_version_ids)) || (value.item_action_version_ids !== undefined && !Array.isArray(value.item_action_version_ids)) || (value.item_publications !== undefined && (!value.item_publications || typeof value.item_publications !== "object" || Array.isArray(value.item_publications)))) {
    throw new LibraryError("تعذر التحقق من نتيجة العملية. أعد تحميل اللائحة.");
  }
  return value;
}
