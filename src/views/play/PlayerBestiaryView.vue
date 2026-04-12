<template>
  <div class="space-y-4 pb-8">
    <!-- Tabs — only show Forms tab if the character qualifies -->
    <div class="flex gap-1 border-b border-border">
      <button
        v-for="tab in visibleTabs"
        :key="tab.id"
        type="button"
        class="px-4 py-2 font-cinzel text-xs tracking-wide border-b-2 -mb-px transition-colors"
        :class="activeTab === tab.id
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id as 'bestiary' | 'forms'"
      >{{ tab.label }}</button>
    </div>

    <!-- ── BESTIARY TAB ──────────────────────────────────────────── -->
    <template v-if="activeTab === 'bestiary'">
      <div v-if="isLoadingDiscoveries" class="flex justify-center py-16">
        <LoadingSpinner />
      </div>

      <div v-else-if="!resolved.length" class="text-center py-16 space-y-2">
        <p class="font-cinzel text-lg text-muted-foreground">No creatures discovered yet</p>
        <p class="font-fell text-sm text-muted-foreground italic">Monsters you encounter will appear here.</p>
      </div>

      <template v-else>
        <div class="relative">
          <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            v-model="search"
            type="text"
            placeholder="Search bestiary…"
            class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div
            v-for="entry in filtered"
            :key="entry.discovery.id"
            class="group relative rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
            @click="openLightbox(entry.monster, entry.discovery)"
          >
            <MonsterFormCard
              :monster="entry.monster"
              :name="entry.monster?.name ?? 'Unknown creature'"
              :image-url="entry.monster?.image_url ?? null"
              :reveal-stats="entry.discovery.reveal_stats"
            />
          </div>
        </div>
      </template>
    </template>

    <!-- ── WILD FORMS TAB ────────────────────────────────────────── -->
    <template v-else-if="activeTab === 'forms'">
      <div class="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-xs font-semibold text-foreground">
            {{ member?.['class'] }} · Level {{ member?.level }}
          </p>
          <p v-if="isDruid" class="font-fell text-xs text-muted-foreground italic mt-0.5">
            Max CR {{ maxWildshapeCrDisplay }}
            <template v-if="(member?.level ?? 0) < 8"> · no fly/swim speed</template>
          </p>
        </div>
        <span v-if="isDruid && isCircleOfMoon" class="font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">MOON</span>
      </div>

      <!-- DM: share all eligible beasts with this druid -->
      <div v-if="ui.dmPreviewMode && isDruid && unsharedEligibleBeasts.length > 0" class="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
        <p class="font-fell text-xs text-muted-foreground italic">{{ unsharedEligibleBeasts.length }} eligible beast{{ unsharedEligibleBeasts.length === 1 ? '' : 's' }} not yet shared</p>
        <button
          type="button"
          :disabled="sharingBeasts"
          class="inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-primary border border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-50"
          @click="shareAllEligibleBeasts"
        >
          {{ sharingBeasts ? 'Sharing…' : 'Share all eligible beasts' }}
        </button>
      </div>

      <div v-if="wildForms.length === 0" class="text-center py-16 space-y-2">
        <p class="font-cinzel text-lg text-muted-foreground">No available forms</p>
        <p class="font-fell text-sm text-muted-foreground italic">
          <template v-if="isDruid">Discover beasts to unlock wild shapes, or ask your DM to pin forms for you.</template>
          <template v-else>Your DM can pin forms for you here.</template>
        </p>
      </div>

      <template v-else>
        <!-- Pinned section -->
        <template v-if="pinnedForms.length">
          <p class="font-cinzel text-[10px] tracking-wider text-muted-foreground">PINNED BY DM</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div
              v-for="entry in pinnedForms"
              :key="entry.monster.id"
              class="group relative rounded-lg border border-primary/30 bg-card overflow-hidden cursor-pointer hover:border-primary/60 transition-colors"
              @click="openLightbox(entry.monster, null)"
            >
              <MonsterFormCard :monster="entry.monster" :name="entry.name" :image-url="entry.imageUrl" :reveal-stats="true" />
              <!-- DM pin button (preview mode only) -->
              <button
                v-if="ui.dmPreviewMode"
                type="button"
                class="absolute top-1.5 right-1.5 z-10 p-0.5 rounded bg-primary/20 text-primary hover:bg-destructive/20 hover:text-destructive transition-colors"
                title="Unpin form"
                @click.stop="togglePin(entry.monster)"
              >
                <Pin class="h-3 w-3" />
              </button>
            </div>
          </div>
        </template>

        <!-- Eligible section -->
        <template v-if="eligibleForms.length">
          <p class="font-cinzel text-[10px] tracking-wider text-muted-foreground mt-2">ELIGIBLE FORMS</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div
              v-for="entry in eligibleForms"
              :key="entry.monster.id"
              class="group relative rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
              @click="openLightbox(entry.monster, null)"
            >
              <MonsterFormCard :monster="entry.monster" :name="entry.name" :image-url="entry.imageUrl" :reveal-stats="true" />
              <!-- DM pin button (preview mode only) -->
              <button
                v-if="ui.dmPreviewMode"
                type="button"
                class="absolute top-1.5 right-1.5 z-10 p-0.5 rounded bg-card/80 text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                title="Pin form"
                @click.stop="togglePin(entry.monster)"
              >
                <Pin class="h-3 w-3" />
              </button>
            </div>
          </div>
        </template>
      </template>
    </template>

    <!-- ── LIGHTBOX ──────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="lightbox"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="lightbox = null"
      >
        <div class="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <button class="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground" @click="lightbox = null">
            <X class="h-4 w-4" />
          </button>

          <div class="relative h-48 bg-muted overflow-hidden rounded-t-xl">
            <FocalImage
              v-if="lightbox.imageUrl"
              :src="lightbox.imageUrl"
              :alt="lightbox.name"
              format="landscape"
              :focal-point="lightbox.monster?.portrait_focal_point"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center font-cinzel text-5xl font-bold"
              :style="{ color: crColor(lightbox.monster?.stat_block.challenge_rating ?? '0') }"
            >{{ lightbox.name.charAt(0) }}</div>
            <span
              v-if="lightbox.monster"
              class="absolute bottom-2 right-2 px-2 py-0.5 rounded font-cinzel text-[10px] font-bold text-white"
              :style="{ backgroundColor: crColor(lightbox.monster.stat_block.challenge_rating) }"
            >CR {{ lightbox.monster.stat_block.challenge_rating }}</span>
          </div>

          <div class="p-4 space-y-4">
            <div>
              <h2 class="font-cinzel text-xl font-bold text-foreground">{{ lightbox.name }}</h2>
              <p v-if="lightbox.monster" class="font-fell text-sm text-muted-foreground italic capitalize">
                {{ lightbox.monster.size }} {{ lightbox.monster.monster_type }}<span v-if="lightbox.monster.alignment"> · {{ lightbox.monster.alignment }}</span>
              </p>
            </div>

            <template v-if="lightbox.monster && (lightbox.revealStats ?? activeTab === 'forms')">
              <div class="flex gap-4 font-cinzel text-sm">
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-bold">{{ lightbox.monster.stat_block.armor_class }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">HP</p>
                  <p class="font-bold">{{ lightbox.monster.stat_block.hit_points }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">SPD</p>
                  <p class="font-bold">{{ lightbox.monster.stat_block.speed }}</p>
                </div>
              </div>
              <AbilityScoreTable :scores="lightboxScores" :rounded="false" />
              <template v-for="section in lightboxTraitSections" :key="section.label">
                <div class="border-t border-border pt-3">
                  <p class="font-cinzel text-[10px] tracking-wider text-muted-foreground mb-2">{{ section.label.toUpperCase() }}</p>
                  <div v-for="t in section.traits" :key="t.name" class="mb-3 last:mb-0">
                    <div class="flex items-start gap-2 flex-wrap">
                      <p class="font-cinzel text-xs font-semibold text-foreground shrink-0">{{ t.name }}.</p>
                      <div class="flex gap-1.5 flex-wrap">
                        <button
                          v-if="parseAttackBonus(t.description) !== null"
                          type="button"
                          class="font-cinzel text-[9px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          @click.stop="rollAttack(parseAttackBonus(t.description) ?? 0, t.name)"
                        >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
                        <button
                          v-if="hasRollableDice(t.description)"
                          type="button"
                          class="font-cinzel text-[9px] px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          @click.stop="rollActionDamage(t.description, t.name)"
                        >🎲 {{ actionDiceLabel(t.description) }}</button>
                      </div>
                    </div>
                    <p class="font-fell text-xs text-muted-foreground leading-relaxed mt-0.5">{{ t.description }}</p>
                  </div>
                </div>
              </template>
              <div v-if="lastRoll" class="border-t border-border pt-3 flex items-center justify-between">
                <span class="font-fell text-xs text-muted-foreground italic">{{ lastRoll.label }}</span>
                <span class="font-cinzel text-lg font-bold text-foreground">{{ lastRoll.total }}</span>
              </div>
            </template>

            <PlayerNotesWidget
              v-if="lightbox.monster"
              entity-type="monster"
              :entity-id="lightbox.entityId"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Pin, Search, X } from "lucide-vue-next";
