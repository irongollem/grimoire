<template>
  <div
    class="rounded-lg border bg-card transition-colors"
    :class="member.current_hp <= 0 ? 'border-destructive/50' : 'border-border'"
  >
    <div class="flex flex-col md:flex-row">
      <!-- Left: identity -->
      <div class="flex flex-col md:w-44 md:border-r md:border-border shrink-0 overflow-hidden">
        <!-- The portrait opens the character, like the name beside it: the
             biggest thing in the row is what a DM reaches for, and the eye
             button's player preview was the only obvious target left. -->
        <RouterLink
          :to="`/party/${member.id}`"
          :aria-label="`Open ${member.name}`"
          class="card-plate card-plate-edge block h-31.25 bg-muted overflow-hidden"
        >
          <FocalImage
            :src="portrait.src"
            :alt="portrait.alt"
            format="landscape"
            :focal-point="portrait.focalPoint"
            :placeholder="placeholderUrl(portrait.shaped ? 'monster' : 'character')"
            ai-badge="right"
          />
        </RouterLink>

        <div class="flex flex-col gap-0.5 px-3 py-2.5">
          <div class="flex items-center gap-1">
            <RouterLink
              :to="`/party/${member.id}`"
              class="text-heading-sm font-bold text-foreground leading-tight underline-offset-2 hover:text-primary hover:underline transition-colors flex-1"
            >
              {{ member.name }}
            </RouterLink>
            <AppButton
              variant="ghost"
              tone="primary"
              size="inline-xs"
              :icon="IconReveal"
              tooltip="Preview player portal as this character"
              class="shrink-0 text-muted-foreground/50"
              @click="previewAsPlayer"
            />
            <AppButton
              v-if="dmSharedJournal.length"
              variant="ghost"
              tone="caution"
              size="inline-xs"
              tooltip="View player journal entries shared with DM"
              :class="['relative shrink-0', unreadJournalCount > 0 ? 'text-tone-caution' : 'text-muted-foreground/50']"
              @click="showJournalModal = true"
            >
              <template #icon>
                <IconScrollText class="h-3.5 w-3.5" />
                <span
                  v-if="unreadJournalCount > 0"
                  class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive text-2xs font-bold text-white flex items-center justify-center leading-none"
                />
              </template>
            </AppButton>
          </div>
          <p class="text-caption text-muted-foreground italic">
            {{
              [speciesName, classLabel, levelDisplay ? `Lv${levelDisplay}` : ""]
                .filter(Boolean)
                .join(" · ")
            }}
          </p>
          <DollAskNotice v-if="auth.isDM && member.doll_requested_at" :member="member" />
          <span
            v-if="isInDisguise(member)"
            class="inline-flex items-center gap-1 text-label text-ink-caution/80"
            title="Currently in disguise"
          >◈ disguised</span>
          <p v-if="member.player_name" class="text-caption text-muted-foreground">
            {{ member.player_name }}
          </p>
          <AppButton
            v-if="effectiveLocationId"
            :variant="hasLocationOverride ? 'tinted' : 'ghost'"
            :tone="hasLocationOverride ? 'caution' : 'primary'"
            size="inline-xs"
            :to="placeRoute(effectiveLocationId)"
            :icon="IconLocation"
            :label="locationLabel"
          />
          <span
            v-else
            class="inline-flex items-center gap-0.5 text-caption-sm text-muted-foreground/40 italic"
          >
            <IconLocation class="h-2.5 w-2.5 shrink-0" />
            Location unknown
          </span>
        </div>
      </div>

      <!-- Middle: HP + stats -->
      <div class="flex-1 p-4 flex flex-col gap-3">
        <!-- HP section -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2">
            <span class="text-label-lg font-semibold text-muted-foreground flex-1">
              HP
              <span class="ml-2 text-sm font-bold" :class="hpColor(displayHp, displayMaxHp)">{{ displayHp }}</span>
              <span class="text-muted-foreground font-normal"> / {{ displayMaxHp }}</span>
              <span v-if="member.temp_hp > 0" class="ml-1 text-ink-info font-bold">+{{ member.temp_hp }} tmp</span>
              <span
                v-if="member.wildshape_state"
                class="ml-1 font-normal italic text-elven-green"
              >({{ member.wildshape_state.beast_name }})</span>
            </span>
            <button
              type="button"
              :class="[
                'w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0',
                member.inspiration
                  ? 'bg-tone-caution/20 text-ink-caution'
                  : 'text-muted-foreground/40 hover:text-ink-caution',
              ]"
              title="Toggle inspiration"
              @click="toggleInspiration"
            >
              <IconGenerate class="h-3.5 w-3.5" />
            </button>
          </div>

          <div class="h-2 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="hpBarColor(displayHp, displayMaxHp)"
              :style="{ width: `${Math.max(0, Math.min(100, (displayHp / displayMaxHp) * 100))}%` }"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <AppInput
              v-model.number="hpInput"
              type="number"
              min="0"
              placeholder="Amt"
              tone="filled"
              size="body-xs"
              align="center"
              :block="false"
              class="w-16"
            />
            <AppButton
              variant="tinted"
              size="sm"
              label="Damage"
              tone="danger"
              emphasis="soft"
              @click="dealDamage"
            />
            <AppButton
              variant="tinted"
              size="sm"
              label="Heal"
              tone="success"
              emphasis="soft"
              @click="heal"
            />
            <AppButton
              variant="tinted"
              size="sm"
              label="+Temp"
              tone="info"
              emphasis="soft"
              @click="addTemp"
            />
            <!-- Damage to someone at 0 HP is a death save failure, two from a critical hit. -->
            <AppCheckbox v-if="hitsDyingBody" v-model="criticalHit" size="sm" label-role="label" label="Critical hit" />
          </div>
        </div>

        <!-- Key stats grid -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-label-lg">
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">AC</span>
            <span class="font-bold text-foreground shrink-0" :title="acTitle">{{ displayAc }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Speed</span>
            <span class="font-bold text-foreground shrink-0">{{ displaySpeed }} ft</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Perception</span>
            <span class="font-bold text-foreground shrink-0">{{ passivePerception }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Insight</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveInsight }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Investigation</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveInvestigation }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Arcana</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveArcana }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">History</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveHistory }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Nature</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveNature }}</span>
          </span>
          <span class="flex items-baseline justify-between gap-1 min-w-0">
            <span class="text-muted-foreground truncate">Religion</span>
            <span class="font-bold text-foreground shrink-0">{{ passiveReligion }}</span>
          </span>
        </div>

        <!-- Saving throw proficiencies -->
        <div v-if="member.saving_throw_proficiencies.length" class="flex flex-wrap gap-1">
          <span class="text-label text-muted-foreground mr-1 self-center">SAVES:</span>
          <span
            v-for="save in member.saving_throw_proficiencies"
            :key="save"
            class="px-1.5 py-0.5 rounded bg-muted text-eyebrow text-foreground font-semibold"
          >{{ save }}</span>
        </div>

        <PartyConditionsPanel :member="member" />

        <PartyDeathSaves v-if="member.current_hp <= 0" :member="member" />
      </div>
    </div>

    <!-- Companions for this member -->
    <div v-if="companions.length" class="border-t border-border bg-muted/10 px-4 py-3 flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-eyebrow font-semibold text-muted-foreground">Companions</span>
        <AppButton
          variant="link"
          size="inline-xs"
          label="+ Add"
          @click="emit('open-companion-form', { companion: null, ownerId: member.id })"
        />
      </div>
      <CompanionCard
        v-for="comp in companions"
        :key="comp.id"
        :companion="comp"
        :source-name="companionSourceName(comp)"
        :source-link="companionSourceLink(comp)"
        @edit="emit('open-companion-form', { companion: $event })"
        @delete="emit('delete-companion', $event)"
      />
    </div>
    <div v-else class="border-t border-border bg-muted/10 px-4 py-2 flex items-center justify-between">
      <span class="text-caption text-muted-foreground italic">No companions</span>
      <AppButton
        variant="ghost"
        tone="primary"
        size="inline-xs"
        label="+ Add Companion"
        @click="emit('open-companion-form', { companion: null, ownerId: member.id })"
      />
    </div>
  </div>

  <PlayerJournalDmModal
    v-if="showJournalModal"
    :player-name="dmPlayerName || member.player_name || member.name"
    :entries="dmSharedJournal"
    @close="showJournalModal = false"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { IconGenerate, IconLocation, IconReveal, IconScrollText } from '@/lib/icons';
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useToast } from "@/composables/useToast";
import { damageOutcome, describeDamageOutcome, healingOutcome } from "@/rules/dying";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { describeAc } from "@/rules/armorClass";
import { useReadItems } from "@/composables/player/useReadItems";
import PlayerJournalDmModal from "./PlayerJournalDmModal.vue";
import type { PlayerJournalEntry } from "@/composables/notes/usePlayerJournal";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAppUiStore } from "@/stores/ui/app";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { isInDisguise } from "@/lib/partyMemberDisplay";
import { effectiveLocationId as deriveEffectiveLocationId } from "@/lib/partyPosition";
import { placeRoute } from "@/lib/locations/placeRoute";
import FocalImage from "@/components/common/media/FocalImage.vue";
import { formPortrait } from "@/lib/wildshapePortrait";
import { walkingSpeed } from "@/lib/movement";
import DollAskNotice from "./DollAskNotice.vue";
import CompanionCard from "./CompanionCard.vue";
import PartyConditionsPanel from "./PartyConditionsPanel.vue";
import PartyDeathSaves from "./PartyDeathSaves.vue";
import { betterTempHp, formHpPools } from "@/rules/hitPoints";
import type { PartyMember, PartyMemberUpdate } from "@/types/party.types";
import { passiveScore } from "@/rules/skillCheck";
import type { Companion } from "@/types/companion.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const {
  member,
  speciesName,
  locationNameMap,
  classLabel,
  levelDisplay,
  companions,
  dmSharedJournal = [],
  dmPlayerName = "",
} = defineProps<{
  member: PartyMember;
  speciesName: string | null;
  locationNameMap: Map<string, string>;
  classLabel: string;
  levelDisplay: number;
  companions: Companion[];
  dmSharedJournal?: PlayerJournalEntry[];
  dmPlayerName?: string;
}>();

