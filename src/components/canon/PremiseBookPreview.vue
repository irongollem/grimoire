<template>
  <aside class="flex flex-col gap-2" aria-label="In the players' book" data-testid="premise-book-preview">
    <h3 class="m-0 text-body font-bold">In the players' book</h3>
    <div class="flex flex-col gap-4 rounded-lg border border-border bg-card p-6" data-testid="premise-book-page">
      <p v-if="empty" class="m-0 text-body italic text-muted-foreground" data-testid="premise-book-empty">
        Nothing is shared yet. Share the pitch, a theme or a table note and it appears here, as the players would read it.
      </p>
      <template v-else>
        <p v-if="pitch !== ''" class="m-0 whitespace-pre-line text-body" data-testid="premise-book-pitch">{{ pitch }}</p>
        <section v-if="themes.length > 0" class="flex flex-col gap-1">
          <h4 class="m-0 text-body font-bold">What this campaign is about</h4>
          <ul class="m-0 flex list-disc flex-col gap-0.5 pl-5">
            <li v-for="theme in themes" :key="theme.id">{{ theme.title }}</li>
          </ul>
        </section>
        <section v-if="table.length > 0 || lines.length > 0 || veils.length > 0" class="flex flex-col gap-1">
          <h4 class="m-0 text-body font-bold">At our table</h4>
          <ul v-if="table.length > 0" class="m-0 flex list-disc flex-col gap-0.5 pl-5">
            <li v-for="note in table" :key="note.id">{{ note.title }}</li>
          </ul>
          <template v-if="lines.length > 0">
            <p class="m-0 mt-1 text-caption text-muted-foreground">Lines: never in the story</p>
            <ul class="m-0 flex list-disc flex-col gap-0.5 pl-5">
              <li v-for="line in lines" :key="line.id">{{ line.title }}</li>
            </ul>
          </template>
          <template v-if="veils.length > 0">
            <p class="m-0 mt-1 text-caption text-muted-foreground">Veils: happen off screen</p>
            <ul class="m-0 flex list-disc flex-col gap-0.5 pl-5">
              <li v-for="veil in veils" :key="veil.id">{{ veil.title }}</li>
            </ul>
          </template>
        </section>
      </template>
    </div>
    <p class="m-0 text-caption italic text-muted-foreground">Only what you share prints. The voice and the look never do.</p>
  </aside>
</template>

<script setup lang="ts">
/**
 * What of the premise the players would read, in book order: the shared pitch, the shared themes under "What this
 * campaign is about", and the shared table notes, lines and veils under "At our table". An entry is shared when any
 * party member may see it. The voice and the look are never in it: they are written for the AI.
 */
import { computed } from "vue";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";

const { entries } = defineProps<{ /** The campaign's premise entries. */ entries: readonly CanonEntry[] }>();

function shared(kind: PremiseKind): CanonEntry[] {
  return entries.filter((e) => e.premise_kind === kind && e.player_visible_to.length > 0);
}

const pitch = computed(() => shared("pitch").map((e) => tiptapToPlainText(e.body).trim()).filter((t) => t !== "").join("\n\n"));
const themes = computed(() => shared("theme"));
const table = computed(() => shared("table"));
const lines = computed(() => shared("line"));
const veils = computed(() => shared("veil"));
const empty = computed(() => pitch.value === "" && themes.value.length + table.value.length + lines.value.length + veils.value.length === 0);
</script>
