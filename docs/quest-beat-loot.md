# Quest beat loot

Beat loot is a preparation and orchestration layer, not a second loot or inventory system.

## Sources of truth

- `quests.reward_item_ids`, quest coin fields, `reward_currency_pools`, and `reward_art_objects` remain valid unassigned or end-of-quest rewards.
- `quest_beat_loot` places a prepared item, currency parcel, or rolled encounter chest on a beat. Item placements reference `items.id`; they do not clone Item Vault records.
- `campaign_messages` is the delivery and claim source of truth after dispatch. The dispatch RPC emits the existing `item_drop`, `currency_drop`, or `loot_chest` metadata shape.
- `party_inventory`, `npc_inventory`, and party-member coin fields remain the received-value source of truth.

## Dispatch and claims

Call `dispatch_quest_beat_loot(beat_id, entry_id)` for one entry, or pass a null entry ID for the whole beat. It locks prepared rows, creates messages and stamps provenance in one transaction. Repeating either operation returns the original message IDs and never emits duplicate drops.

Players claim those messages through the existing authoritative RPCs:

- `claim_item_drop` or `grab_item_drop` for item stacks
- `claim_currency_drop` for currency
- `claim_loot_chest_atom` for rolled chest atoms

Those RPCs already serialize competing claims and deliver inventory or currency in the same transaction. Beat code must not reproduce their delivery logic.

## Status and deletion

`get_quest_beat_loot(campaign_id, quest_id)` joins prepared rows to messages in one query and derives `held`, `chat`, `partially_claimed`, `claimed`, or `message_removed`. Build, Run, graph, and board consumers should aggregate that result rather than query each card.

The message snapshot stores `quest_id`, `beat_id`, `quest_loot_entry_id`, `source_type`, and `source_id`. Removing a beat never deletes chat or received inventory. If chat itself is removed, the loot row retains its original message UUID and reports `message_removed`; it does not silently become dispatchable again.
