<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex items-stretch">
      <!-- Portrait -->
      <div class="shrink-0 w-24 relative overflow-hidden bg-muted/50">
        <FocalImage
          v-if="member.portrait_url"
          :src="member.portrait_url"
          :alt="member.name"
          format="portrait"
          :focal-point="member.portrait_focal_point ?? null"
        />
        <span
          v-else
          class="absolute inset-0 flex items-center justify-center font-cinzel text-3xl font-bold text-muted-foreground"
        >{{ member.name.charAt(0) }}</span>
      </div>

      <!-- Right column -->
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- Name + controls row -->
        <div class="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
          <div class="min-w-0">
            <h1 class="font-cinzel text-lg font-bold text-foreground leading-tight truncate">{{ member.name }}</h1>
            <p class="font-fell text-xs text-muted-foreground italic">
              {{ [member.race, member.class, member.subclass].filter(Boolean).join(" · ") }}
              <span v-if="member.level" class="font-cinzel text-[10px] text-primary not-italic ml-1">Lv {{ member.level }}</span>
            </p>
          </div>
          <!-- HP controls + Inspiration -->
          <div class="shrink-0 flex flex-col items-end gap-1">
            <div class="flex items-center gap-1">
              <input
                v-model.number="hpInput"
                type="number"
                min="0"
                placeholder="0"
                class="w-10 h-6 rounded border border-border bg-muted/40 px-1 font-cinzel text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button class="h-6 px-1.5 rounded bg-destructive/15 border border-destructive/40 font-cinzel text-[9px] text-destructive hover:bg-destructive/25 transition-colors tracking-wider" @click="applyDamage">DMG</button>
              <button class="h-6 px-1.5 rounded bg-elven-green/10 border border-elven-green/40 font-cinzel text-[9px] text-elven-green hover:bg-elven-green/20 transition-colors tracking-wider" @click="applyHeal">Heal</button>
              <button class="h-6 px-1.5 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-[9px] text-blue-400 hover:bg-blue-500/20 transition-colors tracking-wider" @click="applyTempHp">Tmp</button>
              <button
                class="h-6 flex items-center gap-1 px-1.5 rounded border transition-colors"
                :class="member.inspiration ? 'bg-gold-500/20 border-gold-500/50 text-gold-500' : 'border-border text-muted-foreground hover:text-foreground'"
                @click="toggleInspiration"
              >
                <Star class="h-3 w-3" :class="member.inspiration ? 'fill-gold-500' : ''" />
                <span class="font-cinzel text-[9px] tracking-wider">Insp.</span>
              </button>
            </div>
          </div>
        </div>

        <!-- HP readout -->
        <div class="flex items-baseline gap-1.5 px-3">
          <span class="font-cinzel text-2xl font-bold" :class="hpColor">{{ member.current_hp }}</span>
          <span class="font-fell text-sm text-muted-foreground">/ {{ member.max_hp }}</span>
          <span v-if="member.temp_hp" class="font-cinzel text-[10px] text-blue-400 ml-1">+{{ member.temp_hp }} tmp</span>
        </div>

        <!-- AC / SPD / INIT / PROF + rest buttons -->
        <div class="flex items-center gap-1 px-3 pt-2 pb-3 mt-auto">
          <div v-for="cs in combatStats" :key="cs.label" class="flex items-baseline gap-0.5">
            <span class="font-cinzel text-[9px] text-muted-foreground tracking-wider">{{ cs.label }}</span>
            <span class="font-cinzel text-sm font-bold text-foreground ml-0.5">{{ cs.value }}<span v-if="cs.suffix" class="text-[9px] text-muted-foreground">{{ cs.suffix }}</span></span>
            <span class="text-border mx-1 select-none">·</span>
          </div>
          <div class="ml-auto flex items-center gap-1">
            <button
              class="h-6 flex items-center gap-1 px-1.5 rounded border border-border font-cinzel text-[9px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors tracking-wider"
              title="Short Rest"
              @click="shortRest"
            ><Moon class="h-3 w-3" /> Rest</button>
            <button
              class="h-6 flex items-center gap-1 px-1.5 rounded bg-primary/10 border border-primary/30 font-cinzel text-[9px] text-primary hover:bg-primary/20 transition-colors tracking-wider"
              title="Long Rest"
              @click="longRest"
            ><Sun class="h-3 w-3" /> Sleep</button>
          </div>
        </div>
      </div>
    </div>

    <!-- HP bar -->
    <div class="h-1.5 w-full bg-muted overflow-hidden">
      <div class="h-full transition-all" :class="hpBarColor" :style="{ width: `${hpPct}%` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Star, Moon, Sun } from "lucide-vue-next";
