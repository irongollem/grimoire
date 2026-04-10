<template>
  <div v-if="selectedCombatant || selectedTrap" class="detail-panel">
    <div class="detail-header">
      <span class="detail-name">{{ selectedCombatant?.name ?? selectedTrap?.name }}</span>
      <button class="detail-close" @click="emit('close')">×</button>
    </div>

    <!-- Combatant detail (roll banner, modes, stat block) -->
    <template v-if="selectedCombatant">

    <!-- Roll result banner -->
    <Transition name="roll-fade">
      <div v-if="lastCheck" class="roll-result-banner" :class="rollResultClass">
        <div class="roll-result-total">{{ lastCheck.total }}</div>
        <div class="roll-result-info">
          <span class="roll-result-label">{{ lastCheck.label }}</span>
          <span class="roll-result-breakdown">
            <span class="roll-die" :class="{ 'roll-die-drop': lastCheck.dropped !== undefined }">{{ lastCheck.d20 }}</span>
            <span v-if="lastCheck.dropped !== undefined" class="roll-die roll-die-drop">{{ lastCheck.dropped }}</span>
            <span v-if="lastCheck.modifier !== 0" class="roll-mod">{{ lastCheck.modifier >= 0 ? '+' : '' }}{{ lastCheck.modifier }}</span>
          </span>
        </div>
      </div>
    </Transition>

    <!-- Roll mode toggle -->
    <div class="roll-mode-bar">
      <button
        v-for="m in ROLL_MODES"
        :key="m.value"
        type="button"
        class="roll-mode-btn"
        :class="{ 'roll-mode-active': rollMode === m.value, [m.cls]: rollMode === m.value }"
        @click="rollMode = m.value"
      >{{ m.label }}</button>
    </div>

    <!-- Chat mode toggle -->
    <div class="chat-mode-bar">
      <button
        v-for="m in CHAT_MODES"
        :key="m.value"
        type="button"
        class="chat-mode-btn"
        :class="{ 'chat-mode-active': chatMode === m.value, [m.cls]: chatMode === m.value }"
        :title="m.title"
        @click="chatMode = m.value"
      >{{ m.label }}</button>
    </div>

    <!-- Monster -->
    <template v-if="selectedCombatant.type === 'monster' && selectedMonster">
      <div class="detail-scroll">
        <FocalImage
          v-if="selectedCombatant.portrait_url"
          :src="selectedCombatant.portrait_url"
          :alt="selectedCombatant.name"
          :focal-point="selectedCombatant.portrait_focal_point ?? null"
          format="portrait"
          class="detail-portrait"
        />
        <p class="detail-meta">
          {{ selectedMonster.size }} {{ selectedMonster.monster_type
          }}<span v-if="selectedMonster.alignment"> · {{ selectedMonster.alignment }}</span>
        </p>
        <div class="detail-divider" />
        <div class="detail-stats">
          <div class="detail-stat"><span>AC</span><strong>{{ selectedMonster.stat_block?.armor_class }}</strong></div>
          <div class="detail-stat"><span>HP</span><strong>{{ selectedMonster.stat_block?.hit_points }}</strong></div>
          <div class="detail-stat"><span>Speed</span><strong>{{ selectedMonster.stat_block?.speed }}</strong></div>
          <div class="detail-stat"><span>CR</span><strong>{{ selectedMonster.stat_block?.challenge_rating }}</strong></div>
        </div>
        <div class="detail-divider" />
        <AbilityScoreTable
          :scores="monsterScoresForBlock"
          :saves="monsterSavesForBlock"
          :rounded="false"
          @roll-ability="(_, label, mod) => performCheck(mod, label + ' Check')"
          @roll-save="(_, label, bonus) => performCheck(bonus, label + ' Save')"
        />
        <!-- Monster skills -->
        <template v-if="monsterSkillEntries.length">
          <div class="detail-divider" />
          <p class="detail-section-label">Skills</p>
          <div class="detail-check-grid">
            <button
              v-for="sk in monsterSkillEntries"
              :key="sk.label"
              type="button"
              class="detail-check-btn"
              @click="performCheck(sk.bonus, sk.label)"
            >
              <span>{{ sk.label }}</span>
              <em>{{ sk.bonus >= 0 ? '+' : '' }}{{ sk.bonus }}</em>
            </button>
          </div>
        </template>
        <template v-if="selectedMonster.stat_block?.senses" >
          <div class="detail-divider" />
          <p class="detail-line"><span>Senses</span>{{ selectedMonster.stat_block.senses }}</p>
        </template>
        <p v-if="selectedMonster.stat_block?.languages" class="detail-line"><span>Languages</span>{{ selectedMonster.stat_block.languages }}</p>
        <p v-if="selectedMonster.stat_block?.damage_resistances" class="detail-line"><span>Resistances</span>{{ selectedMonster.stat_block.damage_resistances }}</p>
        <p v-if="selectedMonster.stat_block?.damage_immunities" class="detail-line"><span>Immunities</span>{{ selectedMonster.stat_block.damage_immunities }}</p>
        <p v-if="selectedMonster.stat_block?.condition_immunities" class="detail-line"><span>Cond. Immune</span>{{ selectedMonster.stat_block.condition_immunities }}</p>
        <template v-for="section in traitSections" :key="section.label">
          <template v-if="section.traits?.length">
            <div class="detail-divider" />
            <p class="detail-section-label">{{ section.label }}</p>
            <div v-for="t in section.traits" :key="t.name" class="detail-trait">
              <div class="detail-trait-header">
                <strong>{{ t.name }}.</strong>
                <div class="trait-roll-bar">
                  <button
                    v-if="parseAttackBonus(t.description) !== null"
                    type="button"
                    class="trait-roll-btn trait-atk-btn"
                    @click.stop="rollAttack(parseAttackBonus(t.description) ?? 0, t.name)"
                  >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
                  <button
                    v-if="hasRollableDice(t.description)"
                    type="button"
                    class="trait-roll-btn trait-dmg-btn"
                    @click.stop="rollActionDamage(t.description, t.name)"
                  >🎲 {{ actionDiceLabel(t.description) }}</button>
                </div>
              </div>
              <span class="detail-trait-desc" v-html="renderTraitDesc(t.description)"></span>
            </div>
          </template>
        </template>
        <template v-if="selectedMonster.stat_block?.spellcasting?.entries?.length">
          <div class="detail-divider" />
          <SpellcastingList :spellcasting="selectedMonster.stat_block.spellcasting" />
        </template>
      </div>
    </template>

    <!-- NPC -->
    <template v-else-if="selectedCombatant.type === 'monster' && selectedNpc">
      <div class="detail-scroll">
        <FocalImage
          v-if="selectedCombatant.portrait_url"
          :src="selectedCombatant.portrait_url"
          :alt="selectedCombatant.name"
          :focal-point="selectedCombatant.portrait_focal_point ?? null"
          format="portrait"
          class="detail-portrait"
        />
        <p class="detail-meta">
          {{ [selectedNpc.race, selectedNpc.occupation].filter(Boolean).join(' · ') }}
          <span v-if="selectedNpc.alignment"> · {{ selectedNpc.alignment }}</span>
        </p>
        <template v-if="selectedNpc.stat_block">
          <div class="detail-divider" />
          <div class="detail-stats">
            <div class="detail-stat"><span>AC</span><strong>{{ selectedNpc.stat_block.armor_class }}</strong></div>
            <div class="detail-stat"><span>HP</span><strong>{{ selectedNpc.stat_block.hit_points }}</strong></div>
            <div class="detail-stat" v-if="selectedNpc.stat_block.speed"><span>Speed</span><strong>{{ selectedNpc.stat_block.speed }}</strong></div>
            <div class="detail-stat" v-if="selectedNpc.stat_block.challenge_rating"><span>CR</span><strong>{{ selectedNpc.stat_block.challenge_rating }}</strong></div>
          </div>
          <div class="detail-divider" />
          <AbilityScoreTable
            :scores="{
              str: selectedNpc.stat_block.str ?? 10,
              dex: selectedNpc.stat_block.dex ?? 10,
              con: selectedNpc.stat_block.con ?? 10,
              int: selectedNpc.stat_block.int ?? 10,
              wis: selectedNpc.stat_block.wis ?? 10,
              cha: selectedNpc.stat_block.cha ?? 10,
            }"
            :rounded="false"
            @roll-ability="(_, label, mod) => performCheck(mod, label + ' Check')"
            @roll-save="(_, label, bonus) => performCheck(bonus, label + ' Save')"
          />
          <p v-if="selectedNpc.stat_block.senses" class="detail-line"><span>Senses</span>{{ selectedNpc.stat_block.senses }}</p>
          <p v-if="selectedNpc.stat_block.languages" class="detail-line"><span>Languages</span>{{ selectedNpc.stat_block.languages }}</p>
          <p v-if="selectedNpc.stat_block.damage_resistances" class="detail-line"><span>Resistances</span>{{ selectedNpc.stat_block.damage_resistances }}</p>
          <p v-if="selectedNpc.stat_block.damage_immunities" class="detail-line"><span>Immunities</span>{{ selectedNpc.stat_block.damage_immunities }}</p>
          <p v-if="selectedNpc.stat_block.condition_immunities" class="detail-line"><span>Cond. Immune</span>{{ selectedNpc.stat_block.condition_immunities }}</p>
          <template v-for="section in npcTraitSections" :key="section.label">
            <template v-if="section.traits?.length">
              <div class="detail-divider" />
              <p class="detail-section-label">{{ section.label }}</p>
              <div v-for="t in section.traits" :key="t.name" class="detail-trait">
                <div class="detail-trait-header">
                  <strong>{{ t.name }}.</strong>
                  <div class="trait-roll-bar">
                    <button
                      v-if="parseAttackBonus(t.description) !== null"
                      type="button"
                      class="trait-roll-btn trait-atk-btn"
                      @click.stop="rollAttack(parseAttackBonus(t.description) ?? 0, t.name)"
                    >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
                    <button
                      v-if="hasRollableDice(t.description)"
                      type="button"
                      class="trait-roll-btn trait-dmg-btn"
                      @click.stop="rollActionDamage(t.description, t.name)"
                    >🎲 {{ actionDiceLabel(t.description) }}</button>
                  </div>
                </div>
                <span class="detail-trait-desc" v-html="renderTraitDesc(t.description)"></span>
              </div>
            </template>
          </template>
          <template v-if="selectedNpc.stat_block?.spellcasting?.entries?.length">
            <div class="detail-divider" />
            <SpellcastingList :spellcasting="selectedNpc.stat_block.spellcasting" />
          </template>
        </template>
        <p v-else class="font-fell text-xs text-muted-foreground italic px-1 pt-2">No stat block defined for this NPC.</p>
      </div>
    </template>

    <!-- Companion -->
    <template v-else-if="selectedCombatant.type === 'player' && selectedCompanion">
      <div class="detail-scroll">
        <FocalImage
          v-if="selectedCombatant.portrait_url"
          :src="selectedCombatant.portrait_url"
          :alt="selectedCombatant.name"
          :focal-point="selectedCombatant.portrait_focal_point ?? null"
          format="portrait"
          class="detail-portrait"
        />
        <p class="detail-meta capitalize">{{ selectedCompanion.companion_type?.replace('_', ' ') }}</p>
        <div class="detail-divider" />
        <div class="detail-stats">
          <div class="detail-stat"><span>AC</span><strong>{{ selectedCombatant.ac }}</strong></div>
          <div class="detail-stat"><span>HP</span><strong>{{ selectedCombatant.hp }}/{{ selectedCombatant.max_hp }}</strong></div>
          <div class="detail-stat" v-if="selectedCompanion.stat_block?.speed"><span>Speed</span><strong>{{ selectedCompanion.stat_block.speed }}</strong></div>
        </div>
        <template v-if="selectedCompanion.stat_block">
          <div class="detail-divider" />
          <AbilityScoreTable
            :scores="{
              str: selectedCompanion.stat_block.str ?? 10,
              dex: selectedCompanion.stat_block.dex ?? 10,
              con: selectedCompanion.stat_block.con ?? 10,
              int: selectedCompanion.stat_block.int ?? 10,
              wis: selectedCompanion.stat_block.wis ?? 10,
              cha: selectedCompanion.stat_block.cha ?? 10,
            }"
            :rounded="false"
            @roll-ability="(_, label, mod) => performCheck(mod, label + ' Check')"
            @roll-save="(_, label, bonus) => performCheck(bonus, label + ' Save')"
          />
        </template>
        <template v-for="section in companionTraitSections" :key="section.label">
          <template v-if="section.traits?.length">
            <div class="detail-divider" />
            <p class="detail-section-label">{{ section.label }}</p>
            <div v-for="t in section.traits" :key="t.name" class="detail-trait">
              <div class="detail-trait-header">
                <strong>{{ t.name }}.</strong>
                <div class="trait-roll-bar">
                  <button
                    v-if="parseAttackBonus(t.description) !== null"
                    type="button"
                    class="trait-roll-btn trait-atk-btn"
                    @click.stop="rollAttack(parseAttackBonus(t.description) ?? 0, t.name)"
                  >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
                  <button
                    v-if="hasRollableDice(t.description)"
                    type="button"
                    class="trait-roll-btn trait-dmg-btn"
                    @click.stop="rollActionDamage(t.description, t.name)"
                  >🎲 {{ actionDiceLabel(t.description) }}</button>
                </div>
              </div>
              <span class="detail-trait-desc" v-html="renderTraitDesc(t.description)"></span>
            </div>
          </template>
        </template>
      </div>
    </template>

    <!-- Player -->
    <template v-else-if="selectedCombatant.type === 'player' && selectedMember">
      <div class="detail-scroll">
        <FocalImage
          v-if="selectedCombatant.portrait_url"
          :src="selectedCombatant.portrait_url"
          :alt="selectedCombatant.name"
          :focal-point="selectedCombatant.portrait_focal_point ?? null"
          format="portrait"
          class="detail-portrait"
        />
        <p class="detail-meta">
          {{ [selectedMember.race, selectedMember.class].filter(Boolean).join(' · ') }}
          <span v-if="selectedMember.level"> · Level {{ selectedMember.level }}</span>
        </p>
        <div class="detail-divider" />
        <div class="detail-stats">
          <div class="detail-stat"><span>AC</span><strong>{{ selectedMember.ac }}</strong></div>
          <div class="detail-stat"><span>HP</span><strong>{{ selectedMember.current_hp }}/{{ selectedMember.max_hp }}</strong></div>
          <div class="detail-stat"><span>Speed</span><strong>{{ selectedMember.speed }} ft.</strong></div>
          <div class="detail-stat"><span>Prof</span><strong>+{{ playerProfBonus }}</strong></div>
        </div>
        <div class="detail-divider" />
        <AbilityScoreTable
          :scores="playerScoresForBlock"
          :saves="playerSavesForBlock"
          :rounded="false"
          @roll-ability="(_, label, mod) => performCheck(mod, label + ' Check')"
          @roll-save="(_, label, bonus) => performCheck(bonus, label + ' Save')"
        />
        <!-- Skills -->
        <div class="detail-divider" />
        <p class="detail-section-label">Skills</p>
        <div class="detail-check-grid">
          <button
            v-for="sk in SKILLS"
            :key="sk.key"
            type="button"
            class="detail-check-btn"
            :class="{ 'check-proficient': playerSkillProf(sk.key) !== 'none', 'check-expertise': playerSkillProf(sk.key) === 'expertise' }"
            @click="performCheck(playerSkillBonus(sk.key, sk.ability), sk.label)"
          >
            <span>{{ sk.label }}</span>
            <em>{{ playerSkillBonus(sk.key, sk.ability) >= 0 ? '+' : '' }}{{ playerSkillBonus(sk.key, sk.ability) }}</em>
          </button>
        </div>
        <!-- Melee Attacks -->
        <div class="detail-divider" />
        <p class="detail-section-label">Melee Attacks</p>
        <div v-for="atk in playerMeleeAttacks" :key="atk.name" class="detail-trait">
          <div class="detail-trait-header">
            <strong>{{ atk.name }}.</strong>
            <div class="trait-roll-bar">
              <button
                type="button"
                class="trait-roll-btn trait-atk-btn"
                @click.stop="rollAttack(atk.attackBonus, atk.name)"
              >⚔ {{ atk.attackBonus >= 0 ? '+' : '' }}{{ atk.attackBonus }}</button>
              <button
                v-if="atk.damageDice"
                type="button"
                class="trait-roll-btn trait-dmg-btn"
                @click.stop="rollActionDamage(atk.damageDice, atk.name)"
              >🎲 {{ actionDiceLabel(atk.damageDice) }}</button>
              <span
                v-else-if="atk.damageFixed"
                class="font-cinzel text-[9px] text-muted-foreground whitespace-nowrap self-center"
              >{{ atk.damageFixed }}</span>
            </div>
          </div>
          <span class="detail-trait-desc">{{ atk.description }}</span>
        </div>
        <!-- Curses -->
        <div class="detail-divider" />
        <p class="detail-section-label">Curses</p>
        <div class="flex flex-wrap gap-1 mb-1">
          <span
            v-for="curse in selectedCombatant.curses"
            :key="curse"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/30 font-cinzel text-[9px] text-violet-400 cursor-pointer hover:bg-destructive/20 hover:text-destructive transition-colors"
            title="Click to remove"
            @click="store.removeCurse(selectedCombatant!.instance_id, curse)"
          >{{ curse }} ×</span>
          <span v-if="!selectedCombatant.curses.length" class="font-fell text-xs text-muted-foreground italic">None</span>
        </div>
        <div class="flex items-center gap-1">
          <input
            v-model="curseInput"
            placeholder="Add curse…"
            class="flex-1 bg-transparent border-b border-border px-1 py-0.5 font-fell text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
            @keydown.enter.prevent="store.addCurse(selectedCombatant!.instance_id, curseInput); curseInput = ''"
          />
          <button
            type="button"
            :disabled="!curseInput.trim()"
            class="text-muted-foreground hover:text-violet-400 transition-colors disabled:opacity-40 shrink-0"
            @click="store.addCurse(selectedCombatant!.instance_id, curseInput); curseInput = ''"
          >+</button>
        </div>

        <!-- ── Wildshape ── -->
        <template v-if="isSelectedDruid || selectedCombatant.wildshape">
          <div class="detail-divider" />

          <!-- Active wildshape banner -->
          <template v-if="selectedCombatant.wildshape">
            <div class="wildshape-banner">
              <span class="wildshape-banner-label">🐺 {{ selectedCombatant.wildshape.beast_name }}</span>
              <button
                type="button"
                class="wildshape-revert-btn"
                @click="store.revertWildshape(selectedCombatant!.instance_id)"
              >Revert Form</button>
            </div>
            <template v-if="wildshapeMonster">
              <p class="detail-meta mt-1">{{ wildshapeMonster.size }} {{ wildshapeMonster.monster_type }}</p>
              <div class="detail-stats mt-2">
                <div class="detail-stat"><span>AC</span><strong>{{ wildshapeMonster.stat_block?.armor_class }}</strong></div>
                <div class="detail-stat"><span>Speed</span><strong>{{ wildshapeMonster.stat_block?.speed }}</strong></div>
              </div>
              <div class="detail-divider" />
              <AbilityScoreTable
                :scores="wildshapeScores"
                :saves="wildshapeSaves"
                :rounded="false"
                @roll-ability="(_, label, mod) => performCheck(mod, label + ' Check')"
                @roll-save="(_, label, bonus) => performCheck(bonus, label + ' Save')"
              />
              <template v-for="section in wildshapeTraitSections" :key="section.label">
                <template v-if="section.traits?.length">
                  <div class="detail-divider" />
                  <p class="detail-section-label">{{ section.label }}</p>
                  <div v-for="t in section.traits" :key="t.name" class="detail-trait">
                    <div class="detail-trait-header">
                      <strong>{{ t.name }}.</strong>
                      <div class="trait-roll-bar">
                        <button
                          v-if="parseAttackBonus(t.description) !== null"
                          type="button"
                          class="trait-roll-btn trait-atk-btn"
                          @click.stop="rollAttack(parseAttackBonus(t.description) ?? 0, t.name)"
                        >⚔ {{ (parseAttackBonus(t.description) ?? 0) >= 0 ? '+' : '' }}{{ parseAttackBonus(t.description) ?? 0 }}</button>
                        <button
                          v-if="hasRollableDice(t.description)"
                          type="button"
                          class="trait-roll-btn trait-dmg-btn"
                          @click.stop="rollActionDamage(t.description, t.name)"
                        >🎲 {{ actionDiceLabel(t.description) }}</button>
                      </div>
                    </div>
                    <span class="detail-trait-desc" v-html="renderTraitDesc(t.description)"></span>
                  </div>
                </template>
              </template>
            </template>
          </template>

          <!-- Wildshape picker (Druid only, not currently wildshaped) -->
          <template v-else-if="isSelectedDruid">
            <div class="flex items-center justify-between">
              <p class="detail-section-label">Wildshape</p>
              <div class="flex items-center gap-1.5">
                <span class="font-fell text-[10px] text-muted-foreground">Max CR {{ wildshapeCrDisplay }}</span>
                <span v-if="isSelectedCircleOfMoon" class="font-cinzel text-[9px] tracking-wider px-1 py-0.5 rounded border border-primary/40 text-primary bg-primary/10">MOON</span>
                <button
                  type="button"
                  class="font-cinzel text-[10px] px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                  @click="showWildshapePicker = !showWildshapePicker"
                >{{ showWildshapePicker ? 'Cancel' : '🐺 Choose Form' }}</button>
              </div>
            </div>
            <template v-if="showWildshapePicker">
              <p v-if="!wildshapeForms.length" class="font-fell text-xs text-muted-foreground italic px-1 py-2">
                No eligible beast forms at this level.
              </p>
              <div v-else class="wildshape-picker-list">
                <button
                  v-for="m in wildshapeForms"
                  :key="m.id"
                  type="button"
                  class="wildshape-pick-row"
                  @click="handleWildshape(m)"
                >
                  <span class="pick-name">{{ m.name }}</span>
                  <span class="pick-cr">CR {{ m.stat_block?.challenge_rating }}</span>
                  <span class="pick-ac">AC {{ m.stat_block?.armor_class }}</span>
                  <span class="pick-speed">{{ m.stat_block?.speed }}</span>
                </button>
              </div>
            </template>
          </template>
        </template>

        <template v-if="selectedMember.notes">
          <div class="detail-divider" />
          <p class="detail-notes">{{ selectedMember.notes }}</p>
        </template>

        <!-- Prepared / Known Spells -->
        <template v-if="preparedOrKnownSpells.length">
          <div class="detail-divider" />
          <p class="detail-section-label">{{ selectedCasterType === 'known' ? 'Known Spells' : 'Prepared Spells' }}</p>
          <div v-for="entry in preparedOrKnownSpells" :key="entry.id" class="detail-spell">
            <div class="spell-info">
              <span class="spell-level-badge">{{ entry.spell.level === 0 ? 'C' : entry.spell.level }}</span>
              <span class="spell-name">{{ entry.spell.name }}</span>
            </div>
            <div class="spell-rolls">
              <button
                v-if="entry.spell.damage_rolls?.length"
                type="button"
                class="trait-roll-btn trait-dmg-btn"
                @click.stop="rollSpellDamage(entry.spell)"
              >🎲 {{ entry.spell.damage_rolls[0].dice }}</button>
              <span
                v-if="entry.spell.attack_type === 'save' && playerSpellSaveDc"
                class="spell-save-badge"
              >DC {{ playerSpellSaveDc }} {{ entry.spell.save_attribute }}</span>
            </div>
          </div>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="detail-scroll">
        <p class="detail-empty">No stat block available.</p>
      </div>
    </template>

    </template><!-- end v-if="selectedCombatant" -->

    <!-- Trap detail -->
    <template v-else-if="selectedTrap">
      <div class="detail-scroll">
        <span class="trap-type" :style="{ color: trapTypeColor(selectedTrap.trap_type) }">{{ selectedTrap.trap_type }}</span>
        <span v-if="selectedTrap.trigger_type" class="detail-meta"> · {{ selectedTrap.trigger_type }}</span>

        <!-- Roll result banner (reused) -->
        <Transition name="roll-fade">
          <div v-if="lastCheck" class="roll-result-banner" :class="rollResultClass">
            <div class="roll-result-total">{{ lastCheck.total }}</div>
            <div class="roll-result-info">
              <span class="roll-result-label">{{ lastCheck.label }}</span>
              <span class="roll-result-breakdown">
                <span class="roll-die" :class="{ 'roll-die-drop': lastCheck.dropped !== undefined }">{{ lastCheck.d20 }}</span>
                <span v-if="lastCheck.dropped !== undefined" class="roll-die roll-die-drop">{{ lastCheck.dropped }}</span>
                <span v-if="lastCheck.modifier !== 0" class="roll-mod">{{ lastCheck.modifier >= 0 ? '+' : '' }}{{ lastCheck.modifier }}</span>
              </span>
            </div>
          </div>
        </Transition>

        <div class="detail-divider" />

        <!-- DCs -->
        <div class="detail-stats">
          <div v-if="selectedTrap.detection_dc" class="detail-stat">
            <span>Detect DC</span>
            <strong>{{ selectedTrap.detection_dc }}</strong>
          </div>
          <div v-if="selectedTrap.disarm_dc" class="detail-stat">
            <span>Disarm DC</span>
            <strong>{{ selectedTrap.disarm_dc }}</strong>
          </div>
          <div v-if="selectedTrap.trap_ac" class="detail-stat">
            <span>AC</span>
            <strong>{{ selectedTrap.trap_ac }}</strong>
          </div>
          <div v-if="selectedTrap.trap_hp" class="detail-stat">
            <span>HP</span>
            <strong>{{ selectedTrap.trap_hp }}</strong>
          </div>
        </div>

        <!-- Roll buttons -->
        <div class="detail-divider" />
        <div class="detail-check-grid">
          <button
            v-if="selectedTrap.detection_dc"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, 'Perception (Detection)')"
          >
            <span>Detect</span>
            <em>DC {{ selectedTrap.detection_dc }}</em>
          </button>
          <button
            v-if="selectedTrap.disarm_dc"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, 'Thieves\' Tools (Disarm)')"
          >
            <span>Disarm</span>
            <em>DC {{ selectedTrap.disarm_dc }}</em>
          </button>
          <button
            v-if="selectedTrap.attack_bonus != null"
            type="button"
            class="detail-check-btn trait-atk-btn"
            @click="rollAttack(selectedTrap.attack_bonus!, 'Trap Attack')"
          >
            <span>Attack</span>
            <em>{{ selectedTrap.attack_bonus! >= 0 ? '+' : '' }}{{ selectedTrap.attack_bonus }}</em>
          </button>
          <button
            v-if="selectedTrap.save_dc && selectedTrap.save_type"
            type="button"
            class="detail-check-btn"
            @click="performCheck(0, selectedTrap.save_type + ' Save (Trap)')"
          >
            <span>{{ selectedTrap.save_type }} Save</span>
            <em>DC {{ selectedTrap.save_dc }}</em>
          </button>
        </div>

        <!-- Damage -->
        <template v-if="selectedTrap.damage_entries?.length">
          <div class="detail-divider" />
          <p class="detail-section-label">Damage</p>
          <div class="flex flex-col gap-1 mt-1">
            <div
              v-for="(entry, i) in selectedTrap.damage_entries"
              :key="i"
              class="flex items-center gap-2"
            >
              <span class="font-cinzel text-sm font-bold text-foreground">{{ entry.dice }}</span>
              <span v-if="entry.type" class="font-fell text-xs text-muted-foreground italic capitalize">{{ entry.type }}</span>
              <button
                v-if="hasRollableDice(entry.dice)"
                type="button"
                class="trait-roll-btn trait-dmg-btn ml-auto"
                @click="rollActionDamage(entry.dice, selectedTrap.name)"
              >🎲 {{ actionDiceLabel(entry.dice) }}</button>
            </div>
          </div>
        </template>

        <!-- Effect description -->
        <template v-if="selectedTrap.effect_description">
          <div class="detail-divider" />
          <p class="detail-section-label">Effect</p>
          <p class="detail-trait-desc font-fell text-xs text-muted-foreground leading-relaxed">
            <span v-html="renderTraitDesc(selectedTrap.effect_description)"></span>
          </p>
        </template>

        <!-- Notes -->
        <template v-if="selectedTrap.notes">
          <div class="detail-divider" />
          <p class="detail-notes"><span v-html="renderTraitDesc(selectedTrap.notes)"></span></p>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import FocalImage from "@/components/common/FocalImage.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAllMonsters } from "@/composables/useMonsters";
