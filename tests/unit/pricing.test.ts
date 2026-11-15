import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/features/pricing/calculate";
const rule={baseFeeMinor:100000,includedDistanceMeters:2000,perKilometerMinor:25000,minimumFeeMinor:120000,currency:"NGN"};
describe("calculateQuote",()=>{it("applies the minimum fee",()=>{expect(calculateQuote(rule,1000).totalMinor).toBe(120000)});it("rounds additional distance up to whole kilometres",()=>{expect(calculateQuote(rule,2501).distanceFeeMinor).toBe(25000)});it("includes configured size surcharge",()=>{expect(calculateQuote({...rule,sizeSurchargeMinor:50000},4000).totalMinor).toBe(200000)});it("rejects invalid distance",()=>{expect(()=>calculateQuote(rule,-1)).toThrow("Invalid route distance")})});