import { useUpdatePartyMember } from "@/composables/useParty";
import { getCasterType, getSlotRecovery, getDefaultSpellSlots } from "@/types/spell.types";
import type { SpellSlotEntry } from "@/types/party.types";
import type { PartyMember } from "@/types/party.types";
import FocalImage from "@/components/common/FocalImage.vue";

const props = defineProps<{ member: PartyMember }>();

const { mutateAsync: updateMember } = useUpdatePartyMember();

const hpInput = ref(0);

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function signedNum(n: number) { return n >= 0 ? `+${n}` : `${n}`; }

const dexMod = computed(() => abilityMod(props.member.dex));

const combatStats = computed(() => [
  { label: "AC",   value: props.member.ac,    suffix: "" },
  { label: "SPD",  value: props.member.speed, suffix: "ft" },
  { label: "INIT", value: signedNum(dexMod.value), suffix: "" },
  { label: "PROF", value: `+${props.member.proficiency_bonus}`, suffix: "" },
]);

const hpPct = computed(() => {
  if (props.member.max_hp === 0) return 0;
  return Math.max(0, Math.min(100, (props.member.current_hp / props.member.max_hp) * 100));
});
const hpColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "text-destructive";
  if (p < 33) return "text-destructive";
  if (p < 66) return "text-amber-400";
  return "text-elven-green";
});
const hpBarColor = computed(() => {
  const p = hpPct.value;
  if (p <= 0) return "bg-muted-foreground/40";
  if (p < 33) return "bg-destructive";
  if (p < 66) return "bg-amber-500";
  return "bg-elven-green";
});

// Effective spell slots for rest resets
const casterType = computed(() => getCasterType(props.member.class));
const effectiveSpellSlots = computed<SpellSlotEntry[]>(() => {
  if (casterType.value === "none") return [];
  if (props.member.spell_slots?.length) return props.member.spell_slots;
  return getDefaultSpellSlots(props.member.class, props.member.level);
});

async function applyDamage() {
  if (hpInput.value <= 0) return;
  const newHp = Math.max(0, props.member.current_hp - hpInput.value);
  await updateMember({ id: props.member.id, update: { current_hp: newHp } });
  hpInput.value = 0;
}
async function applyHeal() {
  if (hpInput.value <= 0) return;
  const newHp = Math.min(props.member.max_hp, props.member.current_hp + hpInput.value);
  await updateMember({ id: props.member.id, update: { current_hp: newHp } });
  hpInput.value = 0;
}
async function applyTempHp() {
  if (hpInput.value <= 0) return;
  await updateMember({ id: props.member.id, update: { temp_hp: hpInput.value } });
  hpInput.value = 0;
}
async function shortRest() {
  const update: Record<string, unknown> = {};
  if (hpInput.value > 0) {
    update.current_hp = Math.min(props.member.max_hp, props.member.current_hp + hpInput.value);
    hpInput.value = 0;
  }
  if (getSlotRecovery(props.member.class) === "short") {
    update.spell_slots = effectiveSpellSlots.value.map((s: SpellSlotEntry) => ({ ...s, used: 0 }));
  }
  if (Object.keys(update).length) {
    await updateMember({ id: props.member.id, update: update as Parameters<typeof updateMember>[0]["update"] });
  }
}
async function longRest() {
  const spell_slots = effectiveSpellSlots.value.map((s: SpellSlotEntry) => ({ ...s, used: 0 }));
  await updateMember({
    id: props.member.id,
    update: { current_hp: props.member.max_hp, temp_hp: 0, death_save_successes: 0, death_save_failures: 0, spell_slots },
  });
}
async function toggleInspiration() {
  await updateMember({ id: props.member.id, update: { inspiration: !props.member.inspiration } });
}
</script>
