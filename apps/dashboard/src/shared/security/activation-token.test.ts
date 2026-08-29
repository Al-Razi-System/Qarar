import { describe, expect, it } from "vitest";
import { issueActivationToken, verifyActivationToken } from "./activation-token";

const secret="test-activation-secret-with-more-than-32-characters";
describe("activation tokens",()=>{
 it("accepts an intact signed token before expiry",()=>{const token=issueActivationToken(secret,new Date("2030-01-02T00:00:00Z"));expect(verifyActivationToken(token,secret,new Date("2030-01-01T00:00:00Z"))?.tokenHash).toMatch(/^[0-9a-f]{64}$/);});
 it("rejects a modified token",()=>{const token=issueActivationToken(secret,new Date("2030-01-02T00:00:00Z"));const replacement=token.endsWith("A")?"B":"A";expect(verifyActivationToken(`${token.slice(0,-1)}${replacement}`,secret,new Date("2030-01-01T00:00:00Z"))).toBeNull();});
 it("rejects an expired token",()=>{const token=issueActivationToken(secret,new Date("2030-01-01T00:00:00Z"));expect(verifyActivationToken(token,secret,new Date("2030-01-01T00:00:01Z"))).toBeNull();});
});
