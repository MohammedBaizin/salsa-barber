import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { readZip } from "../../src/lib/backup/zip";
import { signInAs } from "./dashboard-helpers";
import { expectAccessible, expectNoHorizontalScroll, setTheme, sql } from "./helpers";

/**
 * Backup and restore (spec §8.11), admin only. The restore puts back a backup taken moments earlier in the same
 * test, so the database ends where it started. Test phones: 07700 9009xx.
 */
const PHONE = "+447700900951";
test.afterEach(async () => {
  await sql("delete from public.bookings where client_id in (select id from public.clients where phone = $1)", [PHONE]);
  await sql("delete from public.clients where phone = $1", [PHONE]);
});

async function download(page: Page): Promise<string> {
  await page.goto("/dashboard/backup");
  const waiting = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download backup" }).click();
  const file = await waiting;
  expect(file.suggestedFilename()).toMatch(/^salsa-barber-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  return (await file.path())!;
}

test.describe("backup", () => {
  test("download: a zip with every table, logins without passwords and photo names; logged; Today's reminder goes", async ({ page }) => {
    await sql("delete from public.audit_log where action = 'backup.download'");
    await signInAs(page, "admin");
    await expect(page.getByTestId("backup-reminder")).toContainText("No backup has been downloaded recently");

    const path = await download(page);
    const files = readZip(readFileSync(path));
    expect([...files.keys()]).toEqual(["backup.json", "README.txt"]);
    const backup = JSON.parse(files.get("backup.json")!.toString());
    expect(Object.keys(backup.tables).sort()).toEqual(
      ["audit_log", "bookings", "clients", "closures", "gallery_photos", "reviews", "services", "settings", "staff", "staff_services", "time_off"].sort(),
    );
    const [{ n }] = await sql("select count(*)::int as n from public.bookings");
    expect(backup.tables.bookings).toHaveLength(n);
    expect(backup.logins.length).toBeGreaterThan(0);
    expect(JSON.stringify(backup.logins)).not.toMatch(/password|encrypted/i);
    expect(backup.tables.push_subscriptions).toBeUndefined();

    const [log] = await sql("select actor_name from public.audit_log where action = 'backup.download' order by id desc limit 1");
    expect(log.actor_name).toBe("SAMPLE Admin");
    await page.goto("/dashboard");
    await expect(page.getByTestId("greeting")).toBeVisible();
    await expect(page.getByTestId("backup-reminder")).toHaveCount(0);
  });

  test("restore: preview counts, RESTORE to confirm, data replaced; undo puts it back", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAs(page, "admin");
    const path = await download(page);
    await sql("insert into public.clients (name, phone) values ('E2E Restore', $1)", [PHONE]);

    await page.goto("/dashboard/backup");
    const card = page.getByRole("region", { name: "Restore a backup" });
    await card.getByLabel("Backup file (.zip)").setInputFiles(path);
    await card.getByRole("button", { name: "Check this backup" }).click();
    const preview = card.getByTestId("restore-preview");
    await expect(preview).toContainText("Backup of Salsa Barber made");
    const clientsRow = preview.getByRole("row", { name: /^Clients/ });
    const [backupCount, liveCount] = (await clientsRow.getByRole("cell").allTextContents()).map(Number);
    expect(liveCount).toBe(backupCount + 1);

    const restore = card.getByRole("button", { name: "Restore this backup" });
    await card.getByLabel("Type RESTORE to confirm").fill("restore");
    await expect(restore).toBeDisabled();
    await card.getByLabel("Type RESTORE to confirm").fill("RESTORE");
    await restore.click();
    await expect(page.getByTestId("toast")).toHaveText("Backup restored.", { timeout: 30_000 });
    expect(await sql("select 1 from public.clients where phone = $1", [PHONE])).toEqual([]);
    await expect.poll(async () => (await sql("select 1 from public.audit_log where action = 'backup.restore'")).length).toBe(1);

    const undo = page.getByRole("region", { name: "Undo the last restore" });
    await undo.getByRole("button", { name: "Undo last restore" }).click();
    await expect(undo.getByRole("button", { name: "Keep" })).toBeFocused();
    await undo.getByRole("button", { name: "Undo restore" }).click();
    await expect(page.getByTestId("toast")).toHaveText("The last restore was undone.", { timeout: 30_000 });
    expect(await sql("select 1 from public.clients where phone = $1", [PHONE])).toHaveLength(1);
    await expect(page.getByRole("region", { name: "Undo the last restore" })).toHaveCount(0);
  });

  test("RESTORE is checked on the server: a direct call without it restores nothing", async ({ page }) => {
    await signInAs(page, "admin");
    const path = await download(page);
    await sql("insert into public.clients (name, phone) values ('E2E Restore', $1)", [PHONE]);
    const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")).node as Record<string, { filename: string; exportedName: string }>;
    const [id] = Object.entries(manifest).find(([, e]) => e.filename.endsWith("backup/actions.ts") && e.exportedName === "restoreBackup")!;
    const form = new FormData();
    form.append("_1_backup", new Blob([readFileSync(path)], { type: "application/zip" }), "backup.zip");
    form.append("_1_confirm", "restore please");
    form.append("0", JSON.stringify([{ error: null, preview: null, done: null, attempt: 0 }, "$K1"]));
    const res = await page.request.post("/dashboard/backup", { headers: { "Next-Action": id, Accept: "text/x-component" }, multipart: form });
    expect(await res.text()).toContain("Type RESTORE in capitals to confirm.");
    expect(await sql("select 1 from public.clients where phone = $1", [PHONE])).toHaveLength(1);
    expect(await sql("select 1 from public.audit_log where action = 'backup.restore' and at > now() - interval '1 minute'")).toEqual([]);
  });

  test("files that aren't backups are refused with a readable message", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/dashboard/backup");
    const card = page.getByRole("region", { name: "Restore a backup" });
    await card.getByLabel("Backup file (.zip)").setInputFiles({ name: "photo.zip", mimeType: "application/zip", buffer: Buffer.from("not really a zip") });
    await card.getByRole("button", { name: "Check this backup" }).click();
    await expect(card.getByRole("alert")).toHaveText("That file isn't a backup zip we can read.");
    await expect(card.getByTestId("restore-preview")).toHaveCount(0);
  });

  test("owners and barbers can't reach backups", async ({ page }) => {
    await signInAs(page, "owner");
    await page.goto("/dashboard/backup");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const res = await page.request.get("/dashboard/backup/download", { maxRedirects: 0 });
    expect(res.status()).toBe(404);
    expect(res.headers()["content-type"] ?? "").not.toContain("zip");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`WCAG 2.1 AA and no sideways scroll (${theme})`, async ({ page }) => {
      await setTheme(page, "dashboard", theme);
      await signInAs(page, "admin");
      await page.goto("/dashboard/backup");
      if (page.viewportSize()!.width < 1024) await page.setViewportSize({ width: 320, height: 760 });
      await expect(page.getByRole("link", { name: "Download backup" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    });
  }
});
