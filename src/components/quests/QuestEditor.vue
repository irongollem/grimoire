<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Quest title</span>
        <input
          v-model="title"
          placeholder="Quest title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <select
        v-model="status"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
        :style="{ color: QUEST_STATUS_COLORS[status] }"
      >
        <option v-for="s in QUEST_STATUSES" :key="s" :value="s">
          {{ QUEST_STATUS_LABELS[s] }}
        </option>
      </select>

      <button
        type="button"
        :disabled="saving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>

      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Two-column layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left: meta + notes -->
      <div class="lg:col-span-2 flex flex-col gap-4">
        <!-- Summary -->
        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Summary</label>
          <input
            v-model="summary"
            placeholder="A short description of the quest…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Metadata grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Quest Giver</label>
            <select
              v-model="giverNpcId"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              <option v-for="npc in npcs" :key="npc.id" :value="npc.id">{{ npc.name }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Location</label>
            <select
              v-model="locationId"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              <option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Part of Quest</label>
            <select
              v-model="parentQuestId"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              <option v-for="q in parentCandidates" :key="q.id" :value="q.id">
                {{ q.title || "Untitled Quest" }}
              </option>
            </select>
          </div>

          <div class="flex flex-col gap-1.5">
            <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Reward Notes</label>
            <input
              v-model="rewards"
              placeholder="Gold, XP, reputation…"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap items-center gap-1 min-h-8 bg-muted/50 border border-border rounded-md px-2 py-1">
          <span
            v-for="tag in tags"
            :key="tag"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-card font-cinzel text-[11px] text-muted-foreground tracking-wider"
          >
            {{ tag }}
            <button type="button" class="hover:text-destructive transition-colors leading-none text-sm" @click="removeTag(tag)">×</button>
          </span>
          <input
            v-model="tagInput"
            placeholder="Add tag…"
            class="bg-transparent border-none outline-none font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 min-w-24 flex-1"
            @keydown.enter.prevent="addTag"
            @keydown="onTagKeydown"
          />
        </div>

        <!-- Notes (Tiptap) -->
        <div class="flex flex-col rounded-lg border border-border bg-card overflow-hidden" style="min-height: 280px">
          <div class="px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Notes</span>
          </div>
          <div class="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0">
            <template v-if="editor">
              <button type="button" title="Bold" :class="tbCls(editor.isActive('bold'))" @click="editor.chain().focus().toggleBold().run()">
                <strong class="text-[11px] leading-none">B</strong>
              </button>
              <button type="button" title="Italic" :class="tbCls(editor.isActive('italic'))" @click="editor.chain().focus().toggleItalic().run()">
                <em class="text-[11px] leading-none">I</em>
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <button type="button" title="Heading 2" :class="tbCls(editor.isActive('heading', { level: 2 }))" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">
                <span class="text-[10px] font-cinzel font-bold leading-none">H2</span>
              </button>
              <button type="button" title="Heading 3" :class="tbCls(editor.isActive('heading', { level: 3 }))" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">
                <span class="text-[10px] font-cinzel font-bold leading-none">H3</span>
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <button type="button" title="Bullet list" :class="tbCls(editor.isActive('bulletList'))" @click="editor.chain().focus().toggleBulletList().run()">
                <List class="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Ordered list" :class="tbCls(editor.isActive('orderedList'))" @click="editor.chain().focus().toggleOrderedList().run()">
                <ListOrdered class="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Blockquote" :class="tbCls(editor.isActive('blockquote'))" @click="editor.chain().focus().toggleBlockquote().run()">
                <Quote class="h-3.5 w-3.5" />
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <button type="button" title="Undo" :class="tbCls(false)" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
                <Undo2 class="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Redo" :class="tbCls(false)" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
                <Redo2 class="h-3.5 w-3.5" />
              </button>
            </template>
          </div>
          <div class="flex-1 overflow-auto p-4">
            <EditorContent :editor="editor" class="quest-editor h-full" />
          </div>
        </div>
      </div>

      <!-- Right: objectives, rewards, sub-quests -->
      <div class="flex flex-col gap-4">
        <!-- Objectives -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              Objectives
              <span v-if="objectives?.length" class="font-fell font-normal">
                ({{ doneCount }}/{{ objectives.length }})
              </span>
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="obj in objectives ?? []"
              :key="obj.id"
              class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <button
                type="button"
                class="mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors"
                :class="obj.is_done ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary'"
                @click="toggleObjective(obj)"
              >
                <Check v-if="obj.is_done" class="h-2.5 w-2.5" />
              </button>
              <span
                class="font-fell text-sm flex-1 leading-snug transition-colors"
                :class="obj.is_done ? 'text-muted-foreground line-through' : 'text-foreground'"
              >
                {{ obj.description }}
              </span>
              <button
                type="button"
                class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeObjective(obj)"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <div v-if="!isNew" class="flex items-center gap-2 pt-1">
              <input
                v-model="newObjective"
                placeholder="Add objective…"
                class="flex-1 bg-transparent border-b border-border px-1 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
                @keydown.enter.prevent="addObjective"
              />
              <button
                type="button"
                :disabled="!newObjective.trim()"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addObjective"
              >
                <Plus class="h-4 w-4" />
              </button>
            </div>
            <p v-else class="font-fell text-xs text-muted-foreground italic px-2 py-1">
              Save the quest first, then add objectives.
            </p>
          </div>
        </div>

        <!-- Rewards: linked items -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              Reward Items
              <span v-if="rewardItems.length" class="font-fell font-normal">({{ rewardItems.length }})</span>
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in rewardItems"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <Package class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/vault/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ itemName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <div v-if="!isNew && availableItems.length" class="flex items-center gap-2 pt-1">
              <select
                v-model="selectedItemId"
                class="flex-1 bg-transparent border-b border-border px-1 py-1 font-fell text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                <option value="">Link an item…</option>
                <option v-for="item in availableItems" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select>
              <button
                type="button"
                :disabled="!selectedItemId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addItemRef"
              >
                <Plus class="h-4 w-4" />
              </button>
            </div>
            <p v-else-if="isNew" class="font-fell text-xs text-muted-foreground italic px-2 py-1">
              Save the quest first, then link items.
            </p>
            <p v-else-if="!availableItems.length && !rewardItems.length" class="font-fell text-xs text-muted-foreground italic px-2 py-1">
              No items in the vault yet.
            </p>
          </div>
        </div>

        <!-- Rewards: linked encounters -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              Linked Encounters
              <span v-if="linkedEncounters.length" class="font-fell font-normal">({{ linkedEncounters.length }})</span>
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in linkedEncounters"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <Swords class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/encounters/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ encounterName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>
            <div v-if="!isNew && availableEncounters.length" class="flex items-center gap-2 pt-1">
              <select
                v-model="selectedEncounterId"
                class="flex-1 bg-transparent border-b border-border px-1 py-1 font-fell text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
              >
                <option value="">Link an encounter…</option>
                <option v-for="enc in availableEncounters" :key="enc.id" :value="enc.id">
                  {{ enc.name }}
                </option>
              </select>
              <button
                type="button"
                :disabled="!selectedEncounterId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addEncounterRef"
              >
                <Plus class="h-4 w-4" />
              </button>
            </div>
            <p v-else-if="isNew" class="font-fell text-xs text-muted-foreground italic px-2 py-1">
              Save the quest first, then link encounters.
            </p>
            <p v-else-if="!availableEncounters.length && !linkedEncounters.length" class="font-fell text-xs text-muted-foreground italic px-2 py-1">
              No encounters yet.
            </p>
          </div>
        </div>

        <!-- Sub-quests -->
        <div v-if="!isNew" class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              Sub-quests
              <span v-if="subQuests?.length" class="font-fell font-normal">({{ subQuests.length }})</span>
            </span>
            <RouterLink
              :to="`/quests/new?parent=${props.quest?.id}`"
              class="inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity"
            >
              <Plus class="h-3 w-3" />
              Add
            </RouterLink>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <p v-if="!subQuests?.length" class="font-fell text-xs text-muted-foreground italic px-2 py-2">
              No sub-quests yet.
            </p>
            <RouterLink
              v-for="sub in subQuests"
              :key="sub.id"
              :to="`/quests/${sub.id}`"
              class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors group"
            >
              <span
                class="h-2 w-2 rounded-full shrink-0"
                :style="{ backgroundColor: QUEST_STATUS_COLORS[sub.status] }"
              />
              <span class="font-fell text-sm text-foreground flex-1 truncate">{{ sub.title || "Untitled" }}</span>
              <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Save, Trash2, Plus, List, ListOrdered, Quote, Undo2, Redo2,
  Check, X, ChevronRight, Package, Swords,
} from "lucide-vue-next";
import {
  useCreateQuest,
  useUpdateQuest,
  useDeleteQuest,
  useSubQuests,
  useQuestObjectives,
  useCreateObjective,
  useUpdateObjective,
  useDeleteObjective,
  useQuestRefs,
  useCreateQuestRef,
  useDeleteQuestRef,
  useAllQuests,
} from "@/composables/useQuests";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useItems } from "@/composables/useItems";
import { useEncounters } from "@/composables/useEncounters";
import {
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
} from "@/types/quest.types";
import type { Quest, QuestStatus, QuestObjective, QuestRef } from "@/types/quest.types";