import type { Monster } from "@/types/monster.types";
import { useParty } from "@/composables/useParty";
import { SKILLS } from "@/types/party.types";
import type { SaveKey } from "@/types/party.types";
import { TRAP_TYPE_COLORS } from "@/types/trap.types";
import { useCampaignStore } from "@/stores/campaign";
import { useDiscoveredKeys } from "@/composables/useDiscoveredMonsters";
import { useDmPinnedForms } from "@/composables/usePinnedForms";
import { useCompanions } from "@/composables/useCompanions";
import { parseExpression, rollDie } from "@/lib/dice";
import type { Spell as SpellType } from "@/types/spell.types";
import { getCasterType } from "@/types/spell.types";
import { useCharacterSpellsWithDetails } from "@/composables/useCharacterSpells";
import { useAuthStore } from "@/stores/auth";
import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

const props = defineProps<{
  selectedId: string | null;
  selectedTrapId: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const store = useEncounterRunStore();
const campaign = useCampaignStore();
const auth = useAuthStore();
const { data: monsters } = useAllMonsters();
const { data: party } = useParty();
const { data: companions } = useCompanions();

const curseInput = ref("");

// ── Trap detail ───────────────────────────────────────────────────────────────

const selectedTrap = computed(() =>
  store.traps.find((t) => t.id === props.selectedTrapId) ?? null,
);

// ── Roll check state ──────────────────────────────────────────────────────────

type CheckMode = "normal" | "advantage" | "disadvantage";
const ROLL_MODES: { value: CheckMode; label: string; cls: string }[] = [
  { value: "disadvantage", label: "DIS", cls: "mode-dis" },
  { value: "normal",       label: "Normal", cls: "mode-normal" },
  { value: "advantage",    label: "ADV", cls: "mode-adv" },
];

type ChatMode = "public" | "silent";
const CHAT_MODES: { value: ChatMode; label: string; cls: string; title: string }[] = [
  { value: "public", label: "📢 Public", cls: "cmode-public", title: "Roll result visible to all in chat" },
  { value: "silent", label: "🔇 Silent", cls: "cmode-silent", title: "Roll not posted to chat" },
];
const chatMode = ref<ChatMode>("public");
const rollMode = ref<CheckMode>("normal");

interface CheckResult {
  total: number;
  label: string;
  modifier: number;
  d20: number;
  dropped?: number;
  isCrit: boolean;
  isFumble: boolean;
}
const lastCheck = ref<CheckResult | null>(null);

const rollResultClass = computed(() => {
  if (!lastCheck.value) return "";
  if (lastCheck.value.isCrit) return "roll-crit";
  if (lastCheck.value.isFumble) return "roll-fumble";
  return "";
});

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

function performCheck(modifier: number, label: string) {
  const r1 = rollD20();
  if (rollMode.value === "normal") {
    lastCheck.value = {
      total: r1 + modifier,
      label,
      modifier,
      d20: r1,
      isCrit: r1 === 20,
      isFumble: r1 === 1,
    };
  } else {
    const r2 = rollD20();
    const keep = rollMode.value === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
    const drop = rollMode.value === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);
    lastCheck.value = {
      total: keep + modifier,
      label,
      modifier,
      d20: keep,
      dropped: drop,
      isCrit: keep === 20,
      isFumble: keep === 1,
    };
  }
}