// One row per member: conditions and anything else below resolve per character.
provideCharacterRuleset(() => member);

const emit = defineEmits<{
  'open-companion-form': [payload: { companion: Companion | null; ownerId?: string }];
  'delete-companion': [companion: Companion];
}>();

const router = useRouter();
const appUi = useAppUiStore();
const campaign = useCampaignStore();
const auth = useAuthStore();
const { mutateAsync: updateMember } = useUpdatePartyMember();

// #786: current_location_id on a member is an override — null means "with
// the party". The effective position is derived here rather than read off
// the raw column, so a follower shows the party's location instead of
// "Location unknown".
const hasLocationOverride = computed(() => member.current_location_id !== null);
const effectiveLocationId = computed(() =>
  deriveEffectiveLocationId(member, campaign.activeCampaign?.current_location_id ?? null),
);
const locationLabel = computed(() => {
  const id = effectiveLocationId.value;
  if (!id) return "…";
  const name = locationNameMap.get(id) ?? "…";
  return hasLocationOverride.value ? `${name} (away)` : name;
});

const showJournalModal = ref(false);
const { isNew: isJournalNew } = useReadItems("player_journal");
const unreadJournalCount = computed(() =>
  dmSharedJournal.filter((e) => isJournalNew(e.id, e.updated_at)).length,
);
// Resolves a companion's stored source_monster_id (same reason as PartyTracker)
// and the wild shape beast, both stored ids, by id and unscoped.
// With the art tables merged, so the beast's face below is the picture the
// bestiary shows, not the bare library row's (often empty) `image_url`.
const { data: storedMonsters } = useMonstersByIds(
  () => [member.wildshape_state?.monster_id, ...companions.map((c) => c.source_monster_id)],
  { withArt: true },
);
const { data: allNpcs } = useNpcs();

