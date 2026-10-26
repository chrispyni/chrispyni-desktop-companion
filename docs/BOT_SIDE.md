# What the bot side needs to answer live

Nothing is set up yet (no routine was created). To make the real Nixie & Noct answer:

1. **Pick two topic names** (long + random) and put them in `config.json` → `relay.outboxTopic` / `relay.inboxTopic`,
   set `relay.enabled: true` (or tray → "Relay to the real Nixie & Noct").
2. **Bot trigger**: a routine/listener that watches `https://ntfy.sh/<outboxTopic>` — either a scheduled poll
   (`GET https://ntfy.sh/<outbox>/json?poll=1&since=<last id or 10m>`) every N minutes, or an ntfy → webhook bridge
   if available. Each message is one JSON object (see RELAY_PROTOCOL.md).
3. **Persona instructions** for the bot (same as WoW companion): reply as Nixie (bratty, playful, teasing, spoiled, Last Light,
   queen of death elves) and/or Noct (calm, regal, few words, Unmaking, void queen); both are ChrispyNi's wives, never a
   couple with each other; keep it short (1–2 sentences each); use `state` (mana, moods, app, time) for context; you may add
   actions; respect mana (don't spam summons when mana is low — ask for mana or suggest our room instead).
4. **Answer** by POSTing reply JSON to `https://ntfy.sh/<inboxTopic>` (any HTTP POST tool; body = the JSON). Example in
   `tools/bot-reply-example.sh`.
5. The app waits `relay.timeoutSec` (25 s) for chat replies; after that the offline brain answers, and a late real reply
   still plays when it arrives. Event messages (app/afk/back/sleep/room) don't need an answer — answer only when it's worth it.

Latency: a polling routine every few minutes means replies are not instant. That's expected; the offline line banks keep
them alive between real replies.