// ── Action roll helpers ───────────────────────────────────────────────────────

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

async function postRollToChat(
  label: string,
  total: number,
  breakdown: { val: number; dropped: boolean }[],
  modifier: number,
  isCrit: boolean,
  isFumble: boolean,
  senderName: string,
) {
  if (!campaign.activeCampaignId || !auth.user?.id) return;
  if (chatMode.value === "silent") return;

  try {
    await supabase.from("campaign_messages").insert({
      campaign_id: campaign.activeCampaignId,
      user_id: auth.user.id,
      recipient_user_id: null,
      sender_name: senderName,
      message: `rolled ${label} = ${total}`,
      type: "roll",
      metadata: { label, total, breakdown, modifier, isCrit, isFumble },
    });
  } catch {
  }
}

function rollAttack(attackBonus: number, actionName: string) {
  performCheck(attackBonus, actionName + " Attack");
  if (lastCheck.value) {
    const lc = lastCheck.value;
    const breakdown: { val: number; dropped: boolean }[] = [{ val: lc.d20, dropped: false }];
    if (lc.dropped !== undefined) breakdown.push({ val: lc.dropped, dropped: true });
    void postRollToChat(lc.label, lc.total, breakdown, lc.modifier, lc.isCrit, lc.isFumble, selectedCombatant.value?.name ?? "Encounter");
  }
}

