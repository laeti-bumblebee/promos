// Needs a Postgres in DATABASE_URL (as in CI): a throwaway database is made for the run.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cataloguePages, catalogues, fetchRuns, promotions } from "../server/db/schema";
import { refresh } from "../server/services/refresh";
import type { Source } from "../server/sources/types";

const url = process.env.DATABASE_URL;
const name = `promos_test_${process.pid}_${Date.now()}`;
let admin: ReturnType<typeof postgres>;
let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  if (!url) return;
  admin = postgres(url, { max: 1 });
  await admin.unsafe(`create database ${name}`);
  const testUrl = new URL(url);
  testUrl.pathname = `/${name}`;
  client = postgres(testUrl.toString(), { max: 2, onnotice: () => {} });
  db = drizzle(client);
  await migrate(db, { migrationsFolder: "server/db/migrations" });
});

afterAll(async () => {
  if (!url) return;
  await client?.end();
  await admin.unsafe(`drop database if exists ${name}`);
  await admin.end();
});

const fakeSource: Source = {
  chain: "lidl",
  async fetchCatalogues() {
    return [
      {
        chain: "lidl",
        externalId: "week-46",
        title: "Promos de la semaine",
        startsOn: "2026-11-12",
        endsOn: "2026-11-18",
        pages: [1, 2, 3, 4, 5].map((n) => ({ number: n, imageUrl: `https://img.test/${n}.jpg` })),
        promotions: [{ externalKey: "lidl:1", title: "Scie sabre", category: "maison", priceCents: 2199 }],
      },
    ];
  },
};

const failing: Source = {
  chain: "auchan",
  async fetchCatalogues() {
    throw new Error("www.auchan.fr answered 403");
  },
};

function fakeHttp(quotaAfter: number) {
  let calls = 0;
  return async (u: string) => {
    if (u.startsWith("https://img.test/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    if (u.includes("/models?")) return Response.json({ models: [{ name: "models/x-flash-lite", supportedGenerationMethods: ["generateContent"] }] });
    if (u.includes(":generateContent")) {
      calls++;
      if (calls > quotaAfter) return new Response("quota", { status: 429 });
      const page = calls === 1 ? 1 : 3;
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify([{ page, title: `Produit ${calls}`, category: "frais", loyalty: false, price: 1.5, startsOn: "2026-11-14" }]) }] } }],
      });
    }
    return new Response("", { status: 404 });
  };
}

describe.skipIf(!url)("refresh", () => {
  it("stores catalogues, reads pages within the quota, and records each source", async () => {
    await refresh(db as any, { today: "2026-11-11", sources: [fakeSource, failing], fetcher: fakeHttp(1), geminiApiKey: "k", pagesPerRequest: 2 });

    expect(await db.select().from(catalogues)).toHaveLength(1);
    const promos = await db.select().from(promotions);
    expect(promos.map((p) => p.title).sort()).toEqual(["Produit 1", "Scie sabre"]);
    const read = promos.find((p) => p.title === "Produit 1")!;
    expect(read).toMatchObject({ startsOn: "2026-11-14", endsOn: "2026-11-18", priceCents: 150, pageImageUrl: "https://img.test/1.jpg" });

    const pages = await db.select().from(cataloguePages);
    expect(pages.filter((p) => p.extractedAt).map((p) => p.number).sort()).toEqual([1, 2]);

    const runs = await db.select().from(fetchRuns);
    expect(runs.find((r) => r.chain === "auchan")).toMatchObject({ ok: false, message: "www.auchan.fr answered 403" });
    expect(runs.find((r) => r.chain === "ia")!.message).toContain("quota");
  });

  it("carries on the next day with the pages left, without duplicating anything", async () => {
    await refresh(db as any, { today: "2026-11-12", sources: [fakeSource], fetcher: fakeHttp(10), geminiApiKey: "k", pagesPerRequest: 2 });
    const pages = await db.select().from(cataloguePages);
    expect(pages.every((p) => p.extractedAt)).toBe(true);
    expect(await db.select().from(catalogues)).toHaveLength(1);
    expect((await db.select().from(promotions)).filter((p) => p.title === "Scie sabre")).toHaveLength(1);
  });

  it("forgets catalogues six months after they end", async () => {
    await refresh(db as any, { today: "2027-06-01", sources: [], fetcher: fakeHttp(0) });
    expect(await db.select().from(catalogues)).toHaveLength(0);
    expect(await db.select().from(promotions)).toHaveLength(0);
  });
});