import { usePlayerDiscoveries, useAutoDiscoverMonsters } from "@/composables/useDiscoveredMonsters";
import { usePinnedForms, useTogglePinnedForm } from "@/composables/usePinnedForms";
import { useAllMonsters } from "@/composables/useMonsters";
import { useParty } from "@/composables/useParty";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { parseExpression } from "@/lib/dice";
import { rollDice, rollParsed } from "@/lib/roller";
import type { DiscoveredMonster, Monster } from "@/types/monster.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import MonsterFormCard from "@/components/monsters/MonsterFormCard.vue";

// ── Data ──────────────────────────────────────────────────────────────────────
interface BestiaryEntry { discovery: DiscoveredMonster; monster: Monster | null }
interface FormEntry { monster: Monster; name: string; imageUrl: string | null }

const ui = useUiStore();
const auth = useAuthStore();
const { sendRoll } = useCampaignMessages();
const { data: discoveries, isLoading: isLoadingDiscoveries } = usePlayerDiscoveries();
const { data: allMonsters } = useAllMonsters();
const { data: partyMembers } = useParty();
const { data: playerPinnedForms } = usePinnedForms();
const { mutate: togglePinnedForm } = useTogglePinnedForm();

// Resolve current party member
const member = computed(() => {
  const memberId = ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId;
  return partyMembers.value?.find((m) => m.id === memberId) ?? null;
});

