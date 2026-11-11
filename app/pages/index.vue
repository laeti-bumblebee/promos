<script setup lang="ts">
import { STORES, storeChains, type Chain } from "#shared/catalog";
import { chainLabel, groupByStart, normalize, type Promo } from "../utils/format";

const { data, pending, error } = await useFetch<{ today: string; seenAt: string | null; promotions: Promo[] }>("/api/promotions");
const { data: settings } = await useFetch<{ storeIds: string[] }>("/api/settings");

const search = ref("");
const hiddenChains = ref<Chain[]>([]);
const showRunning = ref(false);
const selected = ref<Promo | null>(null);
const detailOpen = computed({
  get: () => selected.value !== null,
  set: (open) => {
    if (!open) selected.value = null;
  },
});

const chains = computed(() => storeChains(settings.value?.storeIds ?? STORES.map((s) => s.id)));

function toggleChain(chain: Chain) {
  hiddenChains.value = hiddenChains.value.includes(chain)
    ? hiddenChains.value.filter((c) => c !== chain)
    : [...hiddenChains.value, chain];
}

const visible = computed(() => {
  const words = normalize(search.value).split(/\s+/).filter(Boolean);
  return (data.value?.promotions ?? []).filter((p) => {
    if (hiddenChains.value.includes(p.chain)) return false;
    const text = normalize(`${p.title} ${p.brand ?? ""}`);
    return words.every((w) => text.includes(w));
  });
});

const grouped = computed(() => groupByStart(visible.value, data.value?.today ?? ""));
const newCount = computed(() => visible.value.filter((p) => p.isNew).length);

// Opening the list counts as having seen it: next time, only what came after is "nouveau".
onMounted(() => {
  if (data.value) $fetch("/api/seen", { method: "POST" }).catch(() => {});
});
</script>

<template>
  <UContainer class="py-4 pb-16 max-w-2xl" style="padding-top: max(1rem, env(safe-area-inset-top))">
    <header class="flex items-center justify-between gap-2 mb-3">
      <h1 class="text-2xl font-bold">Promos à venir</h1>
      <UButton to="/reglages" variant="ghost" color="neutral" icon="i-lucide-settings" aria-label="Réglages" />
    </header>

    <UInput v-model="search" icon="i-lucide-search" placeholder="Rechercher (café, lessive…)" class="w-full mb-3" size="lg" />

    <div class="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filtrer par magasin">
      <UButton
        v-for="chain in chains"
        :key="chain"
        size="sm"
        :variant="hiddenChains.includes(chain) ? 'outline' : 'solid'"
        :color="hiddenChains.includes(chain) ? 'neutral' : 'primary'"
        :aria-pressed="!hiddenChains.includes(chain)"
        @click="toggleChain(chain)"
      >
        {{ chainLabel(chain) }}
      </UButton>
    </div>

    <p v-if="error" class="text-error">Impossible de charger les promotions.</p>
    <p v-else-if="pending">Chargement…</p>
    <template v-else>
      <p v-if="newCount" class="text-sm mb-2">
        <span class="inline-block size-2 rounded-full bg-primary mr-1" />{{ newCount }} nouveauté(s) depuis ta dernière visite
      </p>

      <div v-if="grouped.groups.length === 0 && grouped.running.length === 0" class="text-muted py-8 text-center space-y-2">
        <p>Aucune promotion pour l'instant.</p>
        <p class="text-sm">Les catalogues sont récupérés deux fois par jour. Vérifie aussi les magasins cochés dans les réglages.</p>
      </div>

      <section v-for="group in grouped.groups" :key="group.key" class="mb-6">
        <h2 class="sticky top-0 z-10 bg-default/95 backdrop-blur py-2 text-lg font-semibold">
          {{ group.label }} <span class="text-sm font-normal text-muted">· {{ group.items.length }}</span>
        </h2>
        <PromoRow v-for="promo in group.items" :key="promo.id" :promo="promo" @open="selected = promo" />
      </section>

      <section v-if="grouped.running.length" class="mt-8">
        <UButton block variant="soft" color="neutral" @click="showRunning = !showRunning">
          {{ showRunning ? "Masquer" : "Voir" }} {{ grouped.running.length === 1 ? "la promo déjà en cours" : `les ${grouped.running.length} promos déjà en cours` }}
        </UButton>
        <div v-if="showRunning" class="mt-2">
          <PromoRow v-for="promo in grouped.running" :key="promo.id" :promo="promo" running @open="selected = promo" />
        </div>
      </section>
    </template>

    <USlideover v-model:open="detailOpen" side="bottom" :title="selected?.title ?? ''" description="Détail de la promotion">
      <template #body>
        <PromoDetail v-if="selected" :promo="selected" />
      </template>
    </USlideover>
  </UContainer>
</template>
