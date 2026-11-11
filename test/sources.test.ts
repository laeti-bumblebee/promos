import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auchan, auchanPageUrl, parseAuchanListing } from "../server/sources/auchan";
import { buildPrompt, parseItems, pickModel, QuotaExhausted, readPages } from "../server/sources/gemini";
import { lidl, lidlCategory, lidlFlyerToCatalogue, parseLidlListing } from "../server/sources/lidl";
import { decodeEntities, frenchDate, toCents } from "../server/sources/types";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("helpers", () => {
  it("reads prices and dates written the French way", () => {
    expect(toCents("21.99")).toBe(2199);
    expect(toCents("2,49 €")).toBe(249);
    expect(toCents(3)).toBe(300);
    expect(toCents("")).toBeNull();
    expect(toCents("abc")).toBeNull();
    expect(frenchDate("12/11", 2026)).toBe("2026-11-12");
    expect(frenchDate("3/1/2027", 2026)).toBe("2027-01-03");
    expect(decodeEntities("Gabby&#39;s &amp; co, &eacute;t&eacute;")).toBe("Gabby's & co, été");
  });
});

describe("Lidl", () => {
  it("finds the catalogues on the listing page, once each, without brochures", () => {
    expect(parseLidlListing(fixture("lidl-listing.html"))).toEqual([
      "du-05-11-au-11-11-les-promos-de-la-semaine",
      "du-12-11-au-18-11-les-promos-de-la-semaine",
      "du-09-11-au-12-11-les-exclus-web-de-la-semaine",
    ]);
  });

  it("turns a flyer into a catalogue with its offer dates, pages and products", () => {
    const { flyer } = JSON.parse(fixture("lidl-flyer.json"));
    const c = lidlFlyerToCatalogue(flyer)!;
    expect(c).toMatchObject({
      chain: "lidl",
      externalId: "01a1aacc-6224-7acf-b018-055857c52401",
      title: "Les promos de la semaine · Du 12/11 au 18/11",
      startsOn: "2026-11-12",
      endsOn: "2026-11-18",
    });
    expect(c.pages.map((p) => p.number)).toEqual([1, 2]);
    expect(c.promotions).toHaveLength(3);
    expect(c.promotions[0]).toMatchObject({ externalKey: "lidl:100410885", priceCents: 2199, category: "maison", brand: "PARKSIDE®" });
    expect(c.promotions.map((p) => p.category)).toEqual(["maison", "textile", "bebe"]);
    expect(c.promotions[2]!.title).toBe("Gabby's Dollhouse poupée");
  });

  it("maps Lidl's worlds to our categories", () => {
    expect(lidlCategory("Mondes de besoins/Cuisine & Ménage/Ustensiles")).toBe("maison");
    expect(lidlCategory("Mondes de besoins/Animaux/Chien")).toBe("animaux");
    expect(lidlCategory(undefined)).toBe("autre");
  });

  it("fetches the listing then each flyer, and leaves out ended ones", async () => {
    const { flyer } = JSON.parse(fixture("lidl-flyer.json"));
    const asked: string[] = [];
    const fetcher = async (url: string) => {
      asked.push(url);
      if (url.includes("catalogues-en-ligne")) return new Response(fixture("lidl-listing.html"));
      const old = url.includes("du-05-11");
      return Response.json({ flyer: { ...flyer, id: url, offerEndDate: old ? "2026-11-11" : flyer.offerEndDate } });
    };
    const found = await lidl.fetchCatalogues(fetcher, "2026-11-12");
    expect(asked).toHaveLength(4);
    expect(found.map((c) => c.externalId).every((id) => !id.includes("du-05-11"))).toBe(true);
    expect(found).toHaveLength(2);
  });

  it("reports a refusal instead of returning nothing", async () => {
    await expect(lidl.fetchCatalogues(async () => new Response("", { status: 403 }), "2026-11-12")).rejects.toThrow("403");
  });
});