function rollActionDamage(desc: string, actionName: string) {
  const parsed = parseExpression(desc);
  if (!parsed || !parsed.terms.length) return;
  const breakdown: { val: number; dropped: boolean }[] = [];
  let total = parsed.modifier;
  for (const term of parsed.terms) {
    for (let i = 0; i < term.count; i++) {
      const val = rollDie(term.sides);
      total += val;
      breakdown.push({ val, dropped: false });
    }
  }
  const label = `${actionName} (${actionDiceLabel(desc)})`;
  lastCheck.value = { total, label, modifier: parsed.modifier, d20: breakdown[0]?.val ?? total, isCrit: false, isFumble: false };
  void postRollToChat(label, total, breakdown, parsed.modifier, false, false, selectedCombatant.value?.name ?? "Encounter");
}

function rollSpellDamage(spell: SpellType) {
  const rolls = spell.damage_rolls;
  if (!rolls?.length) return;
  const breakdown: { val: number; dropped: boolean }[] = [];
  let total = 0;
  for (const roll of rolls) {
    const parsed = parseExpression(roll.dice);
    if (parsed) {
      for (const term of parsed.terms) {
        for (let i = 0; i < term.count; i++) {
          const val = rollDie(term.sides);
          total += val;
          breakdown.push({ val, dropped: false });
        }
      }
      total += parsed.modifier;
    }
  }
  const diceLabel = rolls.map((r) => `${r.dice}${r.type ? " " + r.type : ""}`).join(" + ");
  const label = `${spell.name} (${diceLabel})`;
  lastCheck.value = { total, label, modifier: 0, d20: breakdown[0]?.val ?? total, isCrit: false, isFumble: false };
  void postRollToChat(label, total, breakdown, 0, false, false, selectedMember.value?.name ?? "Player");
}

