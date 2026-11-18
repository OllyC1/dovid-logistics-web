import { z } from "zod";

const coordinates = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const additionalStop = z.object({ address: z.string().min(8).max(300), coordinates });
export const quoteSchema = z.object({
  pickupAddress: z.string().min(8).max(300),
  pickupCoordinates: coordinates,
  deliveryAddress: z.string().min(8).max(300),
  deliveryCoordinates: coordinates,
  packageCategory: z.enum(["document", "parcel", "food", "other"]),
  packageSize: z.enum(["small", "medium", "large"]),
  additionalStops: z.array(additionalStop).max(5).default([]),
  oversized: z.boolean().default(false),
  declaredValueMinor: z.number().int().nonnegative().max(100_000_000).optional()
});

export const bookingSchema = quoteSchema.extend({
  pickupInstructions: z.string().max(500).optional(),
  deliveryInstructions: z.string().max(500).optional(),
  packageDescription: z.string().max(500).default(""),
  handlingInstructions: z.string().max(500).optional(),
  senderName: z.string().min(2).max(120),
  senderPhone: z.string().min(7).max(20),
  recipientName: z.string().min(2).max(120),
  recipientPhone: z.string().min(7).max(20),
  payer: z.enum(["sender", "receiver_before_delivery", "receiver_at_delivery"]),
  paymentMethod: z.enum(["online", "bank_transfer"]),
  serviceLevel: z.enum(["standard", "express", "scheduled"]).default("standard"),
  scheduledAt: z.iso.datetime().optional(),
  quoteId: z.uuid(),
  guestQuoteToken: z.string().min(40).max(128).optional(),
  idempotencyKey: z.uuid()
}).superRefine((value, context) => {
  if (value.serviceLevel === "scheduled" && !value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "Choose a pickup time for scheduled delivery." });
  if (value.serviceLevel !== "scheduled" && value.scheduledAt) context.addIssue({ code: "custom", path: ["scheduledAt"], message: "A pickup time is only valid for scheduled delivery." });
});
