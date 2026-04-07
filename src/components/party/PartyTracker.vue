<template>
  <div>
    <!-- Action bar -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
        @click="rollAllInitiative"
      >
        <Dices class="h-3.5 w-3.5 text-primary" />
        Roll All Initiative
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-card border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        @click="clearInitiative"
      >
        <RotateCcw class="h-3.5 w-3.5" />
        Clear Initiative
      </button>
    </div>

    <!-- Loading / Empty -->
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!party?.length"
      title="No heroes in your party"
      description="Add your players' characters to track their HP, initiative, and passive skills."
    >
      <template #action>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
          @click="openForm(null)"
        >
          Add first hero
        </button>
      </template>
    </EmptyState>

    <!-- Party cards -->
    <div v-else class="flex flex-col gap-3">
      <div
        v-for="member in sortedMembers"
        :key="member.id"
        class="rounded-lg border bg-card transition-colors"
        :class="
          member.current_hp <= 0 ? 'border-destructive/50' : 'border-border'
        "
      >
        <div class="flex flex-col md:flex-row">
          <!-- Left: identity -->
          <div class="flex flex-col md:w-44 md:border-r md:border-border shrink-0 overflow-hidden">
            <!-- Top half: portrait -->
            <div class="h-31.25 bg-muted overflow-hidden">
              <FocalImage
                v-if="member.portrait_url"
                :src="member.portrait_url"
                :alt="member.name"
                format="landscape"
                :focal-point="member.portrait_focal_point ?? null"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="font-cinzel text-3xl text-muted-foreground/30 font-bold select-none">
                  {{ member.name.charAt(0) }}
                </span>
              </div>
            </div>

            <!-- Bottom half: name + info -->
            <div class="flex flex-col gap-0.5 px-3 py-2.5">
              <div class="flex items-center gap-1">
                <RouterLink
                  :to="`/party/${member.id}`"
                  class="font-cinzel text-sm font-bold text-foreground leading-tight hover:text-primary transition-colors flex-1"
                >
                  {{ member.name }}
                </RouterLink>
                <button
                  type="button"
                  class="md:hidden w-6 h-6 flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                  title="Edit character"
                  @click="openForm(member)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
              </div>
              <p class="font-fell text-xs text-muted-foreground italic">
                {{
                  [
                    member.race,
                    member.class,
                    member.level ? `Lv${member.level}` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }}
              </p>
              <p v-if="member.player_name" class="font-fell text-[11px] text-muted-foreground">
                {{ member.player_name }}
              </p>
              <RouterLink
                v-if="member.current_location_id"
                :to="`/locations/${member.current_location_id}`"
                class="inline-flex items-center gap-0.5 font-cinzel text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <MapPin class="h-2.5 w-2.5 shrink-0" />
                {{ locationNameMap.get(member.current_location_id) ?? '…' }}
              </RouterLink>
              <span
                v-else
                class="inline-flex items-center gap-0.5 font-cinzel text-[10px] text-muted-foreground/40 italic"
              >
                <MapPin class="h-2.5 w-2.5 shrink-0" />
                Location unknown
              </span>
            </div>
          </div>

          <!-- Middle: HP + stats -->
          <div class="flex-1 p-4 flex flex-col gap-3">
            <!-- HP section -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider flex-1">
                  HP
                  <span
                    class="ml-2 text-sm font-bold"
                    :class="hpColor(member.current_hp, member.max_hp)"
                    >{{ member.current_hp }}</span
                  >
                  <span class="text-muted-foreground font-normal">
                    / {{ member.max_hp }}</span
                  >
                  <span
                    v-if="member.temp_hp > 0"
                    class="ml-1 text-blue-400 font-bold"
                    >+{{ member.temp_hp }} tmp</span
                  >
                </span>
                <button
                  type="button"
                  :class="[
                    'w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0',
                    member.inspiration
                      ? 'bg-yellow-400/20 text-yellow-400'
                      : 'text-muted-foreground/40 hover:text-yellow-400',
                  ]"
                  title="Toggle inspiration"
                  @click="toggleInspiration(member)"
                >
                  <Sparkles class="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  class="hidden md:flex w-7 h-7 rounded-full items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
                  title="Edit character"
                  @click="openForm(member)"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
              </div>

              <!-- HP bar -->
              <div class="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="hpBarColor(member.current_hp, member.max_hp)"
                  :style="{
                    width: `${Math.max(0, Math.min(100, (member.current_hp / member.max_hp) * 100))}%`,
                  }"
                />
              </div>

              <!-- HP controls -->
              <div class="flex items-center gap-2">
                <input
                  :id="`hp-input-${member.id}`"
                  v-model.number="hpInputs[member.id]"
                  type="number"
                  min="0"
                  placeholder="Amt"
                  class="w-16 bg-muted border border-border rounded px-2 py-1 font-fell text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-destructive/10 border border-destructive/30 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                  @click="dealDamage(member)"
                >
                  Damage
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-green-500/10 border border-green-500/30 font-cinzel text-xs font-semibold text-green-500 hover:bg-green-500/20 transition-colors"
                  @click="heal(member)"
                >
                  Heal
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 font-cinzel text-xs font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
                  @click="addTemp(member)"
                >
                  +Temp
                </button>
              </div>
            </div>

            <!-- Key stats grid -->
            <div
              class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-0.5 font-cinzel text-xs"
            >
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">AC</span>
                <span class="font-bold text-foreground shrink-0">{{
                  member.ac
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Speed</span>
                <span class="font-bold text-foreground shrink-0"
                  >{{ member.speed }} ft</span
                >
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Perception</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passivePerception(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Insight</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passiveInsight(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate"
                  >Investigation</span
                >
                <span class="font-bold text-foreground shrink-0">{{
                  passiveInvestigation(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Arcana</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passiveArcana(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">History</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passiveHistory(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Nature</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passiveNature(member)
                }}</span>
              </span>
              <span class="flex items-baseline justify-between gap-1 min-w-0">
                <span class="text-muted-foreground truncate">Religion</span>
                <span class="font-bold text-foreground shrink-0">{{
                  passiveReligion(member)
                }}</span>
              </span>
            </div>

            <!-- Saving throw proficiencies -->
            <div
              v-if="member.saving_throw_proficiencies.length"
              class="flex flex-wrap gap-1"
            >
              <span
                class="font-cinzel text-[10px] text-muted-foreground mr-1 self-center"
                >SAVES:</span
              >
              <span
                v-for="save in member.saving_throw_proficiencies"
                :key="save"
                class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-foreground font-semibold uppercase tracking-wider"
              >
                {{ save }}
              </span>
            </div>

            <!-- Conditions + Curses -->
            <div class="flex flex-wrap items-center gap-1.5">
              <!-- Regular conditions -->
              <span
                v-for="cond in member.conditions"
                :key="cond"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 font-cinzel text-[10px] font-semibold text-destructive"
              >
                {{ cond }}
                <button
                  type="button"
                  class="hover:text-destructive/60 transition-colors"
                  @click="removeCondition(member, cond)"
                >
                  ×
                </button>
              </span>

              <!-- Curse badges -->
              <span
                v-for="curse in member.curses"
                :key="curse"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 font-cinzel text-[10px] font-semibold text-violet-400"
              >
                Cursed: {{ curse }}
                <button
                  type="button"
                  class="hover:text-violet-400/60 transition-colors"
                  @click="removeCurse(member, curse)"
                >
                  ×
                </button>
              </span>

              <!-- Inline curse name input -->
              <template v-if="curseInputOpen[member.id]">
                <input
                  :ref="(el) => { if (el) curseInputRefs[member.id] = el as HTMLInputElement }"
                  v-model="curseInputText[member.id]"
                  placeholder="Curse name…"
                  class="px-2 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/10 font-cinzel text-[10px] text-violet-400 placeholder:text-violet-400/40 focus:outline-none w-32"
                  @keydown.enter.prevent="addCurse(member)"
                  @keydown.escape="curseInputOpen[member.id] = false"
                />
                <button
                  type="button"
                  class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-violet-500/50 font-cinzel text-[10px] text-violet-400 hover:bg-violet-500/20 transition-colors"
                  @click="addCurse(member)"
                >
                  Add
                </button>
              </template>

              <!-- Add condition dropdown -->
              <div class="relative">
                <button
                  type="button"
                  class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/40 font-cinzel text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  @click="toggleConditionDropdown(member, $event)"
                >
                  <Plus class="h-2.5 w-2.5" /> Condition
                </button>
                <div
                  v-if="conditionOpen[member.id]"
                  class="fixed inset-0 z-10"
                  @click="conditionOpen[member.id] = false"
                />
                <div
                  v-if="conditionOpen[member.id]"
                  class="absolute left-0 z-20 w-48 rounded-lg border border-border bg-card shadow-lg p-1"
                  :class="conditionOpenUp[member.id] ? 'bottom-full mb-1' : 'top-full mt-1'"
                >
                  <button
                    v-for="cond in availableConditions(member)"
                    :key="cond"
                    type="button"
                    class="w-full text-left px-2 py-1 rounded font-cinzel text-[11px] text-foreground hover:bg-muted transition-colors"
                    @click="addCondition(member, cond)"
                  >
                    {{ cond }}
                  </button>
                  <div class="border-t border-border mt-1 pt-1">
                    <button
                      type="button"
                      class="w-full text-left px-2 py-1 rounded font-cinzel text-[11px] text-violet-400 hover:bg-muted transition-colors"
                      @click="openCurseInput(member)"
                    >
                      Cursed…
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Death saves (shown when HP ≤ 0) -->
            <div
              v-if="member.current_hp <= 0"
              class="flex items-center gap-3 p-2 rounded bg-destructive/10 border border-destructive/20"
            >
              <span
                class="font-cinzel text-[10px] font-bold text-destructive tracking-wider"
                >DEATH SAVES</span
              >
              <div class="flex items-center gap-1">
                <span class="font-cinzel text-[10px] text-green-500">✓</span>
                <div class="flex gap-1">
                  <button
                    v-for="i in 3"
                    :key="`s${i}`"
                    type="button"
                    class="w-4 h-4 rounded-full border transition-colors"
                    :class="
                      i <= member.death_save_successes
                        ? 'bg-green-500 border-green-500'
                        : 'border-muted-foreground/40'
                    "
                    @click="toggleDeathSave(member, 'success')"
                  />
                </div>
              </div>
              <div class="flex items-center gap-1">
                <span class="font-cinzel text-[10px] text-destructive">✗</span>
                <div class="flex gap-1">
                  <button
                    v-for="i in 3"
                    :key="`f${i}`"
                    type="button"
                    class="w-4 h-4 rounded-full border transition-colors"
                    :class="
                      i <= member.death_save_failures
                        ? 'bg-destructive border-destructive'
                        : 'border-muted-foreground/40'
                    "
                    @click="toggleDeathSave(member, 'failure')"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Companions for this member -->
        <div v-if="companionsFor(member.id).length" class="border-t border-border bg-muted/10 px-4 py-3 flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Companions</span>
            <button
              type="button"
              class="font-cinzel text-[10px] text-primary hover:opacity-80 transition-opacity"
              @click="openCompanionForm(null, member.id)"
            >
              + Add
            </button>
          </div>
          <CompanionCard
            v-for="comp in companionsFor(member.id)"
            :key="comp.id"
            :companion="comp"
            :source-name="companionSourceName(comp)"
            :source-link="companionSourceLink(comp)"
            @edit="openCompanionForm($event)"
            @delete="deleteCompanion($event)"
          />
        </div>
        <div v-else class="border-t border-border bg-muted/10 px-4 py-2 flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground italic">No companions</span>
          <button
            type="button"
            class="font-cinzel text-[10px] text-muted-foreground hover:text-primary transition-colors"
            @click="openCompanionForm(null, member.id)"
          >
            + Add Companion
          </button>
        </div>
      </div>
    </div>

    <!-- Unowned companions section -->
    <div v-if="unownedCompanions.length" class="mt-4 rounded-lg border border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Unassigned Companions</span>
        <button
          type="button"
          class="font-cinzel text-[10px] text-primary hover:opacity-80 transition-opacity"
          @click="openCompanionForm(null)"
        >
          + Add
        </button>
      </div>
      <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CompanionCard
          v-for="comp in unownedCompanions"
          :key="comp.id"
          :companion="comp"
          :source-name="companionSourceName(comp)"
          :source-link="companionSourceLink(comp)"
          @edit="openCompanionForm($event)"
          @delete="deleteCompanion($event)"
        />
      </div>
    </div>

    <!-- Party Inventory -->
    <div class="mt-6 rounded-lg border border-border bg-card">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/20">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1.5">
          <Backpack class="h-3.5 w-3.5" /> Party Inventory
        </span>
        <button
          type="button"
          class="font-cinzel text-[10px] text-primary hover:opacity-80 transition-opacity"
          @click="openAddItem"
        >+ Add Item</button>
      </div>

      <!-- Item list -->
      <div v-if="inventory?.length" class="divide-y divide-border">
        <div
          v-for="item in inventory"
          :key="item.id"
          class="flex items-center gap-3 px-4 py-2.5 group"
        >
          <!-- Name + notes -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <!-- Rarity dot for linked catalog items -->
              <span
                v-if="item.item_id && catalogItemMap.get(item.item_id)"
                class="shrink-0 w-2 h-2 rounded-full"
                :style="{ backgroundColor: RARITY_COLORS[catalogItemMap.get(item.item_id)!.rarity] }"
                :title="catalogItemMap.get(item.item_id)!.rarity"
              />
              <RouterLink
                v-if="item.item_id"
                :to="`/vault/${item.item_id}`"
                class="font-fell text-sm text-foreground leading-tight truncate hover:text-primary transition-colors"
              >{{ item.name }}</RouterLink>
              <p v-else class="font-fell text-sm text-foreground leading-tight truncate">{{ item.name }}</p>
              <span
                v-if="item.item_id && catalogItemMap.get(item.item_id)"
                class="hidden sm:inline font-cinzel text-[9px] text-muted-foreground/60 shrink-0"
              >{{ ITEM_TYPE_LABELS[catalogItemMap.get(item.item_id)!.item_type] }}</span>
            </div>
            <p v-if="item.notes" class="font-fell text-xs text-muted-foreground italic truncate">{{ item.notes }}</p>
          </div>
          <!-- Qty -->
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" class="count-btn-sm" @click="changeQty(item, -1)">−</button>
            <span class="font-cinzel text-xs font-bold text-foreground w-5 text-center">{{ item.quantity }}</span>
            <button type="button" class="count-btn-sm" @click="changeQty(item, 1)">+</button>
          </div>
          <!-- Carried by -->
          <select
            :value="item.carried_by ?? ''"
            class="hidden sm:block bg-muted/40 border border-border rounded px-2 py-0.5 font-fell text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring shrink-0 max-w-28"
            @change="updateCarrier(item, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">— party</option>
            <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
          </select>
          <!-- Attuned -->
          <button
            type="button"
            class="shrink-0 font-cinzel text-[10px] px-1.5 py-0.5 rounded border transition-colors"
            :class="item.is_attuned
              ? 'border-amber-400/50 bg-amber-400/10 text-amber-400'
              : 'border-border text-muted-foreground/40 hover:text-muted-foreground'"
            title="Toggle attunement"
            @click="toggleAttuned(item)"
          >ATT</button>
          <!-- Drop to chat -->
          <button
            type="button"
            class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-400/10"
            title="Drop to chat"
            @click="dropInventoryItemToChat(item)"
          >
            <ArrowUpFromLine class="h-3.5 w-3.5" />
          </button>
          <!-- Delete -->
          <button
            type="button"
            class="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive"
            @click="removeItem(item.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div v-else-if="!addItemOpen" class="px-4 py-6 text-center">
        <p class="font-fell text-xs text-muted-foreground italic">No items yet. Add loot, equipment, or quest items.</p>
      </div>

      <!-- Inline add row -->
      <form v-if="addItemOpen" class="flex flex-wrap gap-2 px-4 py-3 border-t border-border bg-muted/10" @submit.prevent="submitAddItem">
        <!-- Item name combobox -->
        <div class="relative flex-1 min-w-32">
          <input
            v-model="newItem.name"
            placeholder="Search vault or enter custom name…"
            required
            autocomplete="off"
            class="w-full bg-background border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
            @input="onItemSearchInput"
            @focus="onItemSearchInput"
            @keydown.escape="showItemDropdown = false"
            @keydown.down.prevent="focusDropdownItem(0)"
          />
          <!-- Dropdown suggestions -->
          <div
            v-if="showItemDropdown && (catalogItems?.length ?? 0) > 0"
            class="absolute left-0 bottom-full mb-0.5 z-20 w-full rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto"
          >
            <button
              v-for="(item, idx) in filteredCatalogItems"
              :key="item.id"
              :ref="(el) => { if (el) dropdownItemRefs[idx] = el as HTMLButtonElement }"
              type="button"
              class="w-full text-left px-3 py-1.5 font-fell text-sm text-foreground hover:bg-muted transition-colors flex items-baseline gap-2"
              @click="selectCatalogItem(item)"
              @keydown.down.prevent="focusDropdownItem(idx + 1)"
              @keydown.up.prevent="idx === 0 ? undefined : focusDropdownItem(idx - 1)"
              @keydown.escape="showItemDropdown = false"
            >
              <span class="truncate">{{ item.name }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground shrink-0 capitalize">{{ item.rarity }}</span>
            </button>
            <div v-if="newItem.name.trim()" class="border-t border-border">
              <button
                type="button"
                class="w-full text-left px-3 py-1.5 font-fell text-sm text-primary hover:bg-muted transition-colors flex items-center gap-2"
                @click="router.push({ path: '/vault/new', query: { name: newItem.name.trim(), redirect: '/party' } })"
              >
                <ExternalLink class="h-3.5 w-3.5 shrink-0" />
                Create "{{ newItem.name.trim() }}" in Vault
              </button>
            </div>
          </div>
          <!-- Backdrop to close dropdown -->
          <div
            v-if="showItemDropdown"
            class="fixed inset-0 z-10"
            @click="showItemDropdown = false"
          />
        </div>
        <input
          v-model.number="newItem.quantity"
          type="number"
          min="1"
          placeholder="Qty"
          class="w-14 bg-background border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          v-model="newItem.carried_by"
          class="bg-background border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">— party</option>
          <option v-for="m in party" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
        <input
          v-model="newItem.notes"
          placeholder="Notes (optional)"
          class="flex-1 min-w-32 bg-background border border-border rounded px-2 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div class="flex gap-1.5 ml-auto">
          <button type="button" class="px-3 py-1.5 rounded border border-border font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="addItemOpen = false">Cancel</button>
          <button
            type="button"
            :disabled="!newItem.selectedItemId && !newItem.name.trim()"
            class="px-3 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 font-cinzel text-xs font-semibold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            @click="dropNewItemToChat"
          >Drop in Chat</button>
          <button type="submit" :disabled="addingItem" class="px-3 py-1.5 rounded bg-primary text-primary-foreground font-cinzel text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">Add</button>
        </div>
      </form>
    </div>

    <!-- Member form modal -->
    <PartyMemberForm
      v-if="formOpen"
      :member="editingMember"
      @close="formOpen = false"
    />

    <!-- Companion form modal -->
    <CompanionForm
      v-if="companionFormOpen"
      :companion="editingCompanion ?? undefined"
      :party-members="party ?? []"
      @saved="companionFormOpen = false"
      @cancel="companionFormOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, reactive, nextTick } from "vue";
import { useRouter } from "vue-router";
import { Plus, Dices, RotateCcw, Pencil, Sparkles, Backpack, Trash2, ExternalLink, ArrowUpFromLine, MapPin } from "lucide-vue-next";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import { useAllLocations } from "@/composables/useLocations";
import { usePartyInventory, useAddInventoryItem, useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, RARITY_COLORS } from "@/types/item.types";
import { useCompanions, useDeleteCompanion } from "@/composables/useCompanions";
import { useAllMonsters } from "@/composables/useMonsters";
import { useNpcs } from "@/composables/useNpcs";
import { useCampaignStore } from "@/stores/campaign";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import PartyMemberForm from "./PartyMemberForm.vue";
import CompanionCard from "./CompanionCard.vue";
import CompanionForm from "./CompanionForm.vue";
import { CONDITIONS } from "@/types/party.types";
import type { Companion } from "@/types/companion.types";
import type {
  PartyMember,
  SkillProficiencies,
  SkillProfLevel,
} from "@/types/party.types";

const { data: party, isLoading } = useParty();
const { mutateAsync: updateMember } = useUpdatePartyMember();
const { data: allLocations } = useAllLocations();
const locationNameMap = computed(() => {
  const m = new Map<string, string>();
  for (const l of allLocations.value ?? []) m.set(l.id, l.name);
  return m;
});

// Initiative
const sortedMembers = computed(() => {
  const members = party.value ?? [];
  const allHaveInit =
    members.length > 0 && members.every((m) => m.current_initiative !== null);
  if (allHaveInit) {
    return [...members].sort(
      (a, b) => (b.current_initiative ?? 0) - (a.current_initiative ?? 0),
    );
  }
  return [...members].sort((a, b) => a.sort_order - b.sort_order);
});

function d20() {
  return Math.floor(Math.random() * 20) + 1;
}

async function rollInitiative(member: PartyMember) {
  const roll = d20() + member.initiative_bonus;
  await updateMember({ id: member.id, update: { current_initiative: roll } });
}
async function rollAllInitiative() {
  await Promise.all((party.value ?? []).map((member) => rollInitiative(member)));
}
async function clearInitiative() {
  await Promise.all(
    (party.value ?? []).map((member) =>
      updateMember({ id: member.id, update: { current_initiative: null } }),
    ),
  );
}

// HP tracking
const hpInputs = reactive<Record<string, number>>({});

function getHpAmount(member: PartyMember): number {
  return Math.max(0, hpInputs[member.id] ?? 0);
}

async function dealDamage(member: PartyMember) {
  const amount = getHpAmount(member);
  if (!amount) return;
  let hp = member.current_hp;
  let temp = member.temp_hp;
  // Temp HP absorbs damage first
  if (temp > 0) {
    const absorbed = Math.min(temp, amount);
    temp -= absorbed;
    hp = Math.max(-member.max_hp, hp - (amount - absorbed));
  } else {
    hp = Math.max(-member.max_hp, hp - amount);
  }
  await updateMember({
    id: member.id,
    update: { current_hp: hp, temp_hp: temp },
  });
  hpInputs[member.id] = 0;
}

async function heal(member: PartyMember) {
  const amount = getHpAmount(member);
  if (!amount) return;
  const hp = Math.min(member.max_hp, member.current_hp + amount);
  await updateMember({
    id: member.id,
    update: { current_hp: hp, death_save_successes: 0, death_save_failures: 0 },
  });
  hpInputs[member.id] = 0;
}

async function addTemp(member: PartyMember) {
  const amount = getHpAmount(member);
  if (!amount) return;
  const temp = Math.max(member.temp_hp, amount); // temp HP doesn't stack, take the higher
  await updateMember({ id: member.id, update: { temp_hp: temp } });
  hpInputs[member.id] = 0;
}

// Conditions
const conditionOpen   = reactive<Record<string, boolean>>({});
const conditionOpenUp = reactive<Record<string, boolean>>({});

function toggleConditionDropdown(member: PartyMember, event: MouseEvent) {
  const btn = event.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  // Estimate dropdown height: ~22px per condition + 32px for Cursed section
  const estimated = (availableConditions(member).length * 26) + 40;
  conditionOpenUp[member.id] = rect.bottom + estimated > window.innerHeight;
  conditionOpen[member.id] = !conditionOpen[member.id];
}

function availableConditions(member: PartyMember) {
  return CONDITIONS.filter((c) => !member.conditions.includes(c));
}
async function addCondition(member: PartyMember, condition: string) {
  conditionOpen[member.id] = false;
  await updateMember({
    id: member.id,
    update: { conditions: [...member.conditions, condition] },
  });
}
async function removeCondition(member: PartyMember, condition: string) {
  await updateMember({
    id: member.id,
    update: { conditions: member.conditions.filter((c) => c !== condition) },
  });
}

// Curses
const curseInputOpen = reactive<Record<string, boolean>>({});
const curseInputText = reactive<Record<string, string>>({});
const curseInputRefs = reactive<Record<string, HTMLInputElement>>({});

function openCurseInput(member: PartyMember) {
  conditionOpen[member.id] = false;
  curseInputText[member.id] = "";
  curseInputOpen[member.id] = true;
  nextTick(() => curseInputRefs[member.id]?.focus());
}

async function addCurse(member: PartyMember) {
  const name = (curseInputText[member.id] ?? "").trim();
  if (!name) { curseInputOpen[member.id] = false; return; }
  const curses = [...(member.curses ?? []), name];
  const conditions = member.conditions.includes("Cursed")
    ? member.conditions
    : [...member.conditions, "Cursed"];
  await updateMember({ id: member.id, update: { curses, conditions } });
  curseInputOpen[member.id] = false;
  curseInputText[member.id] = "";
}

async function removeCurse(member: PartyMember, curse: string) {
  const curses = (member.curses ?? []).filter((c) => c !== curse);
  const conditions = curses.length
    ? member.conditions
    : member.conditions.filter((c) => c !== "Cursed");
  await updateMember({ id: member.id, update: { curses, conditions } });
}

// Inspiration
async function toggleInspiration(member: PartyMember) {
  await updateMember({
    id: member.id,
    update: { inspiration: !member.inspiration },
  });
}

// Death saves
async function toggleDeathSave(
  member: PartyMember,
  type: "success" | "failure",
) {
  if (type === "success") {
    const n =
      member.death_save_successes >= 3 ? 0 : member.death_save_successes + 1;
    await updateMember({ id: member.id, update: { death_save_successes: n } });
  } else {
    const n =
      member.death_save_failures >= 3 ? 0 : member.death_save_failures + 1;
    await updateMember({ id: member.id, update: { death_save_failures: n } });
  }
}

// Passive skills
function mod(score: number) {
  return Math.floor((score - 10) / 2);
}
function profAdd(
  profs: SkillProficiencies,
  key: keyof SkillProficiencies,
  profBonus: number,
) {
  const level: SkillProfLevel = profs[key] ?? "none";
  return level === "proficient"
    ? profBonus
    : level === "expertise"
      ? profBonus * 2
      : 0;
}

function passivePerception(m: PartyMember) {
  return (
    10 +
    mod(m.wis) +
    profAdd(m.skill_proficiencies, "perception", m.proficiency_bonus)
  );
}
function passiveInsight(m: PartyMember) {
  return (
    10 +
    mod(m.wis) +
    profAdd(m.skill_proficiencies, "insight", m.proficiency_bonus)
  );
}
function passiveInvestigation(m: PartyMember) {
  return (
    10 +
    mod(m.int) +
    profAdd(m.skill_proficiencies, "investigation", m.proficiency_bonus)
  );
}
function passiveArcana(m: PartyMember) {
  return (
    10 +
    mod(m.int) +
    profAdd(m.skill_proficiencies, "arcana", m.proficiency_bonus)
  );
}
function passiveHistory(m: PartyMember) {
  return (
    10 +
    mod(m.int) +
    profAdd(m.skill_proficiencies, "history", m.proficiency_bonus)
  );
}
function passiveNature(m: PartyMember) {
  return (
    10 +
    mod(m.int) +
    profAdd(m.skill_proficiencies, "nature", m.proficiency_bonus)
  );
}
function passiveReligion(m: PartyMember) {
  return (
    10 +
    mod(m.int) +
    profAdd(m.skill_proficiencies, "religion", m.proficiency_bonus)
  );
}

// HP colour helpers
function hpColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "text-destructive";
  if (pct <= 0.25) return "text-orange-400";
  if (pct <= 0.5) return "text-yellow-400";
  return "text-green-400";
}
function hpBarColor(current: number, max: number) {
  const pct = current / max;
  if (current <= 0) return "bg-destructive";
  if (pct <= 0.25) return "bg-orange-400";
  if (pct <= 0.5) return "bg-yellow-400";
  return "bg-green-500";
}

// Form
const formOpen = ref(false);
const editingMember = ref<PartyMember | null>(null);

function openForm(member: PartyMember | null) {
  editingMember.value = member;
  formOpen.value = true;
}

// Companions
const { data: companions }       = useCompanions();
const { data: allMonsters }      = useAllMonsters();
const { data: allNpcs }          = useNpcs();
const { mutateAsync: deleteComp } = useDeleteCompanion();

const companionFormOpen    = ref(false);
const editingCompanion     = ref<Companion | null>(null);
const companionOwnerPreset = ref<string | null>(null);

function companionsFor(memberId: string): Companion[] {
  return (companions.value ?? []).filter((c) => c.owner_party_member_id === memberId);
}

const unownedCompanions = computed(() =>
  (companions.value ?? []).filter((c) => !c.owner_party_member_id),
);

function companionSourceName(c: Companion): string {
  if (c.source_type === "monster" && c.source_monster_id) {
    return (allMonsters.value ?? []).find((m) => m.id === c.source_monster_id)?.name ?? "";
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

function openCompanionForm(companion: Companion | null, ownerMemberId?: string) {
  editingCompanion.value     = companion;
  companionOwnerPreset.value = ownerMemberId ?? null;
  companionFormOpen.value    = true;
}

async function deleteCompanion(companion: Companion) {
  if (!await confirm(`Remove "${companion.name || "this companion"}"?`)) return;
  await deleteComp(companion.id);
}

const router = useRouter();

// Inventory
const campaign = useCampaignStore();
const { sendItemDrop } = useCampaignMessages();
const { data: inventoryAll } = usePartyInventory();
const inventory = computed(() => (inventoryAll.value ?? []).filter((i) => i.carried_by === null));
const { mutateAsync: addInventoryItem, isPending: addingItem } = useAddInventoryItem();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();

// Item catalog (for combobox + linked item lookup)
const { data: catalogItems } = useItems();
const catalogItemMap = computed(() => {
  const map = new Map<string, Item>();
  for (const item of catalogItems.value ?? []) map.set(item.id, item);
  return map;
});

const addItemOpen = ref(false);
const newItem = reactive({ name: "", quantity: 1, carried_by: "", notes: "", selectedItemId: "", isAttuned: false });

// Combobox state
const showItemDropdown = ref(false);
const dropdownItemRefs = reactive<Record<number, HTMLButtonElement>>({});

const filteredCatalogItems = computed((): Item[] => {
  const q = newItem.name.trim().toLowerCase();
  const all = catalogItems.value ?? [];
  if (!q) return all.slice(0, 8);
  return all.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 8);
});

function onItemSearchInput() {
  newItem.selectedItemId = "";
  showItemDropdown.value = true;
}

function selectCatalogItem(item: Item) {
  newItem.name = item.name;
  newItem.selectedItemId = item.id;
  newItem.isAttuned = item.requires_attunement;
  showItemDropdown.value = false;
}

function focusDropdownItem(idx: number) {
  const el = dropdownItemRefs[idx];
  if (el) el.focus();
}

function openAddItem() {
  newItem.name = ""; newItem.quantity = 1; newItem.carried_by = ""; newItem.notes = "";
  newItem.selectedItemId = ""; newItem.isAttuned = false;
  showItemDropdown.value = false;
  addItemOpen.value = true;
}

async function submitAddItem() {
  const name = newItem.name.trim();
  if (!name) return;
  if (!newItem.selectedItemId) {
    router.push({ path: "/vault/new", query: { name, redirect: "/party" } });
    return;
  }
  await addInventoryItem({
    name,
    quantity: newItem.quantity,
    carried_by: newItem.carried_by || null,
    notes: newItem.notes.trim() || null,
    is_attuned: newItem.isAttuned,
    item_id: newItem.selectedItemId,
    is_equipped: false,
    location: 'backpack',
    slot: null,
    is_container: false,
    container_id: null,
    is_ruined: false,
  });
  if (campaign.activeCampaignId)
    void sendCampaignAnnouncement(campaign.activeCampaignId, `🎒 Item added to inventory: "${name}"`);
  addItemOpen.value = false;
  showItemDropdown.value = false;
}

async function changeQty(item: { id: string; quantity: number }, delta: number) {
  const q = Math.max(1, item.quantity + delta);
  await updateInventoryItem({ id: item.id, update: { quantity: q } });
}

async function updateCarrier(item: { id: string }, value: string) {
  await updateInventoryItem({ id: item.id, update: { carried_by: value || null } });
}

async function toggleAttuned(item: { id: string; is_attuned: boolean }) {
  await updateInventoryItem({ id: item.id, update: { is_attuned: !item.is_attuned } });
}

async function removeItem(id: string) {
  await removeInventoryItem(id);
}

async function dropInventoryItemToChat(item: { id: string; name: string; quantity: number; item_id: string | null }) {
  const linked = item.item_id ? catalogItemMap.value.get(item.item_id) : undefined;
  await sendItemDrop(item.name, item.item_id, item.quantity, linked?.rarity ?? null);
  await removeInventoryItem(item.id);
}

async function dropNewItemToChat() {
  const name = newItem.name.trim();
  if (!name) return;
  const linked = newItem.selectedItemId ? catalogItemMap.value.get(newItem.selectedItemId) : undefined;
  await sendItemDrop(name, newItem.selectedItemId || null, newItem.quantity, linked?.rarity ?? null);
  addItemOpen.value = false;
  showItemDropdown.value = false;
  newItem.name = ''; newItem.quantity = 1; newItem.carried_by = ''; newItem.notes = ''; newItem.selectedItemId = '';
}

defineExpose({ openForm, openCompanionForm });
</script>

<style scoped>
@reference "@/assets/main.css";
.count-btn-sm {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
}
</style>
