import { computed, toValue, type MaybeRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { CharacterSpell, CharacterSpellEntry } from "@/types/spell.types";

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
