// What the app knows without a database: the stores on offer and the
// categories. Shared by the server and the pages.

export type Chain = "superu" | "auchan" | "intermarche" | "leclerc" | "lidl";

export interface Store {
  id: string;
  chain: Chain;
  name: string;
  address: string;
}

export const STORES: Store[] = [
  { id: "superu-viroflay", chain: "superu", name: "Super U Viroflay", address: "47 av. du Général Leclerc, 78220 Viroflay" },
  { id: "auchan-velizy", chain: "auchan", name: "Auchan Vélizy 2", address: "Centre commercial Vélizy 2, 78140 Vélizy-Villacoublay" },
  { id: "intermarche-velizy", chain: "intermarche", name: "Intermarché Express Vélizy", address: "78140 Vélizy-Villacoublay" },
  { id: "leclerc-massy", chain: "leclerc", name: "E.Leclerc Massy", address: "Route de Palaiseau, 91300 Massy" },
  { id: "lidl-massy", chain: "lidl", name: "Lidl Massy", address: "14 rue du Pileu, 91300 Massy" },
];

export const CHAIN_LABELS: Record<Chain, string> = {
  superu: "Super U",
  auchan: "Auchan",
  intermarche: "Intermarché",
  leclerc: "Leclerc",
  lidl: "Lidl",
};

/** Chains whose promotions the app can fetch so far. */
export const SUPPORTED_CHAINS: Chain[] = ["lidl", "auchan"];

export const CATEGORIES = [
  { id: "frais", label: "Frais" },
  { id: "epicerie-salee", label: "Épicerie salée" },
  { id: "epicerie-sucree", label: "Épicerie sucrée" },
  { id: "boissons", label: "Boissons" },
  { id: "alcool", label: "Alcool & vin" },
  { id: "surgeles", label: "Surgelés" },
  { id: "hygiene", label: "Hygiène & beauté" },
  { id: "entretien", label: "Entretien" },
  { id: "bebe", label: "Bébé & enfant" },
  { id: "animaux", label: "Animaux" },
  { id: "maison", label: "Maison, bricolage & loisirs" },
  { id: "textile", label: "Textile" },
  { id: "autre", label: "Autre" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];

export function isCategory(value: unknown): value is CategoryId {
  return typeof value === "string" && (CATEGORY_IDS as string[]).includes(value);
}

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Autre";
}

export function storeChains(storeIds: string[]): Chain[] {
  return [...new Set(STORES.filter((s) => storeIds.includes(s.id)).map((s) => s.chain))];
}
