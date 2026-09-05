#!/usr/bin/env bash
# Actualiza tunel.json (GitHub Pages) con la URL actual del túnel de Cloudflare.
# Se ejecuta tras arrancar teleaudio-tunnel.service (ExecStartPost).
set -u
REPO="/home/manuel/apps/teleaudio"
URL=$(journalctl --user -u teleaudio-tunnel.service --no-pager 2>/dev/null | grep -o -E "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1)
if [ -z "$URL" ]; then
  sleep 12
  URL=$(journalctl --user -u teleaudio-tunnel.service --no-pager 2>/dev/null | grep -o -E "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1)
fi
[ -z "$URL" ] && exit 0
cd "$REPO" || exit 0
# Esperar a que cloudflared haya impreso la URL de ESTA ejecución (la última
# línea del log puede ser de una ejecución anterior si corre muy pronto).
sleep 4
URL_NUEVA=$(journalctl --user -u teleaudio-tunnel.service --no-pager 2>/dev/null | grep -o -E "https://[a-z0-9-]+\.trycloudflare\.com" | tail -1)
if [ -n "$URL_NUEVA" ]; then URL="$URL_NUEVA"; fi
echo "{\"url\": \"$URL\"}" > tunel.json
# Commit + push best-effort (si gh no tiene token en este contexto, se queda local)
if git diff --quiet tunel.json; then exit 0; fi
git add tunel.json
git -c user.email="aparatoia50@gmail.com" -c user.name="aparato" commit -m "tunel.json: URL actual del túnel" -q 2>/dev/null || exit 0
TOKEN=$(gh auth token 2>/dev/null) || exit 0
git -c credential.helper="!f() { echo 'username=x-access-token'; echo 'password=$TOKEN'; }; f" push -q origin master 2>/dev/null
exit 0
