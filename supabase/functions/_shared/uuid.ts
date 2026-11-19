// The shape of a uuid, once. A request names rows by id, and an id that is not one is refused before any query is
// made with it; a dozen functions each kept a private copy of this pattern.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
