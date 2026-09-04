#!/usr/bin/env python3
"""
Servicio intermedio TeleAudio: traduce peticiones de audio de YouTube.
El móvil (TeleAudio) pide /audio?url=... a este servicio; el servicio
resuelve la URL real de audio con yt-dlp (incluida la firma anti-bot n=/ns=)
y la reenvía como proxy con soporte de Range (para seek).

Uso: python3 servicio_yt.py [puerto]   (por defecto 8787)
"""
import http.server
import socketserver
import subprocess
import urllib.parse
import urllib.request
import json
import os
import re
import threading
import sys
import time

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
DENO_PATH = "/home/manuel/.deno/bin"
YTDLP = "/home/manuel/.local/bin/yt-dlp"
CACHE = {}  # videoId -> {url, expire_ts}
CACHE_TTL = 3600  # 1 hora

def resolver_url_audio(video_id):
    """Resuelve la URL de audio firmada con yt-dlp (cliente web_embedded)."""
    ahora = time.time()
    if video_id in CACHE and CACHE[video_id]["expire"] > ahora:
        return CACHE[video_id]["url"]
    env = dict(os.environ)
    env["PATH"] = DENO_PATH + ":" + env.get("PATH", "")
    cmd = [
        YTDLP,
        "--extractor-args", "youtube:player_client=web_embedded",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "--get-url", "--no-playlist",
        "--no-warnings",
        "https://www.youtube.com/watch?v=" + video_id,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90, env=env)
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp error: " + proc.stderr[-500:])
    url = proc.stdout.strip().splitlines()[-1]
    if not url.startswith("http"):
        raise RuntimeError("yt-dlp no devolvió URL")
    CACHE[video_id] = {"url": url, "expire": ahora + CACHE_TTL}
    return url

class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.address_string(), fmt % args), flush=True)

    def do_HEAD(self):
        self._procesar(solo_cabeceras=True)

    def do_GET(self):
        self._procesar()

    def _procesar(self, solo_cabeceras=False):
        try:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if parsed.path == "/health":
                self._json({"ok": True})
                return
            if parsed.path == "/info":
                self._info(qs)
                return
            if parsed.path != "/audio":
                self._json({"error": "endpoint no válido. Usa /audio?url=<videoId|urlYouTube>"}, code=404)
                return
            objetivo = (qs.get("url") or qs.get("v") or [""])[0]
            if not objetivo:
                self._json({"error": "falta parámetro url"}, code=400)
                return
            # Extraer videoId de una URL de YouTube o aceptar ID directo
            m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", objetivo)
            video_id = m.group(1) if m else objetivo.strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
                self._json({"error": "videoId no válido: " + video_id}, code=400)
                return
            url_audio = resolver_url_audio(video_id)
            # Proxy: reenvía la petición (con su Range si viene) a googlevideo
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Accept": "*/*",
            }
            rango = self.headers.get("Range")
            if rango:
                headers["Range"] = rango
            req = urllib.request.Request(url_audio, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    self.send_response(resp.status)
                    # Cabeceras que interesan a ExoPlayer
                    for k in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"):
                        v = resp.headers.get(k)
                        if v:
                            self.send_header(k, v)
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    if not solo_cabeceras:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                            self.wfile.flush()
            except urllib.error.HTTPError as e:
                self._json({"error": "aguas abajo HTTP %d: %s" % (e.code, e.reason)}, code=502)
            except Exception as e:
                # Conexión cortada por el cliente (seek/stop): normal
                try:
                    self.wfile.flush()
                except Exception:
                    pass
        except Exception as e:
            try:
                self._json({"error": str(e)}, code=500)
            except Exception:
                pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _info(self, qs):
        """Devuelve título/duración/miniatura de un vídeo (con caché)."""
        objetivo = (qs.get("url") or qs.get("v") or [""])[0]
        m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", objetivo)
        video_id = m.group(1) if m else objetivo.strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
            self._json({"error": "videoId no válido"}, code=400)
            return
        env = dict(os.environ)
        env["PATH"] = DENO_PATH + ":" + env.get("PATH", "")
        cmd = [
            YTDLP,
            "--extractor-args", "youtube:player_client=web_embedded",
            "--no-playlist", "--no-warnings",
            "--print", "%(title)s",
            "--print", "%(duration)s",
            "--print", "%(thumbnail)s",
            "https://www.youtube.com/watch?v=" + video_id,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90, env=env)
            lineas = [l for l in proc.stdout.strip().splitlines() if l]
            titulo = lineas[0] if len(lineas) > 0 else "YouTube"
            dur = int(float(lineas[1])) if len(lineas) > 1 and lineas[1].isdigit() else 0
            thumb = lineas[2] if len(lineas) > 2 else ""
            self._json({"videoId": video_id, "title": titulo, "duration": dur, "thumbnail": thumb})
        except Exception as e:
            self._json({"videoId": video_id, "error": str(e)}, code=500)

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PUERTO), Handler) as httpd:
        print("Servicio TeleAudio YouTube escuchando en :%d" % PUERTO, flush=True)
        httpd.serve_forever()
