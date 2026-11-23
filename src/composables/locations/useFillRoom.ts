/**
 * "Fill a room with AI and save it": the roll-then-save the room list does through its inline editor, as one call for
 * Ask Grimoire (#1253). The roll is `useRoomFill`'s and the saved update is the list's own (`roomFillSaveUpdate`, text
 * untouched keeps its provenance as generated), through `useUpdateLocation`.
 *
 * Deliberately narrow, as `useGenerateMonster` is: the list keeps its draft in front of the DM, the paywall and the
 * Save and Cancel buttons; this is the step they share. A failed roll returns null (its message is `error`); a failed
 * save throws.
 */
import { useRoomFill } from "@/ai/useRoomFill";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { roomFillSaveUpdate } from "@/lib/locations/roomFill";
import type { Location } from "@/types/location.types";

export function useFillRoom() {
  const { fill, error, isGenerating } = useRoomFill();
  const updateLocation = useUpdateLocation();

  async function fillRoom(input: { room: Location; constraints: string[]; steer: string }): Promise<Location | null> {
    const result = await fill(input);
    if (!result) return null;
    return await updateLocation.mutateAsync({
      id: input.room.id,
      update: roomFillSaveUpdate({ description: result.description, aiDraft: result.description, provenance: result.ai_provenance }),
    });
  }

  return { fillRoom, error, isGenerating };
}
