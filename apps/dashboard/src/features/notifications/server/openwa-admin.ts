import "server-only";

import { readFile } from "node:fs/promises";

type FetchLike = typeof fetch;
type Session = { id:string;name:string;status:string;phone:string|null;pushName:string|null;connectedAt:string|null;lastActive:string|null };
type Credential = { name:string;keyPrefix:string;role:string;isActive:boolean;expiresAt?:string|null;lastUsedAt?:string|null;usageCount?:number };
export type OpenWaProviderStatus = { configured:boolean;reachable:boolean;session:Session|null;credential:Credential|null;message?:string };

export class OpenWaAdminError extends Error {
  constructor(public readonly code:string,message:string,public readonly httpStatus:number|null=null){super(message);}
}

export class OpenWaAdminClient {
  private readonly baseUrl:string;
  private readonly apiKey:string;
  private readonly sessionName:string;
  private sessionId?:string;
  private readonly fetchImpl:FetchLike;

  constructor({baseUrl,apiKey,sessionName,sessionId,fetchImpl=fetch}:{baseUrl:string;apiKey:string;sessionName:string;sessionId?:string;fetchImpl?:FetchLike}){
    const parsed=new URL(baseUrl);
    if(!["http:","https:"].includes(parsed.protocol))throw new TypeError("OpenWA URL must use HTTP or HTTPS");
    if(!apiKey||!sessionName)throw new TypeError("OpenWA credentials are required");
    this.baseUrl=parsed.toString().replace(/\/$/,"");this.apiKey=apiKey;this.sessionName=sessionName;this.sessionId=sessionId;this.fetchImpl=fetchImpl;
  }

  private async request<T>(path:string,init:RequestInit={}):Promise<T>{
    let response:Response;
    try{response=await this.fetchImpl(`${this.baseUrl}/api${path}`,{...init,headers:{"x-api-key":this.apiKey,...(init.body?{"content-type":"application/json"}:{}),...init.headers},signal:AbortSignal.timeout(45_000)});}
    catch(error){
      if(error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError")){
        throw new OpenWaAdminError("OPENWA_TIMEOUT_AMBIGUOUS","انتهت مهلة مزود واتساب؛ قد تكون الرسالة وصلت، فتحقق قبل إعادة الإرسال.");
      }
      throw new OpenWaAdminError("OPENWA_UNREACHABLE","تعذر الاتصال بخدمة واتساب.");
    }
    if(!response.ok)throw new OpenWaAdminError(`OPENWA_HTTP_${response.status}`,response.status===401||response.status===403?"رفضت خدمة واتساب بيانات الاعتماد.":"تعذر تنفيذ العملية لدى خدمة واتساب.",response.status);
    if(response.status===204)return null as T;
    try{return await response.json() as T;}catch{throw new OpenWaAdminError("OPENWA_INVALID_RESPONSE","أعادت خدمة واتساب استجابة غير صالحة.",response.status);}
  }

  private async resolveSession():Promise<Session>{
    const sessions=await this.request<Session[]>("/sessions");
    const session=(this.sessionId?sessions.find(item=>item.id===this.sessionId):null)??sessions.find(item=>item.name===this.sessionName);
    if(!session)throw new OpenWaAdminError("OPENWA_SESSION_MISSING","جلسة واتساب المطلوبة غير موجودة.",404);
    this.sessionId=session.id;return session;
  }

  async status():Promise<OpenWaProviderStatus>{
    const session=await this.resolveSession();
    let credential:Credential|null=null;
    try{const keys=await this.request<Credential[]>("/auth/api-keys");credential=keys.find(key=>key.isActive)??keys[0]??null;}catch(error){if(!(error instanceof OpenWaAdminError)||![401,403].includes(error.httpStatus??0))throw error;}
    return {configured:true,reachable:true,session,credential};
  }

  async start(){const session=await this.resolveSession();return this.request<Session>(`/sessions/${encodeURIComponent(session.id)}/start`,{method:"POST"});}
  async stop(){const session=await this.resolveSession();return this.request<Session>(`/sessions/${encodeURIComponent(session.id)}/stop`,{method:"POST"});}
  async unlink(){const session=await this.resolveSession();return this.request<Session>(`/sessions/${encodeURIComponent(session.id)}/logout`,{method:"POST"});}
  async qr(){const session=await this.resolveSession();return this.request<{qrCode:string;status:string}>(`/sessions/${encodeURIComponent(session.id)}/qr`);}

  async sendTest(destination:string,deliveryId:string){
    const normalized=destination.replace(/[^0-9+]/g,"");
    if(!/^\+[1-9][0-9]{7,14}$/.test(normalized))throw new OpenWaAdminError("INVALID_DESTINATION","أدخل رقمًا دوليًا صحيحًا يبدأ بعلامة +.");
    const session=this.sessionId?{id:this.sessionId}:await this.resolveSession();
    const text=["*قرار | اختبار اتصال واتساب*","","تم إرسال هذه الرسالة للتحقق من جاهزية قناة الإشعارات في نظام قرار.","",`*مرجع الاختبار:* ${deliveryId.slice(0,8).toUpperCase()}`,"*النتيجة:* الاتصال بالقناة يعمل بنجاح","","_نظام قرار - جامعة الرازي_"].join("\n");
    const result=await this.request<{messageId:string}>(`/sessions/${encodeURIComponent(session.id)}/messages/send-text`,{method:"POST",headers:{"x-qarar-delivery-id":deliveryId},body:JSON.stringify({chatId:`${normalized.slice(1)}@c.us`,text})});
    if(!result.messageId)throw new OpenWaAdminError("OPENWA_MISSING_MESSAGE_ID","لم تُعد خدمة واتساب مرجع الرسالة.");
    return {providerCode:"openwa",providerMessageId:result.messageId};
  }
}

export async function getOpenWaAdminClient(){
  const baseUrl=process.env.OPENWA_ADMIN_BASE_URL?.trim();
  const sessionName=process.env.OPENWA_SESSION_NAME?.trim()||"qarar-test";
  let apiKey=process.env.OPENWA_API_KEY?.trim();
  if(!apiKey&&process.env.OPENWA_API_KEY_FILE)apiKey=(await readFile(process.env.OPENWA_API_KEY_FILE,"utf8")).trim();
  if(!baseUrl||!apiKey)return null;
  return new OpenWaAdminClient({baseUrl,apiKey,sessionName,sessionId:process.env.OPENWA_SESSION_ID?.trim()||undefined});
}

export async function getOpenWaProviderStatus():Promise<OpenWaProviderStatus>{
  try{const client=await getOpenWaAdminClient();if(!client)return {configured:false,reachable:false,session:null,credential:null,message:"لم تكتمل إعدادات اتصال خدمة واتساب على الخادم."};return await client.status();}
  catch(error){return {configured:true,reachable:false,session:null,credential:null,message:error instanceof OpenWaAdminError?error.message:"تعذر التحقق من خدمة واتساب."};}
}
