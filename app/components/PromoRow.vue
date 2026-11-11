<script setup lang="ts">
import { categoryLabel } from "#shared/catalog";
import { CHAIN_COLORS, chainLabel, euros, shortDate, type Promo } from "../utils/format";

defineProps<{ promo: Promo; running?: boolean }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button
    type="button"
    class="w-full text-left flex gap-3 items-center py-3 px-1 border-b border-default last:border-0 active:bg-elevated/60"
    @click="$emit('open')"
  >
    <div class="size-14 shrink-0 rounded-md bg-elevated overflow-hidden flex items-center justify-center">
      <img v-if="promo.imageUrl" :src="promo.imageUrl" alt="" loading="lazy" class="object-contain size-full" />
      <span v-else class="text-xs text-muted text-center px-1 leading-tight">{{ categoryLabel(promo.category) }}</span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 mb-0.5">
        <span class="text-[10px] font-semibold uppercase rounded px-1.5 py-0.5" :class="CHAIN_COLORS[promo.chain]">
          {{ chainLabel(promo.chain) }}
        </span>
        <span v-if="promo.isNew" class="size-2 rounded-full bg-primary" title="Nouveau" />
        <span v-if="promo.isNew" class="sr-only">Nouveau</span>
        <span v-if="running" class="text-xs text-muted truncate">jusqu'au {{ shortDate(promo.endsOn) }}</span>
      </div>
      <p class="font-medium leading-snug line-clamp-2">{{ promo.title }}</p>
      <div class="flex items-baseline gap-2 text-sm">
        <span v-if="promo.priceCents !== null" class="font-semibold">{{ euros(promo.priceCents) }}</span>
        <span v-if="promo.oldPriceCents !== null" class="text-muted line-through">{{ euros(promo.oldPriceCents) }}</span>
        <span v-if="promo.discount" class="text-primary font-semibold">{{ promo.discount }}</span>
        <span v-if="promo.loyalty" class="text-xs rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 px-1">carte</span>
      </div>
    </div>
  </button>
</template>
