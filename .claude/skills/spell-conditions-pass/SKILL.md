---
name: spell-conditions-pass
description: Read library spells and record, in data, what each does to a creature beyond damage (which condition, on what, for how long, how it ends), so a fight can resolve spells like Hold Person. Written so any capable model can do one reading; two independent readings must agree before anything is used. Use when asked to run, continue or check the spell conditions pass.
user-invocable: true
---

# /spell-conditions-pass: what a spell does besides damage

A fight in this app can resolve Fireball, because its dice are in data. It cannot resolve Hold Person: no spell
record says in data which condition a spell imposes. This pass fills that in for the spells monsters actually
cast (about 310 names, 886 records across the source books).

**You do one reading.** A reading is a JSON file with one entry per spell record. Nothing you write is used on
your word alone: a second reader (another model, or another session that has not seen your file) reads the same
spells, and only the entries where both readings pass the checks and agree are fit to use. So be exact, and when
the text does not fit the fields, say `not_simple`. A wrong entry paralyses the wrong creature in someone's game;
a `not_simple` costs a table one ruling by hand. The second is always the cheaper mistake.

## The one rule

**The spell's own text (`description`, and `higher_levels` where it has one) is the only authority.** Not what you remember of the spell, not another
edition, not a wiki. The same name exists in several source books with different text (the 2014 and 2024 Sleep
are different spells): read each record on its own, and expect their entries to differ. If the text on the page
does not say it, it is not so.

## Step 1: get the worklist

```bash
npm run db:start                     # the local stack, if it is not up
npm run spells:conditions -- worklist --out /tmp/spell-conditions-worklist.json
```

Each item has `id`, `name`, `ruleset`, `level`, `concentration`, `duration`, `description`, `higher_levels`
(what a higher slot adds, where the record keeps it apart; often null) and `monsters` (how
many library monsters list it; the file is sorted most used first). Work from the top. If you were given a range
("items 0 to 149"), do exactly that range.

A reader with no access to the repo can be handed the worklist file and this document; they need nothing else.

## Step 2: write one entry per record

Your reading goes in `src/data/curatedSpellConditions/<reader>.json`, where `<reader>` names who read
(`claude.json`, `gpt.json`). It is one JSON object, spell `id` to entry:

```json
{
  "srd_srd_hold_person": {
    "verdict": "condition",
    "conditions": ["Paralyzed"],
    "stops_casting": null,
    "speed_zero": false,
    "applies": "failed_save",
    "save_ability": "WIS",
    "targets": { "kind": "one", "count": 1, "more_per_slot_above": 1 },
    "only_kinds": ["humanoid"],
    "duration": { "unit": "minute", "amount": 1, "concentration": true },
    "repeat_save": { "when": "end_of_its_turn", "ability": "WIS" },
    "evidence": "The target must succeed on a Wisdom saving throw or be paralyzed for the duration."
  }
}
```

The fields, as `src/lib/library/curatedSpellConditions.ts` defines them:

