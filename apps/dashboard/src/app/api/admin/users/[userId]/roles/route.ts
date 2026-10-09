import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { logEvent } from "@/shared/observability/logger";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";
type Context = { params: Promise<{ userId: string }> };
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function failure(error: unknown) {
 const traceId=crypto.randomUUID(); const safe=safeAdminError(error,"تعذر تنفيذ إدارة الأدوار. أعد تحميل القائمة للتحقق.",500);
 const status=safe.code==="40001"?409:safe.code==="42501"?403:safe.code==="P0002"?404:["22023","23514","23P01","23505"].includes(safe.code)?400:safe.status;
 logEvent("warn","users.roles.failed",{traceId,code:safe.code,cause:error instanceof Error?error.message:"unknown"});
 return NextResponse.json({message:safe.message,traceId},{status,headers:{"Cache-Control":"no-store"}});
}
export async function GET(_request:Request,context:Context){
 try{const {userId}=await context.params;if(!uuid(userId))return NextResponse.json({message:"المستخدم غير صالح."},{status:400});
 return NextResponse.json(await qararRpcV2("get_user_roles_v2",{p_user_id:userId}),{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
export async function PUT(request:Request,context:Context){
 const rejected=rejectUntrustedMutation(request);if(rejected)return rejected;
 try{const {userId}=await context.params;const parsed=await readJsonObject(request,{maxBytes:8192});if(!parsed.ok)return parsed.response;
 const b=parsed.value;const adding=b.action==="add",editing=b.action==="update";
 const validDate=(value:unknown)=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value));
 if(!uuid(userId)||!["add","update","disable","enable"].includes(String(b.action))||(!adding&&(!uuid(b.membershipId)||typeof b.expectedUpdatedAt!=="string"||!Number.isFinite(Date.parse(b.expectedUpdatedAt))))||((adding||editing)&&(!uuid(b.roleId)||!uuid(b.unitId)||(b.title!=null&&(typeof b.title!=="string"||b.title.length>500))||(b.startDate!=null&&!validDate(b.startDate))||(b.endDate!=null&&!validDate(b.endDate))))||(adding&&!uuid(b.requestId)))return NextResponse.json({message:"إعداد الدور غير صالح؛ راجع الدور والجهة والسريان."},{status:400});
 const result=await qararRpcV2("manage_user_role_v2",{p_user_id:userId,p_action:b.action,p_membership_id:adding?null:b.membershipId,p_expected_updated_at:adding?null:b.expectedUpdatedAt,...((adding||editing)?{p_role_id:b.roleId,p_unit_id:b.unitId,p_title:b.title??null,...(b.startDate?{p_start_date:b.startDate}:{}),p_end_date:b.endDate??null}:{}),p_request_id:adding?b.requestId:null});
 return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
