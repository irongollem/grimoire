import { computed, toValue, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type {
  CharacterSpell,
  CharacterSpellEntry,
  InnateSourceType,
  InnateResetsOn,
} from "@/types/spell.types";
import type { Species } from "@/types/species.types";
import { isUuid } from "@/lib/library/contentIdentity";
import { useToast } from "@/composables/useToast";

export interface SpellKnower {
  party_member_id: string;
  name: string;
  is_prepared: boolean;
}

export interface SpellChangeWindow {
  party_member_id: string;
  source_class_id: string;
  change_timing: "level_up" | "long_rest";
  remaining_changes: number | null;
  opened_at: string;
}

const queryKey = (partyMemberId: MaybeRef<string | null>) =>
  computed(() => ["characterSpells", toValue(partyMemberId)]);

/** Lightweight fetch — just the join rows (no spell details). Used to build the known-ID set. */
export function useCharacterSpells(partyMemberId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: queryKey(partyMemberId),
    queryFn: async () => {
      const id = toValue(partyMemberId);
      if (!id) return [] as CharacterSpell[];
      const { data, error } = await supabase
        .from("character_spells")
        .select("*")
        .eq("party_member_id", id);
      if (error) throw error;
      return data as CharacterSpell[];
    },
    enabled: computed(() => !!toValue(partyMemberId)),
  });
}

/** Full fetch with joined spell data. Provider IDs are opaque: query the shared
 *  table for every ID and the UUID-backed custom table for UUID candidates. */
export function useCharacterSpellsWithDetails(
  partyMemberId: MaybeRef<string | null>,
) {
  return useQuery({
    queryKey: computed(() => [
      "characterSpellsDetails",
      toValue(partyMemberId),
    ]),
    queryFn: async () => {
      const id = toValue(partyMemberId);
      if (!id) return [] as CharacterSpellEntry[];

      const { data, error } = await supabase
        .from("character_spells")
        .select("*")
        .eq("party_member_id", id)
        .order("created_at");
      if (error) throw error;

      const rows = data as Omit<CharacterSpellEntry, "spell">[];
      const allIds = [...new Set(rows.map((r) => r.spell_id).filter(Boolean))];
      const customIds = allIds.filter(isUuid);

      const [libraryRes, customRes] = await Promise.all([
        allIds.length > 0
          ? supabase.from("library_spells").select("*").in("id", allIds)
          : Promise.resolve({ data: [] }),
        customIds.length > 0
          ? supabase.from("spells").select("*").in("id", customIds)
          : Promise.resolve({ data: [] }),
      ]);
      if ("error" in libraryRes && libraryRes.error) throw libraryRes.error;
      if ("error" in customRes && customRes.error) throw customRes.error;

      const spellMap = new Map<string, CharacterSpellEntry["spell"]>();
      for (const s of libraryRes.data ?? [])
        spellMap.set(s.id, {
          ...s,
          user_id: "",
        } as CharacterSpellEntry["spell"]);
      for (const s of customRes.data ?? [])
        spellMap.set(s.id, s as CharacterSpellEntry["spell"]);

      return rows.map((r) => ({
        ...r,
        spell: spellMap.get(r.spell_id) ?? null,
      })) as CharacterSpellEntry[];
    },
    enabled: computed(() => !!toValue(partyMemberId)),
  });
}

export function useAddCharacterSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
      isPrepared = false,
      alwaysPrepared = false,
      sourceClassId = null,
    }: {
      partyMemberId: string;
      spellId: string;
      isPrepared?: boolean;
      /** Subclass-granted spell — always prepared, excluded from the prepared limit. */
      alwaysPrepared?: boolean;
      /** Class that granted this spell; required for correct multiclass stats. */
      sourceClassId?: string | null;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .insert({
          party_member_id: partyMemberId,
          spell_id: spellId,
          // An always-prepared spell is, by definition, prepared.
          is_prepared: isPrepared || alwaysPrepared,
          always_prepared: alwaysPrepared,
          source_type: "class",
          source_class_id: sourceClassId,
        });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
  });
}

