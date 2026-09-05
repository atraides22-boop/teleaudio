#!/usr/bin/env python3
"""
Servicio intermedio TeleAudio: traduce peticiones de audio de YouTube.
El móvil (TeleAudio) pide /audio?url=... a este servicio; el servicio
descarga el audio con yt-dlp (cliente web_embedded + firma anti-bot n=/ns=)
a un archivo local y lo sirve con soporte de Range COMPLETO.

¿Por qué archivo local y no proxy directo? Las URLs que genera yt-dlp llevan
rqh=1, y googlevideo responde 403 a las peticiones Range que hace ExoPlayer
para ADELANTAR/ATRASAR (seek). Sirviendo el archivo desde aquí, el seek
funciona siempre (salto instantáneo sobre archivo local).

Uso: python3 servicio_yt.py [puerto]   (por defecto 8787)
"""
import http.server
import socketserver
import subprocess
import urllib.parse
import json
import os
import re
import sys
import time
import shutil

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
DENO_PATH = "/home/manuel/.deno/bin"
YTDLP = "/home/manuel/.local/bin/yt-dlp"
AUDIO_DIR = "/tmp/teleaudio_yt"
ARCHIVO_TTL = 12 * 3600  # 12 horas: pasadas, se vuelve a descargar

# v4.5.3: llave compartida con la app (el túnel público de Cloudflare expone
# este servicio a Internet; sin llave, cualquiera podría usarlo).
# /health queda abierto (lo usa la app para detectar el servicio); el resto
# exige ?k= con esta llave.
TA_KEY = "ta-2026-lucena"

# Caché de resolución RTVE (id -> [timestamp, url audio]) — 6 horas
# Las URLs DASH de RTVE son estables mientras el episodio exista; 6 h basta.
RTVE_CACHE_TTL = 6 * 3600
rtve_cache = {}


