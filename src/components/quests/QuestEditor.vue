<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Quest title</span>
        <input
          v-model="title"
          placeholder="Quest title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <select
        v-model="status"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
        :style="{ color: QUEST_STATUS_COLORS[status] }"
      >
        <option v-for="s in QUEST_STATUSES" :key="s" :value="s">
          {{ QUEST_STATUS_LABELS[s] }}
        </option>
      </select>

      <!-- Player visibility toggle -->
      <PlayerVisibilityToggle
        :visible-to="playerVisibleTo"
        @update:visible-to="playerVisibleTo = $event"
      />

      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="onCancel"
      >
        Cancel
      </button>

      <button
        type="button"
        :disabled="saving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <IconSave class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>

      <button
        v-if="!isNew"
        type="button"
        :disabled="sendingToScriptorium"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
        @click="sendToScriptorium"
      >
        <IconPopulate class="h-3.5 w-3.5" />
        {{ sendingToScriptorium ? "Sending…" : "Scriptorium" }}
      </button>

      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Two-column layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left: meta + notes -->
      <div class="lg:col-span-2 flex flex-col gap-4">
        <!-- Summary -->
        <div class="flex flex-col gap-1.5">
          <label
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Summary</label
          >
          <input
            v-model="summary"
            placeholder="A short description of the quest…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Metadata grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <label
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Quest Giver</label
            >
            <EntityCombobox
              v-model="giverNpcId"
              :options="npcs ?? []"
              placeholder="Search NPCs…"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Location</label
            >
            <EntityCombobox
              v-model="locationId"
              :options="locations ?? []"
              placeholder="Search locations…"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Part of Quest</label
            >
            <EntityCombobox
              v-model="parentQuestId"
              :options="parentCandidateOptions"
              placeholder="Search quests…"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
              >Reward Notes</label
            >
            <input
              v-model="rewards"
              placeholder="XP, reputation, favours…"
              class="w-full bg-card border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Currency reward -->
          <div class="flex flex-col gap-1.5 sm:col-span-2">
            <div class="flex items-center justify-between">
              <label
                class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
                >Reward Currency</label
              >
              <button
                v-if="
                  !isNew &&
                  (rewardPp || rewardGp || rewardEp || rewardSp || rewardCp)
                "
                type="button"
                class="inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-amber-400 hover:opacity-80 transition-opacity tracking-wider"
                @click="dropCurrencyToChat"
              >
                <IconCoins class="h-3 w-3" />
                Drop to Chat
              </button>
            </div>
            <div class="grid grid-cols-5 gap-2">
              <div
                v-for="coin in COIN_TYPES"
                :key="coin.key"
                class="flex flex-col gap-0.5"
              >
                <label
                  class="font-cinzel text-[9px] font-semibold tracking-wider text-center"
                  :style="{ color: coin.color }"
                  >{{ coin.label }}</label
                >
                <input
                  v-model.number="coin.model.value"
                  type="number"
                  min="0"
                  class="w-full text-center bg-card border border-border rounded px-1 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Tags -->
        <TagInput v-model="tags" />

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >Description</span
          >
          <RichTextEditor
            v-model="description"
            placeholder="Narrative description, background lore, context…"
            min-height="10rem"
          />
        </div>

        <!-- Notes -->
        <div class="flex flex-col gap-1">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >DM Notes</span
          >
          <RichTextEditor
            v-model="notes"
            placeholder="Session notes, loose threads, reminders…"
            min-height="10rem"
          />
        </div>
      </div>

      <!-- Right: objectives, rewards, sub-quests -->
      <div class="flex flex-col gap-4">
        <!-- Objectives -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Objectives
              <span v-if="objectives?.length" class="font-fell font-normal">
                ({{ doneCount }}/{{ objectives.length }})
              </span>
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="obj in objectives ?? []"
              :key="obj.id"
              class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <button
                type="button"
                class="mt-0.5 shrink-0 h-4 w-4 rounded border flex items-center justify-center transition-colors"
                :class="
                  obj.is_done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-border hover:border-primary'
                "
                @click="toggleObjective(obj)"
              >
                <IconCheck v-if="obj.is_done" class="h-2.5 w-2.5" />
              </button>
              <span
                class="font-fell text-sm flex-1 leading-snug transition-colors"
                :class="
                  obj.is_done
                    ? 'text-muted-foreground line-through'
                    : 'text-foreground'
                "
              >
                {{ obj.description }}
              </span>
              <button
                type="button"
                :title="
                  obj.is_player_visible
                    ? 'Visible to players — click to hide'
                    : 'Hidden from players — click to reveal'
                "
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                :class="
                  obj.is_player_visible
                    ? 'text-elven-green'
                    : 'text-muted-foreground hover:text-foreground'
                "
                @click="toggleObjectiveVisibility(obj)"
              >
                <IconReveal v-if="obj.is_player_visible" class="h-3.5 w-3.5" />
                <IconHide v-else class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeObjective(obj)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>
            <div v-if="!isNew" class="flex items-center gap-2 pt-1">
              <input
                v-model="newObjective"
                placeholder="Add objective…"
                class="flex-1 bg-transparent border-b border-border px-1 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
                @keydown.enter.prevent="addObjective"
              />
              <button
                type="button"
                :disabled="!newObjective.trim()"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addObjective"
              >
                <IconAdd class="h-4 w-4" />
              </button>
            </div>
            <p
              v-else
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              IconSave the quest first, then add objectives.
            </p>
          </div>
        </div>

        <!-- Reward: items + currency pools + art objects (unified loot panel) -->
        <EncounterLoot
          :item-ids="rewardItemIds"
          :all-items="allItems ?? []"
          :currency-pools="rewardCurrencyPools"
          @update:item-ids="rewardItemIds = $event"
          @update:currency-pools="rewardCurrencyPools = $event"
          @drop-pool="
            sendCurrencyDrop(
              $event.pp,
              $event.gp,
              $event.ep,
              $event.sp,
              $event.cp,
              $event.label || undefined,
            )
          "
          @drop-item="handleDropLootItem($event.item, $event.qty)"
        />

        <!-- Rewards: linked encounters -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Linked Encounters
              <span v-if="linkedEncounters.length" class="font-fell font-normal"
                >({{ linkedEncounters.length }})</span
              >
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in linkedEncounters"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <IconEncounter class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/encounters/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ encounterName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                :title="
                  ref.is_player_visible
                    ? 'Visible to players'
                    : 'Hidden from players'
                "
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                :class="
                  ref.is_player_visible
                    ? 'text-elven-green'
                    : 'text-muted-foreground/40'
                "
                @click="toggleRefVisibility(ref)"
              >
                <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
                <IconHide v-else class="h-3.5 w-3.5" />
              </button>
              <button
                v-if="!isNew"
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              v-if="!isNew && availableEncounters.length"
              class="flex items-center gap-2 pt-1"
            >
              <EntityCombobox
                v-model="selectedEncounterId"
                :options="availableEncounters"
                placeholder="Link an encounter…"
              />
              <button
                type="button"
                :disabled="!selectedEncounterId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addEncounterRef"
              >
                <IconAdd class="h-4 w-4" />
              </button>
            </div>
            <p
              v-else-if="isNew"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              IconSave the quest first, then link encounters.
            </p>
            <p
              v-else-if="
                !availableEncounters.length && !linkedEncounters.length
              "
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              No encounters yet.
            </p>
          </div>
        </div>

        <!-- Key NPCs -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Key NPCs
              <span v-if="linkedNpcRefs.length" class="font-fell font-normal"
                >({{ linkedNpcRefs.length }})</span
              >
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in linkedNpcRefs"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <IconUser class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/npcs/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ npcRefName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                :title="
                  ref.is_player_visible
                    ? 'Visible to players'
                    : 'Hidden from players'
                "
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                :class="
                  ref.is_player_visible
                    ? 'text-elven-green'
                    : 'text-muted-foreground/40'
                "
                @click="toggleRefVisibility(ref)"
              >
                <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
                <IconHide v-else class="h-3.5 w-3.5" />
              </button>
              <button
                v-if="!isNew"
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              v-if="!isNew && availableNpcs.length"
              class="flex items-center gap-2 pt-1"
            >
              <EntityCombobox
                v-model="selectedNpcRefId"
                :options="availableNpcs"
                placeholder="Link an NPC…"
              />
              <button
                type="button"
                :disabled="!selectedNpcRefId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addNpcRef"
              >
                <IconAdd class="h-4 w-4" />
              </button>
            </div>
            <p
              v-else-if="isNew"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              IconSave the quest first, then link NPCs.
            </p>
            <p
              v-else-if="!availableNpcs.length && !linkedNpcRefs.length"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              No NPCs yet.
            </p>
          </div>
        </div>

        <!-- Key Locations -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Key Locations
              <span
                v-if="linkedLocationRefs.length"
                class="font-fell font-normal"
                >({{ linkedLocationRefs.length }})</span
              >
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in linkedLocationRefs"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <IconLocation class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/atlas/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ locationRefName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                :title="
                  ref.is_player_visible
                    ? 'Visible to players'
                    : 'Hidden from players'
                "
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                :class="
                  ref.is_player_visible
                    ? 'text-elven-green'
                    : 'text-muted-foreground/40'
                "
                @click="toggleRefVisibility(ref)"
              >
                <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
                <IconHide v-else class="h-3.5 w-3.5" />
              </button>
              <button
                v-if="!isNew"
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              v-if="!isNew && availableLocations.length"
              class="flex items-center gap-2 pt-1"
            >
              <EntityCombobox
                v-model="selectedLocationRefId"
                :options="availableLocations"
                placeholder="Link a location…"
              />
              <button
                type="button"
                :disabled="!selectedLocationRefId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addLocationRef"
              >
                <IconAdd class="h-4 w-4" />
              </button>
            </div>
            <p
              v-else-if="isNew"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              IconSave the quest first, then link locations.
            </p>
            <p
              v-else-if="
                !availableLocations.length && !linkedLocationRefs.length
              "
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              No locations yet.
            </p>
          </div>
        </div>

        <!-- Creatures -->
        <div class="rounded-lg border border-border bg-card overflow-hidden">
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Creatures
              <span
                v-if="linkedMonsterRefs.length"
                class="font-fell font-normal"
                >({{ linkedMonsterRefs.length }})</span
              >
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="ref in linkedMonsterRefs"
              :key="ref.id"
              class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <IconMonster class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <RouterLink
                :to="`/bestiary/${ref.ref_id}`"
                class="font-fell text-sm text-foreground flex-1 truncate hover:text-primary transition-colors"
              >
                {{ monsterRefName(ref.ref_id) }}
              </RouterLink>
              <button
                v-if="!isNew"
                type="button"
                :title="
                  ref.is_player_visible
                    ? 'Visible to players'
                    : 'Hidden from players'
                "
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                :class="
                  ref.is_player_visible
                    ? 'text-elven-green'
                    : 'text-muted-foreground/40'
                "
                @click="toggleRefVisibility(ref)"
              >
                <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
                <IconHide v-else class="h-3.5 w-3.5" />
              </button>
              <button
                v-if="!isNew"
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeRef(ref)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>
            <div
              v-if="!isNew && availableMonsters.length"
              class="flex items-center gap-2 pt-1"
            >
              <EntityCombobox
                v-model="selectedMonsterRefId"
                :options="availableMonsters"
                placeholder="Link a creature…"
              />
              <button
                type="button"
                :disabled="!selectedMonsterRefId"
                class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                @click="addMonsterRef"
              >
                <IconAdd class="h-4 w-4" />
              </button>
            </div>
            <p
              v-else-if="isNew"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              IconSave the quest first, then link creatures.
            </p>
            <p
              v-else-if="!availableMonsters.length && !linkedMonsterRefs.length"
              class="font-fell text-xs text-muted-foreground italic px-2 py-1"
            >
              No monsters in the bestiary yet.
            </p>
          </div>
        </div>

        <!-- Triggers -->
        <div
          v-if="!isNew"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">
              Consequences
              <span v-if="triggers?.length" class="font-fell font-normal">({{ triggers.length }})</span>
            </span>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <div
              v-for="trig in triggers"
              :key="trig.id"
              class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <IconLightning class="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <div class="flex-1 min-w-0">
                <p class="font-fell text-xs text-foreground leading-snug">
                  <span class="font-semibold">{{ trig.trigger_type === 'quest_complete' ? 'Quest complete' : `Objective done` }}</span>
                  <span v-if="trig.objective_id" class="text-muted-foreground"> ({{ objectiveName(trig.objective_id) }})</span>
                  <span class="text-muted-foreground"> + {{ trig.offset_days }}d →</span>
                  {{ triggerActionSummary(trig) }}
                </p>
              </div>
              <button
                type="button"
                class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                @click="removeTrigger(trig)"
              >
                <IconClose class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Add trigger form -->
            <div class="border-t border-border mt-1 pt-2 flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-1.5">
                <select
                  v-model="newTrigger.trigger_type"
                  class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                  @change="newTrigger.objective_id = null"
                >
                  <option value="quest_complete">When quest completes</option>
                  <option value="objective_done">When objective is done</option>
                </select>
                <select
                  v-if="newTrigger.trigger_type === 'objective_done'"
                  v-model="newTrigger.objective_id"
                  class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                >
                  <option :value="null">— pick objective —</option>
                  <option v-for="obj in objectives" :key="obj.id" :value="obj.id">{{ obj.description }}</option>
                </select>
                <div class="flex items-center gap-1 col-span-2">
                  <input
                    v-model.number="newTrigger.offset_days"
                    type="number"
                    min="0"
                    class="w-16 bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span class="font-fell text-xs text-muted-foreground">days later →</span>
                </div>
                <select
                  v-model="newTrigger.action_type"
                  class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                >
                  <option value="create_calendar_event">Create calendar event</option>
                  <option value="send_broadcast">Send broadcast</option>
                </select>
                <template v-if="newTrigger.action_type === 'create_calendar_event'">
                  <input
                    v-model="newTriggerCalTitle"
                    placeholder="Event title…"
                    class="bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                  />
                  <select
                    v-model="newTriggerCalType"
                    class="bg-background border border-border rounded px-2 py-1 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                  >
                    <option v-for="t in CALENDAR_EVENT_TYPES" :key="t" :value="t">{{ t }}</option>
                  </select>
                </template>
                <template v-else>
                  <input
                    v-model="newTriggerMessage"
                    placeholder="Broadcast message…"
                    class="bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring col-span-2"
                  />
                </template>
              </div>
              <button
                type="button"
                :disabled="!canAddTrigger || addingTrigger"
                class="w-full rounded-md border border-dashed border-border px-3 py-1.5 font-cinzel text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors disabled:opacity-40"
                @click="addTrigger"
              >
                <IconAdd class="h-3 w-3 inline mr-1" />
                {{ addingTrigger ? 'Adding…' : 'Add Consequence' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Sub-quests -->
        <div
          v-if="!isNew"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div
            class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20"
          >
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Sub-quests
              <span v-if="subQuests?.length" class="font-fell font-normal"
                >({{ subQuests.length }})</span
              >
            </span>
            <RouterLink
              :to="`/quests/new?parent=${props.quest?.id}`"
              class="inline-flex items-center gap-1 font-cinzel text-[10px] font-semibold text-primary tracking-wider hover:opacity-80 transition-opacity"
            >
              <IconAdd class="h-3 w-3" />
              Add
            </RouterLink>
          </div>
          <div class="p-2 flex flex-col gap-1">
            <p
              v-if="!subQuests?.length"
              class="font-fell text-xs text-muted-foreground italic px-2 py-2"
            >
              No sub-quests yet.
            </p>
            <RouterLink
              v-for="sub in subQuests"
              :key="sub.id"
              :to="`/quests/${sub.id}`"
              class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors group"
            >
              <span
                class="h-2 w-2 rounded-full shrink-0"
                :style="{ backgroundColor: QUEST_STATUS_COLORS[sub.status] }"
              />
              <span class="font-fell text-sm text-foreground flex-1 truncate">{{
                sub.title || "Untitled"
              }}</span>
              <IconChevronRight
                class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0"
              />
            </RouterLink>
          </div>
        </div>
        <!-- Party Notes (shared by players) -->
        <div
          v-if="!isNew && sharedNotes?.length"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <div class="px-3 py-2 border-b border-border bg-muted/20">
            <span
              class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
            >
              Party Notes
              <span class="font-fell font-normal"
                >({{ sharedNotes.length }})</span
              >
            </span>
          </div>
          <div class="divide-y divide-border">
            <div v-for="note in sharedNotes" :key="note.id" class="px-3 py-2.5">
              <RichTextViewer :content="note.content ?? ''" />
              <p
                class="font-cinzel text-[10px] text-muted-foreground/50 tracking-wider mt-1"
              >
                {{ note.updated_at.slice(0, 10) }}
              </p>
            </div>
          </div>
        </div>

        <!-- Calendar Pins -->
        <EntityCalendarSection
          entity-type="quest"
          :entity-id="props.quest?.id ?? null"
          :entity-name="title || 'Untitled Quest'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd, IconCheck, IconChevronRight, IconClose, IconCoins, IconDelete, IconEncounter, IconHide, IconLightning, IconLocation, IconMonster, IconPopulate, IconReveal, IconSave, IconUser } from '@/lib/icons';
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import {
  useCreateQuest,
  useUpdateQuest,
  useDeleteQuest,
  useSubQuests,
  useQuestObjectives,
  useCreateObjective,
  useUpdateObjective,
  useDeleteObjective,
  useQuestRefs,
  useCreateQuestRef,
  useUpdateQuestRef,
  useDeleteQuestRef,
  useAllQuests,
  useQuestTriggers,
  useCreateQuestTrigger,
  useDeleteQuestTrigger,
  scheduleQuestTriggers,
} from "@/composables/useQuests";
import { useEntityNotes } from "@/composables/useEntityNotes";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useAllMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useEncounters } from "@/composables/useEncounters";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatQuestForScriptorium } from "@/lib/scriptoriumImport";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import EncounterLoot from "@/components/encounters/EncounterLoot.vue";
import TagInput from "@/components/common/TagInput.vue";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import {
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
} from "@/types/quest.types";
import type {
  Quest,
  QuestStatus,
  QuestObjective,
  QuestRef,
} from "@/types/quest.types";