// ── Combatant selection ───────────────────────────────────────────────────────

const selectedCombatant = computed(() =>
  store.sortedCombatants.find((c) => c.instance_id === props.selectedId) ?? null,
);

const selectedMonster = computed(() => {
  if (!selectedCombatant.value?.monster_id) return null;
  return monsters.value?.find((m) => m.id === selectedCombatant.value!.monster_id) ?? null;
});

const selectedNpc = computed(() => {
  if (!selectedCombatant.value?.npc_id) return null;
  return store.availableNpcs.find((n) => n.id === selectedCombatant.value!.npc_id) ?? null;
});

const selectedMember = computed(() => {
  if (!selectedCombatant.value?.party_member_id) return null;
  return party.value?.find((m) => m.id === selectedCombatant.value!.party_member_id) ?? null;
});

const selectedMemberId = computed(() => selectedMember.value?.id ?? null);
const selectedCompanion = computed(() => {
  const cid = selectedCombatant.value?.companion_id;
  if (!cid) return null;
  return companions.value?.find((c) => c.id === cid) ?? null;
});

const npcTraitSections = computed(() => {
  const sb = selectedNpc.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions",           traits: sb.actions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ].filter((s) => s.traits?.length);
});

const companionTraitSections = computed(() => {
  const sb = selectedCompanion.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions",           traits: sb.actions },
    { label: "Bonus Actions",     traits: sb.bonus_actions },
    { label: "Reactions",         traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ].filter((s) => s.traits?.length);
});

