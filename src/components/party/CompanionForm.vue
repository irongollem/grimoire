<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" @click.self="$emit('cancel')">
    <div class="w-full max-w-lg rounded-xl border border-border bg-card shadow-xl flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h2 class="font-cinzel text-base font-bold text-foreground tracking-wide">
          {{ isEdit ? "Edit Companion" : "Add Companion" }}
        </h2>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" tooltip="Close" aria-label="Close" @click="$emit('cancel')" />
      </div>

      <!-- Source type tabs -->
      <SegmentedControl v-model="sourceType" :options="SOURCE_TABS" size="sm" block />

      <!-- Monster source picker -->
      <div v-if="sourceType === 'monster'" class="flex flex-col gap-1.5">
        <label class="text-label-lg font-semibold text-muted-foreground">Monster</label>
        <EntityCombobox
          :model-value="selectedMonsterId"
          :options="monsterOptions"
          placeholder="Search monsters…"
          @update:model-value="selectedMonsterId = $event; onMonsterSelected()"
        />
      </div>

      <!-- NPC source picker -->
      <div v-if="sourceType === 'npc'" class="flex flex-col gap-1.5">
        <label class="text-label-lg font-semibold text-muted-foreground">NPC</label>
        <EntityCombobox
          :model-value="selectedNpcId"
          :options="npcOptions"
          placeholder="Search NPCs…"
          @update:model-value="selectedNpcId = $event; onNpcSelected()"
        />
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
            <IconAddImage class="h-6 w-6" />
          </div>
          <div class="absolute inset-0 bg-black/50 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
            <span class="text-caption text-white italic">{{ portraitUrl ? 'Change' : 'Upload' }}</span>
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
          <p v-else class="text-caption text-muted-foreground italic mt-1">
            Upload a portrait or select a source above to auto-fill artwork.
          </p>
        </div>
      </div>
      <input ref="fileInput" type="file" accept="image/*" class="sr-only" @change="onFileSelected" />

      <!-- Stats form -->
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2 flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Name</label>
          <AppInput
            v-model="name"
            tone="card"
            size="body"
            placeholder="Companion name…"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Type</label>
          <AppSelect v-model="companionType" size="body">
            <option v-for="t in COMPANION_TYPES" :key="t" :value="t">{{ COMPANION_TYPE_LABELS[t] }}</option>
          </AppSelect>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">
            Owner{{ isOwnerLocked ? '' : ' (optional)' }}
          </label>
          <AppSelect
            v-if="!isOwnerLocked"
            v-model="ownerMemberId"
            size="body"
          >
            <option value="">— Party —</option>
            <option v-for="m in partyMembers" :key="m.id" :value="m.id">{{ m.name }}</option>
          </AppSelect>
          <p
            v-else
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground"
          >{{ lockedOwnerName }}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Max HP</label>
          <AppInput v-model.number="maxHp" type="number" min="1" tone="card" size="body" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Current HP</label>
          <AppInput v-model.number="currentHp" type="number" min="0" tone="card" size="body" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">AC</label>
          <AppInput v-model.number="ac" type="number" min="0" tone="card" size="body" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Speed (ft)</label>
          <AppInput v-model.number="speed" type="number" min="0" tone="card" size="body" />
        </div>

        <div class="col-span-2 flex flex-col gap-1.5">
          <label class="text-label-lg font-semibold text-muted-foreground">Status</label>
          <SegmentedControl v-model="statusValue" :options="STATUS_OPTIONS" size="sm" />
        </div>
      </div>

      <!-- Stat block toggle -->
      <div class="border-t border-border pt-3">
        <AppCheckbox v-model="hasStatBlock" label-role="label-lg" label="INCLUDE STAT BLOCK" />
      </div>

      <template v-if="hasStatBlock">
        <!-- Load from bestiary -->
        <div class="flex flex-col gap-1">
          <label class="text-label-lg font-semibold text-muted-foreground">Load from bestiary</label>
          <EntityCombobox
            model-value=""
            :options="pickableMonsters ?? []"
            placeholder="Search monsters…"
            @update:model-value="onLoadFromBestiary($event)"
          />
        </div>

        <!-- Core combat stats -->
        <div class="grid grid-cols-3 gap-2">
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">CR</label>
            <input v-model="sb.challenge_rating" placeholder="1/4" class="sb-input" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">HP</label>
            <DiceExprInput
              :model-value="extractDice(sb.hit_points) || null"
              placeholder="2d8+2"
              @update:model-value="sb.hit_points = $event ?? ''"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">Speed</label>
            <input v-model="sb.speed" placeholder="30 ft." class="sb-input" />
          </div>
        </div>

        <!-- Ability scores -->
        <div>
          <p class="text-eyebrow font-semibold text-muted-foreground mb-1.5">ABILITY SCORES</p>
          <div class="grid grid-cols-6 gap-1">
            <div v-for="ab in ABILITIES" :key="ab.key" class="text-center">
              <p class="text-label font-bold text-muted-foreground mb-0.5">{{ ab.label }}</p>
              <input
                v-model.number="(sb as Record<string, unknown>)[ab.key]"
                type="number" min="1" max="30"
                class="sb-input text-center px-0.5 text-xs"
              />
              <p class="text-caption-sm text-muted-foreground mt-0.5">{{ modifier((sb as Record<string, unknown>)[ab.key] as number) }}</p>
            </div>
          </div>
        </div>

        <!-- Extras -->
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">Skills</label>
            <input v-model="sb.skills" placeholder="Perception +3" class="sb-input" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">Senses</label>
            <input v-model="sb.senses" placeholder="Darkvision 60 ft." class="sb-input" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">Languages</label>
            <input v-model="sb.languages" placeholder="Common" class="sb-input" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-label-lg font-semibold text-muted-foreground">Damage Resistances</label>
            <input v-model="sb.damage_resistances" class="sb-input" />
          </div>
        </div>

        <!-- Special abilities -->
        <TraitSection v-model="sb.special_abilities" label="Special Abilities" />
        <TraitSection v-model="sb.actions" label="Actions" />
        <TraitSection v-model="sb.reactions" label="Reactions" />
      </template>

      <!-- Error -->
      <p v-if="saveError" class="text-destructive text-body">{{ saveError }}</p>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <AppButton variant="subtle" size="lg" label="Cancel" @click="$emit('cancel')" />
        <AppButton
          variant="primary"
          size="md"
          :disabled="!name.trim() || saving"
          @click="save"
        >
          {{ saving ? "Saving…" : isEdit ? "Save" : "Add Companion" }}
        </AppButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { IconAddImage, IconClose } from '@/lib/icons';