const props = defineProps<{
  quest: Quest | null;
  parentId?: string | null;
}>();

const router = useRouter();
const route  = useRoute();

// Cancel strips `?edit=true` to flip back to the sheet; other query params
// (e.g. `?parent=xxx` for nested creates) are preserved.
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}
const isNew = computed(() => !props.quest);

// ── External data ──────────────────────────────────────────────────────────────
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const { data: allMonsters } = useAllMonsters();
const { data: allQuests } = useAllQuests();
const { data: allItems } = useItems();
const { data: allEncounters } = useEncounters();

const parentCandidateOptions = computed(() =>
  (allQuests.value ?? [])
    .filter((q) => q.id !== props.quest?.id)
    .map((q) => ({ id: q.id, name: q.title || "Untitled Quest" })),
);

const questId = computed(() => props.quest?.id ?? "");

const { data: subQuests } = useSubQuests(questId);
const { data: objectives } = useQuestObjectives(questId);
const { data: questRefs } = useQuestRefs(questId);
const { data: triggers } = useQuestTriggers(questId);
const { data: allEntityNotes } = useEntityNotes("quest", questId);
const sharedNotes = computed(() =>
  (allEntityNotes.value ?? []).filter((n) => !n.is_private),
);

const doneCount = computed(
  () => (objectives.value ?? []).filter((o) => o.is_done).length,
);