// ── Class detection ───────────────────────────────────────────────────────────
const isDruid    = computed(() => (member.value?.['class'] as string | null)?.toLowerCase().includes("druid") ?? false);
const isRanger   = computed(() => (member.value?.['class'] as string | null)?.toLowerCase().includes("ranger") ?? false);
const isCircleOfMoon = computed(() => member.value?.subclass?.toLowerCase().includes("moon") ?? false);

const showFormTab = computed(() => isDruid.value || isRanger.value);

const visibleTabs = computed(() => {
  const tabs: { id: string; label: string }[] = [{ id: "bestiary", label: "Bestiary" }];
  if (showFormTab.value || (playerPinnedForms.value?.length ?? 0) > 0) {
    tabs.push({ id: "forms", label: "Wild Forms" });
  }
  return tabs;
});

const activeTab = ref<"bestiary" | "forms">("bestiary");

// ── Bestiary tab ─────────────────────────────────────────────────────────────
function isVisibleToPreviewMember(d: DiscoveredMonster): boolean {
  if (!ui.dmPreviewMode || !ui.dmPreviewPartyMemberId) return true;
  return d.visible_to === null || d.visible_to.includes(ui.dmPreviewPartyMemberId);
}

const resolved = computed<BestiaryEntry[]>(() =>
  (discoveries.value ?? []).filter(isVisibleToPreviewMember).map((d) => {
    let monster: Monster | null = null;
    if (allMonsters.value) {
      if (d.srd_slug)    monster = allMonsters.value.find((m) => m.id === d.srd_slug) ?? null;
      else if (d.monster_id) monster = allMonsters.value.find((m) => m.id === d.monster_id) ?? null;
    }
    return { discovery: d, monster };
  }),
);

