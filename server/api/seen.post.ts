import { STORES } from "#shared/catalog";
import { userSettings } from "../db/schema";

/** The list was looked at: what arrives from now on is "nouveau". */
export default defineEventHandler(async (event) => {
  const sub = currentSub(event);
  const now = new Date();
  await useDb()
    .insert(userSettings)
    .values({ sub, storeIds: STORES.map((s) => s.id), excludedCategories: [], seenAt: now })
    .onConflictDoUpdate({ target: userSettings.sub, set: { seenAt: now } });
  return { seenAt: now };
});