def resolver_rtve(video_id):
    """Resuelve la URL DASH de audio (MPD, solo audio) de un episodio RTVE."""
    ahora = time.time()
    dato = rtve_cache.get(video_id)
    if dato and ahora - dato[0] < RTVE_CACHE_TTL:
        return dato[1]
    env = dict(os.environ)
    env["PATH"] = DENO_PATH + ":" + env.get("PATH", "")
    cmd = [
        YTDLP,
        "--no-playlist",
        "--no-warnings",
        "-f", "dash-audio/bestaudio",
        "-g",
        "https://www.rtve.es/v/" + video_id,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
    if proc.returncode != 0:
        raise RuntimeError("yt-dlp error: " + (proc.stderr[-300:] or proc.stdout[-300:]))
    url = (proc.stdout or "").strip().splitlines()[-1].strip() if proc.stdout.strip() else ""
    if not url or not url.startswith("http"):
        raise RuntimeError("URL de audio vacía")
    rtve_cache[video_id] = [ahora, url]
    return url

os.makedirs(AUDIO_DIR, exist_ok=True)


def limpiar_viejos():
    """Borra archivos de audio con más de ARCHIVO_TTL horas."""
    ahora = time.time()
    try:
        for f in os.listdir(AUDIO_DIR):
            p = os.path.join(AUDIO_DIR, f)
            try:
                if os.path.isfile(p) and ahora - os.path.getmtime(p) > ARCHIVO_TTL:
                    os.remove(p)
            except Exception:
                pass
    except Exception:
        pass


def ruta_audio(video_id):
    return os.path.join(AUDIO_DIR, video_id + ".m4a")


def descargar_audio(video_id):
    """Descarga (o reutiliza) el audio de un vídeo a AUDIO_DIR/<id>.m4a."""
    destino = ruta_audio(video_id)
    if os.path.isfile(destino) and time.time() - os.path.getmtime(destino) < ARCHIVO_TTL:
        return destino
    # Archivo parcial viejo de una descarga anterior: se elimina
    if os.path.exists(destino):
        os.remove(destino)
    env = dict(os.environ)
    env["PATH"] = DENO_PATH + ":" + env.get("PATH", "")
    cmd = [
        YTDLP,
        "--extractor-args", "youtube:player_client=web_embedded",
        "-f", "bestaudio[ext=m4a]/bestaudio",
        "-o", destino,
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "https://www.youtube.com/watch?v=" + video_id,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, env=env)
    if proc.returncode != 0 or not os.path.isfile(destino) or os.path.getsize(destino) < 1000:
        raise RuntimeError("yt-dlp error: " + (proc.stderr[-400:] or proc.stdout[-400:]))
    return destino


def extraer_video_id(objetivo):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", objetivo)
    vid = m.group(1) if m else (objetivo or "").strip()
    return vid if re.fullmatch(r"[A-Za-z0-9_-]{11}", vid) else None


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print("[%s] %s %s" % (
            time.strftime("%H:%M:%S"), self.address_string(), fmt % args), flush=True)

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
            # Endpoints "de pago": exigen la llave (k) de la app
            if (qs.get("k") or [""])[0] != TA_KEY:
                self._json({"error": "llave no válida"}, code=403)
                return
            if parsed.path == "/info":
                self._info(qs)
                return
            if parsed.path == "/rtve":
                self._rtve(qs)
                return
            if parsed.path != "/audio":
                self._json({"error": "endpoint no válido. Usa /audio?url=<videoId|urlYouTube>"}, code=404)
                return
            objetivo = (qs.get("url") or qs.get("v") or [""])[0]
            video_id = extraer_video_id(objetivo)
            if not video_id:
                self._json({"error": "videoId no válido"}, code=400)
                return
            limpiar_viejos()
            destino = descargar_audio(video_id)
            self._servir_archivo(destino, "audio/mp4", solo_cabeceras)
        except Exception as e:
            try:
                self._json({"error": str(e)}, code=500)
            except Exception:
                pass

    def _servir_archivo(self, ruta, mime, solo_cabeceras=False):
        """Sirve un archivo local con soporte Range (bytes=a-b y bytes=a-)."""
        tamano = os.path.getsize(ruta)
        rango = self.headers.get("Range")
        inicio, fin = 0, tamano - 1
        codigo = 200
        cr = None
        if rango:
            m = re.match(r"bytes=(\d*)-(\d*)$", rango.strip())
            if m:
                a, b = m.group(1), m.group(2)
                if a:
                    inicio = int(a)
                    if b:
                        fin = int(b)
                    # sin fin: hasta el final
                elif b:
                    # bytes=-N: últimos N bytes
                    inicio = max(0, tamano - int(b))
                if inicio > fin or inicio >= tamano:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % tamano)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if fin >= tamano:
                    fin = tamano - 1
                codigo = 206
                cr = "bytes %d-%d/%d" % (inicio, fin, tamano)
            # si el Range no se entiende, se sirve el archivo entero (200)
        self.send_response(codigo)
        self.send_header("Content-Type", mime)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fin - inicio + 1))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        if cr:
            self.send_header("Content-Range", cr)
        self.end_headers()
        if solo_cabeceras:
            return
        try:
            with open(ruta, "rb") as f:
                f.seek(inicio)
                restante = fin - inicio + 1
                while restante > 0:
                    chunk = f.read(min(65536, restante))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    restante -= len(chunk)
        except Exception:
            # cliente cortó la conexión (nuevo seek/stop): normal
            pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _info(self, qs):
        """Devuelve título/duración/miniatura de un vídeo (con caché)."""
        objetivo = (qs.get("url") or qs.get("v") or [""])[0]
        video_id = extraer_video_id(objetivo)
        if not video_id:
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
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, env=env)
            if proc.returncode != 0:
                self._json({"videoId": video_id, "error": proc.stderr[-300:]}, code=500)
                return
            lineas = [l for l in proc.stdout.strip().splitlines() if l]
            titulo = lineas[0] if len(lineas) > 0 else "YouTube"
            dur = 0
            if len(lineas) > 1:
                try:
                    dur = int(float(lineas[1]))
                except ValueError:
                    dur = 0
            thumb = lineas[2] if len(lineas) > 2 else ""
            self._json({"videoId": video_id, "title": titulo, "duration": dur, "thumbnail": thumb})
        except Exception as e:
            self._json({"videoId": video_id, "error": str(e)}, code=500)

    def _rtve(self, qs):
        """Programas de TV de RTVE (F6): resuelve la URL de audio DASH (MPD
        solo-audio) de un episodio de RTVE Play vía yt-dlp (las URLs reales
        van firmadas/templadas y la API oficial no las expone). Con caché.
        El móvil reproduce el MPD directamente desde el CDN de RTVE (abierto,
        con soporte Range): aquí solo se RESUELVE, no se hace de proxy.
        Uso: /rtve?id=<videoId numerico>"""
        video_id = (qs.get("id") or [""])[0].strip()
        if not video_id or not video_id.isdigit():
            self._json({"error": "id no válido. Usa /rtve?id=<videoId>"}, code=400)
            return
        try:
            url = resolver_rtve(video_id)
            self._json({"videoId": video_id, "audioUrl": url})
        except Exception as e:
            self._json({"videoId": video_id, "error": str(e)}, code=502)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("0.0.0.0", PUERTO), Handler) as httpd:
        print("Servicio TeleAudio YouTube escuchando en :%d" % PUERTO, flush=True)
        httpd.serve_forever()
