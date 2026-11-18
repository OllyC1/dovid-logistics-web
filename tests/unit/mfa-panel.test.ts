import { describe, expect, it } from "vitest";
import { sanitizeMfaQrCode } from "@/components/staff/mfa-panel";

describe("Super Admin MFA QR code", () => {
  it("removes provider trailing control characters before passing the data URL to Next Image", () => {
    const value = "data:image/svg+xml;utf-8,<svg></svg>\r\n ";
    expect(sanitizeMfaQrCode(value)).toBe("data:image/svg+xml;utf-8,<svg></svg>");
  });
});
