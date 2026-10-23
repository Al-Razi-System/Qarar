import {afterEach,expect,it,vi} from "vitest";
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/shared/api/qarar-server",()=>({qararRpc:rpc}));
import {POST} from "./route";
afterEach(()=>vi.resetAllMocks());
const request=(contract:string,params:unknown={})=>new Request("http://localhost/api/admin/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contract,params})});
it("only dispatches the atomic notification settings command",async()=>{rpc.mockResolvedValue({version:2});expect((await POST(request("admin_save_notification_settings",{p_expected_version:1}))).status).toBe(200);expect(rpc).toHaveBeenCalledOnce();expect((await POST(request("service_claim_notification_deliveries"))).status).toBe(400);});
it("rejects malformed params",async()=>{expect((await POST(request("admin_save_notification_settings",[]))).status).toBe(400);expect(rpc).not.toHaveBeenCalled();});
