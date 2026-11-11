<script setup lang="ts">
import { CATEGORIES, CHAIN_LABELS, STORES, SUPPORTED_CHAINS } from "#shared/catalog";

const { data: settings } = await useFetch<{ storeIds: string[]; excludedCategories: string[] }>("/api/settings");
const { data: status, refresh: reloadStatus } = await useFetch<{ chain: string; ok: boolean; message: string; at: string }[]>("/api/status");

const storeIds = ref<string[]>([...(settings.value?.storeIds ?? [])]);
const excluded = ref<string[]>([...(settings.value?.excludedCategories ?? [])]);
const saving = ref(false);
const message = ref("");

function toggle(list: "stores" | "excluded", id: string, on: boolean) {
  const target = list === "stores" ? storeIds : excluded;
  target.value = on ? [...new Set([...target.value, id])] : target.value.filter((x) => x !== id);
}

async function save() {
  saving.value = true;
  message.value = "";
  try {
    await $fetch("/api/settings", { method: "PUT", body: { storeIds: storeIds.value, excludedCategories: excluded.value } });
    message.value = "Réglages enregistrés.";
  } catch {
    message.value = "L'enregistrement a échoué.";
  } finally {
    saving.value = false;
  }
}

const refreshing = ref(false);
async function refreshNow() {
  refreshing.value = true;
  message.value = "";
  try {
    await $fetch("/api/refresh", { method: "POST" });
    message.value = "Mise à jour lancée : elle prend quelques minutes.";
    setTimeout(() => reloadStatus(), 60_000);
  } catch (error) {
    message.value = (error as { statusMessage?: string }).statusMessage ?? "La mise à jour n'a pas pu démarrer.";
  } finally {
    refreshing.value = false;
  }
}

const statusLabel: Record<string, string> = { ...CHAIN_LABELS, ia: "Lecture des catalogues (IA)" };
const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
</script>

<template>
  <UContainer class="py-4 pb-16 max-w-2xl space-y-8" style="padding-top: max(1rem, env(safe-area-inset-top))">
    <header class="flex items-center gap-2">
      <UButton to="/" variant="ghost" color="neutral" icon="i-lucide-arrow-left" aria-label="Retour" />
      <h1 class="text-2xl font-bold">Réglages</h1>
    </header>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">Mes magasins</h2>
      <UCheckbox
        v-for="store in STORES"
        :key="store.id"
        :model-value="storeIds.includes(store.id)"
        :label="store.name"
        :description="SUPPORTED_CHAINS.includes(store.chain) ? store.address : `${store.address} · bientôt disponible`"
        @update:model-value="(on) => toggle('stores', store.id, on === true)"
      />
    </section>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">Rayons à masquer</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UCheckbox
          v-for="category in CATEGORIES"
          :key="category.id"
          :model-value="excluded.includes(category.id)"
          :label="category.label"
          @update:model-value="(on) => toggle('excluded', category.id, on === true)"
        />
      </div>
    </section>

    <div class="flex items-center gap-3">
      <UButton :loading="saving" size="lg" @click="save">Enregistrer</UButton>
      <p v-if="message" class="text-sm" role="status">{{ message }}</p>
    </div>

    <section class="space-y-3">
      <h2 class="text-lg font-semibold">État des sources</h2>
      <p v-if="!status?.length" class="text-sm text-muted">Aucune récupération pour l'instant.</p>
      <ul class="space-y-2 text-sm">
        <li v-for="s in status" :key="s.chain" class="flex gap-2">
          <span :class="s.ok ? 'text-success' : 'text-error'">{{ s.ok ? "OK" : "Échec" }}</span>
          <span>
            <strong>{{ statusLabel[s.chain] ?? s.chain }}</strong> · {{ when(s.at) }}<br />
            <span class="text-muted">{{ s.message }}</span>
          </span>
        </li>
      </ul>
      <UButton variant="outline" :loading="refreshing" @click="refreshNow">Mettre à jour maintenant</UButton>
    </section>

    <form method="post" action="/auth/logout">
      <UButton type="submit" variant="ghost" color="neutral">Se déconnecter</UButton>
    </form>
  </UContainer>
</template>
