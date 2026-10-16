import { NextResponse } from "next/server";
import { getQararEnv, qararRpc, qararRpcV2, requireQararSession } from "@/shared/api/qarar-server";
import { MEETING_DOWNLOAD_WITHHELD } from "@/shared/security/meeting-downloads";
import { getDashboardOrigin, rejectUntrustedMutation } from "@/shared/security/request-guards";
import { detectAllowedUploadMime, extensionForUploadMime, inspectMultipartRequestSize, MAX_UPLOAD_BYTES } from "@/shared/security/upload-security";
import { scanUploadForMalware } from "@/shared/security/upload-malware-scan";
import { safeAdminError } from "@/shared/security/admin-error";
export const runtime="nodejs";
type Envelope<T>={ok:boolean;data:T;message_ar?:string;error_code?:string;trace_id:string};
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function rejected(v:Envelope<unknown>){return NextResponse.json({error:{message:v.message_ar??"تعذر تجهيز المرفق.",traceId:v.trace_id}},{status:v.error_code==="MODEL_PERMISSION_DENIED"?403:v.error_code==="MODEL_SERVER_FAILURE"?500:400});}
function failure(error:unknown){const traceId=crypto.randomUUID();console.error("typed-topic-file",{traceId,cause:error});const safe=safeAdminError(error,"تعذر إتمام عملية الملف. أعد التحقق من الطلب.",502);return NextResponse.json({error:{message:safe.message,traceId}},{status:safe.status});}
export async function POST(request:Request){
 const guard=rejectUntrustedMutation(request);if(guard)return guard;
 try{
  await requireQararSession();if(await inspectMultipartRequestSize(request)!=="ok")return NextResponse.json({error:{message:"طلب الرفع غير صالح أو يتجاوز الحجم المسموح."}},{status:413});
  const form=await request.formData();const file=form.get("file"),submissionId=String(form.get("submissionId")??""),fileId=String(form.get("fileId")??"");
  if(!(file instanceof File)||!uuid(submissionId)||!uuid(fileId)||file.size<1||file.size>MAX_UPLOAD_BYTES)return NextResponse.json({error:{message:"اختر ملفًا صالحًا لا يتجاوز 25 ميجابايت."}},{status:400});
  const inputText=String(form.get("input")??"");let input:unknown;try{input=JSON.parse(inputText);}catch{return NextResponse.json({error:{message:"بيانات تجهيز الطلب غير صالحة."}},{status:400});}
  const prepared=await qararRpcV2<Envelope<{files:{id:string}[]}>>("prepare_typed_submission_v2",{p_request_id:submissionId,p_input:input});if(!prepared.ok)return rejected(prepared);
  // Replay a confirmed receipt without another storage write (including a lost
  // upload response). The final command verifies all receipts transactionally.
  if(prepared.data.files.some(f=>f.id===fileId))return NextResponse.json({data:{id:fileId,idempotent_replay:true}});
  const mime=await detectAllowedUploadMime(file);if(!mime)return NextResponse.json({error:{message:"الملفات المسموحة: PDF وPNG وJPEG وDOCX أصلية."}},{status:415});
  const scan=await scanUploadForMalware(file);if(scan.state==="infected"||scan.state==="unavailable")return NextResponse.json({error:{message:scan.state==="infected"?"رُفض الملف لأسباب أمنية.":"فحص أمان الملفات غير متاح؛ لم يُخزن الملف."}},{status:scan.state==="infected"?422:503});
  const env=await getQararEnv(),origin=getDashboardOrigin();if(!env.SERVICE_ROLE_KEY||!origin)throw new Error("Storage configuration missing");
  const path=`topic-preparations/${submissionId}/${fileId}${extensionForUploadMime(mime)}`;
  const stored=await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${path}`,{method:"POST",headers:{apikey:env.SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SERVICE_ROLE_KEY}`,"Content-Type":mime,"x-upsert":"false"},body:await file.arrayBuffer()});
  // A previous write may have succeeded before its receipt. Never overwrite it;
  // register verifies the actual storage object's size and mime in the database.
  if(!stored.ok&&stored.status!==409){const reply=await stored.json().catch(()=>null);if(reply?.statusCode!=="409")throw new Error(`Storage write failed: ${stored.status}`);}
  const url=new URL("/api/admin/typed-topics/files",origin);url.searchParams.set("submissionId",submissionId);url.searchParams.set("fileId",fileId);
  const evidence=form.get("evidenceIndex");const registered=await qararRpcV2<Envelope<unknown>>("register_typed_submission_file_v2",{p_request_id:submissionId,p_file_id:fileId,p_name:file.name,p_path:path,p_mime:mime,p_size:file.size,p_url:url.toString(),p_evidence_index:evidence===null?null:Number(evidence)});
  return registered.ok?NextResponse.json({data:registered.data}):rejected(registered);
 }catch(error){return failure(error);}
}
export async function GET(request:Request){try{
 await requireQararSession();const query=new URL(request.url).searchParams,id=query.get("submissionId")??"",file=query.get("fileId")??"";
 if(!uuid(id)||!uuid(file))return NextResponse.json({error:{message:"المرفق غير صالح."}},{status:400});
 let details:{path:string;mime_type:string};const meeting=query.get("meetingId");let downloadWithheld=false;
 if(meeting){
  if(!uuid(meeting))return NextResponse.json({error:{message:"الاجتماع غير صالح."}},{status:400});
  const attachments=await qararRpc<{id:string;file_url:string;mime_type:string;download_allowed?:boolean}[]>("list_meeting_topic_attachments",{p_meeting_id:meeting});
  const found=attachments.find(a=>{const stored=new URL(a.file_url);return a.id===file&&stored.pathname==="/api/admin/typed-topics/files"&&stored.searchParams.get("submissionId")===id&&stored.searchParams.get("fileId")===file;});
  if(!found||!["application/pdf","image/png","image/jpeg","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(found.mime_type))return NextResponse.json({error:{message:"المرفق غير مرتبط بجدول أعمال هذا الاجتماع."}},{status:403});
  details={path:`topic-preparations/${id}/${file}${extensionForUploadMime(found.mime_type as Parameters<typeof extensionForUploadMime>[0])}`,mime_type:found.mime_type};downloadWithheld=found.download_allowed===false;
 }else{const result=await qararRpcV2<Envelope<{path:string;mime_type:string}>>("get_typed_submission_file_v2",{p_request_id:id,p_file_id:file});if(!result.ok)return rejected(result);details=result.data;}
 // The chair may withhold downloads for an agenda item: through the meeting, its files are then shown inline only.
 const inline=query.get("disposition")==="inline"&&(details.mime_type==="application/pdf"||details.mime_type.startsWith("image/"));
 if(downloadWithheld&&!inline)return NextResponse.json({error:{message:MEETING_DOWNLOAD_WITHHELD}},{status:403});
 const env=await getQararEnv();const response=await fetch(`${env.SUPABASE_URL}/storage/v1/object/qarar-evidence/${details.path}`,{headers:{apikey:env.SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SERVICE_ROLE_KEY}`},cache:"no-store"});
 if(!response.ok||!response.body)return NextResponse.json({error:{message:"المرفق غير موجود."}},{status:404});
 return new NextResponse(response.body,{headers:{"Content-Type":details.mime_type,"Content-Disposition":inline?"inline":"attachment","X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store"}});
 }catch(error){return failure(error);}}
