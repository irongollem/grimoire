<template>
  <!-- A sheet, not a list: the head is the kit's chapter head, and from 80rem of the chapter's own width the players' book sits in a right margin. -->
  <div class="@container flex min-w-0 items-start gap-6" data-chapter="premise">
    <div class="flex min-w-0 flex-1 flex-col gap-4 @7xl:max-w-3xl">
      <header class="flex items-start gap-2">
        <div class="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 class="m-0 text-heading-sm font-bold">{{ chapter.label }}</h2>
          <p class="m-0 text-caption italic text-muted-foreground">{{ chapter.why }}</p>
        </div>
        <CanonSuggest request="Suggest a premise for my campaign: a pitch, themes and how it plays." />
      </header>

      <CanonReview mode="premise" :entries="entries" />
      <PremiseWorld :campaign="campaign" />
      <PremisePitch :pitches="ofKind('pitch')" :calendar-id="campaign.calendar_id" />

      <!-- Side by side only when the column itself is wide enough, whatever the screen. -->
      <div class="grid items-start gap-4 @3xl:grid-cols-2">
        <PremiseLines title="Themes" item-label="Theme" placeholder="Kindness is a kind of courage…" :kinds="['theme']" :entries="premise" />
        <PremiseLines title="At the table" item-label="Table note" placeholder="Talk and wandering more than fights…" :kinds="['table']" :entries="premise" />
      </div>

      <LineRequestInbox :sort-order="lineAndVeilCount" />
      <PremiseLines
        title="Lines and veils"
        item-label="Line or veil"
        placeholder="What must never, or only off screen, happen…"
        :kinds="['line', 'veil']"
        :entries="premise"
      />
      <!-- The dial is how the table plays, not a fact about the world, so it stays in Settings; the Narrator reads both. -->
      <p v-if="tableOpen" class="m-0 text-caption text-muted-foreground" data-testid="premise-violence">
        Violence and horror at the AI table: {{ tableViolenceLabel(campaign.table_violence) }}. Change it in
        <AppButton to="/campaign/settings" variant="link" size="inline" label="Campaign settings" />.
      </p>

      <CanonBlock title="For the AI, never printed" data-testid="premise-ai">
        <div class="grid items-start gap-4 @3xl:grid-cols-2">
          <PremiseTextField
            kind="voice"
            label="Voice"
            placeholder="How its text reads and its names sound: dry and warm, gothic and slow…"
            help="Players never read this. Every AI suggestion is written from it."
            :campaign-id="campaign.id"
            :entry="ofKind('voice')[0]"
          />
          <PremiseLook :campaign="campaign" :entry="ofKind('look')[0]" />
        </div>
      </CanonBlock>
    </div>

    <PremiseBookPreview class="hidden w-[28rem] flex-none @7xl:flex" :entries="premise" />
  </div>
</template>

<script setup lang="ts">
/**
 * Premise and tone, as a sheet: the world, the pitch, themes, how it plays at the table, lines and veils, and (last,
 * in one card) the voice and look every AI suggestion is written and painted from. From 80rem a margin shows what of it
 * the players would read.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useTableAccess } from "@/composables/campaign/useTableAccess";
import { tableViolenceLabel } from "@/lib/campaign/tableViolence";
import { chapterOf } from "@/lib/canon/canonParts";
import CanonReview from "./CanonReview.vue";
import CanonBlock from "./kit/CanonBlock.vue";
import CanonSuggest from "./kit/CanonSuggest.vue";
import LineRequestInbox from "./LineRequestInbox.vue";
import PremiseBookPreview from "./PremiseBookPreview.vue";
import PremiseLook from "./PremiseLook.vue";
import PremiseLines from "./PremiseLines.vue";
import PremisePitch from "./PremisePitch.vue";
import PremiseTextField from "./PremiseTextField.vue";
import PremiseWorld from "./PremiseWorld.vue";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";

const { campaign, entries } = defineProps<{ campaign: Campaign; entries: readonly CanonEntry[] }>();

const chapter = chapterOf("premise");
const { open: tableOpen } = useTableAccess();
const premise = computed(() => entries.filter((e) => e.part === "premise"));
/** Where a line or veil asked for by a player lands: after the ones already there, as the add row does. */
const lineAndVeilCount = computed(() => premise.value.filter((e) => e.premise_kind === "line" || e.premise_kind === "veil").length);
function ofKind(kind: PremiseKind): CanonEntry[] {
  return premise.value.filter((e) => e.premise_kind === kind);
}
</script>
