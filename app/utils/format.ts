import { CHAIN_LABELS, type Chain } from "#shared/catalog";

export interface Promo {
  id: number;
  title: string;
  brand: string | null;
  category: string;
  priceCents: number | null;
  oldPriceCents: number | null;
  discount: string | null;
  loyalty: boolean;
  startsOn: string;
  endsOn: string;
  pageNumber: number | null;
  imageUrl: string | null;
  pageImageUrl: string | null;
  url: string | null;
  chain: Chain;
  catalogueTitle: string;
  catalogueUrl: string | null;
  isNew: boolean;
}

export function euros(cents: number | null): string {
  if (cents === null) return "";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function daysBetween(from: string, to: string): number {
  return Math.round((day(to).getTime() - day(from).getTime()) / 86_400_000);
}

/** "Demain", "Jeudi 13 novembre"… */
export function dayLabel(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  const text = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(day(iso));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(day(iso));
}

export function chainLabel(chain: string): string {
  return CHAIN_LABELS[chain as Chain] ?? chain;
}

export const CHAIN_COLORS: Record<string, string> = {
  lidl: "bg-blue-600 text-yellow-300",
  auchan: "bg-red-600 text-white",
  superu: "bg-sky-700 text-white",
  intermarche: "bg-red-700 text-white",
  leclerc: "bg-orange-500 text-white",
};

/** Upcoming ones grouped by start day; running ones together at the end. */
export function groupByStart(promos: Promo[], today: string) {
  const upcoming = new Map<string, Promo[]>();
  const running: Promo[] = [];
  for (const p of promos) {
    if (p.startsOn <= today) running.push(p);
    else upcoming.set(p.startsOn, [...(upcoming.get(p.startsOn) ?? []), p]);
  }
  const groups = [...upcoming.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsOn, items]) => ({ key: startsOn, label: dayLabel(startsOn, today), items }));
  return { groups, running };
}

/** Lower-case, without accents: "Café" matches "cafe". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
