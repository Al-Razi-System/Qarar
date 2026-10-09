import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/shared/api/qarar-server",()=>({qararRpcV2:vi.fn()}));
vi.mock("@/shared/security/request-guards",()=>({rejectUntrustedMutation:vi.fn(()=>null)}));
vi.mock("@/shared/observability/logger",()=>({logEvent:vi.fn()}));
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { GET, PUT } from "./route";
const user="85000000-0000-0000-0000-000000000003";
const context={params:Promise.resolve({userId:user})};
beforeEach(()=>vi.resetAllMocks());
it("loads only the user from the route",async()=>{
 vi.mocked(qararRpcV2).mockResolvedValue({memberships:[]});
 expect((await GET(new Request("http://localhost"),context)).status).toBe(200);
 expect(qararRpcV2).toHaveBeenCalledWith("get_user_roles_v2",{p_user_id:user});
});
it("cannot replace the target using a body UUID",async()=>{
 vi.mocked(qararRpcV2).mockResolvedValue({saved:true});
 const response=await PUT(new Request("http://localhost",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:"other",action:"disable",membershipId:user,expectedUpdatedAt:"2026-10-09T00:00:00Z"})}),context);
 expect(response.status).toBe(200);
 expect(qararRpcV2).toHaveBeenCalledWith("manage_user_role_v2",expect.objectContaining({p_user_id:user,p_action:"disable"}));
});
it("rejects invalid actions before RPC",async()=>{
 const r=await PUT(new Request("http://localhost",{method:"PUT",body:JSON.stringify({action:"make_system_admin"})}),context);
 expect(r.status).toBe(400);expect(qararRpcV2).not.toHaveBeenCalled();
});
it("maps stale saves to conflict and never exposes SQL",async()=>{
 vi.mocked(qararRpcV2).mockRejectedValue(Object.assign(new Error("internal SQL"),{code:"40001"}));
 const r=await PUT(new Request("http://localhost",{method:"PUT",body:JSON.stringify({action:"disable",membershipId:user,expectedUpdatedAt:"2026-10-09T00:00:00Z"})}),context);
 expect(r.status).toBe(409); expect(await r.json()).toEqual(expect.objectContaining({traceId:expect.any(String),message:expect.not.stringContaining("SQL")}));
});
