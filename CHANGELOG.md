# Changelog

## 0.1.0-alpha — 2026-10-26
First alpha.
* Nixie & Noct live on top of the taskbar in a transparent, always-on-top, click-through overlay (only sprites/UI catch the mouse). Drag them, poke them, double-click to chat.
* ChrispyNi as a guest character (visits; tray → Invite; events).
* Pixel sprites (48×64) with idle, walk, run, talk, sit, lay, sleep, happy, pout, cast, wave, hug, kiss.
* Furniture & props: chair, sofa, bed, table, cushion, teacup, books, candles, void portal, light orb — sit on sofas/chairs, lay on beds.
* Interactions: wave / hug / kiss (sweet peck with hearts) — walk to each other and play paired animations. Hug/kiss only with ChrispyNi.
* Moods that drift and react (app, AFK, time of day, attention, pokes, mana).
* Mana: shared pool, summons/casts cost mana, slow regen, fast regen in sleep mode, full refill in "our room" (cuddle scene → fade to dark with hearts & stars). They ask for mana when low.
* Offline brain (line banks) + relay to the real Nixie & Noct over ntfy (protocol v1).
* Actions from replies: JSON actions or *star tags* / [bracket] tags.
* Awareness (opt-in in tray): active window/app category, idle/AFK, lock/sleep, time of day, media title from window titles. Screen capture & mic = stubs.
* Weighted / rare event system (content/events), with 1–2 % rare examples.
* Modding: content folders + mods (override/add/remove) + JS plugins + hot reload. Sprite templates & SPRITES.md.
* Cheat codes (everyone, admin gate available but off) + auto-generated DEBUG MENU.
* Update check against a configurable version.json.