const discoveredKeys = useDiscoveredKeys();
const { data: pinnedForms } = useDmPinnedForms(selectedMemberId);

// ── Proficiency bonus helpers ─────────────────────────────────────────────────

const playerProfBonus = computed(() => {
  const m = selectedMember.value;
  if (!m) return 2;
  if (m.proficiency_bonus) return m.proficiency_bonus;
  const l = m.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9)  return 4;
  if (l >= 5)  return 3;
  return 2;
});

// ── Character spells for selected player ──────────────────────────────────────
const selectedPlayerMemberId = computed(() => selectedMember.value?.id ?? null);
const { data: selectedPlayerSpells } = useCharacterSpellsWithDetails(selectedPlayerMemberId);
const selectedCasterType = computed(() => getCasterType(selectedMember.value?.class ?? null));
const preparedOrKnownSpells = computed(() => {
  const entries = selectedPlayerSpells.value ?? [];
  if (selectedCasterType.value === "none") return [];
  if (selectedCasterType.value === "known") return entries;
  return entries.filter((e) => e.is_prepared || e.spell.level === 0);
});
const playerSpellSaveDc = computed(() => {
  const m = selectedMember.value;
  if (!m) return null;
  const cls = m.class ?? "";
  let spellMod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                              spellMod = abilityMod(m.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls))   spellMod = abilityMod(m.int);
  else                                                                                           spellMod = abilityMod(m.cha);
  return 8 + playerProfBonus.value + spellMod;
});

// ── Player melee attacks (unarmed + improvised) ───────────────────────────────

interface MeleeAttack {
  name: string;
  attackBonus: number;
  damageDice: string | null;
  damageFixed: string | null;
  description: string;
}

const playerMeleeAttacks = computed<MeleeAttack[]>(() => {
  const m = selectedMember.value;
  if (!m) return [];
  const strMod = abilityMod(m.str);
  const dexMod = abilityMod(m.dex);
  const prof = playerProfBonus.value;
  const bestMod = Math.max(strMod, dexMod);
  const unarmedDmg = 1 + strMod;
  const impDice = `1d4${bestMod >= 0 ? "+" : ""}${bestMod}`;
  return [
    {
      name: "Unarmed Strike",
      attackBonus: strMod + prof,
      damageDice: null,
      damageFixed: `${unarmedDmg} bludgeoning`,
      description: `Melee attack. Proficient. Hit: ${unarmedDmg} bludgeoning damage.`,
    },
    {
      name: "Improvised Weapon",
      attackBonus: bestMod,
      damageDice: impDice,
      damageFixed: null,
      description: `Melee or ranged attack. No proficiency bonus. Hit: ${impDice} damage (type varies).`,
    },
  ];
});

// ── Monster derived data ──────────────────────────────────────────────────────

const ABILITY_KEYS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function parseSaveString(s: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) result[m[1].toLowerCase()] = Number(m[2]);
  }
  return result;
}

const monsterScoresForBlock = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  return {
    str: sb?.str ?? 10, dex: sb?.dex ?? 10, con: sb?.con ?? 10,
    int: sb?.int ?? 10, wis: sb?.wis ?? 10, cha: sb?.cha ?? 10,
  };
});

