<template>
  <div v-if="visible" class="flex flex-col gap-3" data-testid="entry-story-links">
    <div v-if="because.length > 0" class="flex flex-col gap-1" data-testid="story-because">
      <span class="text-eyebrow text-muted-foreground">Because of</span>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="e in because" :key="e.id" class="min-w-0">
          <RouterLink :to="{ path: '/canon', query: { entry: e.id } }" class="text-body text-foreground hover:underline" data-testid="story-because-item">{{ e.title }}</RouterLink>
        </li>
      </ul>
    </div>

    <div v-if="ledTo.length > 0" class="flex flex-col gap-1" data-testid="story-led-to">
      <span class="text-eyebrow text-muted-foreground">Led to</span>
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="e in ledTo" :key="e.id" class="min-w-0">
          <RouterLink :to="{ path: '/canon', query: { entry: e.id } }" class="text-body text-foreground hover:underline" data-testid="story-led-to-item">{{ e.title }}</RouterLink>
        </li>
      </ul>
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
 * Cause and effect on one canon entry (#1258 item 18): what it came of ("Because of"), what it led to ("Led to"), and
 * the premise themes it carries. Both directions of `led_to` are read from the campaign's links, and the pointer a
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

/** Entries by id, each once and in the order given; an id with no entry (trashed) is left out. */
function resolve(ids: readonly string[]): CanonEntry[] {
  const seen = new Set<string>();
  const out: CanonEntry[] = [];
  for (const id of ids) {
    const e = byId.value.get(id);
    if (e === undefined || seen.has(e.id) || e.id === entry.id) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

const because = computed(() =>
  resolve([
    ...canonLinks.value.filter((l) => l.type === "led_to" && l.to_id === entry.id).map((l) => l.from_id),
    ...entries.value.filter((e) => e.became_entry_id === entry.id).map((e) => e.id),
  ]),
);
const ledTo = computed(() =>
  resolve([
    ...canonLinks.value.filter((l) => l.type === "led_to" && l.from_id === entry.id).map((l) => l.to_id),
    ...(entry.became_entry_id === null ? [] : [entry.became_entry_id]),
  ]),
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

const picked = ref("");
watch(picked, (id) => {
  if (id === "") return;
  const theme = byId.value.get(id);
  picked.value = "";
  if (theme === undefined) return;
  const choice = typeChoices("canon", "canon").find((c) => c.key === "carries" && c.subjectIsFrom);
  if (!choice) throw new Error("the catalogue has no canon-to-canon carries tie");
  connect({ subject: subject.value, other: { kind: "canon", id: theme.id, name: theme.title }, choice });
});

function uncarry({ link, theme }: { link: WorldLink; theme: CanonEntry }) {
  const connection: Connection = {
    source: "link", row_id: link.id, type: "carries", outward: true, other_kind: "canon", other_id: theme.id, other_name: theme.title, other_image: null,
    note: null, told: null, player_visible_to: null, ai_provenance: null, role: null, status: null,
  };
  disconnect({ connection, subject: subject.value });
}
</script>
