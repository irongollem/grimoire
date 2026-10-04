<template>
  <AppModal :open="open" size="md" :backdrop-dismiss="false" @close="close">
    <ModalHeader
      title="Draft with AI"
      subtitle="Write a document from your campaign's own people, places and sessions."
      :icon="IconGenerate"
      tone="gold"
      closeable
      @close="close"
    />

    <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
      <div class="space-y-1.5">
        <span class="text-label-lg font-semibold text-foreground">Kind</span>
        <SegmentedControl v-model="kind" :options="KIND_OPTIONS" block wrap />
        <p class="text-caption text-muted-foreground">{{ KIND_HINTS[kind] }}</p>
      </div>

      <div v-if="kind === 'handout'" class="space-y-1.5">
        <span class="text-label-lg font-semibold text-foreground">About</span>
        <SegmentedControl v-model="handoutSubject" :options="HANDOUT_SUBJECT_OPTIONS" block />
      </div>

      <div class="space-y-1.5">
        <span class="text-label-lg font-semibold text-foreground">{{ subjectLabel }}</span>
        <EntityCombobox v-model="subjectId" :options="subjectOptions" :placeholder="`Search ${subjectLabel.toLowerCase()}…`" />
        <p v-if="subjectOptions.length === 0" class="text-caption text-muted-foreground italic">
          Nothing to write about yet. Add one in your campaign first.
        </p>
      </div>

      <div class="space-y-1.5">
        <span class="text-label-lg font-semibold text-foreground">Written for</span>
        <SegmentedControl v-model="audience" :options="AUDIENCE_OPTIONS" block />
        <p class="text-caption text-muted-foreground">
          {{ audience === "players"
            ? "Only what the players can already see is used: DM-only notes and secrets stay out."
            : "Everything on record is used, secrets included. Keep this one behind the screen." }}
        </p>
      </div>

      <div class="space-y-1.5">
        <label for="scriptorium-draft-steer" class="text-label-lg font-semibold text-foreground">
          Steer
          <span class="ml-1 font-fell normal-case tracking-normal text-muted-foreground/60">(optional)</span>
        </label>
        <textarea
          id="scriptorium-draft-steer"
          v-model="steer"
          rows="3"
          :maxlength="AI_PROMPT_LIMIT"
          placeholder="A hurried letter, half burnt. Make it sound afraid."
          class="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p v-if="genError" class="text-body text-destructive">{{ genError }}</p>
      <p v-if="createError" class="text-body text-destructive">{{ createError }}</p>

      <!-- A paid draft whose save failed: keep it, offer a save-only retry -->
      <div
        v-if="retained.unsaved.value"
        class="space-y-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
        role="alert"
      >
        <p class="text-caption text-destructive">
          The generated draft could not be saved. Save it again, or discard it and generate a new one.
        </p>
        <AppButton variant="ghost" size="inline-caption" class="underline underline-offset-2" label="Discard" @click="retained.clear()" />
      </div>
    </div>

    <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
      <GenerationCostBadge
        v-if="campaign.isAiEnabled && !retained.unsaved.value"
        :credits="textCreditCost"
        :byok="textIsByok"
        class="me-auto"
      />
      <AppButton variant="subtle" size="md" label="Cancel" :disabled="busy" @click="close" />
      <!-- Saving a paid draft costs nothing and needs no AI: it survives AI being switched off. -->
      <AppButton
        v-if="retained.unsaved.value"
        variant="primary"
        size="md"
        :icon="IconGenerate"
        :loading="retained.isSaving.value"
        :disabled="retained.isSaving.value"
        label="Save again"
        @click="saveRetained"
      />
      <AppButton
        v-else-if="campaign.isAiEnabled"
        variant="primary"
        size="md"
        :icon="IconGenerate"
        :loading="busy"
        :disabled="!subjectId || (isAnyAiGenerating && !isGenerating)"
        :label="busy ? 'Drafting…' : 'Generate'"
        @click="generateAndCreate"
      />
      <AiOffNotice v-else />
    </div>
  </AppModal>

  <PaywallModal v-model="showQuotaPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNotes } from "@/composables/notes/useNotes";
import { useCreateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { useScriptoriumDraft } from "@/ai/useScriptoriumDraft";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { htmlToScriptoriumJson } from "@/lib/scriptorium/documentContent";
import { wholeCredits } from "@edge-shared/credit-math.ts";
import type { DraftAudience, DraftKind, DraftSubjectType } from "@edge-shared/scriptoriumDraft.ts";

const { open } = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const campaign = useCampaignStore();
const { isGenerating, error: genError, generate } = useScriptoriumDraft();
const { mutateAsync: createDocument } = useCreateScriptoriumDocument();
const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("scriptorium_documents");
type Draft = NonNullable<Awaited<ReturnType<typeof generate>>>;
// A paid draft whose save failed is kept so the retry costs nothing.
const retained = useRetainedGeneration<Draft>();

// Mounted app-wide in AiGeneratorPanels: fetch the pickers only while open.
const whenOpen = () => open;
const { data: npcs } = useNpcs(whenOpen);
const { data: factions } = useAllFactions(whenOpen);
const { data: locations } = useAllLocations(whenOpen);
const { data: notes } = useNotes(whenOpen);

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("scriptorium_draft") * textMultiplierFor(textProvider.value)),
);

