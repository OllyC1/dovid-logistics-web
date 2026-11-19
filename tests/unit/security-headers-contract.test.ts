import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("browser security header contract", () => {
  it("prevents unsafe document embedding, plugins and external form posts", () => {
    const source = readFileSync("next.config.ts", "utf8");
    expect(source).toContain("Content-Security-Policy");
    expect(source).toContain("base-uri 'self'");
    expect(source).toContain("object-src 'none'");
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("form-action 'self'");
    expect(source).toContain("upgrade-insecure-requests");
  });
});