// ── Refs derived lists ─────────────────────────────────────────────────────────
const linkedEncounters = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "encounter"),
);
const linkedNpcRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "npc"),
);
const linkedLocationRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "location"),
);
const linkedMonsterRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "monster"),
);

const linkedEncounterIds = computed(
  () => new Set(linkedEncounters.value.map((r) => r.ref_id)),
);
const linkedNpcIds = computed(
  () => new Set(linkedNpcRefs.value.map((r) => r.ref_id)),
);
const linkedLocationIds = computed(
  () => new Set(linkedLocationRefs.value.map((r) => r.ref_id)),
);
const linkedMonsterIds = computed(
  () => new Set(linkedMonsterRefs.value.map((r) => r.ref_id)),
);

const availableEncounters = computed(() =>
  (allEncounters.value ?? []).filter(
    (e) => !linkedEncounterIds.value.has(e.id),
  ),
);
const availableNpcs = computed(() =>
  (npcs.value ?? []).filter((n) => !linkedNpcIds.value.has(n.id)),
);
const availableLocations = computed(() =>
  (locations.value ?? []).filter((l) => !linkedLocationIds.value.has(l.id)),
);
const availableMonsters = computed(() =>
  (allMonsters.value ?? []).filter((m) => !linkedMonsterIds.value.has(m.id)),
);

