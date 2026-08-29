import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  if (process.env.QARAR_SSO_ENABLED !== "true") {
    return NextResponse.json({ message: "الدخول الموحد غير متاح في هذا الإصدار." }, { status: 404 });
  }

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const body = parsedBody.value;
    const { action, ...params } = body;

    let result;
    if (action === "upsert_provider") {
      result = await qararRpc("admin_upsert_sso_provider", {
        p_provider_name: params.provider_name,
        p_supabase_sso_provider_id: params.supabase_sso_provider_id || null,
        p_metadata_url: params.metadata_url || null,
        p_entity_id: params.entity_id || null,
        p_attribute_mapping: params.attribute_mapping || { groups: "groups" },
        p_default_role_id: params.default_role_id || null,
        p_default_governance_unit_id: params.default_governance_unit_id || null,
        p_provisioning_mode: params.provisioning_mode || "invited_only",
        p_status: params.status || "active",
      });
    } else if (action === "upsert_domain") {
      if (params.verified === true) {
        return NextResponse.json(
          { message: "لا يمكن اعتماد ملكية النطاق من المتصفح. يجب أن يكتمل التحقق عبر خدمة موثوقة." },
          { status: 400 },
        );
      }

      result = await qararRpc("admin_upsert_sso_domain", {
        p_sso_provider_id: params.sso_provider_id,
        p_domain: params.domain,
        // Verification is a server-controlled security event. New domains are
        // deliberately registered as pending; this route never forwards a
        // client-provided verification claim.
        p_verified: false,
      });
    } else if (action === "upsert_group_mapping") {
      result = await qararRpc("admin_upsert_sso_group_mapping", {
        p_provider_id: params.provider_id,
        p_external_group: params.external_group,
        p_role_id: params.role_id,
        p_governance_unit_id: params.governance_unit_id,
        p_membership_title: params.membership_title || "عضو",
        p_is_active: params.is_active ?? true,
      });
    } else {
      return NextResponse.json({ message: "الإجراء غير مدعوم." }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ إعدادات الدخول الموحد.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
