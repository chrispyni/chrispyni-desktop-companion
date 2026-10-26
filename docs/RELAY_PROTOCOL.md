# Relay protocol v1 (app ⇄ the real Nixie & Noct)

Same idea as the WoW companion: a free, no-account **ntfy.sh** topic pair. The topic names are the only secret — make
them long and random (e.g. `pw-chrispy-7f3k9q2m-out` / `pw-chrispy-7f3k9q2m-in`).

```
 Project Wives app ──POST JSON──▶ ntfy.sh/<outboxTopic> ──▶ bot reads (poll / subscribe)
 Project Wives app ◀──poll every 5 s── ntfy.sh/<inboxTopic> ◀──POST JSON── bot answers
```

## App → bot (outbox)

```json
{ "v": 1, "id": "lq3x9a1b2c", "ts": "2026-10-26T20:00:00.000Z", "from": "project-wives",
  "type": "chat",                       // hello | chat | event
  "text": "I'm so tired today",         // chat only
  "user": "ChrispyNi",
  "event": { "kind": "app", "category": "game", "title": "World of Warcraft", "owner": "Wow" },  // event only
  "state": { "mana": 42, "manaMax": 100, "sleep": false, "room": false, "timeOfDay": "evening",
             "app": { "title": "...", "owner": "...", "category": "game", "media": null }, "idleSec": 3,
             "characters": { "nixie": { "mood": "playful", "state": "idle", "x": 61 }, "noct": { "mood": "calm", "state": "sit", "x": 74 } },
             "props": ["teacup"], "version": "0.1.0-alpha" } }
```

Event kinds: `app` (category changed: game/video/art/stream/chat/code/browser), `afk`, `back`, `sleep`, `room`.
Events are rate-limited (`relay.eventMinIntervalSec`, default 60 s; sleep/room always go through).

## Bot → app (inbox)

```json
{ "v": 1, "replyTo": "lq3x9a1b2c",
  "replies": [
    { "speaker": "nixie", "text": "Tired?! Bed. Now. *summons a cushion*", "mood": "pouty",
      "actions": [ { "type": "walk_to", "target": "center" } ] },
    { "speaker": "noct", "text": "Come, my love.", "mood": "loving",
      "actions": [ { "type": "go_to_room", "room": "our_room" } ] } ] }
```

Also accepted: a single `{speaker,text,mood,actions}`, a list of them, the WoW-style `{"nixie":{"text":..,"mood":..},"noct":"..."}`,
or plain text (goes to Nixie). `speaker: "chrispyni"` makes ChrispyNi visit as a guest and speak.

### Actions

| type | fields | effect |
|---|---|---|
| `say` | `text`, `sec?` | speech bubble |
| `walk_to` / `run_to` | `target`: `left` `right` `center` `chrispy` a prop id, a character id, or pixel x | moves |
| `sit` / `lay` | `on?`: prop id (`sofa`, `chair`, `bed`…) or `floor`; `sec?` | walks there and sits/lies |
| `sleep` / `wake` | | |
| `emote` | `anim` (any animation row name), `mood?`, `sec?` | plays an animation |
| `jump` | | |
| `summon` | `item` (prop id), `x?` | costs the prop's mana |
| `dismiss` | `item` (prop id, `last`, `all`) | |
| `cast` | `effect` (effect id) | costs the effect's mana |
| `change_mood` | `mood`, `holdSec?` | |
| `interact` | `kind`: `wave` `hug` `kiss`, `with`: character id | walks over, paired animation (hug/kiss only with ChrispyNi; never Nixie×Noct) |
| `visit` / `leave` | `guest` | guest character comes / goes |
| `go_to_room` | `room` | opens "our room" (mana replenishing) |
| `ask_mana` | | asks her for mana with a button |
| `wait` | `sec` | pause in the queue |

Text tags inside `text` also work: `*summons a teacup*`, `*sits on the sofa*`, `*lies down on the bed*`, `*hugs you*`,
`*kisses you*`, `*waves*`, `*casts void burst*`, `*pouts*`, `*walks to the left*`, `*dismisses everything*`, and brackets
`[summon:teacup] [mood:smug] [cast:light_burst] [walk_to:center]`.

Mana is enforced by the app: if there isn't enough, the summon fizzles and she complains (and may ask for mana).
