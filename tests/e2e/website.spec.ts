import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, formAlert, removeStorageFiles, setTheme, sql } from "./helpers";

/**
 * Website content. The real photos, shop photo and reviews are put back exactly after each test; files the tests
 * upload are deleted from storage; test rows say "E2E".
 */
let startedAt = new Date();
let gallery: { id: string; visible: boolean; in_hero: boolean; sort: number; alt: string }[] = [];
let shopPhoto: string | null = null;

test.beforeEach(async () => {
  startedAt = new Date();
  gallery = await sql("select id, visible, in_hero, sort, alt from public.gallery_photos");
  [{ shop_photo_path: shopPhoto }] = await sql("select shop_photo_path from public.settings");
});

test.afterEach(async () => {
  const uploaded = await sql("select name from storage.objects where bucket_id = 'gallery' and created_at >= $1", [startedAt]);
  await sql("delete from public.gallery_photos where alt like 'E2E%'");
  // Hide everything first so restoring never trips the per-section limit, then put each row back.
  await sql("update public.gallery_photos set visible = false");
  for (const g of gallery.filter((x) => !x.visible)) await sql("update public.gallery_photos set in_hero = $2, sort = $3, alt = $4 where id = $1", [g.id, g.in_hero, g.sort, g.alt]);
  for (const g of gallery.filter((x) => x.visible)) await sql("update public.gallery_photos set visible = true, in_hero = $2, sort = $3, alt = $4 where id = $1", [g.id, g.in_hero, g.sort, g.alt]);
  await sql("update public.settings set shop_photo_path = $1", [shopPhoto]);
  await sql("delete from public.reviews where author_name like 'E2E%'");
  await sql("delete from public.audit_log where entity in ('photo', 'review', 'settings') and at >= $1", [startedAt]);
  await removeStorageFiles("gallery", uploaded.map((u) => u.name));
});

const card = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const toast = (page: Page) => page.getByTestId("toast");
const sheet = (page: Page) => page.getByRole("dialog");
const fileExists = async (path: string) => (await sql("select 1 from storage.objects where bucket_id = 'gallery' and name = $1", [path])).length === 1;

