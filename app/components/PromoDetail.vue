<script setup lang="ts">
import { categoryLabel } from "#shared/catalog";
import { chainLabel, euros, shortDate, type Promo } from "../utils/format";

defineProps<{ promo: Promo }>();
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-4 items-start">
      <img v-if="promo.imageUrl" :src="promo.imageUrl" alt="" class="size-24 object-contain rounded-md bg-elevated" />
      <div class="space-y-1">
        <p v-if="promo.brand" class="text-sm text-muted">{{ promo.brand }}</p>
        <p class="text-2xl font-semibold">
          <span v-if="promo.priceCents !== null">{{ euros(promo.priceCents) }}</span>
          <span v-if="promo.oldPriceCents !== null" class="text-base text-muted line-through ml-2">{{ euros(promo.oldPriceCents) }}</span>
        </p>
        <p v-if="promo.discount" class="text-primary font-semibold">{{ promo.discount }}</p>
        <p v-if="promo.loyalty" class="text-sm">Offre créditée sur la carte de fidélité</p>
      </div>
    </div>
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt class="text-muted">Magasin</dt>
      <dd>{{ chainLabel(promo.chain) }}</dd>
      <dt class="text-muted">Dates</dt>
      <dd>du {{ shortDate(promo.startsOn) }} au {{ shortDate(promo.endsOn) }}</dd>
      <dt class="text-muted">Rayon</dt>
      <dd>{{ categoryLabel(promo.category) }}</dd>
      <dt class="text-muted">Catalogue</dt>
      <dd>
        <a v-if="promo.catalogueUrl" :href="promo.catalogueUrl" target="_blank" rel="noopener noreferrer" class="underline">{{ promo.catalogueTitle }}</a>
        <span v-else>{{ promo.catalogueTitle }}</span>
        <span v-if="promo.pageNumber">, page {{ promo.pageNumber }}</span>
      </dd>
    </dl>
    <a v-if="promo.url" :href="promo.url" target="_blank" rel="noopener noreferrer" class="text-sm underline">Voir le produit sur le site</a>
    <figure v-if="promo.pageImageUrl" class="space-y-1">
      <figcaption class="text-xs text-muted">Page du catalogue, pour vérifier :</figcaption>
      <a :href="promo.pageImageUrl" target="_blank" rel="noopener noreferrer">
        <img :src="promo.pageImageUrl" alt="Page du catalogue" loading="lazy" class="w-full rounded-md border border-default" />
      </a>
    </figure>
  </div>
</template>
