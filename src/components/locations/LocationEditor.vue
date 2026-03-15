<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb -->
    <div v-if="parentLocation || isNew" class="flex items-center gap-1.5 text-xs font-fell text-muted-foreground">
      <RouterLink to="/locations" class="hover:text-foreground transition-colors">Locations</RouterLink>
      <template v-if="parentLocation">
        <span>/</span>
        <RouterLink :to="`/locations/${parentLocation.id}`" class="hover:text-foreground transition-colors">
          {{ parentLocation.name }}
        </RouterLink>
      </template>
      <span>/</span>
      <span class="text-foreground">{{ isNew ? "New Location" : props.location?.name }}</span>
    </div>

    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Location name</span>
        <input
          v-model="name"
          placeholder="Location name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Type -->
      <select
        v-model="locationType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="(label, value) in LOCATION_TYPE_LABELS" :key="value" :value="value">
          {{ label }}
        </option>
      </select>

      <!-- Save -->
      <button
        type="button"
        :disabled="saving || !name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>

      <!-- Delete -->
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

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Description editor (Tiptap) -->
    <div class="flex flex-col rounded-lg border border-border bg-card overflow-hidden" style="min-height: 320px">
      <div class="px-3 py-1.5 border-b border-border bg-muted/20 shrink-0">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      </div>

      <!-- Toolbar -->
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
        <EditorContent :editor="editor" class="location-editor h-full" />
      </div>
    </div>

    <!-- Children list (only on existing locations) -->
    <template v-if="!isNew">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Sub-locations
          <span v-if="children?.length" class="font-fell font-normal text-muted-foreground">({{ children.length }})</span>
        </h2>
        <RouterLink
          :to="`/locations/new?parent=${props.location?.id}`"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          <Plus class="h-3.5 w-3.5" />
          Add Sub-location
        </RouterLink>
      </div>

      <div v-if="childrenLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>

      <div v-else-if="!children?.length" class="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
        <MapPin class="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
        <p class="font-fell text-sm text-muted-foreground italic">No sub-locations yet.</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="child in children"
          :key="child.id"
          :to="`/locations/${child.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
        >
          <div
            class="h-8 w-8 shrink-0 rounded flex items-center justify-center text-white text-xs font-cinzel font-bold"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          >
            {{ child.location_type.slice(0, 2).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ child.name }}</p>
            <p class="font-fell text-xs text-muted-foreground italic truncate">{{ LOCATION_TYPE_LABELS[child.location_type] }}</p>
          </div>
          <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Save, Trash2, Plus, List, ListOrdered, Quote, Undo2, Redo2, MapPin, ChevronRight,
} from "lucide-vue-next";
import {
  useLocations,
  useLocation,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/composables/useLocations";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType } from "@/types/location.types";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
}>();

const router = useRouter();
const isNew = computed(() => !props.location);

// ── Fetch parent for breadcrumb ────────────────────────────────────────────────
const parentIdToLoad = props.location?.parent_id ?? props.parentId ?? null;
const { data: parentLocation } = parentIdToLoad
  ? useLocation(parentIdToLoad)
  : { data: ref(null) };

// ── Fetch children (only when editing existing) ────────────────────────────────
const { data: children, isLoading: childrenLoading } = props.location
  ? useLocations(props.location.id)
  : { data: ref([]), isLoading: ref(false) };

// ── Form state ─────────────────────────────────────────────────────────────────
const name         = ref(props.location?.name ?? "");
const locationType = ref<LocationType>(props.location?.location_type ?? "other");
const tags         = ref<string[]>(props.location?.tags ? [...props.location.tags] : []);
const tagInput     = ref("");
const saving       = ref(false);
const saveError    = ref("");

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
  content: props.location?.description ? JSON.parse(props.location.description) : undefined,
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: "Describe this location…" }),
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
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del }    = useDeleteLocation();

function buildPayload() {
  return {
    name:          name.value.trim() || "Unnamed Location",
    location_type: locationType.value,
    description:   JSON.stringify(editor.value?.getJSON() ?? {}),
    notes:         null,
    tags:          tags.value,
    parent_id:     props.location?.parent_id ?? props.parentId ?? null,
    image_url:     props.location?.image_url ?? null,
    campaign_id:   null as string | null,
  };
}

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.location) {
      await update({ id: props.location.id, update: buildPayload() });
      router.push(parentIdToLoad ? `/locations/${parentIdToLoad}` : "/locations");
    } else {
      const created = await create(buildPayload());
      router.push(`/locations/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.location) return;
  if (!confirm(`Delete "${props.location.name}"? Sub-locations will also be deleted.`)) return;
  const parentId = props.location.parent_id;
  await del(props.location.id);
  router.push(parentId ? `/locations/${parentId}` : "/locations");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.location-editor :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none min-h-48;
}
.location-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.location-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.location-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.location-editor :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.location-editor :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.location-editor :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.location-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
