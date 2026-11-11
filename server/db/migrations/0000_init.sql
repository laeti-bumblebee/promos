CREATE TABLE "catalogue_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogue_id" integer NOT NULL,
	"number" integer NOT NULL,
	"image_url" text NOT NULL,
	"extracted_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "catalogues" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"source_url" text,
	"cover_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"catalogue_id" integer NOT NULL,
	"external_key" text NOT NULL,
	"title" text NOT NULL,
	"brand" text,
	"category" text NOT NULL,
	"price_cents" integer,
	"old_price_cents" integer,
	"discount" text,
	"loyalty" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"page_number" integer,
	"image_url" text,
	"page_image_url" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"sub" text PRIMARY KEY NOT NULL,
	"store_ids" text[] NOT NULL,
	"excluded_categories" text[] NOT NULL,
	"seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalogue_pages" ADD CONSTRAINT "catalogue_pages_catalogue_id_catalogues_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."catalogues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_catalogue_id_catalogues_id_fk" FOREIGN KEY ("catalogue_id") REFERENCES "public"."catalogues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_pages_number" ON "catalogue_pages" USING btree ("catalogue_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogues_chain_external" ON "catalogues" USING btree ("chain","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_catalogue_key" ON "promotions" USING btree ("catalogue_id","external_key");