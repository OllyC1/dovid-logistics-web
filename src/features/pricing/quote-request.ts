import { z } from "zod";

const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const additionalStop = z.object({ address: z.string().min(8).max(300), coordinates });
export const deliveryQuoteRequestSchema = z.object({
  pickupAddress: z.string().min(8).max(300),
  pickupCoordinates: coordinates,
  deliveryAddress: z.string().min(8).max(300),
  deliveryCoordinates: coordinates,
  packageCategory: z.enum(["document", "parcel", "food", "other"]),
  packageSize: z.enum(["small", "medium", "large"]),
  serviceLevel: z.enum(["standard", "express", "scheduled"]).default("standard"),
  paymentMethod: z.enum(["online", "bank_transfer"]).default("online"),
  additionalStops: z.array(additionalStop).max(5).default([]),
  oversized: z.boolean().default(false),
  promotionCode: z.string().trim().max(40).optional(),
  approvalReference: z.string().trim().regex(/^DOV-APR-\d{6}-[A-F0-9]{8}$/).optional(),
  declaredValueMinor: z.number().int().nonnegative().max(100_000_000).optional(),
  payer: z.enum(["sender", "receiver_before_delivery", "receiver_at_delivery"]).default("sender"),
  scheduledAt: z.iso.datetime().optional()
}).superRefine((value, context) => {
  if (value.serviceLevel === "scheduled" && !value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "Choose a pickup time for scheduled delivery." });
  if (value.serviceLevel !== "scheduled" && value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "A pickup time is only valid for scheduled delivery." });
});
