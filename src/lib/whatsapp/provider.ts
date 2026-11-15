export type WhatsAppTemplateMessage = {
  phone: string;
  template: string;
  variables: Record<string, string>;
};

export type WhatsAppProvider = {
  readonly mode: "manual" | "official_platform";
  createReviewLink(input: { phone: string; message: string }): Promise<{ url: string; automated: boolean }>;
  sendTemplate?(input: WhatsAppTemplateMessage): Promise<{ providerMessageId: string }>;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

export const manualWhatsAppProvider: WhatsAppProvider = {
  mode: "manual",
  async createReviewLink(input) {
    return { url: `https://wa.me/${digits(input.phone)}?text=${encodeURIComponent(input.message)}`, automated: false };
  },
};

