<template>
  <PageHeader :title="isNew ? 'New Faction' : faction?.name || 'Loading…'">
    <template #actions>
      <button
        v-if="!isNew"
        type="button"
        class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity"
        @click="handleDelete"
      >
        Delete
      </button>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="handleSave"
      >
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="flex flex-col gap-6">
        <!-- Core fields -->
        <div class="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
          <!-- Left: emblem + meta -->
          <div class="flex flex-col gap-4">
            <!-- Emblem -->
            <div
              class="relative aspect-square rounded-lg border border-border overflow-hidden bg-muted cursor-pointer group"
              @click="fileInput?.click()"
            >
              <img
                v-if="form.emblem_url"
                :src="form.emblem_url"
                alt="Faction emblem"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
              >
                <Shield class="h-10 w-10" />
                <span class="font-fell text-sm italic">Upload emblem</span>
              </div>
              <div
                class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <span class="font-fell text-white text-sm italic">{{
                  form.emblem_url ? "Change" : "Upload"
                }}</span>
              </div>
              <div
                v-if="uploading"
                class="absolute inset-0 bg-black/60 flex items-center justify-center"
              >
                <LoadingSpinner />
              </div>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFileSelected"
            />
            <button
              v-if="form.emblem_url"
              type="button"
              class="font-cinzel text-[10px] text-destructive hover:underline text-left"
              @click.stop="form.emblem_url = ''"
            >
              Remove emblem
            </button>

            <!-- Type -->
            <div class="space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Type</label
              >
              <EntityCombobox
                v-model="factionTypeStr"
                :options="FACTION_TYPE_OPTIONS"
                placeholder="Select type…"
              />
            </div>

            <!-- Alignment -->
            <div class="space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Alignment</label
              >
              <EntityCombobox
                v-model="alignmentStr"
                :options="FACTION_ALIGNMENT_OPTIONS"
                placeholder="Select alignment…"
              />
            </div>

            <!-- Visibility -->
            <div class="space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Visible to Players</label
              >
              <PlayerVisibilityToggle
                :visible-to="form.player_visible_to"
                @update:visible-to="form.player_visible_to = $event"
              />
            </div>

            <!-- Tags -->
            <div class="space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Tags</label
              >
              <TagInput v-model="tags" />
            </div>
          </div>

          <!-- Right: name + description -->
          <div class="flex flex-col gap-4">
            <div class="space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Name</label
              >
              <input
                v-model="form.name"
                placeholder="Faction name…"
                required
                class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="flex-1 space-y-1.5">
              <label
                class="font-cinzel text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
                >Description & Notes</label
              >
              <RichTextEditor
                v-model="form.description"
                placeholder="History, motives, known activities…"
                min-height="320px"
              />
            </div>
          </div>
        </div>

        <!-- Sub-sections (only on existing factions) -->
        <template v-if="!isNew">
          <div
            class="border-t border-border pt-6 grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <FactionMembersSection :faction-id="id" />
            <FactionPartyMembersSection :faction-id="id" />
          </div>
          <div class="border-t border-border pt-6">
            <FactionRelationsSection :faction-id="id" />
          </div>
          <div
            class="border-t border-border pt-6 grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            <FactionLocationsSection :faction-id="id" />
            <FactionItemsSection :faction-id="id" />
          </div>
          <div class="border-t border-border pt-6">
            <EntityNotesPanel entity-type="faction" :entity-id="id" />
          </div>
        </template>
      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Shield } from "lucide-vue-next";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useConfirm } from "@/composables/useConfirm";
import {
  useFaction,
  useCreateFaction,
  useUpdateFaction,
  useDeleteFaction,
} from "@/composables/useFactions";
import { FACTION_TYPES, FACTION_ALIGNMENTS } from "@/types/faction.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import FactionMembersSection from "@/components/factions/FactionMembersSection.vue";
import FactionPartyMembersSection from "@/components/factions/FactionPartyMembersSection.vue";
import FactionLocationsSection from "@/components/factions/FactionLocationsSection.vue";
import FactionItemsSection from "@/components/factions/FactionItemsSection.vue";
import FactionRelationsSection from "@/components/factions/FactionRelationsSection.vue";
import EntityNotesPanel from "@/components/common/EntityNotesPanel.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();

const isNew = computed(() => route.name === "faction-new");
const id = computed(() => (isNew.value ? "" : (route.params.id as string)));

// Combobox option lists
const FACTION_TYPE_OPTIONS = FACTION_TYPES.map((t) => ({ id: t, name: t }));
const FACTION_ALIGNMENT_OPTIONS = FACTION_ALIGNMENTS.map((a) => ({
  id: a,
  name: a,
}));

// EntityCombobox uses string id; we map to/from form fields
const factionTypeStr = computed({
  get: () => form.value.faction_type ?? "",
  set: (v) => {
    form.value.faction_type = v || null;
  },
});
const alignmentStr = computed({
  get: () => form.value.alignment ?? "",
  set: (v) => {
    form.value.alignment = v || null;
  },
});

const { data: faction, isLoading: factionLoading } = useFaction(id.value);
const loading = computed(() => !isNew.value && factionLoading.value);

const createFaction = useCreateFaction();
const updateFaction = useUpdateFaction();
const deleteFaction = useDeleteFaction();
const saving = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const tags = ref<string[]>([]);

const form = ref({
  name: "",
  faction_type: null as string | null,
  description: null as string | null,
  emblem_url: "" as string,
  alignment: null as string | null,
  player_visible_to: [] as string[],
});

watch(
  faction,
  (f) => {
    if (!f) return;
    form.value.name = f.name;
    form.value.faction_type = f.faction_type;
    form.value.description = f.description;
    form.value.emblem_url = f.emblem_url ?? "";
    form.value.alignment = f.alignment;
    form.value.player_visible_to = f.player_visible_to ?? [];
    tags.value = [...f.tags];
  },
  { immediate: true },
);

async function handleSave() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = {
      name: form.value.name.trim(),
      faction_type: form.value.faction_type,
      description: form.value.description,
      emblem_url: form.value.emblem_url || null,
      alignment: form.value.alignment,
      player_visible_to: form.value.player_visible_to,
      tags: tags.value,
    };
    if (isNew.value) {
      await createFaction.mutateAsync(payload);
    } else {
      await updateFaction.mutateAsync({ id: id.value, update: payload });
    }
    router.push("/factions");
  } finally {
    saving.value = false;
  }
}

async function handleDelete() {
  if (
    !(await confirm(`Delete "${faction.value?.name}"? This cannot be undone.`))
  )
    return;
  await deleteFaction.mutateAsync(id.value);
  router.push("/factions");
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  (e.target as HTMLInputElement).value = "";
  uploading.value = true;
  try {
    const user = getCurrentUser();
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user!.id}/faction-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("asset-images")
      .upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
    form.value.emblem_url = data.publicUrl;
  } finally {
    uploading.value = false;
  }
}
</script>
