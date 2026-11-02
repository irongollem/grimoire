<template>
  <div class="space-y-4">
    <section class="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 class="text-heading-sm font-semibold text-foreground">Coins</h2>
      <p class="text-caption text-muted-foreground">
        The coins this table spends: gold and silver, dollars and cents, anything. Every price and purse reads in them.
        Removing a coin converts the ones players hold into the remaining coins by value.
      </p>
    </section>

    <div class="space-y-2">
      <CurrencyDenominationRow
        v-for="(row, i) in rows"
        :key="row.uid"
        :model-value="draft.denominations[i]"
        @update:model-value="(d) => (row.den = d)"
        @remove="removeRow(row.uid)"
      />
      <AppButton variant="outline" size="sm" :icon="IconAdd" label="Add a coin" @click="addRow" />
    </div>

    <section class="rounded-lg border border-border bg-card p-4 space-y-3">
      <label class="block max-w-xs">
        <span class="block text-label-lg font-semibold text-muted-foreground mb-1">DEFAULT COIN</span>
        <AppSelect v-model.number="defaultUid" tone="filled" weight="normal" size="body" block aria-label="Default coin">
          <option v-for="(row, i) in rows" :key="row.uid" :value="row.uid">
            {{ draft.denominations[i].name || draft.denominations[i].abbr || "Unnamed coin" }}
          </option>
        </AppSelect>
        <span class="block text-caption text-muted-foreground mt-1">A price written as a bare number, like "50", is in this coin.</span>
      </label>
      <p class="text-caption text-muted-foreground" data-testid="currency-preview">
        <template v-if="samplePrice">
          A price of "50" reads as <CoinAmount :coins="samplePrice" :currency="draft" size="sm" />.
        </template>
        <template v-if="samplePurse">
          A purse of 1 of each coin reads as <CoinAmount :coins="samplePurse" :currency="draft" size="sm" />.
        </template>
      </p>
    </section>

    <div
      v-if="changedElsewhere"
      class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3"
      role="status"
      data-testid="currency-changed-elsewhere"
    >
      <p class="text-caption text-muted-foreground">The saved coins changed elsewhere. Your edits are kept; saving replaces them.</p>
      <AppButton variant="outline" size="sm" label="Load saved coins" @click="loadSaved" />
    </div>

    <ul v-if="problems.length" class="space-y-1" role="alert">
      <li v-for="p in problems" :key="p" class="text-caption text-destructive">{{ p }}</li>
    </ul>

    <div class="flex flex-wrap justify-between gap-2">
      <AppButton variant="ghost" size="md" :icon="IconUndo" label="Reset to D&D 5e coins" @click="resetToSystem" />
      <AppButton
        variant="primary"
        size="md"
        :disabled="isSaving || problems.length > 0 || !dirty"
        :label="isSaving ? 'Saving…' : 'Save coins'"
        @click="save"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The Currency tab (#934): a DM defines the campaign's own coins. An explicit
 * Save, not autosave: removing a coin converts what players hold (the database
 * does it on save), which deserves a deliberate act.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import CoinAmount from "@/components/currency/CoinAmount.vue";
import CurrencyDenominationRow from "@/components/campaign/CurrencyDenominationRow.vue";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconUndo } from "@/lib/icons";
import { parsePrice, validateCurrency, type CurrencyConfig, type Denomination } from "@/lib/currency/currency";
import { useCampaignStore } from "@/stores/campaign";
import { activeGameSystem, defaultCurrencyFor } from "@/systems/registry";

interface Row {
  uid: number;
  den: Denomination;
  /** Not in the saved currency yet: its key still follows its abbreviation. */
  isNew: boolean;
}

const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign, isPending: isSaving } = useUpdateCampaign();
const { confirm } = useConfirm();
const toast = useToast();

const saved = computed<CurrencyConfig | null>(() => campaignStore.activeCampaign?.currency ?? null);

let nextUid = 1;
const rows = ref<Row[]>([]);
const defaultUid = ref(0);

/** The saved currency the draft was last loaded from, serialised: content, never object identity. */
let loadedKey = JSON.stringify(null);
/** The saved coins changed under unsaved edits (another DM saved); the draft is kept. */
const changedElsewhere = ref(false);

function load(cfg: CurrencyConfig | null) {
  loadedKey = JSON.stringify(cfg);
  changedElsewhere.value = false;
  rows.value = (cfg?.denominations ?? []).map((den) => ({ uid: nextUid++, den: { ...den }, isNew: false }));
  defaultUid.value = rows.value.find((r) => r.den.key === cfg?.default_key)?.uid ?? 0;
}

