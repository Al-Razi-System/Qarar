import {afterEach,expect,it,vi} from "vitest";
const {rpc,session}=vi.hoisted(()=>({rpc:vi.fn(),session:vi.fn()}));
vi.mock("@/shared/api/qarar-server",()=>({qararRpc:rpc,qararRpcV2:rpc,requireQararSession:session,getQararEnv:async()=>({SUPABASE_URL:"http://storage.test",SERVICE_ROLE_KEY:"private-key"})}));
vi.mock("@/shared/security/upload-malware-scan",()=>({scanUploadForMalware:async()=>({state:"clean"})}));
vi.mock("@/shared/security/upload-security",async importOriginal=>({...await importOriginal<typeof import("@/shared/security/upload-security")>(),inspectMultipartRequestSize:async()=>"ok"}));
import {GET,POST} from "./route";
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it("uses the chair's contextual server download permission independently of the participant policy",async()=>{
 rpc.mockResolvedValue([{id,file_url:`https://example.test/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}`,mime_type:"application/pdf",download_allowed:false,viewer_download_allowed:true}]);
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("pdf")));
 const response=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}&disposition=attachment`));
 expect(response.status).toBe(200);expect(response.headers.get("Content-Disposition")).toBe("attachment");
});
const id="79000000-0000-0000-0000-000000000011";
it("does not download storage when contextual authorization fails",async()=>{
 rpc.mockResolvedValue({ok:false,error_code:"MODEL_PERMISSION_DENIED",message_ar:"المرفق غير متاح",trace_id:"trace"});const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 const result=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}`));expect(result.status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();
});
it("replays a registered upload without a duplicate storage mutation",async()=>{
 rpc.mockResolvedValue({ok:true,data:{files:[{id}]}});const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);const form=new FormData();form.set("file",new File(["content"],"proof.pdf",{type:"application/pdf"}));form.set("submissionId",id);form.set("fileId",id);form.set("input","{}");
 const request=new Request("http://localhost/api/admin/typed-topics/files",{method:"POST",body:form});vi.spyOn(request,"formData").mockResolvedValue(form);
 const response=await POST(request);expect(response.status).toBe(200);expect((await response.json()).data.idempotent_replay).toBe(true);expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects cross-origin file mutations before authentication or storage",async()=>{
 vi.stubEnv("APP_ORIGIN","https://devqarar.prideidea.com");const response=await POST(new Request("http://localhost/api/admin/typed-topics/files",{method:"POST",headers:{Origin:"https://attacker.test"}}));expect(response.status).toBe(403);expect(session).not.toHaveBeenCalled();
});
it("denies a file absent from the authorized meeting agenda",async()=>{
 rpc.mockResolvedValue([]);const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 expect((await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}`))).status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();
});
it("preserves a safe permission denial from meeting authorization",async()=>{
 rpc.mockRejectedValue(Object.assign(new Error("private database cause"),{status:403,code:"42501"}));const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 const response=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}`));expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain("private database cause");expect(fetchMock).not.toHaveBeenCalled();
});
it("downloads an agenda attachment after contextual meeting authorization",async()=>{
 rpc.mockResolvedValue([{id,file_url:`https://example.test/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}`,mime_type:"application/pdf"}]);const fetchMock=vi.fn().mockResolvedValue(new Response("pdf"));vi.stubGlobal("fetch",fetchMock);
 const response=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}&disposition=inline`));expect(response.status).toBe(200);expect(response.headers.get("Content-Disposition")).toBe("inline");expect(rpc).toHaveBeenCalledWith("list_meeting_topic_attachments",{p_meeting_id:id});expect(fetchMock.mock.calls[0][0]).toContain(`topic-preparations/${id}/${id}.pdf`);
});
it("refuses a download through the meeting when the chair withheld it, and still shows the file inline",async()=>{
 rpc.mockResolvedValue([{id,file_url:`https://example.test/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}`,mime_type:"application/pdf",download_allowed:false}]);const fetchMock=vi.fn().mockResolvedValue(new Response("pdf"));vi.stubGlobal("fetch",fetchMock);
 const download=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}&disposition=attachment`));expect(download.status).toBe(403);expect((await download.json()).error.message).toContain("منع رئيس المجلس");expect(fetchMock).not.toHaveBeenCalled();
 const shown=await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}&disposition=inline`));expect(shown.status).toBe(200);expect(shown.headers.get("Content-Disposition")).toBe("inline");
});
it("refuses an inline request that would fall back to a download when the chair withheld it",async()=>{
 rpc.mockResolvedValue([{id,file_url:`https://example.test/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}`,mime_type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",download_allowed:false}]);const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
 expect((await GET(new Request(`http://localhost/api/admin/typed-topics/files?submissionId=${id}&fileId=${id}&meetingId=${id}&disposition=inline`))).status).toBe(403);expect(fetchMock).not.toHaveBeenCalled();
});
