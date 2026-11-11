// The nightly job: fetch each chain's catalogues, store them, then have the
// AI read the pages not read yet, as far as the free quota allows.
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { cataloguePages, catalogues, fetchRuns, promotions } from "../db/schema";
import { auchan } from "../sources/auchan";
import { buildPrompt, pickModel, QuotaExhausted, readPages, type PageImage } from "../sources/gemini";
import { lidl } from "../sources/lidl";
import type { FoundCatalogue, FoundPromotion, Source } from "../sources/types";

export const SOURCES: Source[] = [lidl, auchan];

type Db = PostgresJsDatabase<Record<string, never>>;
type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Kept this long after they end, for the watch list to come. */
const KEEP_DAYS = 183;
const MAX_ATTEMPTS = 3;

export interface RefreshOptions {
  today?: string;
  fetcher?: HttpFetch;
  geminiApiKey?: string;
  geminiModel?: string;
  pagesPerRequest?: number;
  maxRequests?: number;
  sources?: Source[];
}

export function isoDay(date = new Date()): string {
  // The day in France, where the shops are.
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
}

/** Plain fetch, with a timeout and a browser-like identity. */
export const politeFetch: HttpFetch = (url, init) =>
  fetch(url, {
    ...init,
    signal: AbortSignal.timeout(60_000),
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
      "accept-language": "fr-FR,fr;q=0.9",
      ...(init?.headers ?? {}),
    },
  });

function promotionRow(catalogueId: number, c: { startsOn: string; endsOn: string }, p: FoundPromotion, pageImageUrl?: string) {
  return {
    catalogueId,
    externalKey: p.externalKey,
    title: p.title.slice(0, 300),
    brand: p.brand ?? null,
    category: p.category,
    priceCents: p.priceCents ?? null,
    oldPriceCents: p.oldPriceCents ?? null,
    discount: p.discount ?? null,
    loyalty: p.loyalty ?? false,
    // An offer's own dates must stay inside its catalogue's.
    startsOn: p.startsOn && p.startsOn >= c.startsOn && p.startsOn <= c.endsOn ? p.startsOn : c.startsOn,
    endsOn: p.endsOn && p.endsOn <= c.endsOn && p.endsOn >= c.startsOn ? p.endsOn : c.endsOn,
    pageNumber: p.pageNumber ?? null,
    imageUrl: p.imageUrl ?? null,
    pageImageUrl: pageImageUrl ?? null,
    url: p.url ?? null,
  };
}

const upsertPromotions = (db: Db, rows: ReturnType<typeof promotionRow>[]) =>
  rows.length === 0
    ? Promise.resolve()
    : db
        .insert(promotions)
        .values(rows)
        .onConflictDoUpdate({
          target: [promotions.catalogueId, promotions.externalKey],
          set: {
            title: sql`excluded.title`,
            priceCents: sql`excluded.price_cents`,
            oldPriceCents: sql`excluded.old_price_cents`,
            discount: sql`excluded.discount`,
            startsOn: sql`excluded.starts_on`,
            endsOn: sql`excluded.ends_on`,
          },
        });

export async function storeCatalogue(db: Db, found: FoundCatalogue): Promise<number> {
  const [row] = await db
    .insert(catalogues)
    .values({
      chain: found.chain,
      externalId: found.externalId,
      title: found.title,
      startsOn: found.startsOn,
      endsOn: found.endsOn,
      sourceUrl: found.sourceUrl ?? null,
      coverUrl: found.coverUrl ?? null,
    })
    .onConflictDoUpdate({
      target: [catalogues.chain, catalogues.externalId],
      set: { title: found.title, startsOn: found.startsOn, endsOn: found.endsOn, sourceUrl: found.sourceUrl ?? null, coverUrl: found.coverUrl ?? null },
    })
    .returning({ id: catalogues.id });
  const id = row!.id;
  if (found.pages.length) {
    await db
      .insert(cataloguePages)
      .values(found.pages.map((p) => ({ catalogueId: id, number: p.number, imageUrl: p.imageUrl })))
      .onConflictDoNothing();
  }
  await upsertPromotions(db, found.promotions.map((p) => promotionRow(id, found, p)));
  return id;
}

async function record(db: Db, chain: string, ok: boolean, message: string) {
  await db.insert(fetchRuns).values({ chain, ok, message: message.slice(0, 500) });
}

async function download(fetcher: HttpFetch, url: string, number: number): Promise<PageImage> {
  const reply = await fetcher(url);
  if (!reply.ok) throw new Error(`page ${number}: ${url} answered ${reply.status}`);
  const mimeType = (reply.headers.get("content-type") ?? "image/jpeg").split(";")[0]!;
  const data = Buffer.from(await reply.arrayBuffer()).toString("base64");
  return { number, mimeType: mimeType.startsWith("image/") ? mimeType : "image/jpeg", data };
}

