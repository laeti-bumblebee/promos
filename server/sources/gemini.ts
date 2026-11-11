// Reads catalogue pages with Google's Gemini API, on its free tier only: the
// key comes from a Google AI Studio project with no billing account, so the
// API refuses (429) rather than charges once the day's quota is spent. On a
// refusal we stop and carry on the next day.
import { CATEGORY_IDS, isCategory } from "#shared/catalog";
import type { Fetcher, FoundPromotion } from "./types";
import { toCents } from "./types";

const API = "https://generativelanguage.googleapis.com/v1beta";

export class QuotaExhausted extends Error {}

export interface PageImage {
  number: number;
  mimeType: string;
  /** base64 */
  data: string;
}

export interface ReadPromotion extends FoundPromotion {
  pageNumber: number;
}

const schema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      page: { type: "INTEGER", description: "Numéro de la page où figure l'offre" },
      title: { type: "STRING", description: "Nom du produit, avec la quantité (ex. « Café moulu 4 x 250 g »)" },
      brand: { type: "STRING", nullable: true },
      category: { type: "STRING", enum: CATEGORY_IDS },
      price: { type: "NUMBER", nullable: true, description: "Prix payé en euros, après remise immédiate" },
      oldPrice: { type: "NUMBER", nullable: true, description: "Prix barré ou prix avant remise, en euros" },
      discount: { type: "STRING", nullable: true, description: "L'offre telle qu'imprimée : « -34 % », « 2e à -50 % », « 3 pour 2 »" },
      loyalty: { type: "BOOLEAN", description: "Vrai si la remise est créditée sur la carte de fidélité au lieu d'être déduite du prix" },
      startsOn: { type: "STRING", nullable: true, description: "Date de début propre à cette offre (AAAA-MM-JJ), si elle diffère du catalogue" },
      endsOn: { type: "STRING", nullable: true, description: "Date de fin propre à cette offre (AAAA-MM-JJ), si elle diffère du catalogue" },
    },
    required: ["page", "title", "category", "loyalty"],
  },
};

export function buildPrompt(catalogueTitle: string, startsOn: string, endsOn: string, hint: string | undefined): string {
  return [
    `Voici des pages du catalogue de supermarché « ${catalogueTitle} », valable du ${startsOn} au ${endsOn}.`,
    "Liste chaque produit en promotion visible sur ces pages. Une offre par produit ; n'invente rien et ignore ce qui est illisible.",
    "Catégories : frais (fruits, légumes, viande, poisson, crèmerie, traiteur), epicerie-salee, epicerie-sucree, boissons (sans alcool), alcool, surgeles, hygiene, entretien, bebe, animaux, maison (bazar, bricolage, loisirs, jouets exceptés), textile, autre.",
    hint ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface RawItem {
  page?: unknown;
  title?: unknown;
  brand?: unknown;
  category?: unknown;
  price?: unknown;
  oldPrice?: unknown;
  discount?: unknown;
  loyalty?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
}

const isoDate = (v: unknown): string | undefined =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

/** Keeps the well-formed items the model returned, for the pages it was given. */
export function parseItems(text: string, pageNumbers: number[]): ReadPromotion[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The AI's answer was not JSON");
  }
  if (!Array.isArray(raw)) throw new Error("The AI's answer was not a list");
  const seen = new Set<string>();
  const items: ReadPromotion[] = [];
  for (const item of raw as RawItem[]) {
    const page = Number(item.page);
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!pageNumbers.includes(page) || !title) continue;
    const externalKey = `p${page}:${title.toLowerCase().replace(/\s+/g, " ")}`.slice(0, 200);
    if (seen.has(externalKey)) continue;
    seen.add(externalKey);
    items.push({
      externalKey,
      pageNumber: page,
      title,
      brand: typeof item.brand === "string" && item.brand.trim() ? item.brand.trim() : null,
      category: isCategory(item.category) ? item.category : "autre",
      priceCents: toCents(item.price),
      oldPriceCents: toCents(item.oldPrice),
      discount: typeof item.discount === "string" && item.discount.trim() ? item.discount.trim() : null,
      loyalty: item.loyalty === true,
      startsOn: isoDate(item.startsOn),
      endsOn: isoDate(item.endsOn),
    });
  }
  return items;
}

/**
 * The model to use: GEMINI_MODEL if set, otherwise the newest "flash-lite"
 * model the key may call (the free tier's most generous one).
 */
export async function pickModel(fetcher: Fetcher, apiKey: string, configured?: string): Promise<string> {
  if (configured) return configured.replace(/^models\//, "");
  const reply = await fetcher(`${API}/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`);
  if (!reply.ok) throw new Error(`Gemini model list answered ${reply.status}`);
  const { models = [] } = (await reply.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };
  const candidates = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /flash-lite/.test(n) && !/preview|exp|tts|image|audio/.test(n))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  if (!candidates[0]) throw new Error("No Gemini flash-lite model available for this key");
  return candidates[0];
}

export async function readPages(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  options: { apiKey: string; model: string; prompt: string; pages: PageImage[] },
): Promise<ReadPromotion[]> {
  const parts = [
    { text: options.prompt },
    ...options.pages.flatMap((p) => [
      { text: `Page ${p.number} :` },
      { inline_data: { mime_type: p.mimeType, data: p.data } },
    ]),
  ];
  const reply = await fetcher(`${API}/models/${options.model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    }),
  });
  if (reply.status === 429) throw new QuotaExhausted("Gemini free quota reached");
  if (!reply.ok) throw new Error(`Gemini answered ${reply.status}: ${(await reply.text()).slice(0, 300)}`);
  const body = (await reply.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseItems(text, options.pages.map((p) => p.number));
}