/** A small, plain test photo. */
const smallPng = (color: string) => sharp({ create: { width: 900, height: 600, channels: 3, background: color } }).png().toBuffer();
/** A big, noisy phone-sized JPEG (several MB): the browser shrinks it before uploading. */
async function bigJpeg() {
  const width = 3000;
  const height = 2250;
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (Math.random() * 256) | 0;
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

async function openWebsite(page: Page) {
  await signInAs(page, "owner");
  await page.goto("/dashboard/website");
  await expect(page.getByRole("heading", { name: "Website", level: 1 })).toBeVisible();
  await expect(card(page, "Shop photo").locator("form[data-ready]")).toBeVisible();
}

test.describe("website content", () => {
  test("refresh: a change made straight in the database shows on the website after Refresh website", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Walk-ins welcome").first()).toBeVisible();
    const [{ walk_in_text: original }] = await sql("select walk_in_text from public.settings where id = 1");
    const refresh = async () => {
      await openWebsite(page);
      await card(page, "Refresh the website").getByRole("button", { name: "Refresh website" }).click();
      await expect(toast(page)).toHaveText("Website refreshed. Everyone now sees the latest version.");
    };
    try {
      await sql("update public.settings set walk_in_text = 'E2E Walk in any time.' where id = 1");
      await refresh();
      await page.goto("/");
      await expect(page.getByText("E2E Walk in any time").first()).toBeVisible();
    } finally {
      await sql("update public.settings set walk_in_text = $1 where id = 1", [original]);
    }
    await refresh();
  });

  test("shop photo: a big photo is shrunk in the browser, saved, replaced and removed (files deleted)", async ({ page }) => {
    test.setTimeout(60_000);
    await sql("update public.settings set shop_photo_path = null");
    await openWebsite(page);
    const shop = card(page, "Shop photo");
    await expect(shop.getByText("No shop photo yet.")).toBeVisible();

    const big = await bigJpeg();
    expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
    await shop.getByLabel("Choose a shop photo").setInputFiles({ name: "IMG_1234.jpg", mimeType: "image/jpeg", buffer: big });
    await expect(shop.getByText(/^Ready: \d+\.\d MB → \d+(\.\d)? (KB|MB)$/)).toBeVisible({ timeout: 20_000 });
    await expect(shop.getByTestId("photo-preview")).toBeVisible();
    await shop.getByRole("button", { name: "Save shop photo" }).click();
    await expect(toast(page)).toHaveText("Shop photo saved.", { timeout: 20_000 });
    const [{ shop_photo_path: first }] = await sql("select shop_photo_path from public.settings");
    expect(first).toMatch(/^shop\/[0-9a-f-]+\.webp$/);
    expect(await fileExists(first)).toBe(true);
    await expect(shop.getByTestId("shop-photo")).toBeVisible();

    await shop.getByLabel("Choose a new shop photo").setInputFiles({ name: "front.png", mimeType: "image/png", buffer: await smallPng("#246") });
    await shop.getByRole("button", { name: "Replace shop photo" }).click();
    // The first "saved" notice may still be showing, so wait for the database instead.
    const current = async () => (await sql("select shop_photo_path from public.settings"))[0].shop_photo_path as string;
    await expect.poll(current).not.toBe(first);
    const second = await current();
    // The old file is deleted just after the new path is saved, so wait for it too.
    await expect.poll(() => fileExists(first)).toBe(false);

    await page.goto("/");
    await expect(page.getByRole("img", { name: /shopfront/ })).toBeVisible();

    await page.goto("/dashboard/website");
    await card(page, "Shop photo").getByRole("button", { name: "Remove" }).click();
    await expect(card(page, "Shop photo").getByRole("button", { name: "Keep" })).toBeFocused();
    await card(page, "Shop photo").getByRole("button", { name: "Remove photo" }).click();
    await expect(toast(page)).toHaveText("Shop photo removed.");
    expect(await fileExists(second)).toBe(false);
    const logged = await sql("select summary from public.audit_log where action = 'website.shop_photo' and at >= $1 order by id", [startedAt]);
    expect(logged.map((r) => r.summary)).toEqual(["Added", "Replaced", "Removed"]);
  });

  test("Recent cuts: description required; add shows on the website; children start hidden; hide; move; delete removes the file", async ({ page }) => {
    await sql("update public.gallery_photos set visible = false where not in_hero");
    await openWebsite(page);
    const cuts = card(page, "Recent cuts");
    await expect(cuts.getByTestId("recent_cuts-meter")).toHaveText("0 of 4 shown");

    await cuts.getByLabel("Add a photo to Recent cuts").setInputFiles({ name: "fade.png", mimeType: "image/png", buffer: await smallPng("#a33") });
    await cuts.getByRole("button", { name: "Add photo" }).click();
    await expect(cuts.getByText(/Please describe the photo/)).toBeVisible();
    await cuts.getByLabel(/^Description/).fill("E2E Fresh fade");
    await cuts.getByRole("button", { name: "Add photo" }).click();
    await expect(toast(page)).toHaveText("Photo added to Recent cuts.");
    await expect(cuts.getByTestId("recent_cuts-meter")).toHaveText("1 of 4 shown");
    await expect(cuts.getByLabel(/^Description/)).toHaveValue("");

    await cuts.getByLabel("Add a photo to Recent cuts").setInputFiles({ name: "kid.png", mimeType: "image/png", buffer: await smallPng("#3a3") });
    await cuts.getByLabel(/^Description/).fill("E2E Boy's cut");
    await cuts.getByLabel(/Shows a child/).check();
    await cuts.getByRole("button", { name: "Add photo" }).click();
    await expect(toast(page)).toHaveText("Photo added to Recent cuts, hidden.");
    await expect(cuts.getByTestId("photo-row").filter({ hasText: "E2E Boy's cut" })).toContainText("Hidden");

    await page.goto("/");
    await expect(page.locator("#cuts").getByRole("img", { name: "E2E Fresh fade" }).first()).toBeVisible();
    await expect(page.locator("#cuts").getByRole("img", { name: "E2E Boy's cut" })).toHaveCount(0);

    await page.goto("/dashboard/website");
    await card(page, "Recent cuts").getByRole("button", { name: "Hide E2E Fresh fade" }).click();
    await expect(toast(page)).toHaveText("Photo hidden from the website.");
    const [hidden] = await sql("select visible, path from public.gallery_photos where alt = 'E2E Fresh fade'");
    expect(hidden.visible).toBe(false);

    await card(page, "Recent cuts").getByRole("button", { name: "Edit E2E Fresh fade" }).click();
    await expect(sheet(page).locator("form[data-ready]").first()).toBeVisible();
    await sheet(page).getByLabel("Section").selectOption("slideshow");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page)).toHaveText("Photo saved.");
    await expect(card(page, "Slideshow").getByTestId("photo-row").filter({ hasText: "E2E Fresh fade" })).toBeVisible();

    await card(page, "Slideshow").getByRole("button", { name: "Edit E2E Fresh fade" }).click();
    await sheet(page).getByRole("button", { name: "Delete photo" }).click();
    await expect(sheet(page).getByRole("button", { name: "Keep" })).toBeFocused();
    await sheet(page).getByRole("button", { name: "Delete photo" }).click();
    await expect(toast(page)).toHaveText("Photo deleted.");
    expect(await sql("select 1 from public.gallery_photos where alt = 'E2E Fresh fade'")).toEqual([]);
    expect(await fileExists(hidden.path)).toBe(false);
  });

  test("a full slideshow: new photos go in hidden; showing another is refused until one is hidden; replace swaps the file", async ({ page }) => {
    await sql("update public.gallery_photos set visible = false where in_hero");
    for (let i = 1; i <= 3; i++) {
      await sql("insert into public.gallery_photos (path, alt, in_hero, visible, sort) values ($1, $2, true, true, $3)", [`photos/e2e-slide-${i}.webp`, `E2E Slide ${i}`, 900 + i]);
    }
    await openWebsite(page);
    const slides = card(page, "Slideshow");
    await expect(slides.getByTestId("slideshow-meter")).toHaveText("3 of 3 shown · full");
    await expect(slides.getByText(/Slideshow is full \(3 of 3\), so this photo will be added hidden/)).toBeVisible();

    await slides.getByLabel("Add a photo to Slideshow").setInputFiles({ name: "chair.png", mimeType: "image/png", buffer: await smallPng("#555") });
    await slides.getByLabel(/^Description/).fill("E2E Barber chair");
    await slides.getByRole("button", { name: "Add photo" }).click();
    await expect(toast(page)).toHaveText("Photo added to Slideshow, hidden.");

    await slides.getByRole("button", { name: "Edit E2E Barber chair" }).click();
    await expect(sheet(page).locator("form[data-ready]").first()).toBeVisible();
    await sheet(page).getByLabel("Show on the website").check();
    await expect(sheet(page).getByText(/Slideshow already shows 3 photos/)).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Save" })).toBeDisabled();
    await sheet(page).getByLabel("Show on the website").uncheck();

    const [{ path: before }] = await sql("select path from public.gallery_photos where alt = 'E2E Barber chair'");
    await sheet(page).getByLabel("Replace with another photo").setInputFiles({ name: "chair2.png", mimeType: "image/png", buffer: await smallPng("#777") });
    await sheet(page).getByRole("button", { name: "Replace photo" }).click();
    await expect(toast(page)).toHaveText("Photo replaced.");
    const [{ path: after }] = await sql("select path from public.gallery_photos where alt = 'E2E Barber chair'");
    expect(after).not.toBe(before);
    expect(await fileExists(before)).toBe(false);
    expect(await fileExists(after)).toBe(true);
  });

  test("reviews: add with checks, shown on the website, hide, reorder, delete", async ({ page }) => {
    await openWebsite(page);
    const reviews = card(page, "Reviews");
    await reviews.getByRole("button", { name: "Add review" }).click();
    await expect(sheet(page).locator("form[data-ready]")).toBeVisible();
    await sheet(page).getByRole("button", { name: "Add review" }).click();
    await expect(formAlert(page).filter({ hasText: "Please check the review." })).toBeVisible();
    await expect(sheet(page).getByText("Please enter the reviewer's name (up to 80 characters).")).toBeVisible();

    await sheet(page).getByLabel("Name").fill("E2E Reviewer");
    await sheet(page).getByLabel("Stars").selectOption("4");
    await sheet(page).getByLabel("Review").fill("Sharp fade, friendly lads.\n\nBooked again.");
    await sheet(page).getByLabel("From Google").check();
    await sheet(page).getByRole("button", { name: "Add review" }).click();
    await expect(toast(page)).toHaveText("Review added.");
    await expect(reviews.getByTestId("review-row").filter({ hasText: "E2E Reviewer" })).toContainText("Google");

    await page.goto("/");
    await expect(page.locator("#reviews")).toContainText("Sharp fade, friendly lads.");

    await page.goto("/dashboard/website");
    const rows = card(page, "Reviews").getByTestId("review-row");
    // New reviews go last; moving up is instant on screen and saved.
    const position = async () =>
      (await sql("select author_name from public.reviews order by sort, created_at")).map((r) => r.author_name).indexOf("E2E Reviewer");
    const count = await rows.count();
    if (count > 1) {
      expect(await position()).toBe(count - 1);
      if (page.viewportSize()!.width < 1024) await card(page, "Reviews").getByRole("button", { name: /^Reorder/ }).click();
      await card(page, "Reviews").getByRole("button", { name: "Move review from E2E Reviewer up" }).click();
      await expect(rows.nth(count - 2)).toContainText("E2E Reviewer");
      await expect.poll(position).toBe(count - 2);
    }

    await card(page, "Reviews").getByRole("button", { name: "Edit review from E2E Reviewer" }).click();
    await sheet(page).getByLabel("Show on the website").uncheck();
    await sheet(page).getByRole("button", { name: "Save" }).click();
    await expect(toast(page)).toHaveText("Review saved.");
    await page.goto("/");
    await expect(page.locator("main")).not.toContainText("Sharp fade, friendly lads.");

    await page.goto("/dashboard/website");
    await card(page, "Reviews").getByRole("button", { name: "Edit review from E2E Reviewer" }).click();
    await sheet(page).getByRole("button", { name: "Delete" }).click();
    await sheet(page).getByRole("button", { name: "Delete review" }).click();
    await expect(toast(page)).toHaveText("Review deleted.");
    expect(await sql("select 1 from public.reviews where author_name like 'E2E%'")).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await openWebsite(page);
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
      await card(page, "Reviews").getByRole("button", { name: "Add review" }).click();
      await expect(sheet(page).locator("form[data-ready]")).toBeVisible();
      await expectAccessible(page);
    });
  }
});