const KIND_OPTIONS: ReadonlyArray<SegmentedOption<DraftKind>> = [
  { value: "handout", label: "Player handout" },
  { value: "faction_dossier", label: "Faction dossier" },
  { value: "session_recap", label: "Session recap" },
] as const;

const KIND_HINTS: Record<DraftKind, string> = {
  handout: "An in-world document: a letter, notice, journal page or proclamation about one person, place or faction.",
  faction_dossier: "A sectioned briefing on one faction: leadership, members, holdings, goals and relations.",
  session_recap: "A past-tense recap of one session from the players' side, ending in the open threads.",
};

const HANDOUT_SUBJECT_OPTIONS: ReadonlyArray<SegmentedOption<"npc" | "location" | "faction">> = [
  { value: "npc", label: "An NPC" },
  { value: "location", label: "A location" },
  { value: "faction", label: "A faction" },
] as const;

const AUDIENCE_OPTIONS: ReadonlyArray<SegmentedOption<DraftAudience>> = [
  { value: "players", label: "Players" },
  { value: "dm", label: "DM only" },
] as const;

const kind = ref<DraftKind>("handout");
const handoutSubject = ref<"npc" | "location" | "faction">("npc");
const subjectId = ref("");
const audience = ref<DraftAudience>("players");
const steer = ref("");
const createError = ref("");

const subjectType = computed<DraftSubjectType>(() =>
  kind.value === "handout" ? handoutSubject.value : kind.value === "faction_dossier" ? "faction" : "session",
);

const subjectLabel = computed(() => ({
  npc: "NPC", location: "Location", faction: "Faction", session: "Session",
}[subjectType.value]));

interface Option { id: string; name: string }

const subjectOptions = computed<Option[]>(() => {
  const byType: Record<DraftSubjectType, Option[]> = {
    npc: (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
    location: (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
    faction: (factions.value ?? []).map((f) => ({ id: f.id, name: f.name })),
    session: (notes.value ?? [])
      .filter((n) => n.category === "session")
      .map((n) => ({ id: n.id, name: n.session_num !== null ? `Session ${n.session_num}: ${n.title}` : n.title })),
  };
  return byType[subjectType.value];
});

// Audience follows the kind (a dossier is prep, the others are handed out) until the DM overrides it.
watch(kind, (k) => {
  audience.value = k === "faction_dossier" ? "dm" : "players";
});
watch([kind, handoutSubject], () => {
  subjectId.value = "";
});
watch(() => open, (isOpen) => {
  if (isOpen) createError.value = "";
});

const busy = computed(() => isGenerating.value);

function close() {
  if (busy.value) return;
  emit("close");
}

function wordCountOf(html: string): number {
  const text = html.replace(/<[^>]*>/g, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

async function generateAndCreate() {
  if (!subjectId.value) return;
  createError.value = "";
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  const draft = await generate({
    kind: kind.value,
    subject: { type: subjectType.value, id: subjectId.value },
    audience: audience.value,
    prompt: steer.value,
  });
  if (!draft) return;
  await save(draft);
}

async function saveRetained() {
  if (retained.unsaved.value) await save(retained.unsaved.value);
}

async function save(draft: Draft) {
  createError.value = "";
  // The draft is already paid for: a failed save keeps it so the DM can save
  // it again without generating (and paying) twice.
  const created = await retained.run(draft, async (d) => {
    try {
      const { content, furniture } = htmlToScriptoriumJson(d.html);
      return await createDocument({
        title: d.title,
        content: JSON.stringify(content),
        doc_type: "custom",
        campaign_id: campaign.activeCampaignId,
        tags: [],
        is_published: false,
        is_two_column: false,
        theme: "onednd2024",
        page_size: "A4",
        ink_friendly: false,
        word_count: wordCountOf(d.html),
        show_page_numbers: false,
        footer_text: "",
        page_number_start: 1,
        page_furniture: furniture,
        ai_provenance: d.ai_provenance,
      });
    } catch (e) {
      if (!gateQuotaError(e)) createError.value = e instanceof Error ? e.message : "The draft could not be saved.";
      return null;
    }
  });
  if (!created) return;

  steer.value = "";
  emit("close");
  router.push(`/scriptorium/${created.id}`);
}
</script>
