import { PromotionManager } from "@/components/admin/promotion-manager";
import { requireSuperAdmin } from "@/lib/auth/staff";

export default async function PromotionsPage() {
  const { admin } = await requireSuperAdmin();
  const { data: promotions, error } = await admin.from("promotions").select("id,code,kind,value,maximum_discount_kobo,active,starts_at,ends_at").order("created_at", { ascending: false });
  if (error) throw new Error("Promotions could not be loaded.");
  return <><h1 className="text-3xl font-extrabold text-navy">Promotions</h1><p className="mt-3 max-w-3xl text-slate">Create checkout codes for percentages, fixed discounts or a target customer price. This workspace is restricted to the Super Admin.</p><div className="mt-7"><PromotionManager promotions={(promotions ?? []) as Parameters<typeof PromotionManager>[0]["promotions"]} /></div></>;
}