function encounterName(id: string): string {
  return (allEncounters.value ?? []).find((e) => e.id === id)?.name ?? id;
}
function npcRefName(id: string): string {
  return (npcs.value ?? []).find((n) => n.id === id)?.name ?? id;
}
function locationRefName(id: string): string {
  return (locations.value ?? []).find((l) => l.id === id)?.name ?? id;
}
function monsterRefName(id: string): string {
  return (allMonsters.value ?? []).find((m) => m.id === id)?.name ?? id;
}

// ── Form state ─────────────────────────────────────────────────────────────────
const title = ref(props.quest?.title ?? "");
const summary = ref(props.quest?.summary ?? "");
const status = ref<QuestStatus>(props.quest?.status ?? "undiscovered");
const giverNpcId = ref(props.quest?.giver_npc_id ?? "");
const locationId = ref(props.quest?.location_id ?? "");
const parentQuestId = ref(props.quest?.parent_quest_id ?? props.parentId ?? "");
const rewards = ref(props.quest?.rewards ?? "");
const tags = ref<string[]>(props.quest?.tags ? [...props.quest.tags] : []);
const playerVisibleTo = ref<string[]>(props.quest?.player_visible_to ?? []);
const saving = ref(false);
const saveError = ref("");

const newObjective = ref("");
const rewardItemIds = ref<string[]>([...(props.quest?.reward_item_ids ?? [])]);
const selectedEncounterId = ref("");
const selectedNpcRefId = ref("");
const selectedLocationRefId = ref("");
const selectedMonsterRefId = ref("");
const rewardPp = ref(props.quest?.reward_pp ?? 0);
const rewardGp = ref(props.quest?.reward_gp ?? 0);
const rewardEp = ref(props.quest?.reward_ep ?? 0);
const rewardSp = ref(props.quest?.reward_sp ?? 0);
const rewardCp = ref(props.quest?.reward_cp ?? 0);
const rewardCurrencyPools = ref<
  import("@/types/quest.types").RewardCurrencyPool[]
