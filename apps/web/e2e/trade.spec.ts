import { expect, test } from "@playwright/test";

const DEMO_PASSWORD = "Sandbox-Demo-Pass-2026"; // sandbox seed only (apps/api/src/seed.ts)

test.describe("public pages in three languages", () => {
  for (const [locale, dir, title] of [["ar", "rtl", "السوق"], ["he", "rtl", "שוק"], ["en", "ltr", "Marketplace"]] as const) {
    test(`marketplace renders in ${locale}`, async ({ page }) => {
      await page.goto(`/${locale}/market`);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByText(/USDT/).first()).toBeVisible();
    });
  }
});

test("a verified trader takes a sell offer and sees verified payment instructions", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "flow covered once on desktop");
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("rania@demo.local");
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Welcome back" }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);

  await page.goto("/en/market?side=SELL");
  // pick an offer that isn't ours
  const row = page.locator("tr", { hasNotText: "This is your offer" }).filter({ hasText: "Buy USDT" }).first();
  await row.getByRole("button", { name: "Buy USDT" }).click();
  await expect(page.getByRole("heading", { name: "Offer details" })).toBeVisible();

  await page.locator("#amt").fill("400");
  await expect(page.getByText(/USDT/).filter({ hasText: "Platform fee" }).or(page.getByText("Platform fee"))).toBeVisible();
  await page.getByRole("button", { name: "Buy USDT" }).last().click();
  await page.getByLabel("I've reviewed the price and the fee").check();
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/en\/trades\//);
  await expect(page.getByText("Awaiting payment").first()).toBeVisible();
  await expect(page.getByText("Payment reference")).toBeVisible();
  await expect(page.getByText(/^WX[2-9A-HJ-NP-Z]{6}$/)).toBeVisible();
  await page.screenshot({ path: "test-results/trade-room.png", fullPage: true });

  // cancel so repeated runs keep the seeded book intact
  await page.getByRole("button", { name: "Cancel trade" }).click();
  await page.getByLabel("Reason").fill("e2e test cleanup");
  await page.getByRole("dialog").getByRole("button", { name: "Cancel trade" }).click();
  await expect(page.getByText("Trade cancelled").first()).toBeVisible();
});