const props = defineProps<{
  quest: Quest | null;
  parentId?: string | null;
}>();

const router = useRouter();
const isNew = computed(() => !props.quest);

// ── External data ──────────────────────────────────────────────────────────────
const { data: npcs }      = useNpcs();
const { data: locations } = useAllLocations();
const { data: allQuests } = useAllQuests();
const { data: allItems }  = useItems();
const { data: allEncounters } = useEncounters();

const parentCandidates = computed(() =>
  (allQuests.value ?? []).filter((q) => q.id !== props.quest?.id),
);

const questId = computed(() => props.quest?.id ?? "");

const { data: subQuests }  = useSubQuests(questId);
const { data: objectives } = useQuestObjectives(questId);
const { data: questRefs }  = useQuestRefs(questId);

const doneCount = computed(() => (objectives.value ?? []).filter((o) => o.is_done).length);

// ── Refs derived lists ─────────────────────────────────────────────────────────
const rewardItems = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "item"),
);
const linkedEncounters = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "encounter"),
);

const linkedItemIds = computed(() => new Set(rewardItems.value.map((r) => r.ref_id)));
const linkedEncounterIds = computed(() => new Set(linkedEncounters.value.map((r) => r.ref_id)));

const availableItems = computed(() =>
  (allItems.value ?? []).filter((i) => !linkedItemIds.value.has(i.id)),
);
const availableEncounters = computed(() =>
  (allEncounters.value ?? []).filter((e) => !linkedEncounterIds.value.has(e.id)),
);

