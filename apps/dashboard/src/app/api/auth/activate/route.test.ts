import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueActivationToken } from "@/shared/security/activation-token";

const rpc=vi.fn();const update=vi.fn();
vi.mock("@/shared/api/qarar-service",()=>({qararServiceRpc:(...args:unknown[])=>rpc(...args),updateQararAuthUser:(...args:unknown[])=>update(...args)}));
import { GET, POST } from "./route";

const secret="test-activation-secret-with-more-than-32-characters";
const token=()=>issueActivationToken(secret,new Date(Date.now()+3600000));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("QARAR_ACTIVATION_TOKEN_SECRET",secret);vi.stubEnv("APP_ORIGIN","http://localhost:3000");vi.stubEnv("NODE_ENV","test");});
describe("account activation route",()=>{
 it("previews a valid invitation without exposing the token",async()=>{rpc.mockResolvedValue({email:"user@example.test",full_name_ar:"مستخدم"});const response=await GET(new Request("http://localhost:3000/api/auth/activate",{headers:{"x-qarar-activation-token":token()}}));expect(response.status).toBe(200);expect(await response.json()).toEqual({invitation:{email:"user@example.test",full_name_ar:"مستخدم"}});});
 it("rejects a tampered signed link before database access",async()=>{const value=token();const replacement=value.endsWith("A")?"B":"A";const response=await GET(new Request("http://localhost/api/auth/activate",{headers:{"x-qarar-activation-token":`${value.slice(0,-1)}${replacement}`}}));expect(response.status).toBe(410);expect(rpc).not.toHaveBeenCalled();});
 it("rejects an already used invitation",async()=>{rpc.mockRejectedValue(new Error("already used"));const response=await GET(new Request("http://localhost/api/auth/activate",{headers:{"x-qarar-activation-token":token()}}));expect(response.status).toBe(410);});
 it("claims, changes the Auth password, and consumes the invitation",async()=>{rpc.mockResolvedValueOnce({invitation_id:"inv",auth_user_id:"user",email:"u@test"}).mockResolvedValueOnce({activated:true});update.mockResolvedValue(undefined);const response=await POST(new Request("http://localhost:3000/api/auth/activate",{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json","x-qarar-activation-token":token()},body:JSON.stringify({password:"StrongPassword1!"})}));expect(response.status).toBe(200);expect(update).toHaveBeenCalledWith("user","StrongPassword1!");expect(rpc.mock.calls[1][0]).toBe("service_finish_activation");});
});
