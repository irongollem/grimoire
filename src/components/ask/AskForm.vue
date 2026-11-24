<template>
  <div v-if="rows.length > 0 || !boxed" class="flex flex-col gap-2.5 border-t border-border/60 pt-2" data-testid="ask-form">
    <p v-if="rows.length === 0" class="text-caption text-muted-foreground">Nothing here to set.</p>
    <template v-for="row in rows" :key="row.kind === 'input' ? row.key : `group:${row.name}`">
      <AskFormField
        v-if="row.kind === 'input'"
        :input-key="row.key"
        :schema="row.schema"
        :model-value="inputs[row.key]"
        :options="optionsFor(row.schema)"
        :ties="ties"
        :aside="asides.get(row.key)?.value ?? null"
        :noun="`this ${generator.noun}`"
        @update:model-value="set(row.key, $event)"
        @update:ties="setTies"
      />
      <div v-else class="flex flex-col gap-2" :data-testid="`ask-group-${row.name}`">
        <AppButton
          variant="subtle"
          size="sm"
          class="justify-between"
          :icon-right="open.has(row.name) ? IconChevronUp : IconChevronDown"
          :aria-expanded="open.has(row.name)"
          @click="toggle(row.name)"
        >
          <span class="flex min-w-0 flex-col items-start text-left">
            <span class="text-label-lg">{{ row.name }}</span>
            <span class="max-w-full truncate text-caption text-muted-foreground" :data-testid="`ask-group-summary-${row.name}`">{{ summary(row.members) }}</span>
          </span>
        </AppButton>
        <div v-if="open.has(row.name)" class="flex flex-col gap-2.5 pl-2">
          <AskFormField
            v-for="member in row.members"
            :key="member.key"
            :input-key="member.key"
            :schema="member.schema"
            :model-value="inputs[member.key]"
            :options="optionsFor(member.schema)"
            :ties="ties"
            :aside="asides.get(member.key)?.value ?? null"
            :noun="`this ${generator.noun}`"
            @update:model-value="set(member.key, $event)"
            @update:ties="setTies"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The card's inputs (#1270): the generator's whole form, drawn from its contract. Every edit emits the whole new
 * `inputs`, and the card re-quotes from it. Inputs that fold (`group`) become one row that says what it holds and
 * opens in place; an input that depends on another (`when`) appears with it and goes with it. A `*_id` is picked by
 * name from the same lists the generator's panel reads, and the ties are the panel's own ties field.
 */
import { computed, ref, watch } from "vue";
import type { AskGenerator, AskInputSchema, AskRecordType } from "@edge-shared/agent/askContract";
import { formRows, groupSummary, optionLabel, pruneHidden } from "@/ai/ask/askForm";
import { ASK_ASIDES } from "@/ai/ask/askAsides";
import { ASK_LISTS, isRecordPicker, useAskRecordOptions, type AskRecordOption } from "@/ai/ask/askOptions";
import { readAskLinks, resolveAskLinks, toAskLinks } from "@/ai/ask/adapters/askAdapterKit";
import { useAskLinkRecords } from "@/ai/ask/adapters/askLinkRecords";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskFormField from "@/components/ask/AskFormField.vue";

/** An enum this short is chips; a longer one is a searchable pick. */
const CHIP_LIMIT = 6;

const { generator, inputs, boxed = false } = defineProps<{
  generator: AskGenerator;
  inputs: Record<string, unknown>;
  /** The card has a concept box above this form: with no inputs, the box is the thing to set and nothing is said. */
  boxed?: boolean;
}>();
const emit = defineEmits<{ update: [inputs: Record<string, unknown>] }>();

const rows = computed(() => formRows(generator, inputs));
const open = ref(new Set<string>());
function toggle(name: string) {
  const next = new Set(open.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  open.value = next;
}

// The lists and record pickers this generator's inputs name, read only for what it names.
const schemas = Object.values(generator.inputs);
const recordTypes = new Set<AskRecordType>(schemas.flatMap((s) => (s.type === "string" && s.record !== undefined ? [s.record] : [])));
const records = useAskRecordOptions(() => recordTypes);
const lists = new Map(schemas.flatMap((s) => (s.type === "string" && s.list !== undefined && ASK_LISTS[s.list] ? [[s.list, ASK_LISTS[s.list]()] as const] : [])));

// A line under a field that reads the card's inputs (the encounter's "Uses <table> here"), read only for what is named.
const asides = new Map(Object.entries(generator.inputs).flatMap(([key, s]) => (s.aside !== undefined && ASK_ASIDES[s.aside] ? [[key, ASK_ASIDES[s.aside](() => inputs)] as const] : [])));

function optionsFor(schema: AskInputSchema): AskRecordOption[] | null {
  if (schema.type !== "string") return null;
  if (schema.record !== undefined) return isRecordPicker(schema.record) ? records[schema.record].value : [];
  if (schema.list !== undefined) return (lists.get(schema.list)?.value ?? []).map((o) => ({ id: o.value, name: o.label }));
  if (schema.enum && schema.enum.length > CHIP_LIMIT) return schema.enum.map((word) => ({ id: word, name: optionLabel(schema, word) }));
  return null;
}

function summary(members: readonly { key: string; schema: AskInputSchema }[]): string {
  return groupSummary(members, inputs, (key, value) => {
    const schema = generator.inputs[key];
    if (schema.type === "links") return Array.isArray(value) && value.length > 0 ? `${value.length} ${value.length === 1 ? "tie" : "ties"}` : null;
    if (typeof value !== "string") return String(value);
    const options = optionsFor(schema);
    const named = options?.find((o) => o.id === value)?.name;
    if (named !== undefined) return named;
    // A record not in the list yet has only its id, which is no word for the DM: leave it out until its name arrives.
    if (schema.type === "string" && schema.record !== undefined) return null;
    return schema.type === "string" && schema.enum ? optionLabel(schema, value) : value;
  });
}

function set(key: string, value: unknown) {
  const next = { ...inputs };
  if (value === undefined || value === false) delete next[key];
  else next[key] = value;
  emit("update", pruneHidden(generator, next));
}

// ── Ties ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const linksKey = Object.entries(generator.inputs).find(([, s]) => s.type === "links")?.[0] ?? null;
const askedLinks = computed(() => (linksKey === null ? [] : readAskLinks(generator.id, { [linksKey]: inputs[linksKey] })));
const linkRecords = useAskLinkRecords(() => askedLinks.value);
const signature = (links: readonly { kind: string; id: string; relation: string }[]) => links.map((l) => `${l.kind}:${l.id}:${l.relation}`).join();

// The field's own list is kept here: right after an edit the names of a new tie are not read yet, and the chip must not blink out.
const ties = ref<GeneratorLink[]>([]);
watch([askedLinks, () => linkRecords.names.value], () => {
  if (signature(toAskLinks(ties.value)) === signature(askedLinks.value)) return;
  const names = linkRecords.names.value;
  if (askedLinks.value.length === 0) ties.value = [];
  else if (names !== undefined) ties.value = resolveAskLinks(generator.id, askedLinks.value, names);
}, { immediate: true });

function setTies(next: GeneratorLink[]) {
  ties.value = next;
  if (linksKey !== null) set(linksKey, next.length === 0 ? undefined : toAskLinks(next));
}
</script>
