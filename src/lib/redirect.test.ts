import { describe, expect, it } from "vitest";
import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
  it("allows same-site paths, including query strings", () => {
    expect(safeRedirect("/invite/abc", "/x")).toBe("/invite/abc");
    expect(safeRedirect("/acme/reports?type=pnl&from=2026-01-01", "/x")).toBe("/acme/reports?type=pnl&from=2026-01-01");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example/path",
    "",
    "/ok\nSet-Cookie: a=b",
  ])("rejects %j", (bad) => {
    expect(safeRedirect(bad, "/fallback")).toBe("/fallback");
  });
  it("falls back for non-strings", () => {
    expect(safeRedirect(null, "/fallback")).toBe("/fallback");
    expect(safeRedirect(undefined, "/fallback")).toBe("/fallback");
    expect(safeRedirect(42, "/fallback")).toBe("/fallback");
  });
});
