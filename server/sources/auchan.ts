// Auchan lists its hypermarket catalogues on auchan.fr, with their dates,
// usually the day before they start. Pages are images on cdn.auchan.fr: the
// AI reads them. The page count is found by asking for pages until one is
// missing.
import { decodeEntities, fetchText, frenchDate, type FoundCatalogue, type Source } from "./types";

export const AUCHAN_LISTING_URL = "https://www.auchan.fr/catalogue/hypermarche";
const CDN = "https://cdn.auchan.fr/catalogue/images";
const MAX_PAGES = 80;

export interface AuchanListed {
  code: string;
  /** Folder of the images: "<code>-<number>". */
  folder: string;
  title: string;
  startsOn: string;
  endsOn: string;
  sourceUrl: string;
  coverUrl: string;
}

export function parseAuchanListing(html: string, thisYear: number): AuchanListed[] {
  const found = new Map<string, AuchanListed>();
  for (const m of html.matchAll(/<a\b[^>]*href="\/catalogue\/(\d+-[A-Za-z0-9]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)) {
    const [, code, inner] = m;
    const folder = inner!.match(/images\/[^/]+\/(\d+-[A-Za-z0-9]+-\d+)\/cover/)?.[1];
    const title = inner!.match(/infos_title">([^<]*)</)?.[1];
    const dates = inner!.match(/infos_dates">([^<]*)</)?.[1];
    if (!folder || !title || !dates) continue;
    const parts = dates.match(/(\d{1,2}\/\d{1,2}(?:\/\d{4})?)\D+(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/);
    if (!parts) continue;
    const endsOn = frenchDate(parts[2]!, thisYear);
    const endYear = Number(endsOn?.slice(0, 4) ?? thisYear);
    let startsOn = frenchDate(parts[1]!, endYear);
    // "Du 28/12 au 03/01/2027": the start is the year before.
    if (startsOn && endsOn && startsOn > endsOn) startsOn = frenchDate(parts[1]!, endYear - 1);
    if (!startsOn || !endsOn) continue;
    found.set(code!, {
      code: code!,
      folder,
      title: decodeEntities(title.trim()),
      startsOn,
      endsOn,
      sourceUrl: `https://www.auchan.fr/catalogue/${code}`,
      coverUrl: `${CDN}/452x640/${folder}/cover.jpg`,
    });
  }
  return [...found.values()];
}

export function auchanPageUrl(folder: string, page: number): string {
  return `${CDN}/1200e/${folder}/pages/${page}.jpg`;
}

export const auchan: Source = {
  chain: "auchan",
  aiHint:
    "Catalogue Auchan hypermarché. « Avantage Waaoh » ou « crédité sur la carte » signifie une offre carte de fidélité.",
  async fetchCatalogues(fetcher, today) {
    const listed = parseAuchanListing(await fetchText(fetcher, AUCHAN_LISTING_URL), Number(today.slice(0, 4)));
    const found: FoundCatalogue[] = [];
    for (const c of listed) {
      if (c.endsOn < today) continue;
      const pages: FoundCatalogue["pages"] = [];
      for (let n = 1; n <= MAX_PAGES; n++) {
        const reply = await fetcher(auchanPageUrl(c.folder, n));
        await reply.body?.cancel();
        if (!reply.ok) break;
        pages.push({ number: n, imageUrl: auchanPageUrl(c.folder, n) });
      }
      found.push({
        chain: "auchan",
        externalId: c.code,
        title: c.title,
        startsOn: c.startsOn,
        endsOn: c.endsOn,
        sourceUrl: c.sourceUrl,
        coverUrl: c.coverUrl,
        pages,
        promotions: [],
      });
    }
    return found;
  },
};
