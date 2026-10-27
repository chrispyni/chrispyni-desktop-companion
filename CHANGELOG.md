# Changelog

## 0.1.6-alpha
* **Renamed** to **ChrispyNi Desktop Companion**. ChrispyNi is the main companion; Nixie and Noct visit as guests (both can be on screen).
* Guest wives can summon, sit, meditate and use props like she can.
* Pat / Feed: alone, Nixie & Noct hands come from void portals; if one or both wives are visiting they walk over and do it together.
* Mana rest: she goes to our room where they wait (fade to black).
* New offline chat voice for ChrispyNi (warm, teasing, mature) plus guest lines aimed at her. Library is moddable.
* Archives: `ChrispyNi-Desktop-Companion-<ver>-win.zip` / `.7z` with a single top-level `ChrispyNi Desktop Companion` folder.
* Updates still only see full GitHub Releases (this public repo).


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