>(props.quest?.reward_currency_pools ?? []);
const sendingToScriptorium = ref(false);

// ── Rich text fields ────────────────────────────────────────────────────────────
const description = ref<string>(props.quest?.description ?? "");
const notes = ref<string>(props.quest?.notes ?? "");

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateQuest();
const { mutateAsync: update } = useUpdateQuest();
const { mutateAsync: del } = useDeleteQuest();
const campaign = useCampaignStore();

// ── Triggers ───────────────────────────────────────────────────────────────────

const CALENDAR_EVENT_TYPES = [
  "quest", "world", "campaign", "discovery", "deadline",
  "player_death", "boss_fight", "npc_death", "travel",
  "encounter", "location", "festival", "session",
] as const;

const { mutateAsync: createTrigger } = useCreateQuestTrigger();
const { mutateAsync: deleteTrigger } = useDeleteQuestTrigger();

const newTrigger = ref<{
  trigger_type: "quest_complete" | "objective_done";
  objective_id: string | null;
  offset_days: number;
  action_type: "create_calendar_event" | "send_broadcast";
}>({ trigger_type: "quest_complete", objective_id: null, offset_days: 0, action_type: "create_calendar_event" });

const newTriggerCalTitle = ref("");
const newTriggerCalType = ref<string>("quest");
const newTriggerMessage = ref("");
const addingTrigger = ref(false);

