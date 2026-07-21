<template>
  <!-- Combat notifications -->
  <SettingsSection title="Combat Notifications" description="Alerts when it's your turn in a live encounter.">
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Turn audio cue</p>
          <p class="font-fell text-xs text-muted-foreground italic">A short chime plays when your turn begins.</p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="turnAudioEnabled ? 'bg-primary' : 'bg-muted'"
          role="switch"
          :aria-checked="turnAudioEnabled"
          @click="setTurnAudio(!turnAudioEnabled)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="turnAudioEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
      <div class="flex items-center justify-between">
        <div>
          <p class="font-cinzel text-xs text-foreground tracking-wide">Dice roll sounds</p>
          <p class="font-fell text-xs text-muted-foreground italic">A clack plays on every roll. Crits and fumbles have distinct sounds.</p>
        </div>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
          :class="diceAudioEnabled ? 'bg-primary' : 'bg-muted'"
          role="switch"
          :aria-checked="diceAudioEnabled"
          @click="setDiceAudio(!diceAudioEnabled)"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="diceAudioEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>
    </div>
  </SettingsSection>

  <!-- Dice settings -->
  <SettingsSection title="Dice" description="Choose where rolls come from.">
    <div class="flex items-center justify-between">
      <div>
        <p class="font-cinzel text-xs text-foreground tracking-wide">Dice source</p>
        <p class="font-fell text-xs text-muted-foreground italic">Physical mode prompts you to enter the result of dice you rolled yourself.</p>
      </div>
      <div class="flex rounded-md border border-border overflow-hidden text-label md:text-sm shrink-0 ml-3">
        <button
          type="button"
          class="px-3 py-1 transition-colors"
          :class="diceMode === 'tool' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
          @click="setDiceMode('tool')"
        >TOOL</button>
        <button
          type="button"
          class="px-3 py-1 transition-colors border-l border-border"
          :class="diceMode === 'physical' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'"
          @click="setDiceMode('physical')"
        >PHYSICAL</button>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import SettingsSection from "@/components/common/SettingsSection.vue";
import { usePlayerCombatPrefs } from "@/composables/usePlayerCombatPrefs";
import { useDicePrefs } from "@/composables/useDicePrefs";

const { turnAudioEnabled, setTurnAudio } = usePlayerCombatPrefs();
const { diceAudioEnabled, setDiceAudio, diceMode, setDiceMode } = useDicePrefs();
</script>