export function useSpellChangeWindows(partyMemberId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => ["spellChangeWindows", toValue(partyMemberId)]),
    queryFn: async () => {
      const { data, error } = await supabase.from("spell_change_windows").select("*")
        .eq("party_member_id", toValue(partyMemberId)!);
      if (error) throw error;
      return data as SpellChangeWindow[];
    },
    enabled: computed(() => !!toValue(partyMemberId)),
  });
}

export function useChangePreparedSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId, sourceClassId, newSpellId, oldCharacterSpellId = null,
    }: {
      partyMemberId: string;
      sourceClassId: string;
      newSpellId: string;
      oldCharacterSpellId?: string | null;
    }) => {
      const { data, error } = await supabase.rpc("change_prepared_spell", {
        p_party_member_id: partyMemberId,
        p_source_class_id: sourceClassId,
        p_new_spell_id: newSpellId,
        p_old_character_spell_id: oldCharacterSpellId,
      });
      if (error) throw error;
      return data as CharacterSpell;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["spellChangeWindows", partyMemberId] });
    },
  });
}

export function useAssignCharacterSpellSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sourceClassId }: { id: string; partyMemberId: string; sourceClassId: string }) => {
      const { error } = await supabase.from("character_spells").update({ source_class_id: sourceClassId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}

export function useRemoveCharacterSpell() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
      sourceClassId,
    }: {
      partyMemberId: string;
      spellId: string;
      sourceClassId?: string | null;
    }) => {
      const { error } = await supabase.rpc("delete_character_spells", {
        p_party_member_id: partyMemberId,
        p_spell_id: spellId,
        // Contract with the server: null means "match only source_class_id IS
        // NULL rows" (a legacy pre-multiclass grant) — never a wildcard across
        // all source classes. Passing a specific id removes only that class's grant.
        p_source_class_id: sourceClassId ?? null,
        p_source_type: "class",
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Delete a spell from character_spells by partyMemberId + spellId. */
export function useDeleteCharacterSpell() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
    }: {
      partyMemberId: string;
      spellId: string;
    }) => {
      const { error } = await supabase.rpc("delete_character_spells", {
        p_party_member_id: partyMemberId,
        p_spell_id: spellId,
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      void qc.invalidateQueries({
        queryKey: ["characterSpells", partyMemberId],
      });
      void qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Toggle is_prepared on an existing character_spell row. */
export function useTogglePrepared() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({
      id,
      isPrepared,
    }: {
      id: string;
      partyMemberId: string;
      isPrepared: boolean;
    }) => {
      const { error } = await supabase.rpc("set_character_spell_prepared", {
        p_character_spell_id: id,
        p_is_prepared: isPrepared,
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Add an innate spell (racial / feat / item / other source — not a class slot spell). */
export function useAddInnateSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
      sourceType,
      sourceLabel,
      usesPerDay,
      resetsOn,
      castingAbility,
    }: {
      partyMemberId: string;
      spellId: string;
      sourceType: InnateSourceType;
      sourceLabel: string;
      usesPerDay: number | null;
      resetsOn: InnateResetsOn | null;
      castingAbility: "int" | "wis" | "cha" | null;
    }) => {
      const { error } = await supabase.from("character_spells").insert({
        party_member_id: partyMemberId,
        spell_id: spellId,
        is_prepared: false,
        source_type: sourceType,
        source_label: sourceLabel.trim(),
        uses_per_day: usesPerDay,
        uses_remaining: usesPerDay,
        resets_on: resetsOn,
        casting_ability: castingAbility,
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
  });
}

/** Remove a character spell by its row id — safe when the same spell exists as both class and innate. */
export function useRemoveCharacterSpellById() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ id, partyMemberId }: { id: string; partyMemberId: string }) => {
      const { error } = await supabase.rpc("delete_character_spells", {
        p_party_member_id: partyMemberId,
        p_character_spell_id: id,
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Spend an innate spell use (decrement uses_remaining by 1). Pass the new value from the caller. */
export function useSpendInnateUse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      newRemaining,
    }: {
      id: string;
      partyMemberId: string;
      newRemaining: number;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .update({ uses_remaining: newRemaining })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({
        queryKey: ["characterSpellsDetails", partyMemberId],
      });
    },
  });
}

/**
 * Idempotently adds a spell granted by an Eldritch Invocation.
 * Skips silently if the (party_member_id, spell_id, source_type='feat') row already exists.
 */
export async function addInvocationSpellGrant(
  partyMemberId: string,
  spellId: string,
  invocationName: string,
  usesPerDay: number | null,
): Promise<void> {
  const { error } = await supabase.from("character_spells").upsert(
    {
      party_member_id: partyMemberId,
      spell_id: spellId,
      is_prepared: false,
      source_type: "feat" as InnateSourceType,
      source_label: `Invocation: ${invocationName}`,
      uses_per_day: usesPerDay,
      uses_remaining: usesPerDay,
      resets_on: usesPerDay !== null ? ("long_rest" as InnateResetsOn) : null,
    },
    {
      onConflict: "party_member_id,spell_id,source_type",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
}

/** Returns party members who know (or have prepared) a given spell. */
export function useSpellKnowers(spellId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["spellKnowers", toValue(spellId)]),
    queryFn: async (): Promise<SpellKnower[]> => {
      const id = toValue(spellId);
      if (!id) return [];
      const { data, error } = await supabase
        .from("character_spells")
        .select(
          "party_member_id, is_prepared, party_member:party_members(id, name)",
        )
        .eq("spell_id", id);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        party_member_id: row.party_member_id,
        name:
          (row.party_member as unknown as { name: string } | null)?.name ??
          "Unknown",
        is_prepared: row.is_prepared,
      }));
    },
    enabled: computed(() => !!toValue(spellId)),
  });
}

