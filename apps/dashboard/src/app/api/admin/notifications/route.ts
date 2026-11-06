import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { isJsonObject, readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function POST(request:Request){
 const originError=rejectUntrustedMutation(request);if(originError)return originError;
 const parsed=await readJsonObject(request);if(!parsed.ok)return parsed.response;
 const {contract,params}=parsed.value;
 if(contract!=="admin_save_notification_settings"||!isJsonObject(params))return NextResponse.json({error:{message:"عملية غير مدعومة."}},{status:400});
 try{return NextResponse.json({data:await qararRpc(contract,params)});}catch(error){const safe=safeAdminError(error,"تعذر حفظ إعدادات الإشعارات.",500);return NextResponse.json({error:{code:safe.code,message:safe.message}},{status:safe.status});}
}
