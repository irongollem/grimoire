<template>
  <!-- Prep campaign (#1021 row 22): the AI reads the campaign and proposes what its story will need and lacks. The
       Dungeon Master sees the whole list before anything is made, and only what stays ticked is created. -->
  <AppModal :open="open" size="lg" :backdrop-dismiss="false" @close="close">
    <ModalHeader title="Prep campaign" subtitle="What your story will need at the table and does not have yet." closeable @close="close" />

    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-4" data-testid="prep-dialog">
      <!-- Before anything is asked: what it does and what it costs. -->
      <template v-if="step === 'intro'">
        <p class="text-body text-foreground">
          The AI reads your quests and their beats, your places, and the hazards and items you already have, and proposes what the story will need:
          a hazard where the ground calls for one, a place a beat happens in, an item a beat turns on, a table of what may happen on a road.
        </p>
        <p class="text-body text-foreground">
          You see the whole list first and untick what you do not want. Reading the campaign costs about what a turn at the table costs. Making what you keep costs nothing.
        </p>
        <p v-if="problem" role="alert" class="text-caption text-destructive" data-testid="prep-problem">{{ problem }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" size="md" label="Not now" @click="close" />
          <AppButton variant="primary" size="md" label="Read my campaign" :loading="busy" data-testid="prep-read" @click="propose" />
        </div>
      </template>

      <!-- The whole list, before anything is made. -->
      <template v-else-if="step === 'list'">
        <p v-if="proposals.length === 0" class="text-body italic text-muted-foreground" data-testid="prep-none">
          Nothing is missing that the AI can see: every beat has its place, and nothing it reads calls for a hazard or an item you lack.
        </p>
        <template v-else>
          <p class="text-caption text-muted-foreground">{{ charged }} Untick what you do not want; nothing is made until you press the button.</p>
          <ul class="flex flex-col gap-2">
            <li v-for="(p, i) in proposals" :key="`${p.kind}:${p.name}`" class="border border-border bg-card px-3 py-2.5" :data-testid="`prep-proposal-${i}`">
              <AppCheckbox v-model="kept[i]" label-layout="row">
                <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                  <span class="text-eyebrow text-muted-foreground">{{ KIND_LABELS[p.kind] }}</span>
                  <span class="text-heading-sm text-foreground">{{ p.name }}</span>
                </span>
              </AppCheckbox>
              <p class="mt-1 pl-7 text-caption text-muted-foreground">For: {{ p.why }}</p>
              <p class="mt-1 pl-7 text-body text-foreground">{{ p.description }}</p>
              <p v-if="detailOf(p)" class="mt-1 pl-7 text-caption text-muted-foreground">{{ detailOf(p) }}</p>
            </li>
          </ul>
        </template>
        <p v-if="problem" role="alert" class="text-caption text-destructive" data-testid="prep-problem">{{ problem }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" size="md" :label="proposals.length === 0 ? 'Done' : 'Make none of it'" @click="close" />
          <AppButton v-if="proposals.length > 0" variant="primary" size="md" :label="makeLabel" :disabled="keptCount === 0" :loading="busy" data-testid="prep-make" @click="create" />
        </div>
      </template>

      <!-- What was made, and what was not and why. -->
      <template v-else>
        <p class="text-body text-foreground" data-testid="prep-made">
          <template v-if="made.length > 0">Made: {{ made.join(", ") }}. Each is marked as made by AI and is yours to change or delete.</template>
          <template v-else>Nothing was made.</template>
        </p>
        <ul v-if="skipped.length > 0" class="flex flex-col gap-1" data-testid="prep-skipped">
          <li v-for="s in skipped" :key="s.name" class="text-caption text-muted-foreground">Not made, {{ s.name }}: {{ s.reason }}</li>
        </ul>
        <div class="flex justify-end">
          <AppButton variant="primary" size="md" label="Done" @click="close" />
        </div>
      </template>
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { supabase } from "@/lib/supabase";

/** A proposal as the server sends it and takes it back: one flat shape (`proposalInput` in `_shared/campaignPrep.ts`). */
export interface PrepProposal {
  kind: "hazard" | "place" | "item" | "roll_table" | "feature" | "milestone";
  name: string;
  why: string;
  description: string;
  save?: string;
  dc?: number;
  damage_dice?: string;
  damage_type?: string;
  place_type?: string;
  terrain?: string;
  inside?: string;
  item_type?: string;
  rarity?: string;
  dice?: string;
  feature_type?: string;
  find_dc?: number;
  contents?: string;
  entries?: Array<{ label: string; notes?: string }>;
  /** A milestone (#1021 row 27): how many of its quests must be done, and which. */
  needs?: number;
  quests?: string[];
}

/** Calls `campaign-prep` and hands back the raw response. The seam a test replaces. */
export type PrepTransport = (body: { action: "propose" | "create"; campaignId: string; proposals?: PrepProposal[] }) => Promise<Response>;

const sendToCampaignPrep: PrepTransport = async (body) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/campaign-prep`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
};

const { open, campaignId, transport = undefined } = defineProps<{ open: boolean; campaignId: string; transport?: PrepTransport }>();
const emit = defineEmits<{ close: [] }>();

const KIND_LABELS: Record<PrepProposal["kind"], string> = { hazard: "Hazard", place: "Place", item: "Item", roll_table: "Roll table", feature: "Dungeon feature", milestone: "Level milestone" };
const words = (s: string): string => s.replace(/_/g, " ");

const client = useQueryClient();
const step = ref<"intro" | "list" | "done">("intro");
const busy = ref(false);
const problem = ref<string | null>(null);
const proposals = ref<PrepProposal[]>([]);
const kept = ref<boolean[]>([]);
const credits = ref(0);
const made = ref<string[]>([]);
const skipped = ref<Array<{ name: string; reason: string }>>([]);

// A reopened dialog starts over: an old list may name things that exist by now.
watch(
  () => open,
  (now) => {
    if (!now) return;
    step.value = "intro";
    problem.value = null;
    proposals.value = [];
  },
);

const keptCount = computed(() => kept.value.filter(Boolean).length);
const makeLabel = computed(() => (keptCount.value === proposals.value.length ? `Make all ${keptCount.value}` : `Make ${keptCount.value} of ${proposals.value.length}`));
const charged = computed(() => (credits.value > 0 ? `Reading the campaign cost ${credits.value} ${credits.value === 1 ? "credit" : "credits"}.` : ""));

function detailOf(p: PrepProposal): string {
  if (p.kind === "hazard") return [p.save && p.dc ? `${p.save} saving throw, DC ${p.dc}` : "", p.damage_dice ? `${p.damage_dice} ${p.damage_type ?? ""}`.trim() : ""].filter((s) => s !== "").join(" · ");
  if (p.kind === "place") return [p.place_type ? words(p.place_type) : "", p.terrain ?? "", p.inside ? `in ${p.inside}` : ""].filter((s) => s !== "").join(" · ");
  if (p.kind === "feature") return [p.feature_type ?? "", p.find_dc ? `Perception DC ${p.find_dc} to notice` : "", p.contents ? `Holds: ${p.contents}` : ""].filter((s) => s !== "").join(" · ");
  if (p.kind === "milestone") return p.quests && p.needs ? `When any ${p.needs} of these are done: ${p.quests.join(" · ")}` : "";
  if (p.kind === "roll_table") return [p.dice ?? "", ...(p.entries ?? []).map((e) => e.label)].filter((s) => s !== "").join(" · ");
  return [p.item_type ? words(p.item_type) : "", p.rarity ? words(p.rarity) : ""].filter((s) => s !== "").join(" · ");
}

async function ask(body: Parameters<PrepTransport>[0]): Promise<Record<string, unknown> | null> {
  if (busy.value) return null;
  busy.value = true;
  problem.value = null;
  try {
    const response = await (transport ?? sendToCampaignPrep)(body);
    const answer = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = answer && typeof answer.error === "string" ? answer.error : null;
      problem.value =
        response.status === 402 || code === "insufficient_credits"
          ? "You are out of credits, so the campaign could not be read. Nothing was charged."
          : code !== null && response.status !== 500
            ? code
            : "The campaign could not be prepped right now. Nothing was charged.";
      return null;
    }
    return answer;
  } catch {
    problem.value = "The campaign could not be prepped right now. Nothing was charged.";
    return null;
  } finally {
    busy.value = false;
  }
}

async function propose(): Promise<void> {
  const answer = await ask({ action: "propose", campaignId });
  if (answer === null) return;
  proposals.value = Array.isArray(answer.proposals) ? (answer.proposals as PrepProposal[]) : [];
  kept.value = proposals.value.map(() => true);
  credits.value = typeof answer.credits === "number" ? answer.credits : 0;
  step.value = "list";
}

async function create(): Promise<void> {
  const chosen = proposals.value.filter((_p, i) => kept.value[i]);
  if (chosen.length === 0) return;
  const answer = await ask({ action: "create", campaignId, proposals: chosen });
  if (answer === null) return;
  made.value = Array.isArray(answer.made) ? (answer.made as string[]) : [];
  skipped.value = Array.isArray(answer.skipped) ? (answer.skipped as Array<{ name: string; reason: string }>) : [];
  step.value = "done";
  // The new records belong to lists all over the app: what was made is read again wherever it is shown.
  await client.invalidateQueries();
}

function close(): void {
  if (busy.value) return;
  emit("close");
}
</script>
