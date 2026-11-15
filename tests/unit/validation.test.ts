import { describe, expect, it } from "vitest";
import { quoteSchema } from "@/features/orders/validation";
describe("quote validation",()=>{it("requires valid coordinates",()=>{const result=quoteSchema.safeParse({pickupAddress:"A valid pickup address",pickupCoordinates:{latitude:100,longitude:3},deliveryAddress:"A valid delivery address",deliveryCoordinates:{latitude:7.2,longitude:3.9},packageCategory:"parcel",packageSize:"small"});expect(result.success).toBe(false)})});
