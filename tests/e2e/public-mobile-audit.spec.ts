import { expect, test } from "@playwright/test";

const publicPages = [
  "/",
  "/about",
  "/services",
  "/how-it-works",
  "/pricing",
  "/locations/ibadan",
  "/business",
  "/contact",
  "/faq",
  "/track",
  "/book",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth/complete",
  "/privacy",
  "/terms",
  "/cookies",
] as const;

for (const path of publicPages) {
  test(`${path} is usable on a priority mobile viewport`, async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "This audit is intentionally mobile-first.");
    const runtimeErrors: string[] = [];
    const failedResources: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("requestfailed", (request) => failedResources.push(`${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? "failed"}`));

    const response = await page.goto(path, { waitUntil: "networkidle" });
    expect(response?.ok(), `${path} should return a successful document response`).toBe(true);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const audit = await page.evaluate(() => {
      const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id).filter(Boolean);
      const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
      const undersizedInteractiveControls = [...document.querySelectorAll<HTMLElement>("button, input, select, textarea, [role='button'], nav a[href], footer a[href]")]
        .filter((element) => {
          const target = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? element.closest<HTMLElement>("label") ?? element : element;
          const style = getComputedStyle(target);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const box = target.getBoundingClientRect();
          if (!box.width || !box.height) return false;
          return box.width < 40 || box.height < 40;
        })
        .map((element) => ({ tag: element.tagName, text: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 50) ?? "", width: Math.round(element.getBoundingClientRect().width), height: Math.round(element.getBoundingClientRect().height) }));
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        duplicateIds,
        undersizedInteractiveControls,
      };
    });

    expect(audit.documentWidth, `${path} document should not overflow horizontally`).toBeLessThanOrEqual(audit.viewportWidth);
    expect(audit.bodyWidth, `${path} body should not overflow horizontally`).toBeLessThanOrEqual(audit.viewportWidth);
    expect(audit.duplicateIds, `${path} should not expose duplicate element IDs`).toEqual([]);
    expect(audit.undersizedInteractiveControls, `${path} interactive controls should provide at least a 40px mobile target`).toEqual([]);
    expect(runtimeErrors, `${path} should not raise browser runtime errors`).toEqual([]);
    expect(failedResources, `${path} should not fail resource requests`).toEqual([]);
  });
}