const canAddTrigger = computed(() => {
  if (newTrigger.value.trigger_type === "objective_done" && !newTrigger.value.objective_id) return false;
  if (newTrigger.value.action_type === "create_calendar_event") return !!newTriggerCalTitle.value.trim();
  return !!newTriggerMessage.value.trim();
});

function objectiveName(objectiveId: string): string {
  return (objectives.value ?? []).find((o) => o.id === objectiveId)?.description ?? objectiveId;
}

function triggerActionSummary(trig: { action_type: string; action_payload: unknown }): string {
  if (trig.action_type === "create_calendar_event") {
    const p = trig.action_payload as { title?: string };
    return `Calendar event: "${p.title ?? ""}"`;
  }
  const p = trig.action_payload as { message?: string };
  return `Broadcast: "${p.message ?? ""}"`;
}

async function addTrigger() {
  if (!props.quest || !canAddTrigger.value) return;
  addingTrigger.value = true;
  try {
    const payload = newTrigger.value.action_type === "create_calendar_event"
      ? { title: newTriggerCalTitle.value.trim(), event_type: newTriggerCalType.value }
      : { message: newTriggerMessage.value.trim() };
    await createTrigger({
      quest_id: props.quest.id,
      objective_id: newTrigger.value.objective_id,
      trigger_type: newTrigger.value.trigger_type,
      offset_days: newTrigger.value.offset_days,
      action_type: newTrigger.value.action_type,
      action_payload: payload,
    });
    newTriggerCalTitle.value = "";
    newTriggerMessage.value = "";
  } finally {
    addingTrigger.value = false;
  }
}

