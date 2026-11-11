import { desc } from "drizzle-orm";
import { fetchRuns } from "../db/schema";
import { refresh } from "../services/refresh";

/** "Mettre à jour maintenant", at most every 10 minutes. */
export default defineEventHandler(async (event) => {
  currentSub(event);
  const db = useDb();
  const [last] = await db.select({ at: fetchRuns.startedAt }).from(fetchRuns).orderBy(desc(fetchRuns.startedAt)).limit(1);
  if (last && Date.now() - last.at.getTime() < 10 * 60_000) {
    throw createError({ statusCode: 429, statusMessage: "Une mise à jour vient d'avoir lieu, réessaie dans quelques minutes." });
  }
  // Not awaited: it takes minutes. The settings page shows the result.
  void refresh(db, runtimeRefreshOptions()).catch((error) => console.error("refresh failed", error));
  return { started: true };
});
