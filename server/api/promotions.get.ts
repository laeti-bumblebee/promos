import { and, asc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { storeChains } from "#shared/catalog";
import { catalogues, promotions } from "../db/schema";
import { isoDay } from "../services/refresh";

export default defineEventHandler(async (event) => {
  const settings = await loadSettings(currentSub(event));
  const chains = storeChains(settings.storeIds);
  if (chains.length === 0) return { today: isoDay(), seenAt: settings.seenAt, promotions: [] };
  const today = isoDay();
  const rows = await useDb()
    .select({
      id: promotions.id,
      title: promotions.title,
      brand: promotions.brand,
      category: promotions.category,
      priceCents: promotions.priceCents,
      oldPriceCents: promotions.oldPriceCents,
      discount: promotions.discount,
      loyalty: promotions.loyalty,
      startsOn: promotions.startsOn,
      endsOn: promotions.endsOn,
      pageNumber: promotions.pageNumber,
      imageUrl: promotions.imageUrl,
      pageImageUrl: promotions.pageImageUrl,
      url: promotions.url,
      createdAt: promotions.createdAt,
      chain: catalogues.chain,
      catalogueTitle: catalogues.title,
      catalogueUrl: catalogues.sourceUrl,
    })
    .from(promotions)
    .innerJoin(catalogues, eq(catalogues.id, promotions.catalogueId))
    .where(
      and(
        inArray(catalogues.chain, chains),
        gte(promotions.endsOn, today),
        settings.excludedCategories.length ? notInArray(promotions.category, settings.excludedCategories) : undefined,
      ),
    )
    .orderBy(asc(promotions.startsOn), asc(catalogues.chain), asc(promotions.title))
    .limit(3000);
  const seenAt = settings.seenAt;
  return {
    today,
    seenAt,
    promotions: rows.map(({ createdAt, ...p }: (typeof rows)[number]) => ({ ...p, isNew: seenAt !== null && createdAt > seenAt })),
  };
});