import { useCreateCompanion, useUpdateCompanion } from "@/composables/encounters/useCompanions";
import { useAllMonsters } from "@/composables/monsters/useMonsters";
import { useNpcs, useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { useImageUpload } from "@/composables/useImageUpload";
import { hitPointsToMax } from "@/lib/dice/dice";
import {
  COMPANION_TYPES,
  COMPANION_TYPE_LABELS,
} from "@/types/companion.types";
import type { Companion, CompanionType, CompanionSourceType } from "@/types/companion.types";
import type { Monster, MonsterStatBlock } from "@/types/monster.types";
import type { StatBlock } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import FocalImage from "@/components/common/FocalImage.vue";
import FocalPointPicker from "@/components/common/FocalPointPicker.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TraitSection from "@/components/npcs/TraitSection.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import DiceExprInput from "@/components/common/DiceExprInput.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { STAT_BLOCK_ABILITIES, abilityModifier, skillsToString, skillsToRecord } from "@/lib/utils";

function extractDice(val: string): string {
  const m = val.match(/\(([^)]+)\)/);
  return m ? m[1].trim() : val;
}

const ABILITIES = STAT_BLOCK_ABILITIES;
const modifier = abilityModifier;

const SOURCE_TABS: Array<{ value: CompanionSourceType; label: string }> = [
  { value: "monster", label: "From Monster" },
  { value: "npc",     label: "From NPC" },
  { value: "custom",  label: "Custom" },
];

const STATUS_OPTIONS = [
  { value: "party",     label: "With the party" },
  { value: "elsewhere", label: "Elsewhere" },
] as const;

const props = defineProps<{
  companion?: Companion;
  partyMembers: PartyMember[];
  /** When set, the companion's owner is fixed (player editing their own roster) — the
   * owner select is replaced with a read-only display. */
  lockedOwnerId?: string | null;
}>();

const emit = defineEmits<{
  saved: [];
  cancel: [];
}>();

const isEdit = !!props.companion;

// Picker vs. resolver, the #597 split. `pickableMonsters` is scoped to general +
// the active campaign — what belongs in this campaign to attach next.
// `allMonsters` is unscoped, because `companions.source_monster_id` is an
// already-stored reference that outlives any later re-scoping: resolving it
// against the scoped list blanks the field for a companion whose source monster
// now lives in another campaign.
const { data: pickableMonsters } = useAllMonsters();
const { data: allMonsters }      = useAllMonsters(() => ({ includeAllScopes: true }));

