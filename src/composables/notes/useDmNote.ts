import { computed, reactive, ref, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useAutosave, type AutosaveStatus } from "@/composables/useAutosave";
import { supabase } from "@/lib/supabase";
import { dmNoteEntry, type DmNoteEntityType } from "@/lib/dmNotes/registry";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { DmNoteSubject } from "@/types/dmNote.types";
import { useEntityNotes } from "./useEntityNotes";
import { isBlankNote, useMyEntityNote } from "./useMyEntityNote";

interface ColumnDraft {
  content: string | null;
  // The entity travels in the draft so a save still in the debounce when the
  // subject changes lands on the entity it was typed about.
  type: DmNoteEntityType;
  id: string;
  label: string;
  /** Hydrated from the server, so a save cannot overwrite a note nobody has read yet. */
  ready: boolean;
}

function sameContent(a: string | null, b: string | null): boolean {
  return a === b || (isBlankNote(a) && isBlankNote(b));
}

/**
 * The stored text of a column-kind DM note, read from the database. Anything
 * copying an entity reads its note through here: the note is not in the
 * entity's own cached row, which autosave deliberately leaves stale.
 */
export async function fetchDmNoteColumn(type: DmNoteEntityType, id: string): Promise<string | null> {
  const store = dmNoteEntry(type).store;
  if (store.kind !== "column") return null;
  const { data, error } = await supabase.from(store.table).select(store.column).eq("id", id).maybeSingle();
  if (error) throw error;
  const value = (data as Record<string, unknown> | null)?.[store.column];
  return typeof value === "string" ? value : null;
}

/**
 * The DM's one note on an entity, saving itself as they type (#983). Which
 * store holds it (a column on the entity's table, or the DM's private
 * `entity_notes` row) is the registry's call; both look the same from here.
 *
 * The subject can change type while this lives (the docked panel follows the
 * route), so both mechanisms exist at once and the inactive one is given no
 * subject.
 */
