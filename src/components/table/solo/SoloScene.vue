<template>
  <!-- "This column only ever shows what the character knows." Where you are and who is here, nothing else (Table, 02). -->
  <div class="flex flex-col" data-testid="solo-scene">
    <section class="flex flex-col gap-2.5 px-4 py-3.5">
      <span class="text-eyebrow text-muted-foreground">Where you are</span>
      <h2 v-if="placeName" class="text-heading text-foreground">{{ placeName }}</h2>
      <p v-if="placeName && placeSummary" class="text-body text-muted-foreground" data-testid="solo-place-summary">{{ placeSummary }}</p>
      <p v-else class="text-body italic text-muted-foreground">Nowhere in particular yet. The Narrator will say.</p>
    </section>
    <template v-if="pressure">
      <hr class="border-border" />
      <SoloPressure :pressure="pressure" />
    </template>
    <hr class="border-border" />
    <section class="flex flex-col gap-2.5 px-4 py-3.5">
      <span class="text-eyebrow text-muted-foreground">Here with you</span>
      <ul v-if="people.length" class="flex flex-col gap-2.5">
        <li v-for="person in people" :key="person.id" class="flex items-center gap-2.5">
          <span class="flex h-18 w-12 shrink-0 items-center justify-center overflow-hidden border border-input bg-muted text-heading font-bold text-muted-foreground">
            <FocalImage v-if="person.portrait" :src="person.portrait" :alt="person.name" format="portrait" :render-width="200" :focal-point="person.focalPoint" record lightbox class="size-full" />
            <span v-else>{{ person.name.charAt(0).toUpperCase() }}</span>
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-label-lg font-semibold text-foreground">{{ person.name }}</span>
          </span>
        </li>
      </ul>
      <p v-else class="text-body italic text-muted-foreground">No one else is here.</p>
    </section>
    <!-- Only what the character has been shown: the quests and beats the app's own player view would give them. -->
    <template v-if="after.length">
      <hr class="border-border" />
      <section class="flex flex-col gap-2.5 px-4 py-3.5" data-testid="solo-after">
        <span class="text-eyebrow text-muted-foreground">What you are after</span>
        <ul class="flex flex-col gap-3">
          <li v-for="quest in after" :key="quest.questId" class="flex flex-col gap-1">
            <span class="text-label-lg font-semibold text-foreground">{{ quest.title }}</span>
            <span v-for="(line, i) in quest.current" :key="i" class="flex items-baseline gap-2 text-body text-muted-foreground">
              <i class="inline-block size-1.5 shrink-0 rotate-45 bg-primary" aria-hidden="true" />
              <span class="min-w-0"><span v-if="line.threadLabel" class="text-eyebrow">{{ line.threadLabel }}: </span>{{ line.text }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>
    <!-- What this sitting put on record, folded shut: it is the formal memory of the story, there to be looked up,
         not read line by line as it happens (the maintainer, 17 Nov 2026). -->
    <template v-if="recorded.length">
      <hr class="border-border" />
      <section class="flex flex-col px-4 py-2" data-testid="solo-record">
        <AppButton variant="ghost" size="inline" :icon="recordOpen ? IconChevronDown : IconChevronRight" :aria-expanded="recordOpen" class="justify-start py-1.5" @click="recordOpen = !recordOpen">
          <span class="text-eyebrow text-muted-foreground">On record · {{ recorded.length }}</span>
        </AppButton>
        <Transition v-bind="drawerTransition()">
          <ul v-show="recordOpen" class="flex flex-col gap-2 pt-1 pb-2">
            <li v-for="fact in newestFirst" :key="fact.id" class="text-body text-muted-foreground">{{ fact.text }}</li>
          </ul>
        </Transition>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronDown, IconChevronRight } from "@/lib/icons";
import { drawerTransition } from "@/lib/motion";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { getNpcDisplayFocalPoint, getNpcDisplayName, getNpcDisplayPortrait } from "@/lib/npcDisplay";
import type { SceneNpc } from "@/composables/table/useTableScene";
import type { HearthQuestNow } from "@/lib/hearth/currentBeats";
import type { TablePressure } from "@/lib/table/soloTypes";
import SoloPressure from "./SoloPressure.vue";

const { here, pressure = null, after = [], placeSummary = null, recorded = [] } = defineProps<{
  placeName: string | null;
  /** What the character knows of the place; null until it has been shown to them. */
  placeSummary?: string | null;
  here: readonly SceneNpc[];
  /** The clock the scene runs against; null when there is none. */
  pressure?: TablePressure | null;
  /** The quests the played character knows of, each with where it stands now. */
  after?: readonly HearthQuestNow[];
  /** What this sitting put on record that the character knows, oldest first. */
  recorded?: ReadonlyArray<{ id: string; text: string }>;
}>();

const recordOpen = ref(false);
// The latest thing on record is the one most likely to be looked for.
const newestFirst = computed(() => [...recorded].reverse());

// A character in disguise is shown as the disguise: the same rule the DM's own screens apply for players. No
// occupation or description is drawn: the page cannot tell which of a record's facts this character has learned.
const people = computed(() =>
  here.map((npc) => ({
    id: npc.id,
    name: getNpcDisplayName(npc) ?? npc.name,
    portrait: getNpcDisplayPortrait(npc),
    focalPoint: getNpcDisplayFocalPoint(npc) ?? null,
  })),
);
</script>
