import { z } from "zod";
import { deliveryQuoteRequestSchema } from "@/features/pricing/quote-request";

export const assistedBookingDraftSchema = deliveryQuoteRequestSchema.extend({
  bookingOrigin: z.enum(["whatsapp_admin", "phone_admin", "other_admin"]),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(7).max(20),
  phoneSource: z.enum(["customer_provided", "verified_profile", "admin_verified"]),
  senderName: z.string().trim().min(2).max(120),
  senderPhone: z.string().trim().min(7).max(20),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: z.string().trim().min(7).max(20),
  packageDescription: z.string().trim().min(3).max(500),
  pickupInstructions: z.string().max(500).optional(),
  deliveryInstructions: z.string().max(500).optional(),
  handlingInstructions: z.string().max(500).optional(),
  weightGrams: z.number().int().positive().max(100_000).optional(),
  lengthMm: z.number().int().positive().max(2_000).optional(),
  widthMm: z.number().int().positive().max(2_000).optional(),
  heightMm: z.number().int().positive().max(2_000).optional(),
});

export type AssistedBookingDraftInput = z.infer<typeof assistedBookingDraftSchema>;

