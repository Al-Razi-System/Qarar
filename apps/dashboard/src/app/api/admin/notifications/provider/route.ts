import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { getOpenWaAdminClient, getOpenWaProviderStatus, OpenWaAdminError } from "@/features/notifications/server/openwa-admin";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

async function requireSystemAdmin(){const access=await qararRpc<{is_system_admin?:boolean}>("get_current_user_access_context",{});if(!access.is_system_admin)throw new OpenWaAdminError("FORBIDDEN","هذه العملية متاحة لمسؤول النظام فقط.",403);}
const responseError=(error:unknown,fallback="تعذر تنفيذ عملية واتساب.")=>{const known=error instanceof OpenWaAdminError?error:null;return NextResponse.json({error:{code:known?.code??"PROVIDER_OPERATION_FAILED",message:known?.message??fallback}},{status:known?.httpStatus&&known.httpStatus>=400&&known.httpStatus<=599?known.httpStatus:502});};

export async function GET(){try{await requireSystemAdmin();return NextResponse.json({data:await getOpenWaProviderStatus()});}catch(error){return responseError(error,"تعذر تحميل حالة اتصال واتساب.");}}

export async function POST(request:Request){
  const rejected=rejectUntrustedMutation(request);if(rejected)return rejected;
  const parsed=await readJsonObject(request);if(!parsed.ok)return parsed.response;
  const action=parsed.value.action;
  if(typeof action!=="string")return NextResponse.json({error:{message:"حدد العملية المطلوبة."}},{status:400});
  try{
    await requireSystemAdmin();
    const client=await getOpenWaAdminClient();if(!client)throw new OpenWaAdminError("OPENWA_NOT_CONFIGURED","لم تكتمل إعدادات اتصال خدمة واتساب على الخادم.",503);
    if(action==="status")return NextResponse.json({data:await client.status()});
    if(action==="start")return NextResponse.json({data:await client.start()});
    if(action==="stop")return NextResponse.json({data:await client.stop()});
    if(action==="unlink")return NextResponse.json({data:await client.unlink()});
    if(action==="qr")return NextResponse.json({data:await client.qr()});
    if(action!=="test"||typeof parsed.value.destination!=="string")return NextResponse.json({error:{message:"عملية غير مدعومة."}},{status:400});

    const begun=await qararRpc<{delivery_id:string;completion_token:string;destination:string}>("admin_begin_notification_test",{p_destination:parsed.value.destination});
    try{
      const sent=await client.sendTest(begun.destination,begun.delivery_id);
      const finished=await qararRpc<{delivery_id:string;status:string;provider_message_id:string|null}>("admin_finish_notification_test",{p_delivery_id:begun.delivery_id,p_completion_token:begun.completion_token,p_succeeded:true,p_provider_code:sent.providerCode,p_provider_message_id:sent.providerMessageId,p_error_code:null,p_http_status:200});
      return NextResponse.json({data:{...finished,destination:begun.destination,provider_code:sent.providerCode,provider_message_id:sent.providerMessageId,created_at:new Date().toISOString()}});
    }catch(error){
      const providerError=error instanceof OpenWaAdminError?error:new OpenWaAdminError("OPENWA_SEND_FAILED","تعذر إرسال رسالة الاختبار.");
      await qararRpc("admin_finish_notification_test",{p_delivery_id:begun.delivery_id,p_completion_token:begun.completion_token,p_succeeded:false,p_provider_code:"openwa",p_provider_message_id:null,p_error_code:providerError.code,p_http_status:providerError.httpStatus});
      throw providerError;
    }
  }catch(error){return responseError(error);}
}
