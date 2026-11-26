<template>
  <div class="flex flex-col gap-3" data-testid="arc-contents">
    <section v-for="group in groups" :key="group.key" class="flex flex-col gap-1" :data-testid="`arc-block-${group.key}`">
      <span class="text-eyebrow text-muted-foreground">{{ group.title }}</span>
      <ul v-if="group.lines.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="line in group.lines" :key="line.key" class="flex min-w-0 items-start gap-2">
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="flex min-w-0 items-baseline gap-2">
              <RouterLink :to="line.to" class="text-body text-foreground hover:underline">{{ line.title }}</RouterLink>
              <span v-if="line.note" class="text-label text-muted-foreground">{{ line.note }}</span>
            </span>
            <RouterLink v-for="t in line.under" :key="t.id" :to="entryLink(t.id)" class="text-label text-muted-foreground hover:underline">{{ t.title }}</RouterLink>
          </span>
          <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Take ${line.title} out of this arc`" tooltip="Take out of this arc" data-testid="arc-remove" @click="file(line, null)" />
        </li>
      </ul>
      <p v-else class="m-0 text-caption text-muted-foreground">{{ group.empty }}</p>
    </section>

    <div class="flex flex-col gap-1" data-testid="arc-add">
      <span class="text-eyebrow text-muted-foreground">Add to this arc</span>
      <EntityCombobox v-model="picked" :options="candidates" placeholder="Add to this arc…" dropdown-height="lg" data-testid="arc-add-picker" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What one arc holds (the Arcs chapter's "What is in it"): its forces with their clocks, its secrets with their clue
 * tallies, its truths, its lore, its open questions, its quests and the backstories in it with their open threads, each line opening where it
 * lives. Truths and lore are listed too. Each line can be taken out of the arc, and a picker files any other entry or quest
 * in it, so an arc is filled without opening each sheet.
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries, useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useQuests, useUpdateQuest } from "@/composables/quests/useQuests";
import { openThreads } from "@/lib/canon/backstoryThreads";
import { clockFilled } from "@/lib/canon/canonForces";
import { clueTally } from "@/lib/canon/canonSecrets";
import { LORE_KIND_LABEL } from "@/lib/canon/canonLore";
import { KNOWLEDGE_LABEL } from "@/lib/canon/canonParts";
import { IconClose } from "@/lib/icons";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";

const { arcId } = defineProps<{ arcId: string }>();

const { data: entriesData } = useCanonEntries();
const { data: forceData } = useCanonForceData();
const { data: cluesData } = useCanonClues();
const { data: questsData } = useQuests();
const { data: linksData } = useCampaignLinks();

const { mutate: updateEntry } = useUpdateCanonEntry();
const { mutate: updateQuest } = useUpdateQuest();

const entryLink = (id: string) => ({ path: "/canon", query: { entry: id } });
const entries = computed(() => entriesData.value ?? []);
const inArc = (part: string) => entries.value.filter((e) => e.part === part && e.arc_id === arcId);
const ticksOf = (forceId: string) => (forceData.value?.ticks ?? []).filter((t) => t.force_id === forceId);
const cluesOf = (secretId: string) => (cluesData.value ?? []).filter((c) => c.secret_id === secretId);

/** What a line is filed as: a canon entry or a quest, each of which carries its own `arc_id`. */
interface Line { key: string; kind: "entry" | "quest"; title: string; to: { path: string; query?: Record<string, string> } | string; note?: string; under?: readonly { id: string; title: string }[] }
const groups = computed<{ key: string; title: string; empty: string; lines: Line[] }[]>(() => [
  {
    key: "forces",
    title: "Forces",
    empty: "No force is in this arc.",
    lines: inArc("force").map((f) => ({ kind: "entry", key: f.id, title: f.title, to: entryLink(f.id), note: f.clock_size === null ? "no clock" : `${clockFilled(ticksOf(f.id), f.clock_size)} of ${f.clock_size}` })),
  },
  {
    key: "secrets",
    title: "Secrets",
    empty: "No secret is in this arc.",
    lines: inArc("secret").map((s) => ({ kind: "entry", key: s.id, title: s.title, to: entryLink(s.id), note: clueTally(cluesOf(s.id)) })),
  },
  {
    key: "truths",
    title: "Truths",
    empty: "No truth is in this arc.",
    lines: inArc("truth").map((t) => ({ kind: "entry", key: t.id, title: t.title, to: entryLink(t.id), note: t.knowledge ? KNOWLEDGE_LABEL[t.knowledge] : undefined })),
  },
  {
    key: "lore",
    title: "Lore",
    empty: "No lore is in this arc.",
    lines: inArc("lore").map((l) => ({ kind: "entry", key: l.id, title: l.title, to: entryLink(l.id), note: l.lore_kind ? LORE_KIND_LABEL[l.lore_kind] : undefined })),
  },
  {
    key: "questions",
    title: "Open questions",
    empty: "No question is open in this arc.",
    lines: inArc("question").filter((q) => q.closed_as === null).map((q) => ({ kind: "entry", key: q.id, title: q.title, to: entryLink(q.id) })),
  },
  {
    key: "quests",
    title: "Quests",
    empty: "No quest is part of this arc.",
    lines: (questsData.value ?? []).filter((q) => q.arc_id === arcId).map((q) => ({ kind: "quest", key: q.id, title: q.title, to: `/quests/${q.id}`, note: QUEST_STATUS_LABELS[q.status] })),
  },
  {
    key: "backstories",
    title: "Backstory threads",
    empty: "No backstory is in this arc.",
    lines: inArc("backstory").map((b) => ({ kind: "entry", key: b.id, title: b.title, to: entryLink(b.id), under: openThreads(b.id, entries.value, linksData.value ?? []) })),
  },
]);

// Filing: a quest and a canon entry each hold `arc_id`, so one write moves either in or out.
function file(line: { kind: "entry" | "quest"; key: string }, to: string | null) {
  if (line.kind === "quest") updateQuest({ id: line.key, update: { arc_id: to } });
  else updateEntry({ id: line.key, patch: { arc_id: to } });
}

// The picker: everything not already here, but never a premise line (premise has no arc). Ids say which kind they are.
const PART_LABEL: Record<string, string> = { truth: "Truth", force: "Force", secret: "Secret", question: "Question", lore: "Lore", backstory: "Backstory" };
const candidates = computed(() => [
  ...entries.value.filter((e) => e.part !== "premise" && e.arc_id !== arcId).map((e) => ({ id: `entry:${e.id}`, name: `${e.title} (${PART_LABEL[e.part] ?? e.part})` })),
  ...(questsData.value ?? []).filter((q) => q.arc_id !== arcId).map((q) => ({ id: `quest:${q.id}`, name: `${q.title} (Quest)` })),
]);
const picked = ref("");
watch(picked, (value) => {
  if (value === "") return;
  const [kind, id] = value.split(/:(.*)/s);
  if (id) file({ kind: kind === "quest" ? "quest" : "entry", key: id }, arcId);
  picked.value = "";
});
</script>