const search = ref("");
const filtered = computed(() => {
  if (!search.value.trim()) return resolved.value;
  const q = search.value.trim().toLowerCase();
  return resolved.value.filter(
    (e) => (e.monster?.name ?? "").toLowerCase().includes(q) || (e.monster?.monster_type ?? "").toLowerCase().includes(q),
  );
});

// ── Wild Forms tab ───────────────────────────────────────────────────────────
function parseFraction(s: string): number {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b || "1");
}
function parseCr(cr: string): number {
  if (!cr || cr === "0") return 0;
  if (cr.includes("/")) return parseFraction(cr);
  return parseFloat(cr) || 0;
}

const maxWildshapeCr = computed(() => {
  const level = member.value?.level ?? 1;
  if (isCircleOfMoon.value) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);  // CR 1/8 min, up to level/2
});

const maxWildshapeCrDisplay = computed(() => {
  const cr = maxWildshapeCr.value;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25)  return "1/4";
  if (cr === 0.5)   return "1/2";
  return String(cr);
});

function hasSpeedType(speed: string, type: string): boolean {
  return speed.toLowerCase().includes(type);
}

function isEligibleBeast(m: Monster): boolean {
  if (!isDruid.value) return false;
  const level = member.value?.level ?? 1;
  const cr = parseCr(m.stat_block.challenge_rating);
  if (m.monster_type?.toLowerCase() !== "beast") return false;
  if (cr > maxWildshapeCr.value) return false;
  // Before level 8: can't take forms with fly or swim speed
  if (level < 8) {
    const speed = m.stat_block.speed ?? "";
    if (hasSpeedType(speed, "fly") || hasSpeedType(speed, "swim")) return false;
  }
  return true;
}

// Pinned forms for the current party member (player view or DM preview)
const pinnedFormMonsters = computed<FormEntry[]>(() => {
  const pins = playerPinnedForms.value ?? [];
  const filteredPins = ui.dmPreviewMode
    ? pins.filter((p) => p.party_member_id === ui.dmPreviewPartyMemberId)
    : pins;

  return filteredPins.flatMap((pin) => {
    const monster = allMonsters.value?.find((m) =>
      pin.srd_slug ? m.id === pin.srd_slug : m.id === pin.monster_id,
    ) ?? null;
    if (!monster) return [];
    return [{ monster, name: monster.name, imageUrl: monster.image_url ?? null }];
  });
});

const pinnedMonsterIds = computed(() => new Set(pinnedFormMonsters.value.map((e) => e.monster.id)));

// Build a set of discovered monster keys visible to the current (preview) player
const discoveredMonsterKeys = computed<Set<string>>(() => {
  const s = new Set<string>();
  for (const d of (discoveries.value ?? []).filter(isVisibleToPreviewMember)) {
    if (d.monster_id) s.add(d.monster_id);
    if (d.srd_slug)   s.add(d.srd_slug);
  }
  return s;
});

// DM: eligible beasts not yet shared with the previewed party member
const unsharedEligibleBeasts = computed(() => {
  if (!isDruid.value) return [];
  return (allMonsters.value ?? []).filter(
    (m) => isEligibleBeast(m) && !discoveredMonsterKeys.value.has(m.id),
  );
});

const sharingBeasts = ref(false);
const { mutateAsync: autoDiscover } = useAutoDiscoverMonsters();

async function shareAllEligibleBeasts() {
  const memberId = ui.dmPreviewPartyMemberId;
  if (!memberId || !unsharedEligibleBeasts.value.length) return;
  sharingBeasts.value = true;
  try {
    await autoDiscover({ monsters: unsharedEligibleBeasts.value, partyMemberIds: [memberId] });
  } finally {
    sharingBeasts.value = false;
  }
}

