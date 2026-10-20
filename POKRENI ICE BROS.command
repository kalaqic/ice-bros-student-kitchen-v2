#!/bin/bash
# Dupli klik = pokrece Ice Bros server i otvara igru u browseru.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -d "$HOME/.nvm/versions/node" ] && export PATH="$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" | tail -1)/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nije instaliran. Skini ga sa https://nodejs.org (LTS), pa opet dupli klik na ovaj fajl."
  open "https://nodejs.org"
  read -p "Pritisni Enter za izlaz..."
  exit 1
fi
PORT=${PORT:-2567}
echo "ICE BROS server -> http://localhost:$PORT"
IP=$(ipconfig getifaddr en0 2>/dev/null)
[ -n "$IP" ] && echo "Drugi racunar u istoj mrezi: http://$IP:$PORT"
echo "Zatvori ovaj prozor (ili Ctrl+C) da ugasis server."
(sleep 1.5; open "http://localhost:$PORT") &
PORT=$PORT node server/dist/server.mjs
