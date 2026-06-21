import { expect, test } from "@playwright/test";

test.skip("app loads and renders shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Quick/);
});
