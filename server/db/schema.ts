import { boolean, date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** A catalogue (prospectus) published by a chain. */
export const catalogues = pgTable(
  "catalogues",
  {
    id: serial("id").primaryKey(),
    chain: text("chain").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    sourceUrl: text("source_url"),
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("catalogues_chain_external").on(t.chain, t.externalId)],
);

/** A page of a catalogue, to be read by the AI once. */
export const cataloguePages = pgTable(
  "catalogue_pages",
  {
    id: serial("id").primaryKey(),
    catalogueId: integer("catalogue_id").notNull().references(() => catalogues.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    imageUrl: text("image_url").notNull(),
    /** Set once the page has been read, even if it held nothing. */
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [uniqueIndex("catalogue_pages_number").on(t.catalogueId, t.number)],
);

export const promotions = pgTable(
  "promotions",
  {
    id: serial("id").primaryKey(),
    catalogueId: integer("catalogue_id").notNull().references(() => catalogues.id, { onDelete: "cascade" }),
    /** Unique inside the catalogue: the chain's product ID, or page + title for what the AI read. */
    externalKey: text("external_key").notNull(),
    title: text("title").notNull(),
    brand: text("brand"),
    category: text("category").notNull(),
    priceCents: integer("price_cents"),
    oldPriceCents: integer("old_price_cents"),
    /** The offer as printed: "-34 %", "2e à -50 %", "3 pour 2"… */
    discount: text("discount"),
    /** Offer credited on the loyalty card rather than taken off the price. */
    loyalty: boolean("loyalty").notNull().default(false),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    pageNumber: integer("page_number"),
    imageUrl: text("image_url"),
    pageImageUrl: text("page_image_url"),
    url: text("url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promotions_catalogue_key").on(t.catalogueId, t.externalKey)],
);

export const userSettings = pgTable("user_settings", {
  sub: text("sub").primaryKey(),
  storeIds: text("store_ids").array().notNull(),
  excludedCategories: text("excluded_categories").array().notNull(),
  /** Last time the list was opened: what came after is "nouveau". */
  seenAt: timestamp("seen_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One line per chain and per run, shown in the settings. */
export const fetchRuns = pgTable("fetch_runs", {
  id: serial("id").primaryKey(),
  chain: text("chain").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ok: boolean("ok").notNull(),
  message: text("message").notNull(),
});
