<template>
  <DashboardWidget
    v-if="dying.length"
    title="Death Saves"
    tone="caution"
    :count="dying.length"
    to="/party"
    action-label="Party tracker →"
    max-height="none"
  >
    <div class="divide-y divide-border">
      <div
        v-for="member in dying"
        :key="member.id"
        class="flex items-center gap-3 px-4 py-2.5"
        :class="member.isDead && 'bg-destructive/5'"
      >
        <div class="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-secondary">
          <FocalImage
            :src="member.portraitUrl"
            :focal-point="member.portraitFocalPoint"
            format="token"
            :alt="member.name"
            placeholder="/assets/placeholders/character.webp"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground">{{ member.name }}</p>
          <p v-if="member.isDead" class="text-caption font-bold uppercase tracking-wide text-destructive">Dead</p>
          <p v-else class="text-caption text-muted-foreground">Making death saves</p>
        </div>
        <div class="flex shrink-0 items-center gap-2.5">
          <div class="flex gap-1" :title="pipsTitle(member.successes, 'success')">
            <span
              v-for="i in 3"
              :key="`s-${member.id}-${i}`"
              class="h-2.5 w-2.5 rounded-full border"
              :class="pipClass(member.successes, i, 'border-elven-green bg-elven-green')"
            />
          </div>
          <div class="flex gap-1" :title="pipsTitle(member.failures, 'failure')">
            <span
              v-for="i in 3"
              :key="`f-${member.id}-${i}`"
              class="h-2.5 w-2.5 rounded-full border"
              :class="pipClass(member.failures, i, 'border-destructive bg-destructive')"
            />
          </div>
        </div>
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useParty } from "@/composables/useParty";
import { deriveDyingPartyMembers } from "@/lib/dashboard/deathSaves";
import FocalImage from "@/components/common/FocalImage.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * The self-hiding death-saves alert (#764).
 *
 * Renders nothing at all unless `deriveDyingPartyMembers` finds someone down
 * — that absence is the entire design. The widget is not a status panel that
 * happens to be empty most sessions; it does not exist on the page until it
 * has something the DM must see immediately, which is why it skips
 * `DashboardWidget`'s `loading`/`empty` slots that every other widget here
 * uses: there is no "nothing to show yet" state to render, only "not shown".
 */
const { data: party } = useParty();

/**
 * `?? []` is safe *here specifically*, and nowhere else in this folder: an
 * unloaded roster and a roster with nobody dying both render nothing at all,
 * so collapsing them loses no distinction. Every non-self-hiding widget has to
 * keep them apart — see `RollTableWidget` — because there the collapse would
 * show an empty state before the query had looked.
 */
const dying = computed(() => deriveDyingPartyMembers(party.value ?? []));

/**
 * A pip is only ever solid-filled up to a real count. A `null` count (no
 * saves recorded at all — see `deathSaves.ts`) renders every pip in the same
 * dashed, unfilled outline so it reads as "unknown" rather than quietly
 * matching the look of "0 successes so far" — the two are different facts
 * and the pips say so.
 */
function pipClass(count: number | null, index: number, filledClass: string): string {
  if (count === null) return "border-dashed border-muted-foreground/30";
  return index <= count ? filledClass : "border-muted-foreground/40";
}

function pipsTitle(count: number | null, kind: "success" | "failure"): string {
  if (count === null) return `No ${kind} saves recorded`;
  return `${count} of 3 ${kind}${count === 1 ? "" : "es"}`;
}
</script>
