/**
 * Query-key root for every player-side handout read (#970). The campaign
 * channel's doorbell rings `scriptorium_documents` only when a SHARED document
 * changes (20261004105821), and useCampaignLiveSync maps that ring to this root
 * alone. Never to the DM's own `scriptorium` root: that would refetch the
 * document a DM is typing into.
 */
export const PLAYER_HANDOUTS_KEY = "player-handouts";
