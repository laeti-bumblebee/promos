import { expect, test } from "@playwright/test";
import postgres from "postgres";

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
};

test.beforeAll(async () => {
  const sql = postgres(process.env.DATABASE_URL!);
  await sql`delete from catalogues where external_id like 'e2e-%'`;
  await sql`delete from user_settings`;
  const [c] = await sql`
    insert into catalogues (chain, external_id, title, starts_on, ends_on, source_url)
    values ('lidl', 'e2e-week', 'Les promos de la semaine', ${day(-1)}, ${day(6)}, 'https://www.lidl.fr/')
    returning id`;
  const [a] = await sql`
    insert into catalogues (chain, external_id, title, starts_on, ends_on)
    values ('auchan', 'e2e-auchan', 'Bons plans du week end', ${day(2)}, ${day(4)}) returning id`;
  await sql`
    insert into promotions (catalogue_id, external_key, title, category, price_cents, old_price_cents, discount, loyalty, starts_on, ends_on, page_number, page_image_url)
    values
      (${c!.id}, 'p1:clementines', 'Clémentines 2 kg', 'frais', 299, 449, '-33 %', false, ${day(1)}, ${day(6)}, 1, '/icon-512.png'),
      (${c!.id}, 'p2:vin', 'Côtes du Rhône 75 cl', 'alcool', 399, null, null, false, ${day(1)}, ${day(6)}, 2, null),
      (${c!.id}, 'p3:cafe', 'Café moulu 4 x 250 g', 'epicerie-sucree', 749, null, '-25 %', true, ${day(-1)}, ${day(6)}, 3, null),
      (${a!.id}, 'p1:lessive', 'Lessive liquide', 'entretien', 899, null, '2e à -50 %', false, ${day(2)}, ${day(4)}, 1, null)`;
  await sql.end();
});

test("upcoming offers are grouped by start day, running ones folded away", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Demain/ })).toBeVisible();
  await expect(page.getByText("Clémentines 2 kg")).toBeVisible();
  await expect(page.getByText("Lessive liquide")).toBeVisible();
  await expect(page.getByText("Café moulu 4 x 250 g")).toBeHidden();
  await page.getByRole("button", { name: /déjà en cours/ }).click();
  await expect(page.getByText("Café moulu 4 x 250 g")).toBeVisible();
});

test("search ignores accents, and store chips filter", async ({ page }) => {
  await page.goto("/");
  await page.getByPlaceholder(/Rechercher/).fill("clementine");
  await expect(page.getByText("Clémentines 2 kg")).toBeVisible();
  await expect(page.getByText("Lessive liquide")).toBeHidden();
  await page.getByPlaceholder(/Rechercher/).fill("");
  await page.getByRole("button", { name: "Auchan", exact: true }).click();
  await expect(page.getByText("Lessive liquide")).toBeHidden();
  await expect(page.getByText("Clémentines 2 kg")).toBeVisible();
});

test("an offer opens with its details and catalogue page", async ({ page }) => {
  await page.goto("/");
  await page.getByText("Clémentines 2 kg").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("-33 %")).toBeVisible();
  await expect(dialog.getByText("Lidl", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("img", { name: "Page du catalogue" })).toBeVisible();
});

test("excluded categories and unticked stores disappear, for this person only", async ({ page }) => {
  await page.goto("/reglages");
  // Clicks before the page is interactive would be lost.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Alcool & vin").check();
  await page.getByLabel("Auchan Vélizy 2").uncheck();
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("status")).toHaveText("Réglages enregistrés.");
  await page.goto("/");
  await expect(page.getByText("Clémentines 2 kg")).toBeVisible();
  await expect(page.getByText("Côtes du Rhône 75 cl")).toBeHidden();
  await expect(page.getByText("Lessive liquide")).toBeHidden();
  await expect(page.getByRole("button", { name: "Auchan", exact: true })).toBeHidden();
  const settings = await (await page.request.get("/api/settings")).json();
  expect(settings).toEqual({ storeIds: ["superu-viroflay", "intermarche-velizy", "leclerc-massy", "lidl-massy"], excludedCategories: ["alcool"] });
});

test("offers added after a visit are marked new", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Clémentines 2 kg")).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/promotions")).json()).seenAt).not.toBeNull();
  const sql = postgres(process.env.DATABASE_URL!);
  const [c] = await sql`select id from catalogues where external_id = 'e2e-week'`;
  await sql`insert into promotions (catalogue_id, external_key, title, category, starts_on, ends_on)
            values (${c!.id}, 'p4:pain', 'Pain de mie', 'epicerie-salee', ${day(1)}, ${day(6)})`;
  await sql.end();
  await page.reload();
  await expect(page.getByText(/1 nouveauté/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Pain de mie/ }).getByText("Nouveau")).toBeAttached();
});

test("settings data is refused from another site and without a session", async ({ request }) => {
  expect((await request.get("/api/promotions")).status()).toBe(401);
  expect((await request.put("/api/settings", { data: {} })).status()).toBe(403);
});
