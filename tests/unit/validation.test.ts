import { describe, expect, it } from "vitest";
import { bookingSchema, quoteSchema } from "@/features/orders/validation";
describe("quote validation",()=>{it("requires valid coordinates",()=>{const result=quoteSchema.safeParse({pickupAddress:"A valid pickup address",pickupCoordinates:{latitude:100,longitude:3},deliveryAddress:"A valid delivery address",deliveryCoordinates:{latitude:7.2,longitude:3.9},packageCategory:"parcel",packageSize:"small"});expect(result.success).toBe(false)})});

describe("guest booking validation", () => {
  const booking = {
    pickupAddress: "Bodija Market, Ibadan",
    pickupCoordinates: { latitude: 7.435, longitude: 3.91 },
    deliveryAddress: "Ring Road, Ibadan",
    deliveryCoordinates: { latitude: 7.36, longitude: 3.875 },
    packageCategory: "parcel",
    packageSize: "small",
    senderName: "Guest Sender",
    senderPhone: "08000000000",
    recipientName: "Guest Receiver",
    recipientPhone: "08000000001",
    payer: "sender",
    paymentMethod: "online",
    serviceLevel: "standard",
    quoteId: "11111111-1111-4111-8111-111111111111",
    guestQuoteToken: "a".repeat(43),
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
  } as const;

  it("allows a simple parcel description to be omitted", () => {
    const result = bookingSchema.safeParse(booking);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.packageDescription).toBe("");
  });

  it("rejects an undersized guest quote token", () => {
    expect(bookingSchema.safeParse({ ...booking, guestQuoteToken: "short" }).success).toBe(false);
  });
});
