<template>
  <div
    class="flex flex-col rounded-lg border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
    :class="isOwn ? 'border-primary/40' : 'border-border'"
    @click="$emit('click')"
  >
    <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
      <MiniPortraitOverlay :source="{ table: 'party_members', id: member.id }">
        <FocalImage
          :src="member.portrait_url"
          :alt="member.name"
          format="portrait"
          :focal-point="member.portrait_focal_point ?? null"
          placeholder="/assets/placeholders/character.webp"
          class="group-hover:scale-105 transition-transform duration-300"
        />
        <span
          v-if="isOwn"
          class="absolute top-2 left-2 font-cinzel text-2xs md:text-sm px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider"
        >You</span>
      </MiniPortraitOverlay>
    </div>
    <div class="p-2.5 flex flex-col gap-1.5">
      <div>
        <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ member.name }}</h3>
        <p class="font-fell text-xs text-muted-foreground italic truncate">
          {{ subtitle }}
          <span v-if="member.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ member.level }}</span>
        </p>
      </div>
      <div>
        <template v-if="showNumericHp">
          <div class="flex items-center justify-between mb-0.5">
            <span class="font-cinzel text-2xs md:text-sm text-muted-foreground tracking-wider">HP</span>
            <span class="font-cinzel text-2xs md:text-sm" :class="hpColor">{{ member.current_hp }} / {{ member.max_hp }}</span>
          </div>
          <div class="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all"
              :class="hpBarColor"
              :style="{ width: `${member.max_hp > 0 ? Math.max(0, Math.min(100, (member.current_hp / member.max_hp) * 100)) : 0}%` }"
            />
          </div>
        </template>
        <template v-else>
          <span class="text-eyebrow md:text-sm text-muted-foreground">HP</span>
          <p class="font-fell text-xs italic" :class="hpColor">{{ immersiveHpLabel }}</p>
        </template>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="flex items-center gap-1">
          <IconShield class="h-3 w-3 text-muted-foreground shrink-0" />
          <span class="font-cinzel text-xs font-bold text-foreground">{{ displayAc }}</span>
        </span>
        <span
          v-for="cond in (member.conditions ?? []).slice(0, 2)"
          :key="cond"
          class="font-cinzel text-2xs md:text-sm px-1 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
        >{{ cond }}</span>
        <span v-if="(member.conditions?.length ?? 0) > 2" class="font-fell text-2xs md:text-sm text-muted-foreground italic">
          +{{ (member.conditions?.length ?? 0) - 2 }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconShield } from "@/lib/icons";
import FocalImage from "@/components/common/FocalImage.vue";
import MiniPortraitOverlay from "@/components/simulacrum/MiniPortraitOverlay.vue";
import { useHpDisplay } from "@/composables/useHpDisplay";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import type { PartyMember } from "@/types/party.types";

const { member, isOwn, showNumericHp, subtitle } = defineProps<{
  member: PartyMember;
  isOwn: boolean;
  showNumericHp: boolean;
  subtitle: string;
}>();

defineEmits<{ click: [] }>();

const { hpColor, hpBarColor, immersiveHpLabel } = useHpDisplay(
  () => member.current_hp,
  () => member.max_hp
);

const { bonusFor: shieldAcBonusFor } = useShieldAcBonus();
const displayAc = computed(
  () => member.wildshape_state?.beast_ac ?? member.ac + shieldAcBonusFor(member.id),
);
</script>
