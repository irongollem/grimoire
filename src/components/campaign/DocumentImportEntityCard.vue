<template>
  <div
    class="rounded-lg border bg-card overflow-hidden transition-colors"
    :class="selected ? 'border-primary/50' : 'border-border'"
  >
    <div class="flex items-center gap-2 p-3">
      <AppCheckbox v-model="selected" :aria-label="`Select ${heading}`" />

      <div class="flex min-w-0 flex-1 items-center gap-2">
        <span class="truncate font-cinzel text-sm font-bold text-foreground">{{ heading }}</span>
        <AppButton
          v-if="confidence === 'partial'"
          as="span"
          variant="tinted"
          tone="caution"
          size="xs"
          label="Partial"
          tooltip="The extractor may not have captured every field for this entry — check it over."
        />
        <span v-if="page !== null" class="shrink-0 text-caption text-muted-foreground">Page {{ page }}</span>
      </div>

      <AppButton
        variant="ghost"
        size="icon-xs"
        :tooltip="expanded ? 'Collapse' : 'Expand'"
        :aria-label="expanded ? 'Collapse' : 'Expand'"
        :aria-expanded="expanded"
        :aria-controls="regionId"
        @click="expanded = !expanded"
      >
        <template #icon>
          <IconChevronDown
            class="h-3.5 w-3.5 transition-transform"
            :class="expanded ? 'rotate-180' : ''"
          />
        </template>
      </AppButton>
    </div>

    <div v-if="expanded" :id="regionId" class="space-y-3 border-t border-border p-3">
      <template v-for="(row, idx) in rows" :key="row.kind === 'header' ? `header-${row.label}` : `${row.field.sectionKey}.${row.field.key}`">
        <h4
          v-if="row.kind === 'header'"
          class="text-label-lg uppercase text-muted-foreground"
          :class="idx === 0 ? '' : 'pt-2 border-t border-border'"
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
            {{ row.field.summary }} — review after import
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
  </div>
</template>

<script setup lang="ts">
/**
 * One extracted entity's review card (#353 chunk 3) — the ONE generic card
 * every wizard step reuses. It knows nothing about "a monster" or "a quest";
 * it renders whatever the entity's `data` payload happens to contain, driven
 * entirely by each value's runtime shape:
 *
 *   boolean          -> AppCheckbox
 *   number           -> AppInput (numeric text, parsed on commit)
 *   string[]         -> AppInput, comma-joined (properties, components, classes)
 *   a known prose key -> RichTextEditor (descriptions, notes, backstory, ...)
 *   anything else string-ish -> AppInput
 *   a nested plain object (e.g. a monster's stat_block) -> its own labeled
 *     group of fields, one level deep, using the same rules
 *   an array of objects, or anything nested two levels deep (a statblock's
 *     actions/traits, `skills`, `spellcasting`) -> a read-only summary line;
 *     editing that shape fully belongs in the entity's own editor after
 *     import, not in a seven-step review wizard
 *
 * `data` is untrusted extractor output (documentImport.types.ts header) —
 * this card never assumes a field exists or has the type the interface
 * declares; every read goes through `classify`/`fieldValue`, which fall back
 * to a safe default instead of throwing.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { IconChevronDown } from "@/lib/icons";
import type { EntityKindEntry } from "@/lib/documentImport/entityKinds";
import type { ImportConfidence } from "@/types/documentImport.types";

const { entry, entityRef, page, confidence } = defineProps<{
  entry: EntityKindEntry;
  /** The extraction's stable `ref` for this entity — used only to build a
   *  collision-safe id for the expand region, never persisted from here. */
  entityRef: string;
  page: number | null;
  confidence: ImportConfidence;
}>();

const selected = defineModel<boolean>("selected", { required: true });
/** The entity's current (possibly DM-edited) payload. Untyped on purpose —
 *  see the file header — the parent widens it back to the real payload type
 *  when it builds the import plan. */
const data = defineModel<Record<string, unknown>>("data", { required: true });

const expanded = ref(false);
const regionId = computed(() => `import-entity-${entityRef.replace(/[^a-zA-Z0-9_-]/g, "-")}`);

const heading = computed(() => {
  const v = data.value[entry.displayField];
  return typeof v === "string" && v.trim() !== "" ? v : "Unnamed";
});

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Field classification ─────────────────────────────────────────────────────

/** Field names that hold paraphrased descriptive prose across every kind
 *  (documentImport.types.ts's `PROSE_FIELD_LIMIT` fields) — everything else
 *  string-shaped is a short mechanical/free-text value and gets a plain
 *  AppInput instead. */
const PROSE_FIELDS = new Set([
  "description",
  "notes",
  "appearance",
  "personality",
  "backstory",
  "summary",
  "higher_levels",
]);

type FieldKind = "prose" | "boolean" | "number" | "stringArray" | "text" | "summary";

interface FieldWidget {
  key: string;
  /** Which nested object this field lives under (e.g. "stat_block"), or null
   *  for a field directly on the entity's own payload. */
  sectionKey: string | null;
  kind: FieldKind;
  /** Present only for `kind === "summary"` — a compact, non-editable read of
   *  an array-of-objects or a doubly-nested object. */
  summary?: string;
}

type Row = { kind: "header"; label: string } | { kind: "field"; field: FieldWidget };

/** Best-effort one-line read of a value this card won't offer to edit. */
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
    return names.length ? `${value.length} — ${names.join(", ")}` : `${value.length} entries`;
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

/**
 * One flat, ordered list mixing group headers and fields, built from `data`'s
 * own keys. A nested plain object (depth 1, e.g. `stat_block`) expands into
 * its own header + fields; anything nested further is summarized rather than
 * expanded again — see the file header for why.
 */
/**
 * Presentation order for keys that have a conventional one.
 *
 * Needed because the order these arrive in is **not** the order the extractor
 * produced. `document_imports.extracted` is `jsonb`, and Postgres normalises
 * jsonb object keys (shortest first, then bytewise) rather than preserving
 * insertion order — so a stat block comes back as cha, con, dex, int, str, wis.
 * That is alphabetical, and every stat block in 5e is STR, DEX, CON, INT, WIS,
 * CHA. A DM reading an ability row in the wrong order notices immediately, and
 * would reasonably assume the values had been shuffled too.
 *
 * Keys not listed keep their relative order after the listed ones, so this
 * stays a nudge for the cases with a real convention rather than a second,
 * drifting copy of every payload's field list.
 */
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
  // Index tiebreak keeps it a stable sort for the unlisted majority.
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => rank(a.field.key) - rank(b.field.key) || a.index - b.index)
    .map(({ field }) => field);
}

const rows = computed<Row[]>(() => {
  const mainFields: FieldWidget[] = [];
  const nestedGroups: { label: string; fields: FieldWidget[] }[] = [];

  for (const [key, value] of Object.entries(data.value)) {
    if (value !== null && !Array.isArray(value) && typeof value === "object") {
      const fields = orderFields(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => classify(k, v, key)),
      );
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

// ── Read/write a field against the current `data` ───────────────────────────

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
