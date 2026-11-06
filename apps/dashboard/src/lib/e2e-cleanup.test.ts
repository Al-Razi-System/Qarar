import { describe, expect, it, vi } from "vitest";
import { closeE2EContexts } from "./e2e-cleanup";
describe("E2E cleanup preserves the real failure", () => {
  it("closes every context without masking a primary test error", async () => {
    const original = new Error("original failing action");
    const one = { close: vi.fn().mockRejectedValue(new Error("browser already closed")) };
    const two = { close: vi.fn().mockResolvedValue(undefined) };
    await expect(closeE2EContexts([one, two], { error: original })).rejects.toBe(original);
    expect(one.close).toHaveBeenCalledOnce(); expect(two.close).toHaveBeenCalledOnce();
  });
  it("does not hide cleanup errors after an otherwise successful test", async () => {
    const cleanup = new Error("cleanup failed");
    await expect(closeE2EContexts([{ close: async () => { throw cleanup; } }])).rejects.toBe(cleanup);
  });
  it("completes successful cleanup", async () => {
    await expect(closeE2EContexts([{ close: async () => {} }])).resolves.toBeUndefined();
  });
});