// NPC source — role-gated. DMs browse the raw `npcs` table (full stat blocks,
// true identities); players get the player-visible projection only, so a
// disguised NPC's real name/stat block never reaches the client (#569).
// DM-preview counts as player (WYSIWYG); captured at setup — the role can't
// change while the form is open.
const auth = useAuthStore();
const viewerIsDm = !useUiStore().dmPreviewMode && auth.isDM;
const dmNpcsQuery     = viewerIsDm ? useNpcs() : null;
const sharedNpcsQuery = viewerIsDm ? null : useSharedNpcs();

interface NpcOption { id: string; name: string; portrait_url: string | null; portrait_focal_point?: { x: number; y: number } | null; stat_block: StatBlock | null }

const npcOptions = computed<NpcOption[]>(() => {
  if (viewerIsDm) {
    return (dmNpcsQuery?.data.value ?? []).map((n) => ({
      id: n.id, name: n.name, portrait_url: n.portrait_url, portrait_focal_point: n.portrait_focal_point, stat_block: n.stat_block,
    }));
  }
  return (sharedNpcsQuery?.data.value ?? []).map((n) => ({
    id: n.id, name: getNpcDisplayName(n) ?? "???", portrait_url: n.portrait_url, portrait_focal_point: n.portrait_focal_point, stat_block: n.stat_block,
  }));
});

const isOwnerLocked = computed(() => !!props.lockedOwnerId);
const lockedOwnerName = computed(() =>
  props.partyMembers.find((m) => m.id === props.lockedOwnerId)?.name ?? "You"
);

const { mutateAsync: create } = useCreateCompanion();
const { mutateAsync: update } = useUpdateCompanion();
const { isUploading, upload } = useImageUpload("npc-portraits");

// Form state
const sourceType        = ref<CompanionSourceType>(props.companion?.source_type ?? "custom");
const selectedMonsterId = ref(props.companion?.source_monster_id ?? "");
const selectedNpcId     = ref(props.companion?.source_npc_id ?? "");

// The source combobox both picks and displays, so it offers the scoped list plus
// whatever this companion already points at — otherwise EntityCombobox has no
// option to render the stored id against and the field renders blank.
const monsterOptions = computed<Monster[]>(() => {
  const pickable = pickableMonsters.value ?? [];
  if (!selectedMonsterId.value || pickable.some((m) => m.id === selectedMonsterId.value)) return pickable;
  const stored = (allMonsters.value ?? []).find((m) => m.id === selectedMonsterId.value);
  return stored ? [stored, ...pickable] : pickable;
});
const name              = ref(props.companion?.name ?? "");
const companionType     = ref<CompanionType>(props.companion?.companion_type ?? "ally");
const ownerMemberId     = ref(props.lockedOwnerId ?? props.companion?.owner_party_member_id ?? "");
const combatReady       = ref(props.companion?.combat_ready ?? true);
// SegmentedControl needs a string|number model; combatReady is the boolean
// the payload actually stores, so this is the two-way bridge between them.
const statusValue = computed<"party" | "elsewhere">({
  get: () => combatReady.value ? "party" : "elsewhere",
  set: (v) => { combatReady.value = v === "party"; },
});
const maxHp             = ref(props.companion?.max_hp ?? 1);
const currentHp         = ref(props.companion?.current_hp ?? 1);
const ac                = ref(props.companion?.ac ?? 10);
const speed             = ref(props.companion?.speed ?? 30);
const portraitUrl       = ref<string | null>(props.companion?.portrait_url ?? null);
const focalPoint        = ref<{ x: number; y: number } | null>(props.companion?.portrait_focal_point ?? null);
const saving            = ref(false);
const saveError         = ref("");
const fileInput         = ref<HTMLInputElement | null>(null);

// Stat block
const hasStatBlock = ref(!!props.companion?.stat_block);
const sb = reactive({
  challenge_rating: props.companion?.stat_block?.challenge_rating ?? "0",
  hit_points:       props.companion?.stat_block?.hit_points ?? "4 (1d8)",
  speed:            props.companion?.stat_block?.speed ?? "30 ft.",
  str: props.companion?.stat_block?.str ?? 10,
  dex: props.companion?.stat_block?.dex ?? 10,
  con: props.companion?.stat_block?.con ?? 10,
  int: props.companion?.stat_block?.int ?? 10,
  wis: props.companion?.stat_block?.wis ?? 10,
  cha: props.companion?.stat_block?.cha ?? 10,
  skills:             skillsToString(props.companion?.stat_block?.skills),
  senses:             props.companion?.stat_block?.senses ?? "",
  languages:          props.companion?.stat_block?.languages ?? "",
  damage_resistances: props.companion?.stat_block?.damage_resistances ?? "",
  special_abilities:  props.companion?.stat_block?.special_abilities ? [...props.companion.stat_block.special_abilities] : [] as Array<{ name: string; description: string }>,
  actions:            props.companion?.stat_block?.actions ? [...props.companion.stat_block.actions] : [] as Array<{ name: string; description: string }>,
  reactions:          props.companion?.stat_block?.reactions ? [...props.companion.stat_block.reactions] : [] as Array<{ name: string; description: string }>,
});

