import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RegulationSourceFiles, sourceFileUrl } from "./regulation-source-files";
afterEach(cleanup);
it("never turns unsafe saved source URLs into executable links", () => {
  expect(sourceFileUrl("javascript:alert(1)")).toBeNull();
  expect(sourceFileUrl("data:text/html,test")).toBeNull();
  expect(sourceFileUrl("https://user:password@example.test/file")).toBeNull();
  render(<RegulationSourceFiles attachments={[{ id: "file", file_name: "مصدر اللائحة.pdf", file_url: "https://example.test/file.pdf", created_at: "2026-10-07" }]} />);
  expect(screen.getByRole("link", { name: "مصدر اللائحة.pdf" })).toHaveAttribute("rel", "noopener noreferrer");
});
