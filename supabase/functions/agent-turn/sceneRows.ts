// What the narrator is told of a place, shaped from the rows `loadScene` reads. The rules: a disguised character
// shows under the disguise, a description is plain text, and what a place lies inside is named only when it was found.
import { toPlainText } from "../_shared/ai-prompt.ts";
import type { SceneView } from "../_shared/agent/scene.ts";
import { shownNpcName } from "../_shared/npcProfile.ts";

type Row = Record<string, unknown>;

export function sceneFrom(place: Row, parent: Row | null, siblings: readonly Row[], children: readonly Row[], people: readonly Row[]): SceneView {
  return {
    id: place.id as string,
    name: place.name as string,
    kind: (place.location_type as string | null) ?? null,
    description: toPlainText(place.description as string | null),
    within: parent ? (parent.name as string) : null,
    withinId: parent ? (place.parent_id as string) : null,
    beside: siblings.map((c) => ({ id: c.id as string, name: c.name as string })),
    places: children.map((c) => ({ id: c.id as string, name: c.name as string })),
    characters: people.map((n) => ({
      id: n.id as string,
      name: shownNpcName({
        name: n.name as string,
        disguise_name: n.disguise_name as string | null,
        is_revealed: n.is_revealed === true,
      }),
      occupation: (n.occupation as string | null) ?? null,
    })),
  };
}