function itemName(id: string): string {
  return (allItems.value ?? []).find((i) => i.id === id)?.name ?? id;
}
function encounterName(id: string): string {
  return (allEncounters.value ?? []).find((e) => e.id === id)?.name ?? id;
}

// ── Form state ─────────────────────────────────────────────────────────────────
const title         = ref(props.quest?.title ?? "");
const summary       = ref(props.quest?.summary ?? "");
const status        = ref<QuestStatus>(props.quest?.status ?? "active");
const giverNpcId    = ref(props.quest?.giver_npc_id ?? "");
const locationId    = ref(props.quest?.location_id ?? "");
const parentQuestId = ref(props.quest?.parent_quest_id ?? props.parentId ?? "");
const rewards       = ref(props.quest?.rewards ?? "");
const tags          = ref<string[]>(props.quest?.tags ? [...props.quest.tags] : []);
const tagInput      = ref("");
const saving        = ref(false);
const saveError     = ref("");

const newObjective      = ref("");
const selectedItemId    = ref("");
const selectedEncounterId = ref("");

function addTag() {
  const val = tagInput.value.replace(/,\s*$/, "").trim();
  if (val && !tags.value.includes(val)) tags.value.push(val);
  tagInput.value = "";
}
function onTagKeydown(e: KeyboardEvent) {
  if (e.key === ",") { e.preventDefault(); addTag(); }
}
function removeTag(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag);
}

// ── Tiptap ─────────────────────────────────────────────────────────────────────
const editor = useEditor({
  content: props.quest?.notes ? JSON.parse(props.quest.notes) : undefined,
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: "DM notes, lore, and quest details…" }),
  ],
});

onUnmounted(() => editor.value?.destroy());

function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40",
    active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateQuest();
const { mutateAsync: update } = useUpdateQuest();
const { mutateAsync: del }    = useDeleteQuest();

function buildPayload() {
  return {
    title:           title.value.trim() || "Untitled Quest",
    summary:         summary.value.trim() || null,
    status:          status.value,
    giver_npc_id:    giverNpcId.value || null,
    location_id:     locationId.value || null,
    parent_quest_id: parentQuestId.value || null,
    rewards:         rewards.value.trim() || null,
    tags:            tags.value,
    notes:           JSON.stringify(editor.value?.getJSON() ?? {}),
    started_at:      props.quest?.started_at ?? null,
    resolved_at:     props.quest?.resolved_at ?? null,
  };
}

async function save() {
  if (!title.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.quest) {
      await update({ id: props.quest.id, update: buildPayload() });
    } else {
      const created = await create(buildPayload());
      router.push(`/quests/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.quest) return;
  if (!confirm(`Delete "${props.quest.title || "this quest"}"?`)) return;
  await del(props.quest.id);
  router.push("/quests");
}

// ── Objectives ─────────────────────────────────────────────────────────────────
const { mutateAsync: createObj } = useCreateObjective();
const { mutateAsync: updateObj } = useUpdateObjective();
const { mutateAsync: deleteObj } = useDeleteObjective();

async function addObjective() {
  if (!newObjective.value.trim() || !props.quest) return;
  await createObj({
    quest_id:    props.quest.id,
    description: newObjective.value.trim(),
    is_done:     false,
    sort_order:  objectives.value?.length ?? 0,
  });
  newObjective.value = "";
}

async function toggleObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await updateObj({ id: obj.id, questId: props.quest.id, update: { is_done: !obj.is_done } });
}

async function removeObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await deleteObj({ id: obj.id, questId: props.quest.id });
}

// ── Quest refs ─────────────────────────────────────────────────────────────────
const { mutateAsync: createRef } = useCreateQuestRef();
const { mutateAsync: deleteRef } = useDeleteQuestRef();

async function addItemRef() {
  if (!selectedItemId.value || !props.quest) return;
  await createRef({ quest_id: props.quest.id, ref_type: "item", ref_id: selectedItemId.value });
  selectedItemId.value = "";
}

async function addEncounterRef() {
  if (!selectedEncounterId.value || !props.quest) return;
  await createRef({ quest_id: props.quest.id, ref_type: "encounter", ref_id: selectedEncounterId.value });
  selectedEncounterId.value = "";
}

async function removeRef(ref: QuestRef) {
  if (!props.quest) return;
  await deleteRef({ id: ref.id, questId: props.quest.id });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.quest-editor :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none min-h-48;
}
.quest-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.quest-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.quest-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.quest-editor :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.quest-editor :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.quest-editor :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.quest-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