const hpInput = ref(0);

function getHpAmount(): number {
  return Math.max(0, hpInput.value ?? 0);
}

// While wildshaped the tracker reads (and damages) the beast's pool — otherwise
// the DM would hit Damage and watch nothing move.
const portrait = computed(() => {
  const form = member.wildshape_state;
  return formPortrait(member, form, form ? storedMonsters.value.get(form.monster_id)?.image_url : null);
});
// A wild-shaped member moves at the beast's walking speed.
const displaySpeed = computed(() => {
  const form = member.wildshape_state;
  const beast = form ? storedMonsters.value.get(form.monster_id) : undefined;
  return walkingSpeed(beast?.stat_block.speed) ?? member.speed;
});
const displayHp = computed(() => member.wildshape_state?.beast_hp ?? member.current_hp);
const displayMaxHp = computed(() => member.wildshape_state?.beast_max_hp ?? member.max_hp);

/** HP pools as the shared arithmetic sees them — beast form included, so a
 *  wildshaped druid takes damage on the beast's HP here too, not their own. */
const hpPools = computed(() => formHpPools(member, member.wildshape_state));

const toast = useToast();
const criticalHit = ref(false);
/** The critical-hit choice shows only for a dying character (0 HP, not yet dead) not in a beast form. */
const hitsDyingBody = computed(() => member.current_hp <= 0 && member.death_save_failures < 3 && !member.wildshape_state);
const dyingInput = computed(() => ({
  pools: hpPools.value,
  saves: { successes: member.death_save_successes, failures: member.death_save_failures },
  conditions: member.conditions ?? [],
}));

