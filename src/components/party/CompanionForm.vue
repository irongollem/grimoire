<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" @click.self="$emit('cancel')">
    <div class="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-base font-bold text-foreground tracking-wide">
          {{ isEdit ? "Edit Companion" : "Add Companion" }}
        </h2>
        <button type="button" class="text-muted-foreground hover:text-foreground transition-colors" @click="$emit('cancel')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Source type tabs -->
      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="src in SOURCE_TABS"
          :key="src.value"
          class="flex-1 px-2.5 py-1.5 transition-colors"
          :class="sourceType === src.value
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="sourceType = src.value"
        >
          {{ src.label }}
        </button>
      </div>

      <!-- Monster source picker -->
      <div v-if="sourceType === 'monster'" class="flex flex-col gap-1.5">
        <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Monster</label>
        <select
          v-model="selectedMonsterId"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onMonsterSelected"
        >
          <option value="">— Select monster —</option>
          <option v-for="m in monsters" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </div>

      <!-- NPC source picker -->
      <div v-if="sourceType === 'npc'" class="flex flex-col gap-1.5">
        <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">NPC</label>
        <select
          v-model="selectedNpcId"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="onNpcSelected"
        >
          <option value="">— Select NPC —</option>
          <option v-for="n in npcs" :key="n.id" :value="n.id">{{ n.name }}</option>
        </select>
      </div>

      <!-- Portrait upload -->
      <div class="flex gap-4 items-start">
        <!-- Thumbnail click-to-upload -->
        <div
          class="relative w-24 h-24 rounded-full overflow-hidden border border-border bg-muted shrink-0 cursor-pointer group"
          @click="fileInput?.click()"
        >
          <FocalImage
            v-if="portraitUrl"
            :src="portraitUrl"
            format="token"
            :focal-point="focalPoint"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImagePlus class="h-6 w-6" />
          </div>
          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
            <span class="font-fell text-white text-xs italic">{{ portraitUrl ? 'Change' : 'Upload' }}</span>
          </div>
          <div v-if="isUploading" class="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
            <LoadingSpinner class="h-5 w-5" />
          </div>
        </div>

        <!-- Focal point picker — only when portrait exists -->
        <div class="flex-1 min-w-0">
          <FocalPointPicker
            v-if="portraitUrl"
            :src="portraitUrl"
            :model-value="focalPoint"
            @update:model-value="focalPoint = $event"
          />
          <p v-else class="font-fell text-xs text-muted-foreground italic mt-1">
            Upload a portrait or select a source above to auto-fill artwork.
          </p>
        </div>
      </div>
      <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />

      <!-- Stats form -->
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2 flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Name</label>
          <input
            v-model="name"
            placeholder="Companion name…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Type</label>
          <select
            v-model="companionType"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option v-for="t in COMPANION_TYPES" :key="t" :value="t">{{ COMPANION_TYPE_LABELS[t] }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Owner (optional)</label>
          <select
            v-model="ownerMemberId"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">— Party —</option>
            <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Max HP</label>
          <input v-model.number="maxHp" type="number" min="1" class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Current HP</label>
          <input v-model.number="currentHp" type="number" min="0" class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">AC</label>
          <input v-model.number="ac" type="number" min="0" class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Speed (ft)</label>
          <input v-model.number="speed" type="number" min="0" class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>

      <!-- Error -->
      <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          class="px-4 py-2 rounded-md border border-border font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          @click="$emit('cancel')"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!name.trim() || saving"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="save"
        >
          {{ saving ? "Saving…" : isEdit ? "Save" : "Add Companion" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { X, ImagePlus } from "lucide-vue-next";
import { useCreateCompanion, useUpdateCompanion } from "@/composables/useCompanions";
import { useAllMonsters } from "@/composables/useMonsters";
import { useNpcs } from "@/composables/useNpcs";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  COMPANION_TYPES,
  COMPANION_TYPE_LABELS,
} from "@/types/companion.types";
import type { Companion, CompanionType, CompanionSourceType } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";
import FocalImage from "@/components/common/FocalImage.vue";
import FocalPointPicker from "@/components/common/FocalPointPicker.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const SOURCE_TABS: Array<{ value: CompanionSourceType; label: string }> = [
  { value: "monster", label: "From Monster" },
  { value: "npc",     label: "From NPC" },
  { value: "custom",  label: "Custom" },
];

const props = defineProps<{
  companion?: Companion;
  partyMembers: PartyMember[];
}>();

const emit = defineEmits<{
  saved: [];
  cancel: [];
}>();

const isEdit = !!props.companion;

const { data: monsters } = useAllMonsters();
const { data: npcs }     = useNpcs();

const { mutateAsync: create } = useCreateCompanion();
const { mutateAsync: update } = useUpdateCompanion();
const { isUploading, upload } = useImageUpload("asset-images");

// Form state
const sourceType        = ref<CompanionSourceType>(props.companion?.source_type ?? "custom");
const selectedMonsterId = ref(props.companion?.source_monster_id ?? "");
const selectedNpcId     = ref(props.companion?.source_npc_id ?? "");
const name              = ref(props.companion?.name ?? "");
const companionType     = ref<CompanionType>(props.companion?.companion_type ?? "ally");
const ownerMemberId     = ref(props.companion?.owner_party_member_id ?? "");
const maxHp             = ref(props.companion?.max_hp ?? 1);
const currentHp         = ref(props.companion?.current_hp ?? 1);
const ac                = ref(props.companion?.ac ?? 10);
const speed             = ref(props.companion?.speed ?? 30);
const portraitUrl       = ref<string | null>(props.companion?.portrait_url ?? null);
const focalPoint        = ref<{ x: number; y: number } | null>(props.companion?.portrait_focal_point ?? null);
const saving            = ref(false);
const saveError         = ref("");
const fileInput         = ref<HTMLInputElement | null>(null);

function parseHpNum(hpStr: string): number {
  return parseInt(hpStr, 10) || 1;
}
function parseSpeedNum(speedStr: string): number {
  return parseInt(speedStr, 10) || 30;
}

function onMonsterSelected() {
  const m = (monsters.value ?? []).find((x) => x.id === selectedMonsterId.value);
  if (!m) return;
  name.value      = m.name;
  maxHp.value     = parseHpNum(m.stat_block.hit_points);
  currentHp.value = maxHp.value;
  ac.value        = m.stat_block.armor_class;
  speed.value     = parseSpeedNum(m.stat_block.speed);
  // Auto-fill portrait from monster image if none set yet
  if (!portraitUrl.value && m.image_url) portraitUrl.value = m.image_url;
}

function onNpcSelected() {
  const n = (npcs.value ?? []).find((x) => x.id === selectedNpcId.value);
  if (!n) return;
  name.value = n.name;
  if (n.stat_block) {
    maxHp.value     = parseHpNum(n.stat_block.hit_points);
    currentHp.value = maxHp.value;
    ac.value        = n.stat_block.armor_class;
    speed.value     = parseSpeedNum(n.stat_block.speed);
  }
  // Auto-fill portrait from NPC portrait and copy focal point
  if (!portraitUrl.value && n.portrait_url) {
    portraitUrl.value = n.portrait_url;
    focalPoint.value  = n.portrait_focal_point ?? null;
  }
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = await upload(file);
  if (url) {
    portraitUrl.value = url;
    focalPoint.value  = null; // clear focal point for new upload
  }
  if (fileInput.value) fileInput.value.value = "";
}

async function save() {
  if (!name.value.trim()) return;
  saving.value    = true;
  saveError.value = "";
  try {
    const payload = {
      name:                  name.value.trim(),
      companion_type:        companionType.value,
      source_type:           sourceType.value,
      source_monster_id:     sourceType.value === "monster" ? selectedMonsterId.value || null : null,
      source_npc_id:         sourceType.value === "npc" ? selectedNpcId.value || null : null,
      owner_party_member_id: ownerMemberId.value || null,
      max_hp:                maxHp.value,
      current_hp:            currentHp.value,
      ac:                    ac.value,
      speed:                 speed.value,
      conditions:            props.companion?.conditions ?? [],
      notes:                 props.companion?.notes ?? null,
      sort_order:            props.companion?.sort_order ?? 0,
      portrait_url:          portraitUrl.value,
      portrait_focal_point:  focalPoint.value,
    };

    if (isEdit && props.companion) {
      await update({ id: props.companion.id, update: payload });
    } else {
      await create(payload);
    }
    emit("saved");
  } catch (e: unknown) {
    const msg = e instanceof Error
      ? e.message
      : (e as { message?: string })?.message ?? JSON.stringify(e);
    saveError.value = msg || "Failed to save companion";
  } finally {
    saving.value = false;
  }
}
</script>
