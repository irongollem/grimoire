<template>
  <ImportReviewCard :heading="heading" :status="status" :region-id="regionId" :auto-expand="needsDmChoice(candidates)">
    <template #meta>
      <AppButton
        v-if="confidence === 'partial'"
        as="span"
        variant="tinted"
        tone="caution"
        size="xs"
        label="Partial"
        tooltip="The extractor may not have captured every field for this entry. Check it over."
      />
      <span v-if="page !== null" class="shrink-0 text-caption text-muted-foreground">Page {{ page }}</span>
    </template>

      <ImportDecisionChoice
        v-model="decision"
        :heading="heading"
        :group-name="radioGroupName"
        :candidates="candidates"
        :show-create="showCreateOption"
        :show-generate="showGenerateOption"
        :generate-credits-label="generateCreditsLabel"
      />

      <!-- The field editor, offered only while "Create new" is the chosen
           action — linking or ignoring never touches this entity's fields,
           and generating hands the page's own concept to the AI generator
           rather than a field-by-field editor. -->
      <div v-if="decision.action === 'create'">
        <AppButton
          variant="ghost"
          size="inline"
          :label="editDetailsOpen ? 'Hide details' : 'Edit details'"
          @click="editDetailsOpen = !editDetailsOpen"
        />
        <Transition v-bind="drawerTransition()">
          <div v-show="editDetailsOpen" class="space-y-3 pt-3">
            <template
              v-for="(row, idx) in fieldRows"
              :key="row.kind === 'header' ? `header-${row.label}` : `${row.field.sectionKey}.${row.field.key}`"
            >
              <h4
                v-if="row.kind === 'header'"
                class="text-label-lg uppercase text-muted-foreground"
                :class="idx === 0 ? '' : 'border-t border-border pt-2'"
              >
                {{ row.label }}
              </h4>

              <div v-else class="space-y-1">
                <label v-if="row.field.kind !== 'boolean'" class="block text-label uppercase text-muted-foreground">
                  {{ humanize(row.field.key) }}
                </label>

                <RichTextEditor
                  v-if="row.field.kind === 'prose'"
                  size="md"
                  :model-value="proseValue(row.field)"
                  @update:model-value="(v: string) => commitProse(row.field, v)"
                />

                <AppCheckbox
                  v-else-if="row.field.kind === 'boolean'"
                  :model-value="boolValue(row.field)"
                  :label="humanize(row.field.key)"
                  @update:model-value="(v: boolean) => commitBool(row.field, v)"
                />

                <AppInput
                  v-else-if="row.field.kind === 'number'"
                  type="number"
                  size="sm"
                  :model-value="numberText(row.field)"
                  @update:model-value="(v: string) => commitNumber(row.field, v)"
                />

                <AppInput
                  v-else-if="row.field.kind === 'stringArray'"
                  type="text"
                  size="sm"
                  placeholder="Comma-separated"
                  :model-value="arrayText(row.field)"
                  @update:model-value="(v: string) => commitArray(row.field, v)"
                />

                <p v-else-if="row.field.kind === 'summary'" class="text-caption italic text-muted-foreground">
                  {{ row.field.summary }}, review after import
                </p>

                <AppInput
                  v-else
                  type="text"
                  size="sm"
                  :model-value="textValue(row.field)"
                  @update:model-value="(v: string) => commitText(row.field, v)"
                />
              </div>
            </template>
          </div>
        </Transition>
      </div>
  </ImportReviewCard>
</template>