/** Reads pending pages with the AI. Returns how many requests were made. */
export async function readPendingPages(db: Db, options: Required<Pick<RefreshOptions, "today" | "fetcher" | "geminiApiKey" | "pagesPerRequest" | "maxRequests">> & { geminiModel?: string; sources: Source[] }) {
  const pending = await db
    .select({
      pageId: cataloguePages.id,
      number: cataloguePages.number,
      imageUrl: cataloguePages.imageUrl,
      catalogueId: catalogues.id,
      chain: catalogues.chain,
      title: catalogues.title,
      startsOn: catalogues.startsOn,
      endsOn: catalogues.endsOn,
    })
    .from(cataloguePages)
    .innerJoin(catalogues, eq(catalogues.id, cataloguePages.catalogueId))
    .where(and(isNull(cataloguePages.extractedAt), lt(cataloguePages.attempts, MAX_ATTEMPTS), gte(catalogues.endsOn, options.today)))
    // Soonest offers first: they matter most.
    .orderBy(asc(catalogues.startsOn), asc(catalogues.id), asc(cataloguePages.number));
  if (pending.length === 0) return { requests: 0, read: 0, stopped: "" };

  const model = await pickModel(options.fetcher, options.geminiApiKey, options.geminiModel);
  const batches: (typeof pending)[] = [];
  for (const page of pending) {
    const last = batches.at(-1);
    if (last && last[0]!.catalogueId === page.catalogueId && last.length < options.pagesPerRequest) last.push(page);
    else batches.push([page]);
  }

  let requests = 0;
  let read = 0;
  let stopped = "";
  for (const batch of batches) {
    if (requests >= options.maxRequests) {
      stopped = "limite de la nuit atteinte";
      break;
    }
    const first = batch[0]!;
    const ids = batch.map((p) => p.pageId);
    try {
      const images = await Promise.all(batch.map((p) => download(options.fetcher, p.imageUrl, p.number)));
      const hint = options.sources.find((s) => s.chain === first.chain)?.aiHint;
      requests++;
      const items = await readPages(options.fetcher, {
        apiKey: options.geminiApiKey,
        model,
        prompt: buildPrompt(first.title, first.startsOn, first.endsOn, hint),
        pages: images,
      });
      const imageOf = new Map(batch.map((p) => [p.number, p.imageUrl]));
      await upsertPromotions(db, items.map((item) => promotionRow(first.catalogueId, first, item, imageOf.get(item.pageNumber))));
      for (const id of ids) {
        await db.update(cataloguePages).set({ extractedAt: new Date(), lastError: null }).where(eq(cataloguePages.id, id));
      }
      read += batch.length;
    } catch (error) {
      if (error instanceof QuotaExhausted) {
        stopped = "quota gratuit de l'IA atteint, reprise demain";
        break;
      }
      const message = String((error as Error).message ?? error).slice(0, 500);
      for (const id of ids) {
        await db
          .update(cataloguePages)
          .set({ attempts: sql`${cataloguePages.attempts} + 1`, lastError: message })
          .where(eq(cataloguePages.id, id));
      }
    }
  }
  return { requests, read, stopped };
}

let running: Promise<void> | undefined;

/** Runs the whole refresh; a second call while one runs waits for it. */
export function refresh(db: Db, options: RefreshOptions = {}): Promise<void> {
  running ??= doRefresh(db, options).finally(() => {
    running = undefined;
  });
  return running;
}

async function doRefresh(db: Db, options: RefreshOptions): Promise<void> {
  const today = options.today ?? isoDay();
  const fetcher = options.fetcher ?? politeFetch;
  const sources = options.sources ?? SOURCES;

  for (const source of sources) {
    try {
      const found = await source.fetchCatalogues(fetcher, today);
      let count = 0;
      for (const c of found) {
        await storeCatalogue(db, c);
        count += c.promotions.length;
      }
      await record(db, source.chain, true, `${found.length} catalogue(s), ${count} produit(s) déjà détaillé(s)`);
    } catch (error) {
      await record(db, source.chain, false, String((error as Error).message ?? error));
    }
  }

  if (options.geminiApiKey) {
    try {
      const result = await readPendingPages(db, {
        today,
        fetcher,
        sources,
        geminiApiKey: options.geminiApiKey,
        geminiModel: options.geminiModel,
        pagesPerRequest: options.pagesPerRequest ?? 4,
        maxRequests: options.maxRequests ?? 15,
      });
      const left = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(cataloguePages)
        .innerJoin(catalogues, eq(catalogues.id, cataloguePages.catalogueId))
        .where(and(isNull(cataloguePages.extractedAt), lt(cataloguePages.attempts, MAX_ATTEMPTS), gte(catalogues.endsOn, today)));
      await record(
        db,
        "ia",
        true,
        `${result.read} page(s) lue(s) en ${result.requests} requête(s), ${left[0]?.n ?? 0} en attente${result.stopped ? ` (${result.stopped})` : ""}`,
      );
    } catch (error) {
      await record(db, "ia", false, String((error as Error).message ?? error));
    }
  } else {
    await record(db, "ia", false, "Pas de clé Gemini (GEMINI_API_KEY) : les pages ne sont pas lues");
  }

  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - KEEP_DAYS);
  await db.delete(catalogues).where(lte(catalogues.endsOn, limit.toISOString().slice(0, 10)));
  await db.delete(fetchRuns).where(lt(fetchRuns.startedAt, new Date(Date.now() - 30 * 86_400_000)));
}
