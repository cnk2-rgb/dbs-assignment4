import { expect, test } from "@playwright/test";

test.describe("Grid Mood", () => {
  test("renders the live dashboard shell", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", {
        name: "A live sky shaped by the carbon emissions of the grid."
      })
    ).toBeVisible();
    await expect(page.getByText("Signal Index", { exact: true })).toBeVisible();
    await expect(page.getByText("Marginal CO2", { exact: true })).toBeVisible();
    await expect(page.getByText("Region", { exact: true })).toBeVisible();
  });

  test("loads live Supabase-backed state", async ({ page }) => {
    await page.goto("/");
    const regionCard = page
      .locator("article")
      .filter({ has: page.getByText("Region", { exact: true }) });
    const scenePanel = page
      .locator("section")
      .filter({ has: page.getByText(/Palette:/) });

    await expect(page.getByRole("button", { name: "Chicago, IL" })).toBeVisible({
      timeout: 20000
    });
    await expect(regionCard.getByText("PJM_CHICAGO", { exact: true })).toBeVisible({
      timeout: 20000
    });
    await expect(page.getByText(/Palette:/)).toContainText(/Palette: (ember-pressure|mineral-morning|amber-current|dawn-waiting)/);
    await expect(scenePanel.getByText(/Last updated:/).first()).not.toContainText("pending");
  });

  test("shows the live data tab with source fields and timestamps", async ({
    page
  }) => {
    await page.goto("/");
    const dataPanel = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /Source values for/i }) });

    await page.getByRole("button", { name: "Live Data" }).click();

    await expect(
      page.getByRole("heading", { name: /Source values for/i })
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "Location name" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Region code" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Marginal CO2" })).toBeVisible();
    await expect(dataPanel.getByText(/Last updated:/).first()).toBeVisible();
  });
});
