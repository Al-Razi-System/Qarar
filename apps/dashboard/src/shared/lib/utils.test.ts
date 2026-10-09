import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a token text size together with a token text colour", () => {
    expect(cn("text-q-ui", "text-q-on-primary").split(" ")).toEqual(["text-q-ui", "text-q-on-primary"]);
  });

  it("still lets a later size or colour replace an earlier one of the same kind", () => {
    expect(cn("text-q-ui", "text-q-body")).toBe("text-q-body");
    expect(cn("text-q-text", "text-q-danger")).toBe("text-q-danger");
    expect(cn("rounded-q-control", "rounded-q-card")).toBe("rounded-q-card");
  });
});
