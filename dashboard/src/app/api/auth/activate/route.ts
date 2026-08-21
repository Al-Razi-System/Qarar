import { NextResponse } from "next/server";
import { qararServiceRpc, updateQararAuthUser } from "@/shared/api/qarar-service";
import { activationClaimHash, verifyActivationToken } from "@/shared/security/activation-token";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const noStore = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" };
const tokenFrom = (request: Request) => request.headers.get("x-qarar-activation-token")?.trim() ?? "";

function tokenMetadata(request: Request) {
  const secret = process.env.QARAR_ACTIVATION_TOKEN_SECRET ?? "";
  try { return { secret, token: tokenFrom(request), verified: verifyActivationToken(tokenFrom(request), secret) }; }
  catch { return { secret, token: "", verified: null }; }
}

function invalidInvitation() {
  return NextResponse.json({ error: { code: "INVALID_INVITATION", message: "رابط التفعيل غير صالح أو انتهت صلاحيته أو استُخدم سابقًا." } }, { status: 410, headers: noStore });
}

export async function GET(request: Request) {
  const metadata = tokenMetadata(request);
  if (!metadata.verified) return invalidInvitation();
  try {
    const invitation = await qararServiceRpc<Record<string, unknown>>("service_preview_activation", {
      p_token_hash: metadata.verified.tokenHash,
    });
    return NextResponse.json({ invitation }, { headers: noStore });
  } catch { return invalidInvitation(); }
}

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  const metadata = tokenMetadata(request);
  if (!metadata.verified) return invalidInvitation();
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const password = typeof parsed.value.password === "string" ? parsed.value.password : "";
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return NextResponse.json({ error: { code: "WEAK_PASSWORD", message: "كلمة المرور لا تحقق متطلبات الأمان." } }, { status: 400, headers: noStore });
  }

  const claimHash = activationClaimHash(metadata.token, metadata.secret);
  let claim: { invitation_id: string; auth_user_id: string; email: string };
  try {
    claim = await qararServiceRpc("service_claim_activation", {
      p_token_hash: metadata.verified.tokenHash,
      p_claim_hash: claimHash,
    });
  } catch { return invalidInvitation(); }

  try {
    await updateQararAuthUser(claim.auth_user_id, password);
  } catch {
    await qararServiceRpc("service_finish_activation", {
      p_invitation_id: claim.invitation_id, p_auth_user_id: claim.auth_user_id,
      p_claim_hash: claimHash, p_success: false,
    }).catch(() => undefined);
    return NextResponse.json({ error: { code: "ACTIVATION_UNAVAILABLE", message: "تعذر تفعيل الحساب الآن. حاول مرة أخرى." } }, { status: 503, headers: noStore });
  }

  try {
    await qararServiceRpc("service_finish_activation", {
      p_invitation_id: claim.invitation_id, p_auth_user_id: claim.auth_user_id,
      p_claim_hash: claimHash, p_success: true,
    });
  } catch {
    return NextResponse.json({ error: { code: "ACTIVATION_PENDING", message: "تم تعيين كلمة المرور، لكن تعذر إكمال التفعيل. أعد المحاولة بنفس الرابط." } }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ activated: true }, { headers: noStore });
}