function loadSaved() {
  load(saved.value);
}

load(saved.value);

// A refetch hands back a new campaign object with the same coins; only a
// different campaign, or different coins, concerns the draft (and unsaved
// edits are never thrown away: they get a note instead).
watch(
  () => campaignStore.activeCampaign?.id,
  () => load(saved.value),
);
watch(
  () => JSON.stringify(saved.value),
  (key) => {
    if (key === loadedKey) return;
    const hadEdits = JSON.stringify(sorted.value) !== loadedKey;
    if (!hadEdits || JSON.stringify(sorted.value) === key) load(saved.value);
    else {
      loadedKey = key;
      changedElsewhere.value = true;
    }
  },
);

/** "Gp" -> "gp"; a symbol or digit-led abbreviation still yields a legal key. */
function keyFromAbbr(abbr: string, taken: Set<string>): string {
  const slug = abbr.toLowerCase().replace(/[^a-z0-9_]/g, "");
  const base = (/^[a-z]/.test(slug) ? slug : `c${slug}`).slice(0, 14);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}

/** Saved coins keep their key forever; a new coin's key is derived from its abbreviation. */
function keysFor(list: Row[]): string[] {
  const taken = new Set(list.filter((r) => !r.isNew).map((r) => r.den.key));
  return list.map((r) => {
    if (!r.isNew) return r.den.key;
    const key = keyFromAbbr(r.den.abbr, taken);
    taken.add(key);
    return key;
  });
}

/** The draft as a currency, rows in the order shown, keys resolved. */
const draft = computed<CurrencyConfig>(() => {
  const keys = keysFor(rows.value);
  const denominations = rows.value.map((r, i) => ({ ...r.den, key: keys[i] }));
  const defaultIndex = rows.value.findIndex((r) => r.uid === defaultUid.value);
  return { default_key: defaultIndex >= 0 ? keys[defaultIndex] : "", denominations };
});

/** What is saved: highest value first, as the database requires. */
const sorted = computed<CurrencyConfig>(() => ({
  ...draft.value,
  denominations: [...draft.value.denominations].sort((a, b) => b.value - a.value),
}));

const problems = computed(() => validateCurrency(sorted.value));
const dirty = computed(() => JSON.stringify(sorted.value) !== JSON.stringify(saved.value));
const samplePrice = computed(() => (problems.value.length ? null : parsePrice("50", draft.value)));
const samplePurse = computed(() =>
  problems.value.length ? null : Object.fromEntries(draft.value.denominations.map((d) => [d.key, 1])),
);

function addRow() {
  const uid = nextUid++;
  rows.value.push({ uid, den: { key: "", name: "", abbr: "", value: 1, color: "#9ca3af", makes_change: true }, isNew: true });
  if (!defaultUid.value) defaultUid.value = uid;
}

function removeRow(uid: number) {
  rows.value = rows.value.filter((r) => r.uid !== uid);
  if (defaultUid.value === uid) defaultUid.value = rows.value[0]?.uid ?? 0;
}

/** Replaces the draft with the system's coins; a coin with the same key stays the same coin. */
function resetToSystem() {
  const preset = defaultCurrencyFor(activeGameSystem());
  const keptKeys = new Set(saved.value?.denominations.map((d) => d.key));
  rows.value = preset.denominations.map((den) => ({ uid: nextUid++, den: { ...den }, isNew: !keptKeys.has(den.key) }));
  defaultUid.value = rows.value.find((r) => r.den.key === preset.default_key)?.uid ?? 0;
}

async function save() {
  const active = campaignStore.activeCampaign;
  if (!active || problems.value.length > 0) return;
  const kept = new Set(sorted.value.denominations.map((d) => d.key));
  const removed = (saved.value?.denominations ?? []).filter((d) => !kept.has(d.key));
  if (removed.length > 0) {
    const names = removed.map((d) => d.name).join(", ");
    const ok = await confirm(`Removing ${names} converts the ${removed.length === 1 ? "coin" : "coins"} players hold into the remaining coins by value.`, {
      title: "Remove coins?",
      confirmLabel: "Remove and convert",
    });
    if (!ok) return;
  }
  try {
    const updated = await updateCampaign({ id: active.id, update: { currency: sorted.value } });
    campaignStore.switchToCampaign(updated);
    toast.success("Coins saved.");
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
