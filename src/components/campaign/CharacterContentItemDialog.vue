<template>
  <!--
    What a flagged choice actually is (#943, wave 4). A DM cannot read a
    player's own content any other way, and approving homebrew copies it into
    the table's content, so they get to read it first.
  -->
  <AppModal :open="open" size="md" @close="emit('close')">
    <ModalHeader
      :title="title"
      :subtitle="subtitle"
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <div v-if="itemQuery.isPending.value" class="text-center py-8">
        <LoadingSpinner />
      </div>

      <div v-else-if="itemQuery.isError.value" class="space-y-3" data-testid="item-error">
        <p class="text-body text-destructive">This could not be loaded.</p>
        <AppButton variant="subtle" size="sm" label="Try again" @click="itemQuery.refetch()" />
      </div>

      <p v-else-if="rows.length === 0" class="text-body text-muted-foreground italic" data-testid="item-empty">
        There is nothing more to show for this one.
      </p>

      <dl v-else class="space-y-3">
        <div v-for="row in rows" :key="row.label" data-testid="item-row">
          <dt class="text-label-lg font-semibold text-muted-foreground uppercase">{{ row.label }}</dt>
          <dd class="mt-0.5 text-body text-foreground">
            <RichTextViewer v-if="row.kind === 'rich'" :content="row.text" />
            <p v-else-if="row.kind === 'text'">{{ row.text }}</p>
            <ul v-else-if="row.kind === 'list'" class="flex flex-wrap gap-1.5">
              <li
                v-for="entry in row.entries"
                :key="entry"
                class="rounded-full border border-border px-2 py-0.5 text-caption"
              >
                {{ entry }}
              </li>
            </ul>
            <ul v-else-if="row.kind === 'traits'" class="space-y-2">
              <li v-for="trait in row.traits" :key="trait.name">
                <p class="font-semibold">{{ trait.name }}</p>
                <RichTextViewer v-if="trait.description" :content="trait.description" />
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="ghost" size="md" label="Close" @click="emit('close')" />
      <AppButton
        v-for="option in options"
        :key="option.scope"
        :variant="option.scope === 'table' ? 'subtle' : 'primary'"
        size="md"
        :label="option.label"
        @click="emit('approve', option.scope, seenUpdatedAt)"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  approvalOptions,
  contentKindLabel,
  reviewReasonText,
  useCharacterContentItem,
  type ApprovalScope,
  type CharacterContentReview,
  type ContentKind,
} from "@/composables/party/useCharacterContentReviews";

const { open, review } = defineProps<{
  open: boolean;
  review: CharacterContentReview | null;
}>();

// `seenUpdatedAt` travels with an approval made from here: it is what the DM
// was actually shown, and the database refuses the approval if the player has
// edited the row since.
const emit = defineEmits<{ close: []; approve: [scope: ApprovalScope, seenUpdatedAt: string | undefined] }>();

const itemQuery = useCharacterContentItem(() => (open ? review?.id : null));

const seenUpdatedAt = computed(() => {
  const at = itemQuery.data.value?.updated_at;
  return typeof at === "string" ? at : undefined;
});

/**
 * How each field is shown. The stored shape differs by kind (and a library
 * species is not a homebrew one), so only fields worth a DM's attention are
 * listed; anything absent, empty or of an unexpected type is simply skipped.
 * `rich` fields hold Tiptap JSON or prose and go through the shared viewer.
 */
type FieldFormat = "rich" | "text" | "list" | "traits" | "speed" | "dice" | "level";
interface FieldSpec {
  key: string;
  label: string;
  format: FieldFormat;
}

