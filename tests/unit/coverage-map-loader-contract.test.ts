import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("coverage map loader", () => {
  it("uses Google's asynchronous Maps JavaScript loading mode", () => {
    const source = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");
    expect(source).toContain("&loading=async");
    expect(source).toContain('importLibrary("maps")');
    expect(source).toContain("window.google?.maps?.Map");
  });
  it("fits the selected saved boundary into the map viewport", () => {
    const source = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");
    expect(source).toContain("fitBoundary.current = true");
    expect(source).toContain("map.current.fitBounds(bounds, 48)");
  });
  it("stops reusing partially initialized provider objects after authentication failure", () => {
    const source = readFileSync("src/components/admin/coverage-editor.tsx", "utf8");
    expect(source).toContain("mapsFailed.current = true");
    expect(source).toContain("map.current = null");
    expect(source).toContain('setMapsError("authentication")');
    expect(source).toContain('typeof path.addListener !== "function"');
  });
});
