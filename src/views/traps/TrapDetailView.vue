<template>
  <PageHeader :title="isNew ? 'New Trap' : (form.name || 'Loading…')">
    <template #actions>
      <button
        v-if="isEdit"
        type="button"
        class="font-fell text-sm text-destructive hover:opacity-70 transition-opacity"
        @click="deleteTrap"
      >Delete</button>
      <button
        type="button"
        :disabled="saving || !form.name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <div class="flex flex-col gap-4 max-w-2xl">
      <!-- Image + Identity -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Identity</span>
        </div>
        <div class="p-4 flex gap-4">
          <!-- Image -->
          <div class="shrink-0 w-28">
            <ImageUpload
              :model-value="form.image_url"
              :focal-point="form.image_focal_point"
              aspect="square"
              show-focal-point
              bucket="trap-images"
              @update:model-value="form.image_url = $event"
              @update:focal-point="form.image_focal_point = $event"
            />
          </div>

          <!-- Fields -->
          <div class="flex-1 grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="block font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-1">Name</label>
              <input
                v-model="form.name"
                placeholder="Trap name…"
                class="w-full bg-background border border-border rounded-md px-3 py-1.5 font-cinzel text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
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
      </div>
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import {
  useTrap, useCreateTrap, useUpdateTrap, useDeleteTrap,
} from "@/composables/useTraps";
import { useConfirm } from "@/composables/useConfirm";
import {
  TRAP_TYPES, TRAP_TRIGGERS, TRAP_RESET_TYPES, TRAP_SAVE_TYPES, CR_LIST,
} from "@/types/trap.types";
import { DAMAGE_TYPES } from "@/types/damage.types";
import { CR_XP } from "@/types/encounter.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
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
