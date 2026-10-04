import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const navigation = {
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  Object.values(navigation).forEach((mock) => mock.mockClear());
});