// Eligible beast forms: only beasts the player has discovered that pass CR/speed filter
const eligibleBeastForms = computed<FormEntry[]>(() => {
  if (!isDruid.value) return [];
  const monsters = allMonsters.value ?? [];
  return monsters
    .filter((m) =>
      discoveredMonsterKeys.value.has(m.id) &&
      isEligibleBeast(m) &&
      !pinnedMonsterIds.value.has(m.id),
    )
    .map((m) => ({ monster: m, name: m.name, imageUrl: m.image_url ?? null }))
    .sort((a, b) => parseCr(a.monster.stat_block.challenge_rating) - parseCr(b.monster.stat_block.challenge_rating));
});

const pinnedForms  = computed(() => pinnedFormMonsters.value);
const eligibleForms = computed(() => eligibleBeastForms.value);
const wildForms    = computed(() => [...pinnedForms.value, ...eligibleForms.value]);

// DM preview: toggle pin
function togglePin(monster: Monster) {
  const memberId = ui.dmPreviewPartyMemberId;
  if (!memberId) return;
  const existing = (playerPinnedForms.value ?? []).find((p) =>
    monster.is_srd ? p.srd_slug === monster.id : p.monster_id === monster.id,
  );
  togglePinnedForm({ monster, partyMemberId: memberId, existing });
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
interface LightboxState {
  monster: Monster | null;
  name: string;
  imageUrl: string | null;
  revealStats: boolean | null;
  entityId: string;
}
const lightbox = ref<LightboxState | null>(null);

function openLightbox(monster: Monster | null, discovery: DiscoveredMonster | null) {
  if (!monster && !discovery) return;
  lastRoll.value = null;
  lightbox.value = {
    monster,
    name: monster?.name ?? "Unknown creature",
    imageUrl: monster?.image_url ?? null,
    revealStats: discovery?.reveal_stats ?? null,
    entityId: discovery?.monster_id ?? discovery?.srd_slug ?? monster?.id ?? "",
  };
}

// ── Roll helpers ──────────────────────────────────────────────────────────────
const lastRoll = ref<{ label: string; total: number } | null>(null);

function parseAttackBonus(desc: string): number | null {
  const m = desc.match(/([+-]\d+)\s+to\s+hit/i);
  return m ? parseInt(m[1]) : null;
}
function hasRollableDice(desc: string): boolean {
  const parsed = parseExpression(desc);
  return !!parsed && parsed.terms.length > 0;
}
function actionDiceLabel(desc: string): string {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return "";
  const diceStr = parsed.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = parsed.modifier;
  return diceStr + (mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : "");
}

function rollAttack(attackBonus: number, actionName: string) {
  const result = rollDice({ 20: 1 }, attackBonus);
  const label = `${actionName} Attack`;
  lastRoll.value = { label, total: result.total };
  void sendRoll({ ...result, label }, null, member.value?.name);
}

function rollActionDamage(desc: string, actionName: string) {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return;
  const { total, breakdown } = rollParsed(parsed);
  const label = `${actionName} (${actionDiceLabel(desc)})`;
  lastRoll.value = { label, total };
  void sendRoll({ total, label, modifier: parsed.modifier, breakdown, isCrit: false, isFumble: false }, null, member.value?.name);
}

const lightboxScores = computed(() => {
  const s = lightbox.value?.monster?.stat_block;
  return { str: s?.str ?? 10, dex: s?.dex ?? 10, con: s?.con ?? 10, int: s?.int ?? 10, wis: s?.wis ?? 10, cha: s?.cha ?? 10 };
});

const lightboxTraitSections = computed(() => {
  const sb = lightbox.value?.monster?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions",           traits: sb.actions },
    { label: "Bonus Actions",     traits: sb.bonus_actions },
    { label: "Reactions",         traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ].filter((s) => s.traits?.length);
});

// ── Shared helpers ────────────────────────────────────────────────────────────
function crColor(cr: string): string {
  const n = parseCr(cr);
  if (n <= 0.5) return "#22c55e";
  if (n <= 4)   return "#eab308";
  if (n <= 9)   return "#f97316";
  if (n <= 15)  return "#dc2626";
  return "#7c3aed";
}
</script>
