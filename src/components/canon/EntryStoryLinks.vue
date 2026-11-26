<template>
  <div v-if="visible" class="flex flex-col gap-3" data-testid="entry-story-links">
    <div v-for="g in groups" :key="g.key" class="flex flex-col gap-1" :data-testid="`story-${g.key}`">
      <span class="text-eyebrow text-muted-foreground">{{ g.label }}</span>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="r in g.rows" :key="r.entry.id" class="flex min-w-0 items-center gap-1">
          <RouterLink :to="{ path: '/canon', query: { entry: r.entry.id } }" class="min-w-0 truncate text-body text-foreground hover:underline" :data-testid="`story-${g.key}-item`">{{ r.entry.title }}</RouterLink>
          <!-- The entry's own became pointer is its record, not a tie: no remove. -->
          <AppButton v-if="r.link !== null" variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove the tie to ${r.entry.title}`" data-testid="story-remove" @click="removeTie(r.link, r.entry)" />
        </li>
      </ul>
    </div>

    <div v-if="canCarry" class="flex flex-col gap-1.5" data-testid="story-cause-pickers">
      <EntityCombobox v-if="causeOptions.length > 0" :key="`cause-${pickedCause}`" v-model="pickedCause" :options="causeOptions" placeholder="Add a cause…" data-testid="story-add-cause" />
      <EntityCombobox v-if="effectOptions.length > 0" :key="`effect-${pickedEffect}`" v-model="pickedEffect" :options="effectOptions" placeholder="Add an effect…" data-testid="story-add-effect" />
    </div>

    <div v-if="canCarry" class="flex flex-col gap-1.5" data-testid="story-carries">
      <span class="text-eyebrow text-muted-foreground">Carries</span>
      <ul v-if="carried.length > 0" class="flex flex-wrap gap-1.5">
        <li v-for="c in carried" :key="c.link.id" class="inline-flex items-center gap-1 border border-border bg-muted/40 py-px pr-1 pl-2 text-label text-foreground">
          <RouterLink :to="{ path: '/canon', query: { entry: c.theme.id } }" class="hover:underline" data-testid="story-carries-item">{{ c.theme.title }}</RouterLink>
          <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`No longer carries ${c.theme.title}`" @click="uncarry(c)" />
        </li>
      </ul>
      <EntityCombobox v-if="themeOptions.length > 0" :key="picked" v-model="picked" :options="themeOptions" placeholder="Carries a theme…" />
      <p v-else-if="carried.length === 0" class="text-caption text-muted-foreground">No theme to carry yet. Themes are written in the premise.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Cause and effect on one canon entry (#1258 item 18, #1279 item 9): what it came of ("Because of"), what it led to ("Led to"), and
 * the premise themes it carries. This block owns `led_to` and `carries` (the details hide both from Connections), so
 * each `led_to` row can be removed and Add a cause / Add an effect write one; a row from the entry's own became pointer is
 * its record, not a tie, and stays read-only. Both directions of `led_to` are read from the campaign's links, and the pointer a
 * secret, question or truth keeps to what it became (`became_entry_id`) counts as a `led_to` too, so the two never
 * disagree on screen. A heading with nothing under it is not drawn; a premise entry carries nothing.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCampaignLinks, useCreateConnection, useRemoveConnection } from "@/composables/connections/useConnections";
import { IconClose } from "@/lib/icons";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { CanonEntry } from "@/types/canon.types";
import type { Connection, WorldLink, WorldRef } from "@/types/connections.types";

const { entry } = defineProps<{ entry: CanonEntry }>();

const { data: entriesData } = useCanonEntries();
const { data: linksData } = useCampaignLinks();
const { mutate: connect } = useCreateConnection();
const { mutate: disconnect } = useRemoveConnection();

const subject = computed<WorldRef>(() => ({ kind: "canon", id: entry.id }));
const entries = computed(() => entriesData.value ?? []);
const byId = computed(() => new Map(entries.value.map((e) => [e.id, e])));
const canonLinks = computed(() => (linksData.value ?? []).filter((l) => l.from_kind === "canon" && l.to_kind === "canon"));

interface Tie { entry: CanonEntry; link: WorldLink | null }

/** Entries with the `led_to` link that ties them, each once; the became pointer gives a row with no link of its own. */
function ties(links: readonly { id: string; link: WorldLink }[], pointerIds: readonly string[]): Tie[] {
  const seen = new Set<string>();
  const out: Tie[] = [];
  for (const { link, id } of links) {
    const e = byId.value.get(id);
    if (e === undefined || seen.has(e.id) || e.id === entry.id) continue;
    seen.add(e.id);
    out.push({ entry: e, link });
  }
  for (const id of pointerIds) {
    const e = byId.value.get(id);
    if (e === undefined || seen.has(e.id) || e.id === entry.id) continue;
    seen.add(e.id);
    out.push({ entry: e, link: null });
  }
  return out;
}

const ledToLinks = computed(() => canonLinks.value.filter((l) => l.type === "led_to"));
const because = computed(() =>
  ties(
    ledToLinks.value.filter((l) => l.to_id === entry.id).map((l) => ({ link: l, id: l.from_id })),
    entries.value.filter((e) => e.became_entry_id === entry.id).map((e) => e.id),
  ),
);
const ledTo = computed(() =>
  ties(
    ledToLinks.value.filter((l) => l.from_id === entry.id).map((l) => ({ link: l, id: l.to_id })),
    entry.became_entry_id === null ? [] : [entry.became_entry_id],
  ),
);
// A heading with nothing under it is not drawn.
const groups = computed(() =>
  [
    { key: "because", label: "Because of", rows: because.value },
    { key: "led-to", label: "Led to", rows: ledTo.value },
  ].filter((g) => g.rows.length > 0),
);

const canCarry = computed(() => entry.part !== "premise");
const carried = computed(() => {
  const out: { link: WorldLink; theme: CanonEntry }[] = [];
  for (const link of canonLinks.value) {
    if (link.type !== "carries" || link.from_id !== entry.id) continue;
    const theme = byId.value.get(link.to_id);
    if (theme !== undefined) out.push({ link, theme });
  }
  return out;
});
const themeOptions = computed(() => {
  const held = new Set(carried.value.map((c) => c.theme.id));
  return entries.value.filter((e) => e.part === "premise" && e.premise_kind === "theme" && !held.has(e.id)).map((e) => ({ id: e.id, name: e.title }));
});

const visible = computed(() => because.value.length > 0 || ledTo.value.length > 0 || canCarry.value);

/** What an Add a cause / effect picker offers: any entry of the canon but the premise's lines, this one, and what is already tied that way. */
function candidates(taken: readonly Tie[]) {
  const held = new Set(taken.map((t) => t.entry.id));
  return entries.value.filter((e) => e.part !== "premise" && e.id !== entry.id && !held.has(e.id)).map((e) => ({ id: e.id, name: e.title }));
}
const causeOptions = computed(() => candidates(because.value));
const effectOptions = computed(() => candidates(ledTo.value));

const picked = ref("");
const pickedCause = ref("");
const pickedEffect = ref("");

function pickedEntry(id: string, target: { value: string }): CanonEntry | undefined {
  if (id === "") return undefined;
  target.value = "";
  return byId.value.get(id);
}
watch(picked, (id) => {
  const theme = pickedEntry(id, picked);
  if (theme === undefined) return;
  const choice = typeChoices("canon", "canon").find((c) => c.key === "carries" && c.subjectIsFrom);
  if (!choice) throw new Error("the catalogue has no canon-to-canon carries tie");
  connect({ subject: subject.value, other: { kind: "canon", id: theme.id, name: theme.title }, choice });
});

/** A cause is the entry this one came of, so this entry is the `to` end; an effect is the `from` end's opposite. */
function connectLedTo(other: CanonEntry, subjectIsFrom: boolean) {
  const choice = typeChoices("canon", "canon").find((c) => c.key === "led_to" && c.subjectIsFrom === subjectIsFrom);
  if (!choice) throw new Error("the catalogue has no canon-to-canon led_to tie");
  connect({ subject: subject.value, other: { kind: "canon", id: other.id, name: other.title }, choice });
}
watch(pickedCause, (id) => {
  const other = pickedEntry(id, pickedCause);
  if (other !== undefined) connectLedTo(other, false);
});
watch(pickedEffect, (id) => {
  const other = pickedEntry(id, pickedEffect);
  if (other !== undefined) connectLedTo(other, true);
});

function removeTie(link: WorldLink, other: CanonEntry) {
  const connection: Connection = {
    source: "link", row_id: link.id, type: "led_to", outward: link.from_id === entry.id, other_kind: "canon", other_id: other.id, other_name: other.title, other_image: null,
    note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null,
  };
  disconnect({ connection, subject: subject.value });
}

function uncarry({ link, theme }: { link: WorldLink; theme: CanonEntry }) {
  const connection: Connection = {
    source: "link", row_id: link.id, type: "carries", outward: true, other_kind: "canon", other_id: theme.id, other_name: theme.title, other_image: null,
    note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null,
  };
  disconnect({ connection, subject: subject.value });
}
</script>