<script setup lang="ts">
/**
 * One extracted entity's review row (rework of #353's `DocumentImportEntityCard.vue`
 * for the decision model — see `context/features/document-import.md`'s "Every
 * entity gets an explicit DECISION" section). An accordion, defaulting to
 * link: collapsed shows what will actually happen ("Links to Goblin · CR 1/4
 * · this campaign" / "New" / "Generate · 1.5 credits" / "Ignored"); expanded
 * shows the full choice — every candidate lettered A, B, C…, then Create
 * new / Generate, then Ignore — as a native radio group (CLAUDE.md's
 * raw-input exception; a checkbox-style primitive doesn't exist for radios
 * and would be one control for a decision this component doesn't own the
 * definition of — `entityMatching.ts` does).
 *
 * The generic field editor below "Edit details" is the same one this
 * component's predecessor rendered unconditionally — it now shows only while
 * `create` is the chosen action, since linking or ignoring never touches
 * this entity's own fields and generating hands the page's concept to the AI
 * generator instead.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import { drawerTransition } from "@/lib/motion";
import type { EntityKindEntry } from "@/lib/documentImport/entityKinds";
import ImportDecisionChoice from "@/components/campaign/ImportDecisionChoice.vue";
import ImportReviewCard from "@/components/campaign/ImportReviewCard.vue";
import { decisionStatus, needsDmChoice } from "@/lib/documentImport/reviewDecisions";
import { canCreateFromPage, type EntityCandidate, type ImportDecision } from "@/lib/documentImport/entityMatching";
import type { ImportConfidence } from "@/types/documentImport.types";

const {
  entry,
  entityRef,
  page,
  confidence,
  candidates = [],
  generateCredits = null,
} = defineProps<{
  entry: EntityKindEntry;
  /** The extraction's stable `ref` for this entity — used only to build a
   *  collision-safe id for the expand region and the radio group's `name`,
   *  never persisted from here. */
  entityRef: string;
  page: number | null;
  confidence: ImportConfidence;
  /** This entity's dedupe candidates, already ranked — empty when none were
   *  found or matching hasn't finished yet. */
  candidates?: readonly EntityCandidate[];
  /** Cost of generating this entity through the Monster Generator, or `null`
   *  when this isn't a monster row or the cost isn't known yet. Monsters
   *  only — every other kind ignores this prop entirely. */
  generateCredits?: number | null;
}>();

/** The entity's current (possibly DM-edited) payload. Untyped on purpose —
 *  the parent widens it back to the real payload type when it builds the
 *  import plan. */
const data = defineModel<Record<string, unknown>>("data", { required: true });
/** What happens to this entity — link, create, generate, or ignore. */
const decision = defineModel<ImportDecision>("decision", { required: true });

const editDetailsOpen = ref(false);
const regionId = computed(() => `import-entity-${entityRef.replace(/[^a-zA-Z0-9_-]/g, "-")}`);
const radioGroupName = computed(() => `${regionId.value}-decision`);

const heading = computed(() => {
  const v = data.value[entry.displayField];
  return typeof v === "string" && v.trim() !== "" ? v : "Unnamed";
});

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const isMonsterKind = computed(() => entry.kind === "monsters");
const canCreate = computed(() => canCreateFromPage(entry.kind, data.value));
const showCreateOption = computed(() => !isMonsterKind.value || canCreate.value);
const showGenerateOption = computed(() => isMonsterKind.value);

const generateCreditsLabel = computed(() => {
  if (generateCredits === null) return null;
  const rounded = Math.round(generateCredits * 100) / 100;
  return rounded === 1 ? "1 credit" : `${rounded} credits`;
});

const status = computed(() => decisionStatus(decision.value, generateCreditsLabel.value));

// ── Field classification (unchanged from the predecessor card) ─────────────

const PROSE_FIELDS = new Set(["description", "notes", "appearance", "personality", "backstory", "summary", "higher_levels"]);

type FieldKind = "prose" | "boolean" | "number" | "stringArray" | "text" | "summary";

interface FieldWidget {
  key: string;
  sectionKey: string | null;
  kind: FieldKind;
  summary?: string;
}

type Row = { kind: "header"; label: string } | { kind: "field"; field: FieldWidget };

function summarize(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    const names = value
      .map((item) =>
        item && typeof item === "object" && typeof (item as Record<string, unknown>).name === "string"
          ? ((item as Record<string, unknown>).name as string)
          : null,
      )
      .filter((n): n is string => n !== null);
    return names.length ? `${value.length} · ${names.join(", ")}` : `${value.length} entries`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length ? keys.join(", ") : "None";
  }
  return "";
}

