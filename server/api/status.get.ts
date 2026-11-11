import { desc, sql } from "drizzle-orm";
import { fetchRuns } from "../db/schema";

/** The latest run of each source, for the settings page. */
export default defineEventHandler(async () => {
  const rows = await useDb()
    .selectDistinctOn([fetchRuns.chain])
    .from(fetchRuns)
    .orderBy(fetchRuns.chain, desc(fetchRuns.startedAt));
  return rows.map((r: typeof fetchRuns.$inferSelect) => ({ chain: r.chain, ok: r.ok, message: r.message, at: r.startedAt }));
});
