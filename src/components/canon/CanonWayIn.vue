<template>
  <section class="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-border bg-card p-4" data-testid="canon-way-in">
    <header class="flex flex-col gap-1">
      <!-- At the top, where it is seen: at the bottom of the steps it was missed. -->
      <AppButton class="self-end" variant="outline" size="sm" label="Skip to the chapters" data-testid="way-in-skip" @click="skip" />
      <h2 class="m-0 font-display text-title">Your campaign's background book</h2>
      <p class="m-0 text-body text-muted-foreground">
        Everything about your world that is not a person, a place, a quest or a faction goes here, and it prints as a book beside the rest. Four short steps give it ground to stand on; the rest grows as you play.
      </p>
    </header>

    <div class="flex flex-wrap items-center gap-2">
      <span class="text-caption text-muted-foreground">Or start another way:</span>
      <AppButton variant="outline" size="sm" to="/canon/import" label="Bring in a book you have" />
      <CanonSuggest label="Let the Familiar walk you through it" request="Walk me through building my campaign's canon, one chapter at a time." />
    </div>

    <ol class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="(step, i) in steps"
        :key="step.id"
        class="flex flex-col gap-2 rounded-lg border border-border px-3 py-2"
        :class="{ 'opacity-60': !step.done && step.id !== current }"
        :data-testid="`way-in-${step.id}`"
        :data-state="step.done ? 'done' : step.id === current ? 'open' : 'later'"
      >
        <div class="flex items-baseline gap-2">
          <span class="text-body font-medium">{{ i + 1 }}. {{ TITLES[step.id] }}</span>
          <span v-if="step.count !== undefined && !step.done" class="text-caption text-muted-foreground">{{ step.count }} of 3</span>
          <span v-if="step.done" class="ml-auto text-caption text-muted-foreground" data-testid="way-in-done">✓ Done</span>
        </div>

        <template v-if="step.id === current">
          <p class="m-0 text-caption text-muted-foreground">{{ HINTS[step.id] }}</p>
          <AppButton v-if="step.id === 'pitch'" class="self-start" variant="outline" size="sm" to="/canon/premise" label="Write the pitch" />
          <CanonAddRow
            v-else
            v-model="draft"
            :placeholder="ADD[step.id as Exclude<WayInStepId, 'pitch'>].placeholder"
            :input-label="ADD[step.id as Exclude<WayInStepId, 'pitch'>].label"
            :label="ADD[step.id as Exclude<WayInStepId, 'pitch'>].button"
            :create="(title) => add(step.id, title)"
          >
            <CanonSuggest v-if="step.id === 'truths' || step.id === 'force'" :label="step.id === 'truths' ? 'Ask the Familiar for three' : 'Ask the Familiar'" :request="REQUESTS[step.id]" />
          </CanonAddRow>
          <p v-if="step.id === 'secret' && madeSecret !== null" class="m-0 flex flex-wrap items-center gap-2 text-caption text-muted-foreground" data-testid="way-in-clue">
            Now give it a clue.
            <AppButton variant="outline" size="sm" :to="`/canon/secrets?entry=${madeSecret}`" label="Open the secret" />
          </p>
        </template>
      </li>
    </ol>

  </section>
</template>

<script setup lang="ts">
/**
 * What a new canon shows in place of its chapters: the four short steps (pitch, three truths, a force, a secret with a
 * clue) with the first open one carrying its own add. The overseer's page shows it while `isNewCanon(steps)` and the
 * campaign has not skipped it; every step reads straight from the canon, so finishing one in a chapter ticks it here.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import { wayInSteps, type WayInStepId } from "@/lib/canon/canonWayIn";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import CanonAddRow from "./CanonAddRow.vue";
import CanonSuggest from "./kit/CanonSuggest.vue";

const { entries, clues } = defineProps<{ entries: readonly CanonEntry[]; clues: readonly CanonClue[] }>();

const TITLES: Record<WayInStepId, string> = {
  pitch: "Write the pitch",
  truths: "Write three truths",
  force: "Name a force that is moving",
  secret: "Hide a secret, with a clue",
};
const HINTS: Record<WayInStepId, string> = {
  pitch: "A paragraph that says what your campaign is about.",
  truths: "Things simply so about your world, one line each.",
  force: "Someone or something working towards a goal, whether or not the party is there.",
  secret: "Something the party can find out, and the first clue that points to it.",
};
const ADD: Record<Exclude<WayInStepId, "pitch">, { placeholder: string; label: string; button: string }> = {
  truths: { placeholder: "A new truth…", label: "A new truth", button: "Add truth" },
  force: { placeholder: "A new force, by its name…", label: "A new force", button: "Add force" },
  secret: { placeholder: "A new secret, as one statement…", label: "A new secret", button: "Add secret" },
};
const REQUESTS: Record<"truths" | "force", string> = {
  truths: "Suggest three truths for my canon.",
  force: "Suggest a force for my canon.",
};

const steps = computed(() => wayInSteps(entries, clues));
const current = computed(() => steps.value.find((s) => !s.done)?.id ?? null);

const draft = ref("");
const madeSecret = ref<string | null>(null);
const { mutateAsync: create } = useCreateCanonEntry();

// The pitch is written on its own sheet, so it has no add here.
async function add(id: WayInStepId, title: string) {
  if (id === "pitch") return;
  const count = (part: CanonEntry["part"]) => entries.filter((e) => e.part === part).length;
  const created =
    id === "truths"
      ? await create({ part: "truth", knowledge: "all", title, sort_order: count("truth") })
      : await create({ part: id, title, sort_order: count(id) });
  if (id === "secret") madeSecret.value = created.id;
}

const store = useCanonUiStore();
const campaign = useCampaignStore();
function skip() {
  if (campaign.activeCampaignId === null) return;
  store.wayInDismissed = { ...store.wayInDismissed, [campaign.activeCampaignId]: true };
}
</script>
