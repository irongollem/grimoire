<template>
  <article class="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" :aria-label="draft.item.name">
    <!-- Title, status, and where it came from -->
    <header class="flex flex-col gap-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 class="min-w-0 text-title font-bold text-foreground">{{ draft.item.name }}</h3>
        <AiGeneratedBadge variant="inline" :provenance="invention.ai_provenance" />
        <span class="ml-auto rounded border border-border px-1.5 py-0.5 text-label text-muted-foreground">
          {{ inventionStatusLabel(invention.status, viewer) }}
        </span>
      </div>
      <p class="text-caption text-muted-foreground">
        {{ rarityLabel }}, {{ typeLabel }}, {{ valueLine }}, {{ isNew ? "New item" : "Already in the campaign" }}
      </p>
      <p v-if="viewer === 'dm' && characterName" class="text-caption text-muted-foreground">
        Invented by {{ characterName }}
      </p>
    </header>

    <!-- What the player asked for, in their own hand -->
    <blockquote v-if="invention.wish" data-hand class="invention-wish border-l-2 border-gold-500/50 pl-3 text-body text-foreground">
      {{ invention.wish }}
    </blockquote>

    <p v-if="draft.item.new && draft.item.new.flavor" class="text-body italic text-muted-foreground">
      {{ draft.item.new.flavor }}
    </p>

    <!-- The declared effects are what the rules were checked against; the prose under them is how the item reads in play. -->
    <section v-if="draft.mechanics.length > 0 || draft.item.new?.rules_text" class="flex flex-col gap-1.5">
      <h4 class="text-label-lg font-semibold text-foreground">What it does</h4>
      <ul v-if="draft.mechanics.length > 0" class="flex list-disc flex-col gap-0.5 pl-5">
        <li v-for="(m, i) in draft.mechanics" :key="i" class="text-body text-foreground">
          {{ inventionMechanicLine(m) }}
        </li>
      </ul>
      <p v-if="draft.item.new?.rules_text" class="text-body text-foreground">{{ draft.item.new.rules_text }}</p>
    </section>

    <InventionRecipeBlock :draft="draft" :discipline="invention.discipline" />

    <section v-if="draft.adjustments.length > 0" class="flex flex-col gap-1">
      <h4 class="text-caption font-semibold text-muted-foreground">Fitted to the rules</h4>
      <ul class="flex flex-col gap-0.5">
        <li v-for="(a, i) in draft.adjustments" :key="i" class="text-caption text-muted-foreground">{{ a }}</li>
      </ul>
    </section>

    <section
      v-if="draft.warnings.length > 0"
      class="flex flex-col gap-1 rounded-md border border-gold-500/40 bg-gold-500/10 p-3"
      role="note"
    >
      <h4 class="text-label-lg font-semibold text-foreground">Check before approving</h4>
      <ul class="flex flex-col gap-0.5">
        <li v-for="(w, i) in draft.warnings" :key="i" class="text-caption text-foreground">{{ w }}</li>
      </ul>
    </section>

    <section v-if="invention.dm_note" class="flex flex-col gap-1">
      <h4 class="text-label-lg font-semibold text-foreground">
        {{ viewer === "player" ? "Your DM's note" : "Your note" }}
      </h4>
      <p data-hand class="invention-wish text-body text-foreground">{{ invention.dm_note }}</p>
    </section>

    <slot name="note" />

    <div v-if="$slots.actions || $slots.default" class="flex flex-wrap justify-end gap-2">
      <slot name="actions" />
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
/*
  An AI-drafted invention (#1103), shown the same way to the player who asked and the DM who
  decides: what it is, what it does, what it costs to make, and what the rules changed. It only
  displays; the caller supplies buttons through `#actions` (or the default slot) and a note
  field through `#note`.

  The wish and the DM's note are hand-written text, so they carry `data-hand` and are set in the
  DM's/player's hand under Vellum (the scoped rule below; vellum.css only reaches rich text).
*/
import { computed } from "vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import InventionRecipeBlock from "@/components/crafting/invention/InventionRecipeBlock.vue";
import { inventionMechanicLine, inventionStatusLabel, inventionValueText, outputIsNew } from "@/lib/crafting/invention";
import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS } from "@/types/item.types";
import type { CraftingInvention } from "@/types/crafting.types";

const { invention, viewer, characterName } = defineProps<{
  invention: CraftingInvention;
  viewer: "player" | "dm";
  characterName?: string;
}>();

const draft = computed(() => invention.draft);
const isNew = computed(() => outputIsNew(draft.value));
const rarityLabel = computed(() => ITEM_RARITY_LABELS[draft.value.item.rarity]);
const typeLabel = computed(() => ITEM_TYPE_LABELS[draft.value.item.item_type]);
const valueLine = computed(() => {
  const each = inventionValueText(draft.value.item.value_cp);
  return draft.value.quantity > 1 ? `${each} each, x ${draft.value.quantity}` : each;
});
</script>

<style scoped>
:root[data-theme^="vellum"] .invention-wish {
  font-family: "Fondamento", var(--vl-serif);
  color: var(--vl-hand-ink);
}
</style>