const monsterSavesForBlock = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() => {
  const sb = selectedMonster.value?.stat_block;
  const parsed = sb?.saving_throws ? parseSaveString(sb.saving_throws) : {};
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => {
      const base = abilityMod(sb?.[s.key] ?? 10);
      return [s.key, { bonus: parsed[s.key] ?? base, proficient: s.key in parsed }];
    }),
  );
});

const playerScoresForBlock = computed(() => {
  const m = selectedMember.value;
  return {
    str: m?.str ?? 10, dex: m?.dex ?? 10, con: m?.con ?? 10,
    int: m?.int ?? 10, wis: m?.wis ?? 10, cha: m?.cha ?? 10,
  };
});

const playerSavesForBlock = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() => {
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => [
      s.key,
      { bonus: playerSaveBonus(s.key as SaveKey), proficient: (selectedMember.value?.saving_throw_proficiencies ?? []).includes(s.key) },
    ]),
  );
});

const monsterSkillEntries = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  if (!sb?.skills) return [];
  return Object.entries(sb.skills).map(([key, val]) => ({
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    bonus: Number(val),
  }));
});

const traitSections = computed(() => {
  const sb = selectedMonster.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
    { label: "Lair Actions", traits: sb.lair_actions },
  ];
});

// ── Wildshape ─────────────────────────────────────────────────────────────────

const showWildshapePicker = ref(false);

const isSelectedDruid = computed(() =>
  (selectedMember.value?.['class'] as string | null)?.toLowerCase().includes("druid") ?? false,
);

const isSelectedCircleOfMoon = computed(() =>
  selectedMember.value?.subclass?.toLowerCase().includes("moon") ?? false,
);

function parseCrValue(cr: string | null | undefined): number {
  if (!cr || cr === "0") return 0;
  if (cr.includes("/")) {
    const [n, d] = cr.split("/");
    return Number(n) / Number(d);
  }
  return parseFloat(cr) || 0;
}

const wildshapeMaxCr = computed(() => {
  const level = selectedMember.value?.level ?? 1;
  if (isSelectedCircleOfMoon.value) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);
});

const wildshapeCrDisplay = computed(() => {
  const cr = wildshapeMaxCr.value;
  if (cr === 0.125) return "1/8";
  if (cr === 0.25)  return "1/4";
  if (cr === 0.5)   return "1/2";
  return String(cr);
});

const wildshapeForms = computed<Monster[]>(() => {
  if (!isSelectedDruid.value) return [];
  const level = selectedMember.value?.level ?? 1;
  const maxCr = wildshapeMaxCr.value;
  const dkeys = discoveredKeys.value;
  const pinnedKeys = new Set<string>(
    (pinnedForms.value ?? []).map((p) => p.monster_id ?? p.srd_slug ?? "").filter(Boolean),
  );
  return (monsters.value ?? [])
    .filter((m) => {
      if (!dkeys.has(m.id) && !pinnedKeys.has(m.id)) return false;
      if ((m.monster_type ?? "").toLowerCase() !== "beast") return false;
      if (parseCrValue(m.stat_block?.challenge_rating) > maxCr) return false;
      if (level < 8) {
        const speed = (m.stat_block?.speed ?? "").toLowerCase();
        if (speed.includes("fly") || speed.includes("swim")) return false;
      }
      return true;
    })
    .sort((a, b) => parseCrValue(a.stat_block?.challenge_rating) - parseCrValue(b.stat_block?.challenge_rating));
});

const wildshapeMonster = computed<Monster | null>(() => {
  const ws = selectedCombatant.value?.wildshape;
  if (!ws) return null;
  return monsters.value?.find((m) => m.id === ws.monster_id) ?? null;
});

const wildshapeScores = computed(() => {
  const sb = wildshapeMonster.value?.stat_block;
  return {
    str: sb?.str ?? 10, dex: sb?.dex ?? 10, con: sb?.con ?? 10,
    int: sb?.int ?? 10, wis: sb?.wis ?? 10, cha: sb?.cha ?? 10,
  };
});

const wildshapeSaves = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() => {
  const sb = wildshapeMonster.value?.stat_block;
  const parsed = sb?.saving_throws ? parseSaveString(sb.saving_throws) : {};
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => {
      const base = abilityMod(sb?.[s.key] ?? 10);
      return [s.key, { bonus: parsed[s.key] ?? base, proficient: s.key in parsed }];
    }),
  );
});

const wildshapeTraitSections = computed(() => {
  const sb = wildshapeMonster.value?.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ];
});

function handleWildshape(monster: Monster) {
  if (!selectedCombatant.value) return;
  const sb = monster.stat_block;
  const maxHp = parseInt(String(sb?.hit_points ?? "1").split(" ")[0], 10) || 1;
  const ac = String(sb?.armor_class ?? "10");
  store.enterWildshape(selectedCombatant.value.instance_id, {
    id: monster.id,
    name: monster.name,
    max_hp: maxHp,
    ac,
  });
  showWildshapePicker.value = false;
}

// ── Player derived data ───────────────────────────────────────────────────────

function playerSaveBonus(key: SaveKey): number {
  const m = selectedMember.value;
  if (!m) return 0;
  const base = abilityMod(m[key]);
  const profs: string[] = m.saving_throw_proficiencies ?? [];
  return profs.includes(key) ? base + playerProfBonus.value : base;
}

function playerSkillProf(key: string) {
  return selectedMember.value?.skill_proficiencies?.[key as keyof typeof selectedMember.value.skill_proficiencies] ?? "none";
}

function playerSkillBonus(key: string, ability: SaveKey): number {
  const m = selectedMember.value;
  if (!m) return 0;
  const base = abilityMod(m[ability]);
  const prof = playerSkillProf(key);
  if (prof === "expertise")  return base + playerProfBonus.value * 2;
  if (prof === "proficient") return base + playerProfBonus.value;
  return base;
}

// ── Trap helper ───────────────────────────────────────────────────────────────

