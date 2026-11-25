<template>
  <section class="flex flex-col gap-3 border border-border bg-card p-3" aria-label="In the canon" data-testid="npc-in-canon">
    <span class="text-eyebrow text-muted-foreground">In the canon</span>

    <div v-if="knows.length > 0" class="flex flex-col gap-1" data-testid="npc-knows">
      <span class="text-label font-bold text-foreground">Knows</span>
      <ul class="flex flex-col gap-1">
        <li v-for="entry in knows" :key="entry.id" class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3" data-testid="npc-knows-row">
          <RouterLink :to="{ path: '/canon', query: { entry: entry.id } }" class="min-w-0 flex-1 text-body text-foreground underline-offset-2 hover:underline">{{ entry.title || "Untitled" }}</RouterLink>
          <span class="shrink-0 text-label text-muted-foreground">{{ PART_WORD[entry.part] }}</span>
          <AppButton v-if="canTell(entry)" variant="primary" size="sm" label="Tell the party" data-testid="npc-tell" @click="tell(entry)" />
          <span v-else-if="entry.part === 'truth' && entry.revealed_at !== null" class="shrink-0 text-label text-muted-foreground" data-testid="npc-told">Told</span>
        </li>
      </ul>
    </div>

    <div v-if="about.length > 0 || rows.length > 0" class="flex flex-col gap-1" data-testid="npc-about">
      <span class="text-label font-bold text-foreground">About them</span>
      <ul class="flex flex-col gap-1">
        <li v-for="entry in about" :key="entry.id" class="flex min-w-0 items-baseline justify-between gap-3" data-testid="npc-about-row">
          <RouterLink :to="{ path: '/canon', query: { entry: entry.id } }" class="min-w-0 text-body text-foreground underline-offset-2 hover:underline">{{ entry.title || "Untitled" }}</RouterLink>
          <span class="shrink-0 text-label text-muted-foreground">{{ PART_WORD[entry.part] }}</span>
        </li>
        <li v-for="row in rows" :key="row.id" class="flex min-w-0 items-baseline justify-between gap-3" data-testid="npc-lore-row">
          <RouterLink :to="{ path: '/canon', query: { entry: row.id } }" class="min-w-0 text-body text-foreground underline-offset-2 hover:underline">{{ row.title || "Untitled lore" }}</RouterLink>
          <span class="shrink-0 text-label text-muted-foreground" data-testid="npc-lore-told">Lore, {{ row.told }} of {{ row.total }} told</span>
        </li>
      </ul>
    </div>

    <!-- Canon here draws its own two groups ("Clues on them", "Lore to tell through them") in this block's label style. -->
    <div v-if="hasHere" data-testid="npc-on-them">
      <CanonHere kind="npc" :id="npcId" bare />
    </div>

    <p v-if="empty" class="m-0 text-caption text-muted-foreground" data-testid="npc-canon-none">Nothing in the canon is tied to {{ name }} yet.</p>
    <AppButton variant="ghost" size="sm" :icon="IconAdd" icon-size="xs" label="Write lore about this person" class="self-start" :loading="writing" data-testid="write-lore" @click="writeLore" />
  </section>
</template>

<script setup lang="ts">
/**
 * "In the canon" on an NPC's sheet (#1279 item 13, replacing "Told of in"): where this person stands in the canon, in one
 * block. Knows is what they can tell (the entries tied to them as a knower; a truth there offers "Tell the party"), About
 * them is what the canon says of them (truths, secrets, forces and the lore told of them, each lore with how many of its
 * passages are told), and the clues and passages that come out on them are the Canon here lists, drawn without its card.
 * Everything comes with the sheet's one `get_canon_here` read, so the block adds no request of its own (the dm-npc-detail
 * budget). The Relations tab hides canon ties because this block shows them. DM sheets only.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonHere from "@/components/canon/CanonHere.vue";
import { useCanonHere } from "@/composables/canon/useCanonHere";
import type { CanonHereEntry } from "@/composables/canon/useCanonHere";
import { useNpcLore } from "@/composables/canon/useNpcLore";
import { useTellTruth } from "@/composables/canon/useTellTruth";
import { IconAdd } from "@/lib/icons";
import type { CanonPart } from "@/types/canon.types";

const { npcId, name } = defineProps<{ npcId: string; name: string }>();
const { rows, knows, about, writeLore, writing } = useNpcLore(() => npcId, () => name);
const { data: here } = useCanonHere("npc", () => npcId);
// "Tell the party" names no knower, so no entry is bound: binding one would read that entry's connections, a request per row.
const { tellParty } = useTellTruth(() => "");

const PART_WORD: Record<CanonPart, string> = { premise: "Premise", truth: "Truth", force: "Force", secret: "Secret", question: "Question", lore: "Lore", backstory: "Backstory" };

const hasHere = computed(() => (here.value?.clues.length ?? 0) > 0 || (here.value?.passages.length ?? 0) > 0);
const empty = computed(() => knows.value.length === 0 && about.value.length === 0 && rows.value.length === 0 && !hasHere.value);

// A truth told to the party already (knowledge "all") has nothing left to tell.
const canTell = (entry: CanonHereEntry) => entry.part === "truth" && entry.knowledge !== "all";

// useTellTruth reads only the entry's id and when it was first told; the row carries both, so the full entry is not read.
async function tell(entry: CanonHereEntry): Promise<void> {
  await tellParty(entry);
}
</script>