/**
 * Remove every species-granted innate spell from a party member (source_type
 * 'racial'). Call before applying a new species' grants when SWITCHING species —
 * all racial rows belong to the outgoing species, so a Tiefling→Dwarf switch
 * shouldn't leave Thaumaturgy behind.
 */
export async function removeSpeciesSpellGrants(partyMemberId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_character_spells", {
    p_party_member_id: partyMemberId,
    p_source_type: "racial",
  });
  if (error) throw error;
}

/**
 * Insert innate spell grants from a species onto a party member.
 * Idempotent — skips rows that already exist (upsert with ignoreDuplicates).
 * Returns free-pick grants (spell_id = null) that the caller should surface to the player.
 */
export async function applySpeciesSpellGrants(
  partyMemberId: string,
  species: Species,
  characterLevel: number,
  subrace?: string | null,
): Promise<Species["granted_spells"]> {
  const all = (species.granted_spells ?? []).filter(
    (g) =>
      g.min_level <= characterLevel &&
      (g.subrace === null || g.subrace === (subrace ?? null)),
  );
  const autoGrants = all.filter((g) => g.spell_id !== null);
  const freePickGrants = all.filter((g) => g.spell_id === null);

  if (autoGrants.length) {
    const rows = autoGrants.map((g) => ({
      party_member_id: partyMemberId,
      spell_id: g.spell_id as string,
      is_prepared: false,
      source_type: "racial" as InnateSourceType,
      source_label: g.source_label || species.name,
      uses_per_day: g.uses_per_day,
      uses_remaining: g.uses_per_day,
      resets_on: (g.resets_on ?? null) as InnateResetsOn | null,
      casting_ability: g.casting_ability ?? null,
    }));

    const { error } = await supabase
      .from("character_spells")
      .upsert(rows, {
        onConflict: "party_member_id,spell_id,source_type",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }

  return freePickGrants;
}
