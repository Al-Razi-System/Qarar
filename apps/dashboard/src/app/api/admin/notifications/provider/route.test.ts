import { afterEach, expect, it, vi } from "vitest";
const {rpc,client}=vi.hoisted(()=>({rpc:vi.fn(),client:{status:vi.fn(),start:vi.fn(),stop:vi.fn(),unlink:vi.fn(),qr:vi.fn(),sendTest:vi.fn()}}));
vi.mock("@/shared/api/qarar-server",()=>({qararRpc:rpc}));
vi.mock("@/shared/security/request-guards",()=>({rejectUntrustedMutation:()=>null}));
vi.mock("@/features/notifications/server/openwa-admin",async()=>{const actual=await vi.importActual<typeof import("@/features/notifications/server/openwa-admin")>("@/features/notifications/server/openwa-admin");return {...actual,getOpenWaAdminClient:vi.fn(async()=>client),getOpenWaProviderStatus:vi.fn(async()=>({configured:true,reachable:true,session:null,credential:null}))};});
import { GET,POST } from "./route";
afterEach(()=>vi.resetAllMocks());
const post=(body:unknown)=>new Request("http://localhost/api/admin/notifications/provider",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

it("denies provider metadata to non system administrators",async()=>{rpc.mockResolvedValue({is_system_admin:false});expect((await GET()).status).toBe(403);});
it("records a successful test before and after provider IO",async()=>{rpc.mockResolvedValueOnce({is_system_admin:true}).mockResolvedValueOnce({delivery_id:"d1",completion_token:"t1",destination:"+967778781778"}).mockResolvedValueOnce({delivery_id:"d1",status:"accepted",provider_message_id:"m1"});client.sendTest.mockResolvedValue({providerCode:"openwa",providerMessageId:"m1"});expect((await POST(post({action:"test",destination:"+967778781778"}))).status).toBe(200);expect(rpc.mock.calls.map(call=>call[0])).toEqual(["get_current_user_access_context","admin_begin_notification_test","admin_finish_notification_test"]);});
it("records provider failure and returns safe Arabic copy",async()=>{rpc.mockResolvedValueOnce({is_system_admin:true}).mockResolvedValueOnce({delivery_id:"d1",completion_token:"t1",destination:"+967778781778"}).mockResolvedValueOnce({delivery_id:"d1",status:"failed"});client.sendTest.mockRejectedValue(new Error("secret upstream body"));const response=await POST(post({action:"test",destination:"+967778781778"}));expect(response.status).toBe(502);expect(await response.text()).not.toContain("secret upstream body");expect(rpc).toHaveBeenLastCalledWith("admin_finish_notification_test",expect.objectContaining({p_succeeded:false}));});