describe("Auchan", () => {
  it("reads the catalogues, their dates and image folders", () => {
    const listed = parseAuchanListing(fixture("auchan-listing.html"), 2026);
    expect(listed).toHaveLength(4);
    expect(listed[1]).toEqual({
      code: "4452-kn3HoOJB",
      folder: "4452-kn3HoOJB-54449",
      title: "Décorations Noël & fêtes",
      startsOn: "2026-11-10",
      endsOn: "2026-12-24",
      sourceUrl: "https://www.auchan.fr/catalogue/4452-kn3HoOJB",
      coverUrl: "https://cdn.auchan.fr/catalogue/images/452x640/4452-kn3HoOJB-54449/cover.jpg",
    });
    expect(listed[3]).toMatchObject({ startsOn: "2026-12-28", endsOn: "2027-01-03" });
  });

  it("counts pages by asking for them until one is missing", async () => {
    const fetcher = async (url: string) => {
      if (url.includes("hypermarche")) return new Response(fixture("auchan-listing.html"));
      const page = Number(url.match(/pages\/(\d+)\.jpg/)?.[1]);
      return new Response("img", { status: url.includes("4572-") && page <= 2 ? 200 : 404 });
    };
    const found = await auchan.fetchCatalogues(fetcher, "2026-11-11");
    const weekend = found.find((c) => c.externalId === "4572-hd13YFDC")!;
    expect(weekend.pages).toEqual([
      { number: 1, imageUrl: auchanPageUrl("4572-hd13YFDC-54570", 1) },
      { number: 2, imageUrl: auchanPageUrl("4572-hd13YFDC-54570", 2) },
    ]);
    expect(weekend.startsOn).toBe("2026-11-12");
  });
});

describe("Gemini", () => {
  it("keeps only well-formed items for the pages it was given", () => {
    const items = parseItems(
      JSON.stringify([
        { page: 2, title: "Café moulu 4 x 250 g", brand: "Bellarom", category: "epicerie-sucree", price: 7.49, oldPrice: 9.99, discount: "-25 %", loyalty: false },
        { page: 2, title: "Café moulu 4 x 250 g", category: "epicerie-sucree", loyalty: false },
        { page: 9, title: "Hors sujet", category: "frais", loyalty: false },
        { page: 3, title: "Croquettes", category: "chats", loyalty: true, startsOn: "2026-11-13", endsOn: "pas une date" },
        { page: 3, title: "", category: "frais" },
      ]),
      [2, 3],
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ pageNumber: 2, priceCents: 749, oldPriceCents: 999, discount: "-25 %", brand: "Bellarom" });
    expect(items[1]).toMatchObject({ category: "autre", loyalty: true, startsOn: "2026-11-13", endsOn: undefined });
    expect(() => parseItems("pas du json", [1])).toThrow();
  });

  it("chooses the newest flash-lite model unless one is configured", async () => {
    const fetcher = async () =>
      Response.json({
        models: [
          { name: "models/gemini-2.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-10-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-11-flash-lite-preview", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-12-pro", supportedGenerationMethods: ["generateContent"] },
        ],
      });
    expect(await pickModel(fetcher, "k")).toBe("gemini-10-flash-lite");
    expect(await pickModel(fetcher, "k", "models/custom")).toBe("custom");
  });

  it("sends pages as images with the prompt, and stops on the free quota", async () => {
    let body: any;
    const ok = async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init!.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: '[{"page":1,"title":"Clémentines","category":"frais","loyalty":false}]' }] } }] });
    };
    const pages = [{ number: 1, mimeType: "image/jpeg", data: "AAAA" }];
    const items = await readPages(ok, { apiKey: "k", model: "m", prompt: buildPrompt("Promos", "2026-11-12", "2026-11-18", "indice"), pages });
    expect(items[0]!.title).toBe("Clémentines");
    expect(body.contents[0].parts[0].text).toContain("indice");
    expect(body.contents[0].parts[2]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "AAAA" } });
    await expect(readPages(async () => new Response("", { status: 429 }), { apiKey: "k", model: "m", prompt: "p", pages })).rejects.toBeInstanceOf(QuotaExhausted);
  });
});
