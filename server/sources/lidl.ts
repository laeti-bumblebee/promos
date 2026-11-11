// Lidl publishes its weekly catalogues on lidl.fr about a week before they
// start. Each one is described by a JSON document (endpoints.leaflets.schwarz)
// with its dates, page images and the non-food products as data. Food offers
// are only in the page images: the AI reads them.
import type { CategoryId } from "#shared/catalog";
import { decodeEntities, fetchJson, fetchText, toCents, type FoundCatalogue, type FoundPromotion, type Source } from "./types";

export const LIDL_LISTING_URL = "https://www.lidl.fr/c/catalogues-en-ligne/s10017753";
const FLYER_API = "https://endpoints.leaflets.schwarz/v4/flyer";

interface LidlProduct {
  productId?: string;
  title?: string;
  brand?: string;
  price?: string;
  image?: string;
  url?: string;
  wonCategoryPrimary?: string;
}

interface LidlFlyer {
  id: string;
  name?: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  offerStartDate?: string;
  offerEndDate?: string;
  flyerUrlAbsolute?: string;
  thumbnailUrl?: string;
  pages?: { number: number; image?: string }[];
  products?: Record<string, LidlProduct>;
}

/** Catalogue slugs linked from the listing page, without brochures. */
export function parseLidlListing(html: string): string[] {
  const slugs = new Set<string>();
  for (const m of html.matchAll(/\/l\/catalogue-de-la-semaine\/([a-z0-9-]+)\/ar\/\d+/g)) {
    if (!m[1]!.startsWith("brochure")) slugs.add(m[1]!);
  }
  return [...slugs];
}

const LIDL_CATEGORIES: [RegExp, CategoryId][] = [
  [/b[ée]b[ée]|enfant|jouet/i, "bebe"],
  [/mode|v[êe]tement|textile|chaussure/i, "textile"],
  [/animal|animaux/i, "animaux"],
  [/beaut[ée]|hygi[èe]ne|soin/i, "hygiene"],
  [/vin|alcool|spiritueux|bi[èe]re/i, "alcool"],
  [/bricolage|jardin|cuisine|m[ée]nage|habitat|sport|loisir|maison|multim[ée]dia/i, "maison"],
];

export function lidlCategory(path: string | undefined): CategoryId {
  const world = (path ?? "").split("/").slice(1, 3).join("/");
  return LIDL_CATEGORIES.find(([re]) => re.test(world))?.[1] ?? "autre";
}

export function lidlFlyerToCatalogue(flyer: LidlFlyer): FoundCatalogue | null {
  const startsOn = flyer.offerStartDate ?? flyer.startDate;
  const endsOn = flyer.offerEndDate ?? flyer.endDate;
  if (!flyer.id || !startsOn || !endsOn) return null;
  const promotions: FoundPromotion[] = [];
  for (const p of Object.values(flyer.products ?? {})) {
    if (!p.productId || !p.title) continue;
    promotions.push({
      externalKey: `lidl:${p.productId}`,
      title: decodeEntities(p.title),
      brand: p.brand ? decodeEntities(p.brand) : null,
      category: lidlCategory(p.wonCategoryPrimary),
      priceCents: toCents(p.price),
      imageUrl: p.image ?? null,
      url: p.url ?? null,
    });
  }
  return {
    chain: "lidl",
    externalId: flyer.id,
    title: [flyer.title, flyer.name].filter(Boolean).join(" · ") || "Catalogue Lidl",
    startsOn,
    endsOn,
    sourceUrl: flyer.flyerUrlAbsolute,
    coverUrl: flyer.thumbnailUrl,
    pages: (flyer.pages ?? []).filter((p) => p.image).map((p) => ({ number: p.number, imageUrl: p.image! })),
    promotions,
  };
}

export const lidl: Source = {
  chain: "lidl",
  aiHint:
    "Catalogue Lidl. Les articles non alimentaires (bricolage, cuisine, maison, mode, jouets, sport) sont déjà connus : ignore-les. " +
    "Un jour indiqué (« Jeudi », « Dès lundi ») fixe la date de début de l'offre. « Avec Lidl Plus » signifie une offre carte de fidélité.",
  async fetchCatalogues(fetcher, today) {
    const slugs = parseLidlListing(await fetchText(fetcher, LIDL_LISTING_URL));
    const found: FoundCatalogue[] = [];
    for (const slug of slugs) {
      const url = `${FLYER_API}?flyer_identifier=${encodeURIComponent(slug)}&region_id=0&region_code=0`;
      const reply = await fetchJson<{ flyer?: LidlFlyer }>(fetcher, url);
      const catalogue = reply.flyer && lidlFlyerToCatalogue(reply.flyer);
      if (catalogue && catalogue.endsOn >= today) found.push(catalogue);
    }
    return found;
  },
};
