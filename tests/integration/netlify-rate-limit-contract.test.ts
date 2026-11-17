import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Netlify provider rate-limit contracts", () => {
  it("protects Google address requests per client before the Next.js handler", () => {
    const source = readFileSync("netlify/edge-functions/limit-map-requests.js", "utf8");
    expect(source).toContain('path: "/api/maps/*"');
    expect(source).toContain("windowLimit: 40");
    expect(source).toContain("windowSize: 60");
    expect(source).toContain('aggregateBy: ["ip", "domain"]');
  });

  it("protects road-route quote requests without intercepting payment webhooks", () => {
    const source = readFileSync("netlify/edge-functions/limit-quote-requests.js", "utf8");
    expect(source).toContain('path: "/api/delivery/quotes"');
    expect(source).toContain("windowLimit: 12");
    expect(source).toContain("windowSize: 60");
    expect(source).not.toContain("/api/payments");
  });
});