function trapTypeColor(trapType: string): string {
  return TRAP_TYPE_COLORS[trapType as keyof typeof TRAP_TYPE_COLORS] ?? "#3D3D3D";
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderTraitDesc(desc: string): string {
  if (!desc) return "";
  try {
    const json = JSON.parse(desc);
    if (json?.type === "doc") return generateHTML(json, [StarterKit]);
  } catch {}
  return desc;
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Detail panel ─────────────────────────────────────────────────────────── */

.detail-panel {
  @apply w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden;
}

@media (max-width: 639px) {
  .detail-panel {
    position: absolute;
    inset: 0;
    width: 100%;
    z-index: 10;
    border-left: none;
  }
}

.detail-header {
  @apply flex items-center justify-between px-3 py-2 border-b border-border shrink-0;
}

.detail-name {
  @apply font-cinzel text-sm font-bold text-foreground truncate;
}

.detail-close {
  @apply text-muted-foreground hover:text-foreground transition-colors text-xl leading-none shrink-0 ml-2;
}

/* Roll result banner */
.roll-result-banner {
  @apply flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/30 shrink-0;
}
.roll-result-total {
  @apply font-cinzel text-2xl font-bold text-foreground min-w-10 text-center;
}
.roll-crit .roll-result-total   { @apply text-amber-500; }
.roll-fumble .roll-result-total { @apply text-destructive; }
.roll-result-info {
  @apply flex flex-col;
}
.roll-result-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase;
}
.roll-result-breakdown {
  @apply flex items-center gap-1 flex-wrap;
}
.roll-die {
  @apply font-cinzel text-xs font-bold text-foreground bg-muted rounded px-1.5 py-0.5;
}
.roll-die-drop {
  @apply line-through opacity-40;
}
.roll-mod {
  @apply font-cinzel text-xs text-primary font-semibold;
}

/* Roll mode bar */
.roll-mode-bar {
  @apply flex border-b border-border shrink-0;
}
.roll-mode-btn {
  @apply flex-1 py-1.5 font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.roll-mode-active { @apply text-foreground; }
.mode-dis.roll-mode-active   { @apply bg-destructive/10 text-destructive; }
.mode-normal.roll-mode-active { @apply bg-muted/50 text-foreground; }
.mode-adv.roll-mode-active   { @apply bg-green-500/10 text-green-600 dark:text-green-400; }

/* Chat mode bar */
.chat-mode-bar {
  @apply flex border-b border-border shrink-0;
}
.chat-mode-btn {
  @apply flex-1 py-1 font-cinzel text-[9px] font-bold tracking-wider text-muted-foreground hover:text-foreground transition-colors;
}
.chat-mode-active { @apply text-foreground; }
.cmode-public.chat-mode-active { @apply bg-primary/10 text-primary; }
.cmode-hidden.chat-mode-active { @apply bg-amber-500/10 text-amber-600 dark:text-amber-400; }
.cmode-silent.chat-mode-active { @apply bg-muted/60 text-muted-foreground; }

.detail-scroll {
  @apply flex-1 overflow-y-auto p-3 flex flex-col gap-2;
}

.detail-portrait {
  @apply w-full rounded-md object-cover mb-1 overflow-hidden;
  max-height: 200px;
}

.detail-meta {
  @apply font-fell text-xs text-muted-foreground italic capitalize;
}

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-stats {
  @apply grid grid-cols-2 gap-1;
}

.detail-stat {
  @apply flex flex-col bg-muted/40 rounded px-2 py-1;
}

.detail-stat span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-abilities {
  @apply grid grid-cols-3 gap-1;
}

.detail-ability {
  @apply flex flex-col items-center bg-muted/40 rounded px-1 py-1.5;
}

.detail-ability span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-ability strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-ability em {
  @apply font-cinzel text-[10px] not-italic text-muted-foreground;
}

/* Rollable cells */
.rollable {
  @apply cursor-pointer hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors;
}
.rollable:active {
  @apply scale-95;
}

/* Check grid (saves / skills) */
.detail-check-grid {
  @apply grid grid-cols-2 gap-1;
}

.detail-check-btn {
  @apply flex items-center justify-between bg-muted/30 rounded px-2 py-1 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors cursor-pointer;
}
.detail-check-btn span {
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase truncate;
}
.check-label-row {
  @apply flex items-center gap-0.5;
}
.prof-pip {
  @apply font-cinzel text-[8px] font-bold text-primary bg-primary/15 rounded px-0.5 leading-none py-0.5;
}
.detail-check-btn em {
  @apply font-cinzel text-xs font-bold not-italic text-foreground shrink-0 ml-1;
}
.check-proficient {
  @apply border-l-2 border-l-primary/60;
}
.check-expertise {
  @apply border-l-2 border-l-amber-500/80;
}

.detail-section-label {
  @apply font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase mt-1;
}

.detail-trait {
  @apply font-fell text-xs text-foreground leading-relaxed;
}

.detail-trait-header {
  @apply flex items-start justify-between gap-2 mb-0.5;
}

.detail-trait-desc {
  @apply block text-muted-foreground;
}

.trait-roll-bar {
  @apply flex gap-1 flex-wrap shrink-0;
}

.trait-roll-btn {
  @apply inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-cinzel text-[9px] font-semibold tracking-wider cursor-pointer transition-colors whitespace-nowrap;
}

.trait-atk-btn {
  @apply bg-blue-500/15 text-blue-500 border border-blue-500/30 hover:bg-blue-500/25;
}

.trait-dmg-btn {
  @apply bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25;
}

/* Player spell list in detail panel */
.detail-spell {
  @apply flex items-center justify-between gap-2 py-1 border-b border-border/30 last:border-b-0;
}

.spell-info {
  @apply flex items-center gap-1.5 min-w-0 flex-1;
}

.spell-name {
  @apply font-fell text-xs text-foreground truncate;
}

.spell-level-badge {
  @apply font-cinzel text-[9px] font-bold text-muted-foreground bg-muted rounded px-1 shrink-0;
}

.spell-rolls {
  @apply flex items-center gap-1 shrink-0;
}

.spell-save-badge {
  @apply font-cinzel text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30;
}

.detail-line {
  @apply font-fell text-xs text-foreground;
}

.detail-line span {
  @apply font-cinzel text-[9px] font-bold tracking-wider text-muted-foreground uppercase mr-1;
}

.detail-notes {
  @apply font-fell text-xs text-muted-foreground italic;
}

.detail-empty {
  @apply font-fell text-sm text-muted-foreground italic text-center py-8;
}

/* Transitions */
.roll-fade-enter-active,
.roll-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.roll-fade-enter-from,
.roll-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Wildshape */
.wildshape-banner {
  @apply flex items-center justify-between gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2;
}

.wildshape-banner-label {
  @apply font-cinzel text-xs font-semibold text-amber-400;
}

.wildshape-revert-btn {
  @apply font-cinzel text-[10px] px-2 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0;
}

.wildshape-picker-list {
  @apply flex flex-col gap-0.5 max-h-52 overflow-y-auto rounded border border-border;
}

.wildshape-pick-row {
  @apply flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60 transition-colors cursor-pointer;
}

.pick-name {
  @apply font-fell text-xs text-foreground flex-1 truncate;
}

.pick-cr {
  @apply font-cinzel text-[10px] text-muted-foreground shrink-0;
}

.pick-ac {
  @apply font-cinzel text-[10px] text-muted-foreground shrink-0;
}

.pick-speed {
  @apply font-fell text-[10px] text-muted-foreground shrink-0 truncate max-w-24 hidden sm:block;
}

/* Trap type label in detail panel */
.trap-type {
  font-family: var(--font-fell, serif);
  font-size: 10px;
  font-weight: 500;
}
</style>
