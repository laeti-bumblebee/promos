import { eq } from "drizzle-orm";
import type { H3Event } from "h3";
import { CATEGORY_IDS, STORES } from "#shared/catalog";
import { userSettings } from "../db/schema";

export interface Settings {
  storeIds: string[];
  excludedCategories: string[];
  seenAt: Date | null;
}

export function currentSub(event: H3Event): string {
  const sub = (event.context as { user?: { sub?: string } }).user?.sub;
  if (!sub) throw createError({ statusCode: 401 });
  return sub;
}

export async function loadSettings(sub: string): Promise<Settings> {
  const [row] = await useDb().select().from(userSettings).where(eq(userSettings.sub, sub));
  if (!row) return { storeIds: STORES.map((s) => s.id), excludedCategories: [], seenAt: null };
  return { storeIds: row.storeIds, excludedCategories: row.excludedCategories, seenAt: row.seenAt };
}

/** Keeps only known stores and categories. */
export function cleanSettings(body: unknown): { storeIds: string[]; excludedCategories: string[] } {
  const value = (body ?? {}) as { storeIds?: unknown; excludedCategories?: unknown };
  const list = (v: unknown, allowed: string[]) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))] : [];
  return {
    storeIds: list(value.storeIds, STORES.map((s) => s.id)),
    excludedCategories: list(value.excludedCategories, CATEGORY_IDS),
  };
}
