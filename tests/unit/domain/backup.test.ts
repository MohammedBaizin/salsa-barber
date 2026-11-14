import { describe, expect, it } from "vitest";
import { BACKUP_FORMAT, BACKUP_VERSION, backupCounts, BackupFileError, packBackup, unpackBackup, type Backup } from "@/lib/backup/format";
import { BACKED_UP, BACKUP_TABLES } from "@/lib/backup/tables";
import { createZip, crc32, readZip } from "@/lib/backup/zip";
import { backupReminder } from "@/lib/domain/backup";

describe("zip", () => {
  it("CRC-32 matches the standard check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("round trip: names (UTF-8), text and binary survive", () => {
    const binary = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));
    const zip = createZip([
      { name: "backup.json", data: JSON.stringify({ name: "Zoë", n: 1 }) },
      { name: "photos/café.bin", data: binary },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["backup.json", "photos/café.bin"]);
    expect(JSON.parse(files.get("backup.json")!.toString())).toEqual({ name: "Zoë", n: 1 });
    expect(files.get("photos/café.bin")!.equals(binary)).toBe(true);
  });

  it("refuses files that aren't zips, damaged ones and too many entries", () => {
    expect(() => readZip(Buffer.from("not a zip at all"))).toThrow(/no zip directory/);
    const zip = createZip([{ name: "a.txt", data: "hello hello hello" }]);
    const damaged = Buffer.from(zip);
    damaged[40] ^= 0xff; // inside the compressed data
    expect(() => readZip(damaged)).toThrow();
    const many = createZip(Array.from({ length: 3 }, (_, i) => ({ name: `${i}.txt`, data: "x" })));
    expect(() => readZip(many, { entries: 2, bytes: 1000 })).toThrow(/too many files/);
  });
});

function sampleBackup(): Backup {
  const tables = Object.fromEntries(BACKED_UP.map((t) => [t, []])) as unknown as Backup["tables"];
  tables.clients = [{ id: "c1", name: "Jo", phone: "+447700900000", created_at: "2026-01-01T00:00:00Z" }];
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: "2026-11-14T10:00:00.000Z",
    shop: "Salsa Barber",
    tables,
    logins: [{ id: "u1", email: "sam@staff.example", created_at: "2026-01-01T00:00:00Z" }],
    photos: { gallery: ["photos/a.webp"], team: [] },
  };
}

describe("backup file", () => {
  it("every table is either backed up or deliberately skipped; security data is never backed up", () => {
    expect(BACKED_UP).not.toContain("request_attempts");
    expect(BACKED_UP).not.toContain("login_failures");
    expect(BACKED_UP).not.toContain("push_subscriptions");
    expect(Object.keys(BACKUP_TABLES)).toHaveLength(14);
  });

  it("pack and unpack: backup.json + README.txt; counts", () => {
    const zip = packBackup(sampleBackup());
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["backup.json", "README.txt"]);
    expect(files.get("README.txt")!.toString()).toContain("clients: 1");
    const back = unpackBackup(zip);
    expect(back).toEqual(sampleBackup());
    expect(backupCounts(back).clients).toBe(1);
    expect(JSON.stringify(back)).not.toMatch(/encrypted_password|password/);
  });

  it("refuses other files with a readable message", () => {
    const wrap = (data: unknown) => createZip([{ name: "backup.json", data: JSON.stringify(data) }]);
    expect(() => unpackBackup(Buffer.from("hello"))).toThrow(BackupFileError);
    expect(() => unpackBackup(createZip([{ name: "other.txt", data: "x" }]))).toThrow(/backup.json is missing/);
    expect(() => unpackBackup(wrap({ format: "something-else" }))).toThrow(/isn't a backup from this booking system/);
    expect(() => unpackBackup(wrap({ ...sampleBackup(), version: 99 }))).toThrow(/different version/);
    const { bookings: _b, ...rest } = sampleBackup().tables;
    void _b;
    expect(() => unpackBackup(wrap({ ...sampleBackup(), tables: rest }))).toThrow(/missing the bookings table/);
  });
});

describe("backup reminder (admins, on Today)", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("after 7 days, or when there's never been one", () => {
    expect(backupReminder(new Date("2026-11-10T12:00:00Z"), now)).toBeNull();
    expect(backupReminder(new Date("2026-11-07T12:00:00Z"), now)).toBe("The last backup was downloaded 7 days ago. Download a fresh one.");
    expect(backupReminder(null, now)).toMatch(/^No backup has been downloaded recently/);
  });
});
