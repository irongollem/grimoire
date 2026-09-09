<template>
  <section class="mx-auto w-full max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5" aria-labelledby="new-flow-heading">
    <div>
      <p class="text-label font-bold uppercase tracking-wider text-primary">New quest</p>
      <h2 id="new-flow-heading" class="font-cinzel text-lg font-bold text-foreground">
        {{ startMode === "paste" ? "Paste a page from your book" : "Name the quest and what it is about" }}
      </h2>
      <p class="mt-1 text-body text-muted-foreground">
        <template v-if="startMode === 'paste'">
          Copy a page from an adventure book — the quest lands with its story beats already wired, and anything
          else on the page (locations, NPCs, monsters…) comes along too if you want it.
        </template>
        <template v-else>
          The overview opens next — the quest's premise, stakes, rewards, and the material that spans the whole
          story. Build the beats from there once you know what the quest is.
        </template>
      </p>
    </div>

    <SegmentedControl v-model="startMode" :options="START_MODE_OPTIONS" />

    <template v-if="startMode === 'type'">
      <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label class="grid gap-1.5">
          <span class="text-label-lg font-semibold text-muted-foreground">Quest title</span>
          <AppInput v-model="title" size="lg" placeholder="The road beneath the lake…" @keydown.enter="createFlow" />
        </label>
        <label class="grid gap-1.5">
          <span class="text-label-lg font-semibold text-muted-foreground">Starting lane</span>
          <AppSelect v-model="status" size="lg" block aria-label="Starting quest lane">
            <option v-for="candidate in QUEST_STATUSES" :key="candidate" :value="candidate">{{ QUEST_STATUS_LABELS[candidate] }}</option>
          </AppSelect>
        </label>
      </div>

      <label class="grid gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Premise <span class="font-normal">(optional)</span></span>
        <AppInput
          v-model="summary"
          :maxlength="QUEST_SUMMARY_MAX"
          placeholder="Players see this verbatim — the blurb that tells you what the quest is without opening it. One sentence, no DM secrets."
        />
      </label>

      <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ error }}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <AppButton to="/quests" label="Cancel" variant="subtle" :disabled="saving" />
        <AppButton label="Create quest" variant="primary" :loading="saving" :disabled="!title.trim()" @click="createFlow" />
      </div>
    </template>

    <QuestPasteImportPanel v-else :parent-id="parentId ?? null" />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCreateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useCreateQuest } from "@/composables/quests/useQuests";
import { QUEST_SUMMARY_MAX } from "@/lib/quests/summary";
import { QUEST_STATUSES, QUEST_STATUS_LABELS, type QuestStatus } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/SegmentedControl.vue";
import QuestPasteImportPanel from "@/components/quests/QuestPasteImportPanel.vue";
import { IconClipboard, IconEdit } from "@/lib/icons";

const { parentId = null } = defineProps<{ parentId?: string | null }>();

/** A third way to start a quest, beside typing one (below) and generating
 *  one (`QuestGeneratorPanel.vue`, opened from the quest list) — pasting a
 *  page from a book (#839). See `QuestPasteImportPanel.vue`'s own header for
 *  why this reuses the settings importer's extraction rather than forking
 *  it. */
type StartMode = "type" | "paste";
const startMode = ref<StartMode>("type");
const START_MODE_OPTIONS: SegmentedOption<StartMode>[] = [
  { value: "type", label: "Type it", icon: IconEdit },
  { value: "paste", label: "Paste a page", icon: IconClipboard },
];
const router = useRouter();
const createQuest = useCreateQuest();
const createBeat = useCreateQuestBeat();
const title = ref("");
const summary = ref("");
const status = ref<QuestStatus>("undiscovered");
const saving = ref(false);
const error = ref("");

async function createFlow() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const created = await createQuest.mutateAsync({
      parent_quest_id: parentId,
      title: title.value.trim(),
      summary: summary.value.trim() || null,
      status: status.value,
      giver_npc_id: null,
      location_id: null,
      tags: [],
      player_visible_to: [],
      started_at: null,
      resolved_at: null,
    });
    // A quest's rumor beat is written with it, not left for the DM to
    // remember — the DB trigger makes this the entry the moment it exists,
    // so nothing here sets `entry_beat_id` directly. "Rumor" is not a kind:
    // it is `visibility: "rumored"`, the state the player journal renders as
    // "a rumour is circulating" even before `rumor_text` is written — which
    // is why the plain insert is used here rather than the route RPC, whose
    // signature has no visibility parameter.
    // `quests.campaign_id` is nullable on the column and never in practice —
    // `useCreateQuest` stamps the active campaign with no opt-out (see the
    // `campaign_id` note in quests.md). A null here would mean that promise
    // broke, which is worth a loud error rather than a beat in no campaign.
    if (!created.campaign_id) throw new Error("The quest was created outside any campaign");
    await createBeat.mutateAsync({
      quest_id: created.id,
      campaign_id: created.campaign_id,
      title: "The rumor",
      dm_content: null,
      read_aloud: null,
      how_it_plays: null,
      rumor_text: null,
      reveal_text: null,
      visibility: "rumored",
      kind: "neutral",
      converge_mode: "any",
      presentation_hint: null,
      canvas_x: 0,
      canvas_y: 0,
      is_improvised: false,
      improv_reviewed_at: null,
    });
    // Name the surface, never the global mode. This used to set `dmMode = "prep"`
    // and rely on prep's default landing — which meant improvising a quest at the
    // table silently ended the DM's broadcast, and the next NPC reveal went out
    // unannounced with nothing to connect it to. See #758.
    await router.push({ path: `/quests/${created.id}`, query: { view: "overview" } });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "The quest flow could not be created";
  } finally {
    saving.value = false;
  }
}
</script>