export function useDmNote(subject: MaybeRefOrGetter<DmNoteSubject | null>) {
  const qc = useQueryClient();
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  const columnSubject = computed(() => {
    const s = toValue(subject);
    return s && dmNoteEntry(s.type).store.kind === "column" ? s : null;
  });
  const noteSubject = computed(() => {
    const s = toValue(subject);
    return s && dmNoteEntry(s.type).store.kind === "entity_note" ? s : null;
  });

  const labels = new Map<string, string>();
  watch(
    () => toValue(subject),
    (s) => {
      if (s) labels.set(`${s.type}:${s.id}`, s.label);
    },
    { immediate: true },
  );

  async function recordTouch(type: DmNoteEntityType, id: string, label: string) {
    const userId = auth.user?.id;
    const campaignId = campaign.activeCampaignId;
    if (!userId || !campaignId) return;
    try {
      const { error } = await supabase.from("dm_note_touches").upsert(
        {
          user_id: userId,
          campaign_id: campaignId,
          entity_type: type,
          entity_id: id,
          entity_label: label,
          touched_at: new Date().toISOString(),
        },
        { onConflict: "user_id,campaign_id,entity_type,entity_id" },
      );
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["dm-note-touches"] });
    } catch (e) {
      console.error("Could not record the note touch", e);
    }
  }

  // ---- Column kind --------------------------------------------------------
  const columnQuery = useQuery({
    queryKey: computed(() => {
      const s = columnSubject.value;
      const store = s ? dmNoteEntry(s.type).store : null;
      return ["dm-note", store?.kind === "column" ? store.table : null, s?.id ?? null] as const;
    }),
    queryFn: async (): Promise<string | null> => {
      const s = columnSubject.value;
      return s ? fetchDmNoteColumn(s.type, s.id) : null;
    },
    enabled: () => columnSubject.value !== null,
  });
  const columnLoaded = computed(() => columnQuery.isSuccess.value && columnQuery.data.value !== undefined);

  const columnFromServer = (): ColumnDraft => {
    const s = columnSubject.value;
    // No column subject: an inert draft (empty id) that never saves.
    if (!s) return { content: null, type: "npc", id: "", label: "", ready: false };
    return { content: columnQuery.data.value ?? null, type: s.type, id: s.id, label: s.label, ready: columnLoaded.value };
  };
  const columnDraft = reactive<ColumnDraft>(columnFromServer());

  async function saveColumn(snapshot: ColumnDraft) {
    const store = dmNoteEntry(snapshot.type).store;
    if (store.kind !== "column" || !snapshot.id) return;
    const value = isBlankNote(snapshot.content) ? null : snapshot.content;
    const { error } = await supabase
      .from(store.table)
      .update({ [store.column]: value })
      .eq("id", snapshot.id);
    if (error) throw error;
    // Only the note's own read is refreshed. Every screen that shows a DM note
    // reads it here, so refetching the entity's lists after each autosave would
    // cost a full list read every few seconds of typing at the table.
    qc.setQueryData(["dm-note", store.table, snapshot.id], value);
    await recordTouch(snapshot.type, snapshot.id, snapshot.label);
  }

  const columnAutosave = useAutosave({
    draft: columnDraft,
    initial: columnFromServer,
    equal: (a, b) => sameContent(a.content, b.content),
    save: saveColumn,
    canSave: () => columnDraft.ready && columnDraft.id !== "",
    errorMessage: "Could not save the note",
  });

  const columnRevision = ref(0);
  function rehydrateColumn() {
    const next = columnFromServer();
    const replaced = !sameContent(next.content, columnDraft.content);
    columnAutosave.reset(next);
    if (replaced) columnRevision.value++;
  }

  watch(columnQuery.data, () => {
    if (columnAutosave.dirty.value || columnAutosave.saving.value) return;
    rehydrateColumn();
  });
  watch(
    () => (columnSubject.value ? `${columnSubject.value.type}:${columnSubject.value.id}` : ""),
    async () => {
      await columnAutosave.saveNow();
      rehydrateColumn();
    },
  );

  // ---- Entity-note kind ---------------------------------------------------
  // A note is filed under its entity's campaign, not the active one: a hero is
  // app-wide, and a library species or another campaign's deity can be open
  // while this one is active. Read once, when the note's row is first created.
  async function entityCampaign(type: DmNoteEntityType, id: string): Promise<string | null> {
    const store = dmNoteEntry(type).store;
    if (store.kind !== "entity_note" || store.campaignTable === null) return null;
    const { data, error } = await supabase
      .from(store.campaignTable)
      .select("campaign_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as { campaign_id: string | null } | null)?.campaign_id ?? null;
  }

  const noteType = () => (noteSubject.value ? noteSubject.value.type : "");
  const noteId = () => (noteSubject.value ? noteSubject.value.id : "");
  const entityNotes = useEntityNotes(noteType, noteId);
  const note = useMyEntityNote({
    entityType: noteType,
    entityId: noteId,
    notes: () => entityNotes.data.value,
    userId: () => auth.user?.id,
    isPrivate: true,
    campaignFor: (snapshot) => entityCampaign(snapshot.entityType as DmNoteEntityType, snapshot.entityId),
    onSaved: (snapshot) => {
      const type = snapshot.entityType as DmNoteEntityType;
      const label = labels.get(`${type}:${snapshot.entityId}`) ?? dmNoteEntry(type).label;
      void recordTouch(type, snapshot.entityId, label);
    },
  });

  // ---- One face -----------------------------------------------------------
  const useColumn = computed(() => noteSubject.value === null);
  const draft = {
    get content(): string | null {
      return useColumn.value ? columnDraft.content : note.draft.content;
    },
    set content(value: string | null) {
      if (useColumn.value) columnDraft.content = value;
      else note.draft.content = value;
    },
  };

  // Remounts the editor when the subject changes, since it reads its value once.
  const epoch = ref(0);
  watch(
    () => {
      const s = toValue(subject);
      return s ? `${s.type}:${s.id}` : "";
    },
    () => epoch.value++,
  );

  const status: ComputedRef<AutosaveStatus> = computed(() =>
    useColumn.value ? columnAutosave.status.value : note.status.value,
  );
  const saveError = computed(() => (useColumn.value ? columnAutosave.saveError.value : note.saveError.value));
  const revision: ComputedRef<number> = computed(() => columnRevision.value + note.revision.value + epoch.value);
  const loading = computed(() => {
    if (toValue(subject) === null) return false;
    return useColumn.value ? columnQuery.isLoading.value : entityNotes.isLoading.value;
  });

  return {
    draft,
    status,
    saveError,
    revision,
    loading,
  };
}