/**
 * Applies the typed damage through the dying rules: temp HP first, a beast form's pool, and at
 * 0 HP a failed death save (two on a critical hit) instead of further loss.
 */
async function dealDamage() {
  const amount = getHpAmount();
  if (!amount) return;
  const critical = hitsDyingBody.value && criticalHit.value;
  const out = damageOutcome(dyingInput.value, { amount, critical });
  const update: PartyMemberUpdate = { current_hp: out.current_hp, temp_hp: out.temp_hp };
  if (member.wildshape_state) {
    // A 2024 form has no beast pool: it stays until the character drops to 0.
    if (out.reverted) update.wildshape_state = null;
    else if (out.beast_hp !== null) update.wildshape_state = { ...member.wildshape_state, beast_hp: out.beast_hp };
  }
  if (out.saves.successes !== member.death_save_successes) update.death_save_successes = out.saves.successes;
  if (out.saves.failures !== member.death_save_failures) update.death_save_failures = out.saves.failures;
  if (out.conditions.length !== (member.conditions ?? []).length) update.conditions = out.conditions;
  await updateMember({ id: member.id, update });
  hpInput.value = 0;
  criticalHit.value = false;
  const message = describeDamageOutcome(member.name, amount, out.outcome);
  if (message) toast.info(message);
}

async function heal() {
  const amount = getHpAmount();
  if (!amount) return;
  const out = healingOutcome(dyingInput.value, amount);
  if (out.outcome === "healing-refused-dead") {
    toast.info(`${member.name} is dead. Healing cannot bring them back. Use Revive.`);
    hpInput.value = 0;
    return;
  }
  if (member.wildshape_state && out.beast_hp !== null) {
    await updateMember({ id: member.id, update: {
      wildshape_state: { ...member.wildshape_state, beast_hp: out.beast_hp },
    }});
    hpInput.value = 0;
    return;
  }
  const update: PartyMemberUpdate = { current_hp: out.current_hp };
  // Only healing from 0 ends the dying state; healing a standing character leaves the saves alone.
  if (out.outcome === "revived-by-healing") {
    update.death_save_successes = 0;
    update.death_save_failures = 0;
    update.conditions = out.conditions;
  }
  await updateMember({ id: member.id, update });
  hpInput.value = 0;
}

async function addTemp() {
  const amount = getHpAmount();
  if (!amount) return;
  await updateMember({ id: member.id, update: { temp_hp: betterTempHp(member.temp_hp, amount) } });
  hpInput.value = 0;
}

async function toggleInspiration() {
  await updateMember({ id: member.id, update: { inspiration: !member.inspiration } });
}

const { acFor, acBreakdownFor } = useArmorClass();
// Hover shows how the number is made, so a DM can see why it is what it is.
const acTitle = computed(() =>
  member.wildshape_state ? `Wild Shape: ${member.wildshape_state.beast_name}` : describeAc(acBreakdownFor(member)),
);
const displayAc = computed(
  () => member.wildshape_state?.beast_ac ?? acFor(member),
);

const passivePerception = computed(() => passiveScore(member, "perception"));
const passiveInsight = computed(() => passiveScore(member, "insight"));
const passiveInvestigation = computed(() => passiveScore(member, "investigation"));
const passiveArcana = computed(() => passiveScore(member, "arcana"));
const passiveHistory = computed(() => passiveScore(member, "history"));
const passiveNature = computed(() => passiveScore(member, "nature"));
const passiveReligion = computed(() => passiveScore(member, "religion"));

function hpColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "text-destructive";
  if (pct <= 0.25) return "text-destructive";
  if (pct <= 0.5) return "text-ink-caution";
  return "text-ink-success";
}

function hpBarColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "bg-destructive";
  if (pct <= 0.25) return "bg-tone-danger";
  if (pct <= 0.5) return "bg-tone-caution";
  return "bg-tone-success";
}

function companionSourceName(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) {
    return storedMonsters.value.get(c.source_monster_id)?.name ?? "";
  }
  if (c.source_type === "npc" && c.source_npc_id) {
    return (allNpcs.value ?? []).find((n) => n.id === c.source_npc_id)?.name ?? "";
  }
  return "";
}

function companionSourceLink(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) return `/bestiary/${c.source_monster_id}`;
  if (c.source_type === "npc" && c.source_npc_id) return `/npcs/${c.source_npc_id}`;
  return "";
}

function previewAsPlayer() {
  appUi.enterDmPreview(member.id);
  router.push({ name: "play-character" });
}
</script>