async function removeTrigger(trig: { id: string }) {
  if (!props.quest) return;
  await deleteTrigger({ id: trig.id, questId: props.quest.id });
}

function buildPayload() {
  return {
    title: title.value.trim() || "Untitled Quest",
    summary: summary.value.trim() || null,
    status: status.value,
    giver_npc_id: giverNpcId.value || null,
    location_id: locationId.value || null,
    parent_quest_id: parentQuestId.value || null,
    rewards: rewards.value.trim() || null,
    reward_pp: rewardPp.value,
    reward_gp: rewardGp.value,
    reward_ep: rewardEp.value,
    reward_sp: rewardSp.value,
    reward_cp: rewardCp.value,
    reward_item_ids: rewardItemIds.value,
    reward_currency_pools: rewardCurrencyPools.value,
    tags: tags.value,
    description: description.value || null,
    notes: notes.value || null,
    player_visible_to: playerVisibleTo.value,
    started_at: props.quest?.started_at ?? null,
    resolved_at: props.quest?.resolved_at ?? null,
  };
}

async function autoSave() {
  if (!props.quest) return;
  await update({ id: props.quest.id, update: buildPayload() });
}

async function handleDropLootItem(
  item: import("@/types/item.types").Item,
  qty: number,
) {
  await sendItemDrop(item.name, item.id, qty, item.rarity ?? null);
  rewardItemIds.value = rewardItemIds.value.filter((id) => id !== item.id);
  await autoSave();
}

