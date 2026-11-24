<template>
  <div v-if="isAiEnabled" class="flex flex-col gap-2">
    <div class="flex justify-end">
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconGenerate"
        icon-size="xs"
        :loading="isSuggesting"
        :disabled="isAnyAiGenerating"
        :tooltip="isAnyAiGenerating && !isSuggesting ? 'Another generation is already in progress' : undefined"
        label="Suggest"
        @click="openCard"
      />
    </div>

    <p v-if="suggestError" class="text-caption text-destructive">{{ suggestError }}</p>
    <!-- A run reads the campaign and asks the model, which takes a while: say so where the answers will land. -->
    <div v-if="isSuggesting" class="space-y-2" role="status" aria-live="polite">
      <p class="flex items-center gap-2 text-caption italic text-muted-foreground">
        <BannerLoader class="h-4" />
        Reading your campaign for connections. This takes a little while.
      </p>
      <ListSkeleton variant="text" :count="3" />
    </div>

    <div
      v-if="suggestions.length > 0 || setAside.length > 0"
      class="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
    >
      <div class="flex items-center justify-between">
        <div class="text-label-lg font-semibold text-muted-foreground">Suggested connections</div>
        <AppButton variant="subtle" size="sm" label="Dismiss all" @click="dismissAll" />
      </div>
      <p class="text-caption text-muted-foreground">Nothing is saved until you accept a suggestion.</p>
      <!-- The same slip as the saved connections; Accept and Dismiss sit under the reason so a phone keeps its width for it. -->
      <ConnectionSlip
        v-for="s in suggestions"
        :key="suggestionKey(s)"
        :name="s.target_name"
        :image-format="targetKindOf(s) === 'faction' ? 'token' : 'portrait'"
        :tags="tagsOf(s)"
        :notes="s.notes"
      >
        <template #footer>
          <div class="flex justify-end gap-1">
            <AppButton
              variant="primary"
              size="sm"
              :icon="IconCheck"
              icon-size="xs"
              label="Accept"
              :disabled="isAccepting"
              @click="accept(s)"
            />
            <AppButton variant="subtle" size="sm" label="Dismiss" :disabled="isAccepting" @click="dismiss(s)" />
          </div>
        </template>
      </ConnectionSlip>
      <p
        v-for="a in setAside"
        :key="`aside:${a.target_name}:${a.claim}`"
        class="text-caption italic text-muted-foreground"
      >
        Set aside: "{{ a.claim }}". {{ capitalised(a.reason) }}.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconCheck, IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import ConnectionSlip, { type ConnectionTag } from "@/components/common/entity/ConnectionSlip.vue";
import { useCreateConnection } from "@/composables/connections/useConnections";
import { useOpenGenerator } from "@/composables/ask/useOpenGenerator";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useConnectionSuggestions, type ResolvedSuggestion } from "@/ai/useConnectionSuggestions";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { SuggestedKinRelation } from "@edge-shared/connectionSuggestions.ts";
import type { WorldRef } from "@/types/connections.types";

/**
 * "Suggest connections" for one thing (#1084): the Suggest button, the proposals and
 * the set-aside claims, for any kind of subject. Mounted by the Connections
 * block of a sheet. The button opens the record's card in the Familiar (#1270),
 * where the steer is written and the price shown; what comes back lands here. Nothing is written until the DM accepts a proposal, and an
 * accepted one is written through `useCreateConnection` like any tie the DM adds
 * by hand, with the suggestion's provenance.
 */
const { subject, subjectName } = defineProps<{ subject: WorldRef; subjectName: string }>();

const campaign = useCampaignStore();
const toast = useToast();
const isAiEnabled = computed(() => campaign.isAiEnabled);

const { forSubject } = useConnectionSuggestions();
const { open } = useOpenGenerator();
// Bound to this subject: another sheet's Suggest run never shows up or accepts here.
const {
  isGenerating: isSuggesting,
  error: suggestError,
  suggestions,
  setAside,
  provenance,
  dismiss,
  dismissAll,
} = forSubject(() => subject);

const { mutateAsync: createConnection } = useCreateConnection();
const isAccepting = ref(false);

/** The card in the Familiar, for this record: a link kind is also the kind of record Ask names. */
function openCard() {
  open("connection_suggestions", { target: { type: subject.kind, id: subject.id, name: subjectName } });
}

// What the target is to the subject, as the tag reads it.
const KIN_LABELS: Record<SuggestedKinRelation, string> = {
  parent: "Parent",
  child: "Child",
  spouse: "Spouse",
  former_spouse: "Former spouse",
  sibling: "Sibling",
  relative: "Relative",
};

/** The catalogue key a kin relation is stored under, and whether the subject is its `from` end. */
const KIN_CHOICE: Record<SuggestedKinRelation, { key: string; subjectIsFrom: boolean }> = {
  parent: { key: "parent_of", subjectIsFrom: false },
  child: { key: "parent_of", subjectIsFrom: true },
  spouse: { key: "spouse_of", subjectIsFrom: true },
  former_spouse: { key: "former_spouse_of", subjectIsFrom: true },
  sibling: { key: "sibling_of", subjectIsFrom: true },
  relative: { key: "relative_of", subjectIsFrom: true },
};

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function targetKindOf(s: ResolvedSuggestion): LinkKind {
  if (s.kind === "kin") return s.target_type === "pc" ? "party_member" : "npc";
  return s.target_kind;
}

function suggestionKey(s: ResolvedSuggestion): string {
  return `${s.kind}:${targetKindOf(s)}:${s.target_id}:${s.kind === "link" ? s.type : ""}`;
}

/** The picker choice a suggestion stands for, read from the subject; null when the catalogue holds none. */
function choiceFor(s: ResolvedSuggestion): TypeChoice | null {
  const choices = typeChoices(subject.kind, targetKindOf(s));
  if (s.kind === "link") return choices.find((c) => !c.home && c.key === s.type && c.subjectIsFrom === s.subject_is_from) ?? null;
  if (s.kind === "membership") return choices.find((c) => c.home === "membership") ?? null;
  const want = KIN_CHOICE[s.relation];
  return choices.find((c) => c.home === "kin" && c.key === want.key && c.subjectIsFrom === want.subjectIsFrom) ?? null;
}

function tagsOf(s: ResolvedSuggestion): ConnectionTag[] {
  const tags: ConnectionTag[] = [];
  if (s.kind === "link") tags.push({ label: choiceFor(s)?.word ?? s.type.replaceAll("_", " ") });
  else if (s.kind === "membership") tags.push({ label: s.role });
  else tags.push({ label: KIN_LABELS[s.relation], color: "var(--primary)" });
  const kind = targetKindOf(s);
  if (kind !== "npc") tags.push({ label: kind === "party_member" ? "character" : kind });
  return tags;
}

async function accept(s: ResolvedSuggestion) {
  const choice = choiceFor(s);
  if (!choice) {
    toast.error("That kind of connection is not available for this pair.");
    return;
  }
  isAccepting.value = true;
  try {
    await createConnection({
      subject,
      other: { kind: targetKindOf(s), id: s.target_id, name: s.target_name },
      choice,
      ...(s.notes ? { note: s.notes } : {}),
      ...(s.kind === "membership" ? { role: s.role } : {}),
      ...(s.kind === "kin" && s.parent_role ? { parentRole: s.parent_role } : {}),
      ...(provenance.value ? { aiProvenance: { ...provenance.value } } : {}),
    });
    dismiss(s);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : `Could not save that connection to ${subjectName}.`);
  } finally {
    isAccepting.value = false;
  }
}
</script>
