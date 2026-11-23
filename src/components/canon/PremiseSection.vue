<template>
  <section id="canon-premise" class="flex scroll-mt-4 flex-col gap-3" aria-labelledby="canon-premise-heading">
    <CanonRubric id="canon-premise-heading" numeral="I" title="Premise and tone" />

    <div class="@container flex flex-col gap-4 border border-border bg-card p-4">
      <PremiseWorld :campaign="campaign" />
      <CanonSuggestFold part="premise"><CanonSuggestions mode="premise" :entries="entries" /></CanonSuggestFold>
      <PremisePitch :pitches="ofKind('pitch')" :calendar-id="campaign.calendar_id" />

      <!-- Side by side only when the column itself is wide: with the truth's aside open it is not, whatever the screen. -->
      <div class="grid gap-4 @2xl:grid-cols-2">
        <PremiseLines
          title="Themes"
          item-label="Theme"
          placeholder="Kindness is a kind of courage…"
          :kinds="['theme']"
          :entries="premise"
        />
        <PremiseLines
          title="At the table"
          item-label="Table note"
          placeholder="Talk and wandering more than fights…"
          :kinds="['table']"
          :entries="premise"
        />
      </div>

      <PremiseLines
        title="Lines and veils"
        item-label="Line or veil"
        placeholder="What must never, or only off screen, happen…"
        :kinds="['line', 'veil']"
        :entries="premise"
      />
      <!-- The dial is how the table plays, not a fact about the world, so it stays in Settings; the Narrator reads both. -->
      <p v-if="tableOpen" class="-mt-2 m-0 text-caption text-muted-foreground" data-testid="premise-violence">
        Violence and horror at the AI table: {{ tableViolenceLabel(campaign.table_violence) }}. Change it in
        <AppButton to="/campaign/settings" variant="link" size="inline" label="Campaign settings" />.
      </p>

      <div class="grid gap-4 border-t border-border pt-4 @2xl:grid-cols-2">
        <PremiseTextField
          kind="voice"
          label="Voice"
          placeholder="How its text reads and its names sound: dry and warm, gothic and slow…"
          help="Players never read this. Every AI suggestion is written from it."
          :campaign-id="campaign.id"
          :entry="ofKind('voice')[0]"
        />
        <PremiseTextField
          kind="look"
          label="Look"
          placeholder="How its pictures are painted: storybook gouache, candlelit oils…"
          help="Players never read this. Every AI picture is painted from it."
          :campaign-id="campaign.id"
          :entry="ofKind('look')[0]"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Part I (frame 02): the world, the pitch, themes, how it plays at the table, lines and veils, and the voice and
 * look every AI suggestion is written and painted from.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useTableAccess } from "@/composables/campaign/useTableAccess";
import { tableViolenceLabel } from "@/lib/campaign/tableViolence";
import CanonSuggestFold from "./CanonSuggestFold.vue";
import CanonSuggestions from "./CanonSuggestions.vue";
import CanonRubric from "./CanonRubric.vue";
import PremiseLines from "./PremiseLines.vue";
import PremisePitch from "./PremisePitch.vue";
import PremiseTextField from "./PremiseTextField.vue";
import PremiseWorld from "./PremiseWorld.vue";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";

const { campaign, entries } = defineProps<{ campaign: Campaign; entries: readonly CanonEntry[] }>();

const { open: tableOpen } = useTableAccess();
const premise = computed(() => entries.filter((e) => e.part === "premise"));
function ofKind(kind: PremiseKind): CanonEntry[] {
  return premise.value.filter((e) => e.premise_kind === kind);
}
</script>
