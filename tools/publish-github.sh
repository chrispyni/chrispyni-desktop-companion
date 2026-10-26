#!/bin/sh
# One-shot publish once `gh auth login` is done (run from the repo root on the box).
set -e
gh repo create chrispyni/project-wives --public --source=. --remote=origin \
  --description "Project Wives — desktop companions: Nixie & Noct, pixel-art elf queens living on your Windows taskbar. Moddable Electron app · Made with Grok AI" --push
gh repo edit chrispyni/project-wives --enable-issues --enable-wiki=false \
  --add-topic desktop-companion --add-topic electron --add-topic pixel-art --add-topic vtuber --add-topic desktop-pet
awk '/^## 0.1.0/{f=1;next}/^## /{f=0}f' CHANGELOG.md > /tmp/notes.md
printf '\n> **SmartScreen:** the exe is unsigned. If Windows says "Windows protected your PC", click **More info → Run anyway**.\n\nMirror: https://drive.google.com/drive/folders/134T9Tb1D0p1QkrseUDQ69pWKDkxK_l33\n' >> /tmp/notes.md
gh release create v0.1.0-alpha --prerelease --title "Project Wives v0.1.0-alpha" --notes-file /tmp/notes.md \
  dist/ProjectWives-0.1.0-alpha-portable.exe /workspace/ProjectWives-0.1.0-alpha-win.7z