async function save() {
  if (!title.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  const justShared =
    playerVisibleTo.value.length > 0 && !(props.quest?.player_visible_to?.length ?? 0);
  try {
    if (props.quest) {
      const wasCompleted = props.quest.status === "completed";
      await update({ id: props.quest.id, update: buildPayload() });
      if (!wasCompleted && status.value === "completed" && campaign.activeCampaignId) {
        void scheduleQuestTriggers(
          props.quest.id, "quest_complete", null,
          { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
          campaign.activeCampaignId,
        );
      }
      if (justShared && campaign.activeCampaignId)
        void sendCampaignAnnouncement(
          campaign.activeCampaignId,
          `📋 Quest shared: "${title.value.trim()}"`,
        );
      router.push("/quests");
    } else {
      const created = await create(buildPayload());
      if (playerVisibleTo.value.length > 0 && campaign.activeCampaignId)
        void sendCampaignAnnouncement(
          campaign.activeCampaignId,
          `📋 Quest shared: "${created.title}"`,
        );
      router.push(`/quests/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.quest) return;
  if (!(await confirm(`Delete "${props.quest.title || "this quest"}"?`)))
    return;
  await del(props.quest.id);
  router.push("/quests");
}

// ── Scriptorium ────────────────────────────────────────────────────────────────
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument();

async function sendToScriptorium() {
  if (!props.quest) return;
  sendingToScriptorium.value = true;
  try {
    const giverName =
      (npcs.value ?? []).find((n) => n.id === props.quest!.giver_npc_id)
        ?.name ?? null;
    const locName =
      (locations.value ?? []).find((l) => l.id === props.quest!.location_id)
        ?.name ?? null;
    const importData = formatQuestForScriptorium(
      props.quest,
      objectives.value ?? [],
      giverName,
      locName,
    );
    const doc = await createScriptoriumDoc(importData);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    sendingToScriptorium.value = false;
  }
}

// ── Objectives ─────────────────────────────────────────────────────────────────
const { mutateAsync: createObj } = useCreateObjective();
const { mutateAsync: updateObj } = useUpdateObjective();
const { mutateAsync: deleteObj } = useDeleteObjective();

async function addObjective() {
  if (!newObjective.value.trim() || !props.quest) return;
  await createObj({
    quest_id: props.quest.id,
    description: newObjective.value.trim(),
    is_done: false,
    sort_order: objectives.value?.length ?? 0,
    is_player_visible: false,
  });
  newObjective.value = "";
}

async function toggleObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await updateObj({
    id: obj.id,
    questId: props.quest.id,
    update: { is_done: !obj.is_done },
  });
}

async function toggleObjectiveVisibility(obj: QuestObjective) {
  if (!props.quest) return;
  await updateObj({
    id: obj.id,
    questId: props.quest.id,
    update: { is_player_visible: !obj.is_player_visible },
  });
}

async function removeObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await deleteObj({ id: obj.id, questId: props.quest.id });
}

// ── Quest refs ─────────────────────────────────────────────────────────────────
const { mutateAsync: createRef } = useCreateQuestRef();
const { mutateAsync: updateQuestRef } = useUpdateQuestRef();
const { mutateAsync: deleteRef } = useDeleteQuestRef();
const { sendCurrencyDrop, sendItemDrop } = useCampaignMessages();

async function toggleRefVisibility(ref: QuestRef) {
  if (!props.quest) return;
  await updateQuestRef({
    id: ref.id,
    questId: props.quest.id,
    update: { is_player_visible: !ref.is_player_visible },
  });
}

async function dropCurrencyToChat() {
  await sendCurrencyDrop(
    rewardPp.value,
    rewardGp.value,
    rewardEp.value,
    rewardSp.value,
    rewardCp.value,
  );
}

const COIN_TYPES = [
  { key: "pp", label: "PP", color: "#a855f7", model: rewardPp },
  { key: "gp", label: "GP", color: "#f59e0b", model: rewardGp },
  { key: "ep", label: "EP", color: "#60a5fa", model: rewardEp },
  { key: "sp", label: "SP", color: "#9ca3af", model: rewardSp },
  { key: "cp", label: "CP", color: "#b45309", model: rewardCp },
];

async function addEncounterRef() {
  if (!selectedEncounterId.value || !props.quest) return;
  await createRef({
    quest_id: props.quest.id,
    ref_type: "encounter",
    ref_id: selectedEncounterId.value,
  });
  selectedEncounterId.value = "";
}

async function addNpcRef() {
  if (!selectedNpcRefId.value || !props.quest) return;
  await createRef({
    quest_id: props.quest.id,
    ref_type: "npc",
    ref_id: selectedNpcRefId.value,
  });
  selectedNpcRefId.value = "";
}

async function addLocationRef() {
  if (!selectedLocationRefId.value || !props.quest) return;
  await createRef({
    quest_id: props.quest.id,
    ref_type: "location",
    ref_id: selectedLocationRefId.value,
  });
  selectedLocationRefId.value = "";
}

async function addMonsterRef() {
  if (!selectedMonsterRefId.value || !props.quest) return;
  await createRef({
    quest_id: props.quest.id,
    ref_type: "monster",
    ref_id: selectedMonsterRefId.value,
  });
  selectedMonsterRefId.value = "";
}

async function removeRef(ref: QuestRef) {
  if (!props.quest) return;
  await deleteRef({ id: ref.id, questId: props.quest.id });
}
</script>