const FIELDS: Record<ContentKind, FieldSpec[]> = {
  species: [
    { key: "description", label: "Description", format: "rich" },
    { key: "size", label: "Size", format: "text" },
    { key: "speed", label: "Speed", format: "speed" },
    { key: "traits", label: "Traits", format: "traits" },
    { key: "languages", label: "Languages", format: "list" },
  ],
  background: [
    { key: "description", label: "Description", format: "rich" },
    { key: "skill_proficiencies", label: "Skills", format: "list" },
    { key: "tool_proficiencies", label: "Tools", format: "list" },
    { key: "languages", label: "Languages", format: "list" },
    { key: "equipment", label: "Equipment", format: "rich" },
    { key: "feature_name", label: "Feature", format: "text" },
    { key: "feature_description", label: "What the feature does", format: "rich" },
    { key: "feat_grant_name", label: "Feat granted", format: "text" },
    { key: "feat_grant_description", label: "What the feat does", format: "rich" },
  ],
  class: [
    { key: "description", label: "Description", format: "rich" },
    { key: "hit_die", label: "Hit die", format: "dice" },
    { key: "primary_ability", label: "Primary ability", format: "text" },
    { key: "saving_throws", label: "Saving throws", format: "list" },
    { key: "armor_proficiencies", label: "Armor", format: "list" },
    { key: "weapon_proficiencies", label: "Weapons", format: "list" },
  ],
  subclass: [
    { key: "class_name", label: "Subclass of", format: "text" },
    { key: "description", label: "Description", format: "rich" },
  ],
  spell: [
    { key: "level", label: "Level", format: "level" },
    { key: "school", label: "School", format: "text" },
    { key: "casting_time", label: "Casting time", format: "text" },
    { key: "range", label: "Range", format: "text" },
    { key: "duration", label: "Duration", format: "text" },
    { key: "components", label: "Components", format: "list" },
    { key: "classes", label: "Classes", format: "list" },
    { key: "description", label: "Description", format: "rich" },
    { key: "higher_levels", label: "At higher levels", format: "rich" },
  ],
  feat: [
    { key: "prerequisite", label: "Prerequisite", format: "text" },
    { key: "description", label: "Description", format: "rich" },
  ],
};

interface Trait {
  name: string;
  description: string | null;
}

type Row =
  | { label: string; kind: "rich" | "text"; text: string }
  | { label: string; kind: "list"; entries: string[] }
  | { label: string; kind: "traits"; traits: Trait[] };

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : [];
}

function traitList(value: unknown): Trait[] {
  if (!Array.isArray(value)) return [];
  const traits: Trait[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = nonEmptyString((entry as Record<string, unknown>).name);
    if (name) traits.push({ name, description: nonEmptyString((entry as Record<string, unknown>).description) });
  }
  return traits;
}

function speedText(value: unknown): string | null {
  if (typeof value === "number") return `${value} ft.`;
  if (typeof value !== "object" || value === null) return null;
  const parts = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .map(([mode, feet]) => `${mode} ${feet} ft.`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function levelText(value: unknown): string | null {
  if (typeof value !== "number") return null;
  return value === 0 ? "Cantrip" : `Level ${value}`;
}

function rowFor(spec: FieldSpec, value: unknown): Row | null {
  const { label } = spec;
  switch (spec.format) {
    case "rich": {
      const text = nonEmptyString(value);
      return text ? { label, kind: "rich", text } : null;
    }
    case "text": {
      const text = nonEmptyString(value);
      return text ? { label, kind: "text", text } : null;
    }
    case "list": {
      const entries = stringList(value);
      return entries.length > 0 ? { label, kind: "list", entries } : null;
    }
    case "traits": {
      const traits = traitList(value);
      return traits.length > 0 ? { label, kind: "traits", traits } : null;
    }
    case "speed": {
      const text = speedText(value);
      return text ? { label, kind: "text", text } : null;
    }
    case "dice":
      return typeof value === "number" ? { label, kind: "text", text: `d${value}` } : null;
    case "level": {
      const text = levelText(value);
      return text ? { label, kind: "text", text } : null;
    }
  }
}

const item = computed(() => itemQuery.data.value ?? null);

const rows = computed<Row[]>(() => {
  const current = item.value;
  if (!review || !current) return [];
  return FIELDS[review.kind].flatMap((spec) => {
    const row = rowFor(spec, current[spec.key]);
    return row ? [row] : [];
  });
});

/** Its stored name, which is what the player called it; a class or subclass keeps its name under another key. */
const title = computed(() => {
  const current = item.value;
  const stored =
    current &&
    (nonEmptyString(current.name) ?? nonEmptyString(current.subclass_name) ?? nonEmptyString(current.class_name));
  return stored ?? review?.label ?? "";
});

const subtitle = computed(() =>
  review ? `${contentKindLabel(review.kind)}. ${reviewReasonText(review)}` : undefined,
);

const options = computed(() => (review ? approvalOptions(review) : []));
</script>
