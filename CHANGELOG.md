# Changelog

## 0.1.7-alpha
* ChrispyNi dialogue rewritten (nonchalant / mature; no "~" except secret horny mood when talking to the wives).
* Secret **horny** mood: unlocks after enough voluntary sleep-togethers (not AFK/auto sleep, not mana-room rest); 5–10% chance on wake; mana ceiling 200% of max while active; hidden from normal mood lists.
* Max mana grows and persists: +1–5 per mana spend, +5–10 after voluntary sleep-together, +10–20 after 8+ hours since last app close (system clock; quick relaunch gives nothing).
* Fix: ChrispyNi (and others) could get stuck in a looping cast/sparkle pose after using a light prop — `useProp` set `loopAnim` forever and blocked autonomous thinking. Prop uses no longer loop; hold expiry clears any leftover loop. General rule: autonomous behaviors cannot repeat endlessly (streak + duration caps; user-driven watch/sleep/drag/menu exempt).
* Character categories: ChrispyNi is **Main** (no "(wife)" tag); Nixie & Noct are **Wife**; empty **Friends** for later. Mods may set a custom `category` in character.json. Debug menu is grouped by category.
* Avatars keep ~one sprite width apart when standing (no overlapping). Walk targets pick the nearest free spot; overlapping after a drop/throw/spawn makes them gently step apart. Hug/Kiss may still bring them together briefly.
* Guest arrive/leave: the host answers ~1–2s later from the offline chat library (ChrispyNi mommy voice in the public edition).
* Public edition: Hug / Kiss are on each guest's right-click menu (Nixie / Noct) while they're present — removed from ChrispyNi's own menu. Wives edition unchanged (still on the wife while ChrispyNi visits).
* Fix: the avatar body was invisible (only the curious-look eyes showed). Edition overlays restated `sheet.png` without shipping the file, so the loader pointed at a missing path. The base sprite sheet is kept when an overlay path is missing.


## 0.1.6-alpha
* Renamed to **ChrispyNi Desktop Companion**.
* ChrispyNi is the desktop companion: walk, chat, mood, mana, pats, feeding, props, sleep, throw physics, mods, auto-update.
* Archives: `ChrispyNi-Desktop-Companion-<ver>-win.zip` / `.7z` with a single top-level folder.
* Updates still only see full GitHub Releases.


## 0.1.5-alpha
* Feeding: spam Feed and the cookies pop out right away; she eats them one after another. Up to 4-5 in a row, then she's full for 15-20 minutes and no more appear. Each cookie still gives +1 mana.
* Pats give 1-10 mana, once every 5 minutes per wife (before that she just enjoys it, no mana).
* Critical pats! A rare pat gives 20-50 mana with extra sparkles. The chance grows a little with every normal pat and resets after a crit.
* Right-click menus and info popups close when you click anywhere else (even another app or the desktop) or press Esc.
* When ChrispyNi visits, Nixie and Noct stay close to her, face her, chat with her and hug her instead of wandering off.
* While ChrispyNi visits, right-click Nixie or Noct for **Hug** and **Kiss**: ChrispyNi walks over and gives her one (a little mana and a happy wife).
* Nixie and Noct summon props on their own again now and then (a teacup, cushion, books…) and use them.
* Chat is now fully offline: a moddable reply library (`content/chat/library.json`, mods can add their own) with replies that fit each wife and moods that react to what you say. Nothing you type leaves your PC.
* The online relay chat was removed. The only network access left is the update check on GitHub.
* Mods are data-only now (JSON + images); JS plugins are no longer loaded.
* Security hardening: the app windows can't navigate anywhere or open popups and never get camera/mic permissions.
* Sleep: they walk to the nearest side of the screen, a bed appears, and they lie down with little `z` bubbles (no more peeking at the cursor). Any mouse movement, click or key press wakes them, like a monitor waking up; they yawn and stretch and the bed disappears.
* Waking from sleep now always wakes both wives, and dropping a sleeping wife wakes them too. A cursor resting still near them no longer keeps them awake or makes them stare at it.
* Falls play the falling animation once, then they land (no more replaying it after landing).
* Throwing! Drag a wife or a prop and let go while moving: it flies, bounces once off the edge of the screen and the floor, then settles. Props can now be picked up and moved.
* When Nixie or Noct is really angry, once in a while she grabs a prop or the other one and throws it (never ChrispyNi).
* The app icon is back to the original Project Wives icon.

## 0.1.4-alpha
* Updates: Nixie or Noct tells you when a new version is out, right in her speech bubble, with **Update** and **Later** buttons. No Windows popups; the app updates itself, restarts, and tells you it worked (or that it didn't, and keeps running).
* Your saves, mods and edited content are kept during updates; replaced files are backed up in `backup\`.
* Gentler walk: legs no longer swing too wide apart or cross mid-step.
* Clicking, dragging or right-clicking the wives and props no longer steals focus, so a fullscreen video stays fullscreen. Only the chat box takes keyboard focus while it's open.

## 0.1.3-alpha
* Watching together: when a video plays, they sit at the bottom of the screen and watch with you.
* Hold the cursor near a wife and she stops to look at it (only a couple of times).
* They use props lying around: sit, lie down, sip tea, read, light candles. Props nobody uses get tidied away (half the mana back).
* Cookies are endless but limited: after 4-5 in a row she's full for 15-20 minutes.
* ChrispyNi visits more often the longer it's been (soft pity).
* Clicking a mana bar offers to rest only below 50%. Bubbles and popups never hide behind the mana bar; buttons fit their text.
* Simpler tray: Talk, Go to room, About, Quit. About shows the version and checks for updates.
* Cheat switches toggle off when entered again. Debug tools appear only in debug mode.
* Pre-releases are no longer offered by the auto-updater.

## 0.1.2-alpha
* Each wife has her own mana, shown when you hover over her. Only magic uses it, with new magic between them and for ChrispyNi.
* They rest through a door to our room, one at a time or both together. Hugs, snacks and meditation restore a little.
* Hidden mood levels: sweet when happy, grumpy (and hard to pick up) when annoyed. It slowly evens out.
* Falls: a normal landing, a superhero landing or a faceplant, depending on how high you drop her.
* Right-click menus: Info, Pat, Feed (cookie) and delete props with a partial mana refund.
* Much less chatter; when you're busy they talk to each other with `…` bubbles. Very short or mashed messages get a `?`.
* Chat closes on an outside click, and the desktop behind is always clickable. Hitboxes match the sprites.
* They wander the whole screen and never leave it. ChrispyNi comes and goes through a void portal.
* Shows as "Project Wives" in Task Manager, with a new icon.
* Auto-update from GitHub Releases (keeps your saves, mods and edited content and makes a backup).

## 0.1.1 (alpha) — 2026-10-26
* Self-contained folder build: saves, settings, mods, logs and cache all stay inside the app folder. Nothing goes to AppData.
* Built-in content is now plain, editable files next to the exe.
* Clear message if the folder can't be written to (e.g. Program Files).
* The single-file portable exe is gone. Download the 7z/zip and unpack it.

## 0.1.0 (alpha) — 2026-10-26
* First alpha: Nixie & Noct on your taskbar, with speech bubbles and chat.
* Walk, run, sit, lie down, nap, cast, wave, hug and kiss. ChrispyNi visits as a guest.
* Summon furniture and props with your mana, then refill it in our room.
* Moods, awareness of what you're doing, and rare surprise events.
* Mods, sprite templates, cheat codes and a debug menu.
