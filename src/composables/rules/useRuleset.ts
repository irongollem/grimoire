import { injectLocal, provideLocal } from "@vueuse/core";
import { computed, type ComputedRef, type MaybeRefOrGetter, toValue } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { normalizeRuleset, type RulesetKey } from "@/types/ruleset.types";

/**
 * The ruleset scope: which edition a piece of UI reads its rules from.
 *
 * A ruleset is a property of each character as well as of a campaign (epic
 * #943), so "the" ruleset is two questions, and they can have different answers
 * for the same character:
 *
 * - **Build rules follow the character** (`useRuleset()`): classes, subclasses,
 *   class features, spells and spell preparation, spell slots, feats,
 *   backgrounds, species, metamagic, rituals, weapon mastery. A 2014 character
 *   keeps its 2014 build whatever table it sits at.
 * - **Table rules follow the campaign when the character is seated there, and
 *   the character when it is not** (`useTableRuleset()`): conditions and
 *   exhaustion, monsters, items, house and custom rules, the rules compendium,
 *   AI generators. Everyone at one table plays by one set of table rules, so a
 *   2014 character at a 2024 table meets 2024 conditions; a campaign-less
 *   character has no table, so its own edition stands in.
 *
 * Reach for `useRuleset()` when the answer is about what the character *is*,
 * `useTableRuleset()` when it is about what happens at the table. A surface that
 * shows one character calls `provideCharacterRuleset(member)` at the top of
 * setup; everything below it (and the surface itself) then resolves against that
 * character. The creation wizard has an edition but no row yet and calls
 * `provideRuleset(edition)`. Anywhere with no scope above it, both resolve to the
 * active campaign's edition (2014 when unset), which is exactly the behaviour
 * before characters carried their own.
 *
 * The scope uses `provideLocal`/`injectLocal` rather than `provide`/`inject`
 * because the component that knows the character also calls the composables, and
 * plain `inject` cannot see what its own component provided.
 */
export interface RulesetScope {
  /** Build rules: the character's edition, or the campaign's when no character is in scope. */
  build: ComputedRef<RulesetKey>;
  /** Table rules: the campaign's edition when the character in scope is seated at the active campaign, otherwise the same as `build`. */
  table: ComputedRef<RulesetKey>;
}

/** The character in scope. Only these two fields are read. */
export type RulesetScopeMember = { ruleset: RulesetKey; campaign_id: string | null };

const RULESET_SCOPE_KEY = Symbol("rulesetScope");

function campaignScope(): RulesetScope {
  const campaign = useCampaignStore();
  const edition = computed(() => normalizeRuleset(campaign.activeCampaign?.ruleset));
  return { build: edition, table: edition };
}

/** The enclosing scope if one was provided, else the active campaign's edition. */
function enclosingScope(): RulesetScope {
  return injectLocal<RulesetScope | null>(RULESET_SCOPE_KEY, null) ?? campaignScope();
}

/** Call at the top of setup in a surface that shows ONE character. Returns the scope it provided. */
export function provideCharacterRuleset(
  member: MaybeRefOrGetter<RulesetScopeMember | null | undefined>,
): RulesetScope {
  const outer = enclosingScope();
  const campaign = useCampaignStore();
  const scope: RulesetScope = {
    // While the character is still loading, behave as the enclosing scope does.
    build: computed(() => toValue(member)?.ruleset ?? outer.build.value),
    table: computed(() => {
      const m = toValue(member);
      if (!m) return outer.table.value;
      const seatedHere = m.campaign_id !== null && m.campaign_id === campaign.activeCampaignId;
      return seatedHere ? normalizeRuleset(campaign.activeCampaign?.ruleset) : m.ruleset;
    }),
  };
  provideLocal(RULESET_SCOPE_KEY, scope);
  return scope;
}

/** For a surface with an edition but no character row yet (the creation wizard). build and table are both the given value. */
export function provideRuleset(ruleset: MaybeRefOrGetter<RulesetKey>): RulesetScope {
  const edition = computed(() => toValue(ruleset));
  const scope: RulesetScope = { build: edition, table: edition };
  provideLocal(RULESET_SCOPE_KEY, scope);
  return scope;
}

function view(pick: (scope: RulesetScope) => ComputedRef<RulesetKey>) {
  const ruleset = pick(enclosingScope());
  return {
    ruleset,
    is2014: computed(() => ruleset.value === "2014"),
    is2024: computed(() => ruleset.value === "2024"),
  };
}

/** Build rules in scope (see the module comment). */
export function useRuleset() {
  return view((scope) => scope.build);
}

/** Table rules in scope (see the module comment). */
export function useTableRuleset() {
  return view((scope) => scope.table);
}