- **`verdict`**
  - `condition`: the spell imposes one or more of the named conditions, and the other fields say how, completely.
  - `no_condition`: it imposes none of them. Fireball, Detect Magic, Mage Hand.
  - `not_simple`: it imposes one of the named conditions, but these fields cannot say it truthfully. Use it
    whenever the outcome depends on a choice the caster makes (Command), on hit points (2014 Sleep, Power Word
    Stun), on a roll on a table that determines which named condition applies, when the condition changes over the
    turns (2024 Sleep), when a later
    save is allowed only in some circumstance (Fear: only out of the caster's sight), when the spell also forces
    movement or makes the target drop what it holds, or when different targets get different conditions. Also
    when you are not sure.
  - **The dividing rule, so two readers land on the same verdict:** the verdict is about the fourteen named
    conditions and about stopping casting, and nothing else. A spell that does something else to a creature,
    however severe (banishes it, curses it, slows it, makes it follow a suggestion without the text saying
    Charmed), is `no_condition`. `not_simple` is only for a spell whose text does name one of the fourteen. So
    Confusion, which changes a creature's behavior by rolling on a table but names none of these conditions, is
    `no_condition`.
- **`conditions`**: every named condition imposed together by the one cast. The names are exactly: Blinded,
  Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone,
  Restrained, Stunned, Unconscious. Nothing else is a condition here: "slowed", "banished", "asleep" and
  "cursed" are not on the list, and a spell whose effect is one of those is `no_condition` or `not_simple`.
  A condition the caster puts on themselves or a willing ally (Invisibility makes a creature Invisible) counts.
- **`stops_casting`**: `"verbal"` when those it affects cannot cast a spell with a verbal component (Silence:
  "Casting a spell that includes a verbal component is impossible there"), `"all"` when they cannot cast at
  all, otherwise null. No named condition says this, and it is what makes a spell worth more against a wizard
  than a fighter. A spell that only does this is still a `condition` entry, with `conditions: []`.
- **`speed_zero`**: true when the text also sets the speed of those it affects to 0 while the condition lasts
  and the condition does not already do that by the rules (Hypnotic Pattern: "has a speed of 0"); otherwise
  false.
- **`applies`**: `failed_save` (the target fails a saving throw), `hit` (a spell attack hits), or `automatic`
  (no roll: a willing target, or no save offered).
- **`save_ability`**: STR, DEX, CON, INT, WIS or CHA when `applies` is `failed_save`; otherwise null.
- **`targets`**: at the spell's own level. `kind` is `one`, `several` (a stated number of creatures; give the
  `count`), `area` (everyone in a shape; `count` is null) or `self`. `more_per_slot_above` is how many more
  creatures a slot one level higher adds, read from this record's `higher_levels` (or its description when the
  two are one text). 0 when this record's text gives none, whatever the spell does in another book.
- **`only_kinds`**: the creature kinds the text limits it to, lower case ("humanoid", "beast"); empty for any.
- **`duration`**: the longest it lasts. `unit` is `instant`, `round`, `minute`, `hour`, `until_dispelled` or
  `special`; `amount` only for round, minute and hour. `concentration` must equal the record's own
  `concentration` value. "Until the end of your next turn" is 1 round.
- **`repeat_save`**: a later saving throw that ends it early: `when` is `end_of_its_turn`, `start_of_its_turn`,
  `when_damaged` or `as_an_action`, with its `ability`. Null when only the duration ends it.
- **`evidence`**: one sentence copied word for word from this record's `description`: the one that imposes the
  condition, or, for `no_condition`, a sentence that shows what the spell does instead (its first sentence is
  fine when nothing says it better). It is checked against the text, so copy it; do not tidy it.

For `no_condition` and `not_simple`, give `conditions: []`, `only_kinds: []`, `stops_casting: null`, `speed_zero: false`, the other fields null, and the
evidence sentence.

## Step 3: check your own reading

```bash
npm run spells:conditions -- check --a src/data/curatedSpellConditions/<you>.json --b src/data/curatedSpellConditions/<you>.json --report /tmp/report.json
```

Checked against itself, a reading shows only its own findings (evidence that is not in the text, a condition
the description never names, a count that does not fit its kind, concentration that contradicts the record).
Fix every one, by reading the spell again, never by changing the entry until the checker is quiet.

## Step 4: the second reading, and the comparison

The second reader does steps 1 to 3 **without seeing the first file**. Then:

```bash
npm run spells:conditions -- check --a src/data/curatedSpellConditions/claude.json --b src/data/curatedSpellConditions/gpt.json --report /tmp/report.json
```

It prints how many entries are usable, how many the two disagree on, how many have findings, and how many only
one reading holds. A disagreement is settled by a person reading the spell, not by picking a side or asking a
third model to vote.

## What this pass does not do

- It writes nothing to a database. Applying the agreed entries to `library_spells.condition_effect` is its own
  command, `apply --a <file> --b <file>`: a dry run unless `--write` is given, it writes only the entries both readings
  agree on and leaves every other row as it is. Writing production (`--production --yes-production`) is the
  maintainer's decision, like every write to the shared library.
- It does not judge damage, healing or dice. Those have their own pass (`npm run spells:check-mechanics`).
- It does not cover spells no library monster casts. Extend the worklist command when players' spells are due.

## Hard limits for whoever runs it

- Library spell text is open content (SRD, Kobold Press, EN Publishing) and may be read and quoted. Nothing else
  from the project, and nothing about any user or campaign, goes to an outside service.
- Never write to production. Never run `supabase db push`.
- Do not "improve" a spell's text, and do not correct what looks like a typo in it: the evidence must match the
  record as it is.
