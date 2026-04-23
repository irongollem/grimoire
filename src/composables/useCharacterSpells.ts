import { computed, toValue, type MaybeRef, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { CharacterSpell, CharacterSpellEntry, InnateSourceType, InnateResetsOn } from "@/types/spell.types";
import type { Species } from "@/types/species.types";

export interface SpellKnower {
  party_member_id: string;
  name: string;
  is_prepared: boolean;
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

/** Full fetch with joined spell data — used in the spellbook/prepared tabs. */
export function useCharacterSpellsWithDetails(partyMemberId: MaybeRef<string | null>) {
  return useQuery({
    queryKey: computed(() => ["characterSpellsDetails", toValue(partyMemberId)]),
    queryFn: async () => {
      const id = toValue(partyMemberId);
      if (!id) return [] as CharacterSpellEntry[];
      const { data, error } = await supabase
        .from("character_spells")
        .select("*, spell:spells(*)")
        .eq("party_member_id", id)
        .order("created_at");
      if (error) throw error;
      return data as CharacterSpellEntry[];
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
    }: {
      partyMemberId: string;
      spellId: string;
      isPrepared?: boolean;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .insert({ party_member_id: partyMemberId, spell_id: spellId, is_prepared: isPrepared });
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
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
    }: {
      partyMemberId: string;
      spellId: string;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .delete()
        .eq("party_member_id", partyMemberId)
        .eq("spell_id", spellId);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}

/** Delete a spell from character_spells by partyMemberId + spellId. */
export function useDeleteCharacterSpell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      spellId,
    }: {
      partyMemberId: string;
      spellId: string;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .delete()
        .eq("party_member_id", partyMemberId)
        .eq("spell_id", spellId);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      void qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      void qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}

/** Toggle is_prepared on an existing character_spell row. */
export function useTogglePrepared() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      isPrepared,
    }: {
      id: string;
      partyMemberId: string;
      isPrepared: boolean;
    }) => {
      const { error } = await supabase
        .from("character_spells")
        .update({ is_prepared: isPrepared })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
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
    }: {
      partyMemberId: string;
      spellId: string;
      sourceType: InnateSourceType;
      sourceLabel: string | null;
      usesPerDay: number | null;
      resetsOn: InnateResetsOn | null;
    }) => {
      const { error } = await supabase.from("character_spells").insert({
        party_member_id: partyMemberId,
        spell_id: spellId,
        is_prepared: false,
        source_type: sourceType,
        source_label: sourceLabel || null,
        uses_per_day: usesPerDay,
        uses_remaining: usesPerDay,
        resets_on: resetsOn,
      });
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}

/** Remove a character spell by its row id — safe when the same spell exists as both class and innate. */
export function useRemoveCharacterSpellById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; partyMemberId: string }) => {
      const { error } = await supabase.from("character_spells").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { partyMemberId }) => {
      qc.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
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
      qc.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}

/**
 * Resets uses_remaining = uses_per_day for all innate spells that recharge on the given rest type.
 * Long rest also resets short_rest spells (short rest is a subset of long rest recovery).
 * Called imperatively from RestDialog.confirm().
 */
export async function restoreInnateUses(
  partyMemberId: string,
  restType: "long" | "short",
): Promise<void> {
  const resetOn: InnateResetsOn[] = restType === "long" ? ["long_rest", "short_rest"] : ["short_rest"];

  const { data, error } = await supabase
    .from("character_spells")
    .select("id, uses_per_day")
    .eq("party_member_id", partyMemberId)
    .neq("source_type", "class")
    .not("uses_per_day", "is", null)
    .in("resets_on", resetOn);

  if (error) throw error;
  if (!data?.length) return;

  await Promise.all(
    data.map((row) =>
      supabase
        .from("character_spells")
        .update({ uses_remaining: row.uses_per_day })
        .eq("id", row.id),
    ),
  );
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
        .select("party_member_id, is_prepared, party_member:party_members(id, name)")
        .eq("spell_id", id);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        party_member_id: row.party_member_id,
        name: (row.party_member as unknown as { name: string } | null)?.name ?? "Unknown",
        is_prepared: row.is_prepared,
      }));
    },
    enabled: computed(() => !!toValue(spellId)),
  });
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
      source_label: g.source_label || null,
      uses_per_day: g.uses_per_day,
      uses_remaining: g.uses_per_day,
      resets_on: (g.resets_on ?? null) as InnateResetsOn | null,
    }));

    const { error } = await supabase
      .from("character_spells")
      .upsert(rows, { onConflict: "party_member_id,spell_id,source_type", ignoreDuplicates: true });
    if (error) throw error;
  }

  return freePickGrants;
}
