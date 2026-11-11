import type { Chain, CategoryId } from "#shared/catalog";

export interface FoundPromotion {
  externalKey: string;
  title: string;
  brand?: string | null;
  category: CategoryId;
  priceCents?: number | null;
  oldPriceCents?: number | null;
  discount?: string | null;
  loyalty?: boolean;
  /** ISO dates (YYYY-MM-DD); the catalogue's when absent. */
  startsOn?: string;
  endsOn?: string;
  pageNumber?: number | null;
  imageUrl?: string | null;
  url?: string | null;
}

export interface FoundCatalogue {
  chain: Chain;
  externalId: string;
  title: string;
  startsOn: string;
  endsOn: string;
  sourceUrl?: string;
  coverUrl?: string;
  /** Pages for the AI to read. */
  pages: { number: number; imageUrl: string }[];
  /** Promotions the chain already gives as data. */
  promotions: FoundPromotion[];
}

export type Fetcher = (url: string) => Promise<Response>;

export interface Source {
  chain: Chain;
  /** Catalogues still running or to come. */
  fetchCatalogues(fetcher: Fetcher, today: string): Promise<FoundCatalogue[]>;
  /** Told to the AI with each page: what to skip, what the chain's signs mean. */
  aiHint?: string;
}

export async function fetchText(fetcher: Fetcher, url: string): Promise<string> {
  const reply = await fetcher(url);
  if (!reply.ok) throw new Error(`${url} answered ${reply.status}`);
  return reply.text();
}

export async function fetchJson<T>(fetcher: Fetcher, url: string): Promise<T> {
  const reply = await fetcher(url);
  if (!reply.ok) throw new Error(`${url} answered ${reply.status}`);
  return (await reply.json()) as T;
}

/** "21.99" or "21,99" → 2199. */
export function toCents(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) && value.trim() !== "" ? Math.round(n * 100) : null;
}

/** "12/11/2026" → "2026-11-12"; "12/11" takes the year from `fallbackYear`. */
export function frenchDate(value: string, fallbackYear: number): string | null {
  const m = value.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y ?? fallbackYear}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

/** Decodes the few HTML entities found in titles. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&acirc;/g, "â")
    .replace(/&ccedil;/g, "ç")
    .replace(/&ndash;/g, "–");
}
