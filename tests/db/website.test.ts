import { afterAll, describe, expect, it } from "vitest";
import { as, sql } from "./helpers";

/** Website content (spec §8.7). Test rows use "TEST" text / paths under test/; everything is put back afterwards. */

const [{ path: originalShop }] = await sql<{ path: string | null }>("select shop_photo_path as path from public.settings");

afterAll(async () => {
  await sql("update public.settings set shop_photo_path = $1", [originalShop]);
  await sql("delete from public.audit_log where action = 'website.shop_photo' and at > now() - interval '10 minutes'");
  await sql("delete from public.audit_log where entity in ('photo', 'review') and summary like 'TEST%'");
  await sql("delete from public.gallery_photos where path like 'test/%'");
  await sql("delete from public.reviews where author_name like 'TEST%'");
});

describe("shop photo", () => {
  it("is logged as website.shop_photo (Added / Replaced / Removed), not as a settings change", async () => {
    const owner = await as("owner");
    await sql("update public.settings set shop_photo_path = null");
    await owner.from("settings").update({ shop_photo_path: "shop/test-a.webp" }).eq("id", 1);
    await owner.from("settings").update({ shop_photo_path: "shop/test-b.webp" }).eq("id", 1);
    await owner.from("settings").update({ shop_photo_path: null }).eq("id", 1);
    const rows = await sql<{ action: string; summary: string }>(
      "select action, summary from public.audit_log where entity = 'settings' and 'shop_photo_path' = any(changed) and at > now() - interval '1 minute' order by id",
    );
    expect(rows).toEqual([
      { action: "website.shop_photo", summary: "Added" },
      { action: "website.shop_photo", summary: "Replaced" },
      { action: "website.shop_photo", summary: "Removed" },
    ]);
  });
});

describe("gallery photos", () => {
  it("Recent cuts shows at most 4 and the slideshow at most 3; hidden photos don't count", async () => {
    const owner = await as("owner");
    for (const [inHero, limit, hint] of [[false, 4, "recent_cuts"], [true, 3, "slideshow"]] as const) {
      const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.gallery_photos where visible and in_hero = $1", [inHero]);
      for (let i = n; i < limit; i++) {
        const r = await owner.from("gallery_photos").insert({ path: `test/${hint}-${i}.webp`, alt: "TEST photo", in_hero: inHero, visible: true });
        expect(r.error).toBeNull();
      }
      const over = await owner.from("gallery_photos").insert({ path: `test/${hint}-over.webp`, alt: "TEST photo", in_hero: inHero, visible: true });
      expect(over.error?.message).toContain("gallery_full");
      expect(over.error?.hint).toBe(hint);
      const hidden = await owner.from("gallery_photos").insert({ path: `test/${hint}-hidden.webp`, alt: "TEST photo", in_hero: inHero, visible: false });
      expect(hidden.error).toBeNull();
      // Showing the hidden one is refused too.
      const show = await owner.from("gallery_photos").update({ visible: true }).eq("path", `test/${hint}-hidden.webp`);
      expect(show.error?.message).toContain("gallery_full");
    }
  });

  it("a description is required", async () => {
    const owner = await as("owner");
    expect((await owner.from("gallery_photos").insert({ path: "test/no-alt.webp", alt: "  ", visible: false })).error?.code).toBe("23514");
  });
});

describe("reviews", () => {
  it("no future dates; reordering is logged as review.reorder", async () => {
    const owner = await as("owner");
    const future = await owner.from("reviews").insert({ author_name: "TEST Future", body: "x", stars: 5, review_date: "2999-01-01" });
    expect(future.error?.code).toBe("23514");
    const { data } = await owner.from("reviews").insert({ author_name: "TEST Order", body: "Good", stars: 4, sort: 900 }).select("id").single();
    await owner.from("reviews").update({ sort: 901 }).eq("id", data!.id);
    await owner.from("reviews").update({ stars: 5 }).eq("id", data!.id);
    const rows = await sql<{ action: string }>("select action from public.audit_log where entity = 'review' and entity_id = $1 order by id", [data!.id]);
    expect(rows.map((r) => r.action)).toEqual(["review.insert", "review.reorder", "review.update"]);
  });
});

describe("barbers", () => {
  it("can't add photos or reviews, or upload files to the website buckets", async () => {
    const sam = await as("sam");
    expect((await sam.from("gallery_photos").insert({ path: "test/sam.webp", alt: "TEST", visible: false })).error?.code).toBe("42501");
    expect((await sam.from("reviews").insert({ author_name: "TEST Sam", body: "x", stars: 5 })).error?.code).toBe("42501");
    const upload = await sam.storage.from("gallery").upload("test/sam.webp", new Blob(["x"], { type: "image/webp" }), { contentType: "image/webp" });
    expect(upload.error).not.toBeNull();
  });
});
