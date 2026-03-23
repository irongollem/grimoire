<template>
  <div class="space-y-4 max-w-2xl mx-auto">
    <!-- Back -->
    <RouterLink
      to="/traps"
      class="inline-flex items-center gap-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors tracking-wider"
    >
      <ChevronLeft class="h-3.5 w-3.5" />
      Traproom
    </RouterLink>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <input
          v-model="form.name"
          class="flex-1 bg-transparent border-b border-border font-cinzel text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary pb-1"
          placeholder="Trap name…"
        />
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="isEdit"
            type="button"
            class="font-cinzel text-xs text-destructive hover:opacity-80 tracking-wider transition-opacity"
            @click="deleteTrap"
          >
            Delete
          </button>
          <button
            type="button"
            :disabled="saving || !form.name.trim()"
            class="font-cinzel text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
            @click="save"
          >
            {{ saving ? "Saving…" : isEdit ? "Save" : "Create" }}
          </button>
        </div>
      </div>

      <!-- Image + Identity -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</span>
        </div>
        <div class="p-4 flex gap-4">
          <!-- Image -->
          <div class="shrink-0">
            <div
              class="w-28 h-28 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer hover:border-primary/50 transition-colors relative group"
              @click="triggerImageUpload"
            >
              <FocalImage
                v-if="form.image_url"
                :src="form.image_url"
                :alt="form.name"
                format="portrait"
                :focal-point="form.image_focal_point"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
                <CrosshairIcon class="h-8 w-8" />
              </div>
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ImageIcon class="h-5 w-5 text-white" />
              </div>
            </div>
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onImageFile" />
            <button
              v-if="form.image_url"
              type="button"
              class="mt-1 w-28 font-cinzel text-[10px] text-muted-foreground/50 hover:text-destructive tracking-wider transition-colors text-center"
              @click="form.image_url = null; form.image_focal_point = null"
            >
              Remove
            </button>
          </div>

          <!-- Fields -->
          <div class="flex-1 grid grid-cols-2 gap-3">
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Type</label>
              <select v-model="form.trap_type" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option v-for="t in TRAP_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">CR</label>
              <div class="flex items-center gap-2">
                <select v-model="form.cr" class="flex-1 bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  <option :value="null">—</option>
                  <option v-for="cr in CR_LIST" :key="cr" :value="cr">{{ cr }}</option>
                </select>
                <span v-if="crXp" class="font-cinzel text-[10px] text-muted-foreground tracking-wider whitespace-nowrap">
                  {{ crXp }} XP
                </span>
              </div>
            </div>
            <div class="col-span-2">
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Tags</label>
              <TagInput v-model="form.tags" />
            </div>
          </div>
        </div>
      </div>

      <!-- Mechanics -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Mechanics</span>
        </div>
        <div class="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Trigger</label>
            <select v-model="form.trigger_type" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option :value="null">—</option>
              <option v-for="t in TRAP_TRIGGERS" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div>
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Detection DC</label>
            <input v-model.number="form.detection_dc" type="number" min="1" max="30" placeholder="15" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Disarm DC</label>
            <input v-model.number="form.disarm_dc" type="number" min="1" max="30" placeholder="15" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Reset</label>
            <select v-model="form.reset_type" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option v-for="r in TRAP_RESET_TYPES" :key="r" :value="r">{{ r }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Effect -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Effect</span>
        </div>
        <div class="p-4 space-y-3">
          <div>
            <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Effect Description</label>
            <input
              v-model="form.effect_description"
              placeholder="The trap fires a poisoned dart at the nearest creature…"
              class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <!-- Attack bonus -->
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Attack Bonus</label>
              <input
                v-model.number="form.attack_bonus"
                type="number"
                placeholder="+5"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <!-- Save type + DC -->
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Save Type</label>
              <select v-model="form.save_type" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option :value="null">—</option>
                <option v-for="s in TRAP_SAVE_TYPES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Save DC</label>
              <input
                v-model.number="form.save_dc"
                type="number"
                min="1"
                max="30"
                placeholder="15"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <!-- Damage -->
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Damage Dice</label>
              <DiceExprInput v-model="form.damage_dice" placeholder="2d10+3" />
            </div>
            <div>
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Damage Type</label>
              <select v-model="form.damage_type" class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize">
                <option :value="null">—</option>
                <option v-for="d in DAMAGE_TYPES" :key="d" :value="d" class="capitalize">{{ d }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.description" placeholder="Flavor text, lore, appearance…" min-height="120px" />
        </div>
      </div>

      <!-- DM Notes -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">DM Notes</span>
        </div>
        <div class="p-3">
          <RichTextEditor v-model="form.notes" placeholder="Private notes, encounter ideas, variants…" min-height="100px" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { ChevronLeft, Crosshair as CrosshairIcon, Image as ImageIcon } from "lucide-vue-next";
import {
  useTrap, useCreateTrap, useUpdateTrap, useDeleteTrap,
} from "@/composables/useTraps";
import { useImageUpload } from "@/composables/useImageUpload";
import { useConfirm } from "@/composables/useConfirm";
import {
  TRAP_TYPES, TRAP_TRIGGERS, TRAP_RESET_TYPES, TRAP_SAVE_TYPES, CR_LIST,
} from "@/types/trap.types";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { CR_XP } from "@/types/encounter.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import TagInput from "@/components/common/TagInput.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";

const route  = useRoute();
const router = useRouter();

const isNew  = computed(() => route.name === "trap-new");
const isEdit = computed(() => !isNew.value);
const id     = computed(() => route.params.id as string);

const { data: trap, isLoading } = useTrap(id);
const createMut  = useCreateTrap();
const updateMut  = useUpdateTrap();
const deleteMut  = useDeleteTrap();
const { confirm } = useConfirm();

const saving = ref(false);

const blankForm = () => ({
  name:               "",
  trap_type:          "Mechanical" as const,
  cr:                 null as string | null,
  trigger_type:       null as string | null,
  detection_dc:       null as number | null,
  disarm_dc:          null as number | null,
  effect_description: null as string | null,
  attack_bonus:       null as number | null,
  save_type:          null as string | null,
  save_dc:            null as number | null,
  damage_dice:        null as string | null,
  damage_type:        null as string | null,
  reset_type:         "None" as const,
  image_url:          null as string | null,
  image_focal_point:  null as { x: number; y: number } | null,
  tags:               [] as string[],
  description:        null as string | null,
  notes:              null as string | null,
});

const form = ref(blankForm());

watch(trap, (t) => {
  if (t) Object.assign(form.value, {
    name: t.name,
    trap_type: t.trap_type,
    cr: t.cr,
    trigger_type: t.trigger_type,
    detection_dc: t.detection_dc,
    disarm_dc: t.disarm_dc,
    effect_description: t.effect_description,
    attack_bonus: t.attack_bonus,
    save_type: t.save_type,
    save_dc: t.save_dc,
    damage_dice: t.damage_dice,
    damage_type: t.damage_type,
    reset_type: t.reset_type,
    image_url: t.image_url,
    image_focal_point: t.image_focal_point,
    tags: [...(t.tags ?? [])],
    description: t.description ? (typeof t.description === "string" ? t.description : JSON.stringify(t.description)) : null,
    notes: t.notes ? (typeof t.notes === "string" ? t.notes : JSON.stringify(t.notes)) : null,
  });
}, { immediate: true });

const crXp = computed(() => form.value.cr ? CR_XP[form.value.cr] : null);

// Image upload
const fileInput = ref<HTMLInputElement | null>(null);
const { upload } = useImageUpload("trap-images");

function triggerImageUpload() { fileInput.value?.click(); }

async function onImageFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const url = await upload(file);
  if (url) form.value.image_url = url;
  if (fileInput.value) fileInput.value.value = "";
}

async function save() {
  if (!form.value.name.trim()) return;
  saving.value = true;
  try {
    const payload = { ...form.value } as Parameters<typeof createMut.mutateAsync>[0];
    if (isNew.value) {
      await createMut.mutateAsync(payload);
    } else {
      await updateMut.mutateAsync({ id: id.value, update: payload });
    }
    router.push("/traps");
  } finally {
    saving.value = false;
  }
}

async function deleteTrap() {
  const ok = await confirm(`Delete "${form.value.name}"? This cannot be undone.`, {
    title: "Delete Trap",
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  await deleteMut.mutateAsync(id.value);
  router.push("/traps");
}
</script>