function onLoadFromBestiary(monsterId: string) {
  if (!monsterId) return;
  const m = (allMonsters.value ?? []).find(x => x.id === monsterId);
  if (!m) return;
  applyStatBlockFromMonster(m.stat_block);
}

function applyStatBlockFromMonster(statBlock: MonsterStatBlock) {
  hasStatBlock.value = true;
  Object.assign(sb, {
    challenge_rating:   statBlock.challenge_rating,
    hit_points:         statBlock.hit_points,
    speed:              statBlock.speed,
    str: statBlock.str, dex: statBlock.dex, con: statBlock.con,
    int: statBlock.int, wis: statBlock.wis, cha: statBlock.cha,
    skills:             skillsToString(statBlock.skills),
    senses:             statBlock.senses ?? "",
    languages:          statBlock.languages ?? "",
    damage_resistances: statBlock.damage_resistances ?? "",
    special_abilities:  statBlock.special_abilities ? [...statBlock.special_abilities] : [],
    actions:            statBlock.actions ? [...statBlock.actions] : [],
    reactions:          statBlock.reactions ? [...statBlock.reactions] : [],
  });
}

function buildStatBlock(): MonsterStatBlock | null {
  if (!hasStatBlock.value) return null;
  const skillsRecord = skillsToRecord(sb.skills);
  return {
    armor_class:        ac.value,
    hit_points:         sb.hit_points,
    speed:              sb.speed,
    str: sb.str, dex: sb.dex, con: sb.con,
    int: sb.int, wis: sb.wis, cha: sb.cha,
    challenge_rating:   sb.challenge_rating,
    ...(Object.keys(skillsRecord).length ? { skills: skillsRecord } : {}),
    ...(sb.senses             ? { senses: sb.senses } : {}),
    ...(sb.languages          ? { languages: sb.languages } : {}),
    ...(sb.damage_resistances ? { damage_resistances: sb.damage_resistances } : {}),
    ...(sb.special_abilities?.length ? { special_abilities: sb.special_abilities } : {}),
    ...(sb.actions?.length    ? { actions: sb.actions } : {}),
    ...(sb.reactions?.length  ? { reactions: sb.reactions } : {}),
  };
}

function parseHpNum(hpStr: string): number {
  return hitPointsToMax(hpStr, 1);
}
function parseSpeedNum(speedStr: string): number {
  return parseInt(speedStr, 10) || 30;
}

function onMonsterSelected() {
  const m = (allMonsters.value ?? []).find((x) => x.id === selectedMonsterId.value);
  if (!m) return;
  name.value      = m.name;
  maxHp.value     = parseHpNum(m.stat_block.hit_points);
  currentHp.value = maxHp.value;
  ac.value        = m.stat_block.armor_class;
  speed.value     = parseSpeedNum(m.stat_block.speed);
  applyStatBlockFromMonster(m.stat_block);
  // Auto-fill portrait from monster image if none set yet
  if (!portraitUrl.value && m.image_url) portraitUrl.value = m.image_url;
}

function onNpcSelected() {
  const n = npcOptions.value.find((x) => x.id === selectedNpcId.value);
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
  try {
    const url = await upload(file);
    if (url) {
      portraitUrl.value = url;
      focalPoint.value  = null;
    }
  } finally {
    if (fileInput.value) fileInput.value.value = "";
  }
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
      combat_ready:          combatReady.value,
      max_hp:                maxHp.value,
      current_hp:            currentHp.value,
      ac:                    ac.value,
      speed:                 speed.value,
      conditions:            props.companion?.conditions ?? [],
      notes:                 props.companion?.notes ?? null,
      sort_order:            props.companion?.sort_order ?? 0,
      portrait_url:          portraitUrl.value,
      portrait_focal_point:  focalPoint.value,
      stat_block:            buildStatBlock(),
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

<style scoped>
@reference "@/assets/main.css";
.sb-input {
  @apply w-full bg-card border border-border rounded px-2 py-1 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
