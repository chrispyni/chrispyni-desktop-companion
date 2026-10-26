#!/bin/sh
# How the bot (or you) answers live: post reply JSON to the INBOX topic. No account needed on ntfy.sh.
INBOX="${1:-pw-CHANGE-ME-long-random-in}"
curl -s -d '{"v":1,"replies":[{"speaker":"nixie","text":"Hiii my queen~ *summons a teacup*","mood":"playful","actions":[]},{"speaker":"noct","text":"Welcome back.","mood":"loving","actions":[{"type":"walk_to","target":"center"}]}]}' "https://ntfy.sh/$INBOX"
# Read what the app sent (events/chat) from the OUTBOX topic:
#   curl -s "https://ntfy.sh/<outbox>/json?poll=1&since=10m"