function classify(key: string, value: unknown, sectionKey: string | null): FieldWidget {
  if (typeof value === "boolean") return { key, sectionKey, kind: "boolean" };
  if (typeof value === "number") return { key, sectionKey, kind: "number" };
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string")) return { key, sectionKey, kind: "stringArray" };
    return { key, sectionKey, kind: "summary", summary: summarize(value) };
  }
  if (value !== null && typeof value === "object") {
    return { key, sectionKey, kind: "summary", summary: summarize(value) };
  }
  if (PROSE_FIELDS.has(key)) return { key, sectionKey, kind: "prose" };
  return { key, sectionKey, kind: "text" };
}

/** See the predecessor card's own comment: `extracted` is jsonb, and Postgres
 *  normalises object keys alphabetically, so a stat block needs a nudge back
 *  into STR/DEX/CON/INT/WIS/CHA order. */
const FIELD_ORDER: readonly string[] = [
  "name", "title",
  "armor_class", "hit_points", "speed",
  "str", "dex", "con", "int", "wis", "cha",
  "challenge_rating", "proficiency_bonus",
];

function orderFields(fields: FieldWidget[]): FieldWidget[] {
  const rank = (key: string) => {
    const i = FIELD_ORDER.indexOf(key);
    return i === -1 ? FIELD_ORDER.length : i;
  };
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => rank(a.field.key) - rank(b.field.key) || a.index - b.index)
    .map(({ field }) => field);
}

const fieldRows = computed<Row[]>(() => {
  const mainFields: FieldWidget[] = [];
  const nestedGroups: { label: string; fields: FieldWidget[] }[] = [];

  for (const [key, value] of Object.entries(data.value)) {
    if (value !== null && !Array.isArray(value) && typeof value === "object") {
      const fields = orderFields(Object.entries(value as Record<string, unknown>).map(([k, v]) => classify(k, v, key)));
      nestedGroups.push({ label: humanize(key), fields });
    } else {
      mainFields.push(classify(key, value, null));
    }
  }
  const orderedMain = orderFields(mainFields);
  mainFields.length = 0;
  mainFields.push(...orderedMain);

  const out: Row[] = mainFields.map((field) => ({ kind: "field", field }));
  for (const group of nestedGroups) {
    out.push({ kind: "header", label: group.label });
    for (const field of group.fields) out.push({ kind: "field", field });
  }
  return out;
});

function fieldValue(field: FieldWidget): unknown {
  if (field.sectionKey === null) return data.value[field.key];
  const container = data.value[field.sectionKey];
  return container && typeof container === "object" ? (container as Record<string, unknown>)[field.key] : undefined;
}

function setFieldValue(field: FieldWidget, value: unknown): void {
  if (field.sectionKey === null) {
    data.value = { ...data.value, [field.key]: value };
    return;
  }
  const container = data.value[field.sectionKey];
  const base = container && typeof container === "object" ? (container as Record<string, unknown>) : {};
  data.value = { ...data.value, [field.sectionKey]: { ...base, [field.key]: value } };
}

function textValue(field: FieldWidget): string {
  const v = fieldValue(field);
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function proseValue(field: FieldWidget): string | null {
  const v = fieldValue(field);
  return typeof v === "string" ? v : null;
}

function boolValue(field: FieldWidget): boolean {
  return fieldValue(field) === true;
}

function numberText(field: FieldWidget): string {
  const v = fieldValue(field);
  return typeof v === "number" ? String(v) : "";
}

function arrayText(field: FieldWidget): string {
  const v = fieldValue(field);
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string").join(", ") : "";
}

function commitText(field: FieldWidget, raw: string): void {
  setFieldValue(field, raw);
}

function commitProse(field: FieldWidget, raw: string): void {
  setFieldValue(field, raw);
}

function commitBool(field: FieldWidget, value: boolean): void {
  setFieldValue(field, value);
}

function commitNumber(field: FieldWidget, raw: string): void {
  if (raw.trim() === "") {
    setFieldValue(field, null);
    return;
  }
  const n = Number(raw);
  setFieldValue(field, Number.isFinite(n) ? n : null);
}

function commitArray(field: FieldWidget, raw: string): void {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  setFieldValue(field, items);
}
</script>
