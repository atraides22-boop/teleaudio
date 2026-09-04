/* TeleAudio v3.1 - La tele y la radio en tu oreja */
(function () {
  'use strict';

  // Servicio intermedio de YouTube (v4.3.5): el Mac resuelve el audio con la
  // firma anti-bot (n=/ns=) que YouTube exige y la app no puede generar.
  // Se auto-detecta al reproducir: si no responde, se usa la resolución
  // interna antigua (que fallará si YouTube bloquea la IP).
  const YT_PROXY_CANDIDATOS = [
    'http://192.168.1.88:8787',  // Mac en la red de casa
    'http://manuel-macmini.local:8787' // por si cambia la IP
  ];
  let ytProxyActivo = null; // se rellena al primer health check OK

  // Limpieza automática al arrancar (app nativa): elimina cachés y service
  // workers viejos que puedan servir versiones antiguas de la app.
  (function limpiarCaches() {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          regs.forEach(function (r) { r.unregister(); });
        });
      }
      if ('caches' in window) {
        caches.keys().then(function (keys) {
          keys.forEach(function (k) { caches.delete(k); });
        });
      }
    } catch (e) { /* sin importancia */ }
  })();

  // ================= CANALES Y EMISORAS =================
  // categorías: generalista | informativos | deportes | infantil | local (TV)
  //             populares | musicales | autonomas (Radio)
  const TV_CHANNELS = [
    // --- GENERALISTAS ---
    { id: 'la1',  name: 'La 1',           logo: 'logos/la1.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8', cat: 'generalista' },
    { id: 'la2',  name: 'La 2',           logo: 'logos/la2.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8', cat: 'generalista' },
    { id: 'canalsur', name: 'Canal Sur',  logo: 'logos/canalsur.png',   url: 'https://dfk2a268yviz9.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-ddiii1m6jt6of/CanalSurAndaluciaES.m3u8', cat: 'generalista' },
    { id: 'canalsur2', name: 'C. Sur 2',  logo: 'logos/canalsur2.png',  url: 'https://rtva-channel22.flumotion.cloud/playlist.m3u8', cat: 'generalista' },
    { id: 'eltoro', name: 'El Toro TV',   logo: 'logos/eltoro.png',     url: 'https://streaming-1.eltorotv.com/lb0/eltorotv-streaming-web/index.m3u8', cat: 'generalista' },
    { id: 'trece', name: 'TRECE',         logo: 'logos/trece.png',      url: 'https://play.cdn.enetres.net/091DB7AFBD77442B9BA2F141DCC182F5021/021/playlist.m3u8', cat: 'generalista' },
    { id: 'tv3', name: 'TV3', logo: 'logos/tv3.png', url: 'https://directes3-tv-cat.3catdirectes.cat/live-content/tv3-hls/master.m3u8', cat: 'generalista' },
    { id: 'rmtv', name: 'Real Madrid TV', logo: 'logos/rmtv.png', url: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8', cat: 'generalista' },
    // --- INFORMATIVOS ---
    { id: '24h',  name: '24h',            logo: 'logos/24h.png',        url: 'https://ztnr.rtve.es/ztnr/1694255.m3u8', cat: 'informativos' },
    { id: 'tdt324', name: '3Cat 324', logo: 'logos/tdt324.png', url: 'https://directes-tv-cat.3catdirectes.cat/live-content/canal324-hls/master.m3u8', cat: 'informativos' },
    { id: 'canalsurmas', name: 'C. Sur Noticias', logo: 'logos/canalsurmas.png', url: 'https://rtva-channel42.flumotion.cloud/playlist.m3u8', cat: 'informativos' },
    { id: 'euronews', name: 'Euronews',   logo: 'logos/euronews.png',   url: 'https://euronews-live-spa-es.fast.rakuten.tv/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6571/bitok/eyJzdGlkIjoiMDA0YjY0NTMtYjY2MC00ZTZkLTlkNzEtMTk3YTM3ZDZhZWIxIiwibWt0IjoiZXMiLCJjaCI6NjU3MSwicHRmIjoxfQ==/26034/euronews-es.m3u8', cat: 'informativos' },
    // --- DEPORTES ---
    { id: 'tdp',  name: 'Teledeporte',    logo: 'logos/tdp.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8', cat: 'deportes' },
    { id: 'esport3', name: 'Esport3', logo: 'logos/esport3.png', url: 'https://directes-tv-cat.3catdirectes.cat/live-origin/esport3-hls/master.m3u8', cat: 'deportes' },
    // --- INFANTIL ---
    { id: 'clan', name: 'Clan',           logo: 'logos/clan.png',       url: 'https://ztnr.rtve.es/ztnr/5466990.m3u8', cat: 'infantil' },
    { id: 'sx3', name: 'SX3 (infantil)', logo: 'logos/sx3.png', url: 'https://directes-tv-cat.3catdirectes.cat/live-content/super3-hls/master.m3u8', cat: 'infantil' },
    // --- LOCALES / AUTONÓMICAS ---
    { id: 'ondavalencia', name: 'Onda Valencia', logo: 'logos/ondavalencia.png', url: 'https://cloudvideo.servers10.com:8081/8116/index.m3u8', cat: 'local' },
    { id: '7tvgranada', name: '7TV Granada', logo: 'logos/7tvgranada.png', url: 'https://streaming004.gestec-video.com/hls/7TVGRANADA.m3u8', cat: 'local' },
    { id: 'musictvgranada', name: 'Music TV Granada', logo: 'logos/musictv.png', url: 'https://cloudvideo.servers10.com:8081/8032/index.m3u8', cat: 'local' },
    { id: 'rne',  name: 'RNE (TV)',       logo: 'logos/rne.png',        url: 'https://ztnr.rtve.es/ztnr/6688753.m3u8', cat: 'local' }
  ];

  const RADIO_STATIONS = [
    // --- POPULARES ---
    { id: 'ser', name: 'Cadena SER',       logo: 'logos/ser.png',    url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENASERAAC.aac', cat: 'populares' },
    { id: 'cope', name: 'COPE',            logo: 'logos/cope.png',   url: 'https://flucast09-h-cloud.flumotion.com/cope/net1.aac', cat: 'populares' },
    { id: 'onda0', name: 'Onda Cero',      logo: 'logos/onda0.png',  url: 'https://radio-atres-live.ondacero.es/api/livestream-redirect/OCAAC.aac', cat: 'populares' },
    { id: 'esradio', name: 'esRadio',      logo: 'logos/esradio.png', url: 'https://libertaddigital-radio-live1.flumotion.com/libertaddigital/ld-live1-high.aac', cat: 'populares' },
    { id: 'rmarca', name: 'Radio Marca',   logo: 'logos/rmarca.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOMARCA_NACIONALAAC.aac', cat: 'populares' },
    { id: 'rac1', name: 'RAC1',            logo: 'logos/rac1.png',   url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RAC_1.mp3', cat: 'populares' },
    { id: 'radiocable', name: 'Radiocable', logo: 'logos/radiocable.png', url: 'https://radio.radiobot.org/listen/radiocable/radio.mp3', cat: 'populares' },
    // --- MUSICALES ---
    { id: 'los40', name: 'LOS40', logo: 'logos/los40.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40AAC.aac', cat: 'musicales' },
    { id: 'los40classic', name: 'LOS40 Classic', logo: 'logos/los40.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_CLASSICAAC.aac', cat: 'musicales' },
    { id: 'los40dance', name: 'LOS40 Dance', logo: 'logos/los40.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LOS40_DANCEAAC.aac', cat: 'musicales' },
    { id: 'dial', name: 'Cadena Dial', logo: 'logos/dial.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/CADENADIALAAC.aac', cat: 'musicales' },
    { id: 'radiole', name: 'Radiolé', logo: 'logos/radiole.png', url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOLEAAC.aac', cat: 'musicales' },
    { id: 'melodia', name: 'Melodía FM', logo: 'logos/melodia.png', url: 'https://radio-atres-live.ondacero.es/api/livestream-redirect/MELODIA_FMAAC.aac', cat: 'musicales' },
    { id: 'c100', name: 'Cadena 100',      logo: 'logos/c100.png',   url: 'https://cadena100-cope.flumotion.com/chunks.m3u8', cat: 'musicales' },
    { id: 'rockfm', name: 'Rock FM',       logo: 'logos/rockfm.png', url: 'https://rockfm-cope.flumotion.com/playlist.m3u8', cat: 'musicales' },
    { id: 'kissfm', name: 'Kiss FM',       logo: 'logos/kissfm.png', url: 'https://kissfm.kissfmradio.cires21.com/kissfm.mp3', cat: 'musicales' },
    { id: 'europafm', name: 'Europa FM',   logo: 'logos/europafm.png', url: 'https://radio-atres-live.ondacero.es/api/livestream-redirect/EFMAAC.aac', cat: 'musicales' },
    // --- AUTONÓMICAS ---
    { id: 'rne1', name: 'Radio Nacional',  logo: 'logos/rne.png',    url: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r1_main.m3u8', cat: 'autonomas' },
    { id: 'rne3', name: 'Radio 3',         logo: 'logos/rne.png',    url: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r3_main.m3u8', cat: 'autonomas' },
    { id: 'rne5', name: 'Radio 5',         logo: 'logos/r5.png',     url: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r5_madrid_main.m3u8', cat: 'autonomas' },
    { id: 'clasica', name: 'Radio Clásica', logo: 'logos/rne.png',   url: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r2_main.m3u8', cat: 'autonomas' },
    { id: 'csradio', name: 'C. Sur Radio',  logo: 'logos/canalsur.png', url: 'https://rtva-live-radio.flumotion.com/rtva/csr.mp3', cat: 'autonomas' },
    { id: 'csradio_cor', name: 'C. Sur Radio Córdoba', logo: 'logos/canalsur.png', url: 'https://rtva-live-radio.flumotion.com/rtva/csrcor.mp3', cat: 'autonomas' },
    { id: 'csrmusica', name: 'C. Sur Música', logo: 'logos/canalsur.png', url: 'https://rtva-live-radio.flumotion.com/rtva/csm.mp3', cat: 'autonomas' },
    { id: 'catradio', name: 'Catalunya Ràdio', logo: 'logos/catradio.png', url: 'https://directes-radio-int.3catdirectes.cat/live-content/catalunya-radio-hls/master.m3u8', cat: 'autonomas' },
    { id: 'euskadi', name: 'Radio Euskadi', logo: 'logos/euskadi.png', url: 'https://multimedia.eitb.eus/live-content/radioeuskadi-hls/master.m3u8', cat: 'autonomas' },
    { id: 'galega', name: 'Radio Galega',   logo: 'logos/galega.png', url: 'https://crtvg-radiogalega-hls.flumotion.cloud/playlist.m3u8', cat: 'autonomas' }
  ];

  const CAT_LABELS = {
    generalista: '📺 Generalistas',
    informativos: '🗞️ Informativos',
    deportes: '⚽ Deportes',
    infantil: '🧸 Infantil',
    local: '📍 Autonómicas y locales',
    populares: '🎙️ Populares',
    musicales: '🎵 Musicales',
    autonomas: '🌍 Autonómicas'
  };

  const ALL = [...TV_CHANNELS, ...RADIO_STATIONS];

  // ================= LA CANCIÓN DEL DÍA (historial) =================
  const CANCIONES_URL = 'https://atraides22-boop.github.io/teleaudio/canciones.json';
  let songHistory = [];
  // Likes globales por fecha (los rellena el desarrollador al recibir los avisos)
  let songLikes = JSON.parse(localStorage.getItem('teleaudio_song_likes') || '{}');
  // Fechas a las que este dispositivo ya ha dado like
  const myLikes = new Set(JSON.parse(localStorage.getItem('teleaudio_my_likes') || '[]'));

  // Carga el historial: primero remoto (actualizado por el editor), luego local
  async function loadSongs() {
    try {
      const res = await fetch(CANCIONES_URL + '?v=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.canciones) && data.canciones.length) {
          songHistory = data.canciones;
          localStorage.setItem('teleaudio_song_history', JSON.stringify(songHistory));
          // Recoger los likes globales incluidos en el JSON (campo "likes")
          const likes = {};
          data.canciones.forEach(s => { if (s.likes) likes[s.fecha] = s.likes; });
          if (Object.keys(likes).length) {
            songLikes = likes;
            localStorage.setItem('teleaudio_song_likes', JSON.stringify(likes));
          }
          if (currentTab === 'cancion') renderChannels();
          return;
        }
      }
    } catch (e) { /* sin conexión o bloqueado */ }
    // Fallback: caché local
    try {
      const cached = localStorage.getItem('teleaudio_song_history');
      if (cached) songHistory = JSON.parse(cached);
    } catch (e) {}
  }

  // Canción de hoy = la que tiene la fecha de hoy; si no, la más reciente
  function getSongOfDay() {
    // Override personal (si el usuario puso una en ajustes)
    const custom = localStorage.getItem('teleaudio_song_custom');
    if (custom) {
      try {
        const c = JSON.parse(custom);
        if (c && c.url) return { fecha: new Date().toISOString().slice(0, 10), titulo: c.title, artista: c.artist, youtube: c.url, spotify: '' };
      } catch (e) {}
    }
    if (!songHistory.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    const deHoy = songHistory.find(s => s.fecha === today);
    return deHoy || songHistory[0];
  }

  function giveLike(song) {
    const fecha = song.fecha || new Date().toISOString().slice(0, 10);
    if (myLikes.has(fecha)) {
      showToast('Ya votaste esta canción 👍');
      return;
    }
    myLikes.add(fecha);
    localStorage.setItem('teleaudio_my_likes', JSON.stringify([...myLikes]));
    songLikes[fecha] = (songLikes[fecha] || 0) + 1;
    localStorage.setItem('teleaudio_song_likes', JSON.stringify(songLikes));
    // Avisar al desarrollador (solo la app nativa tiene Telegram)
    if (isNative) {
      try {
        Capacitor.Plugins.BackgroundAudio.sendLike({
          name: localStorage.getItem('teleaudio_user_name') || 'Anónimo',
          songTitle: song.titulo,
          songDate: fecha
        }).catch(() => {});
      } catch (e) {}
    }
    showToast('❤️ ¡Gracias por tu voto!');
    renderChannels();
  }

  function likeButton(song) {
    const fecha = song.fecha || new Date().toISOString().slice(0, 10);
    const voted = myLikes.has(fecha);
    const btn = document.createElement('button');
    btn.className = 'like-btn' + (voted ? ' voted' : '');
    btn.textContent = (voted ? '❤️' : '👍') + ' ' + (songLikes[fecha] || 0);
    btn.addEventListener('click', () => giveLike(song));
    return btn;
  }

  function openSongLink(url) {
    if (!url) return;
    window.open(url, isNative ? '_system' : '_blank');
  }

  // ================= DOM =================
  const $ = (id) => document.getElementById(id);
  const grid = $('channel-grid');
  const search = $('search');
  const powerBtn = $('power-fab') || $('power-btn');
  const nowPlaying = $('now-playing');
  const npLogo = $('np-logo');
  const npName = $('np-name');
  const npEq = $('np-eq');
  const statusText = $('status-text');
  const errorBanner = $('error-banner');
  const toast = $('toast');
  const timerBadge = $('timer-badge');

  // ================= ESTADO =================
  const isNative = typeof window !== 'undefined' && window.Capacitor && Capacitor.isNativePlatform();
  // El botón de salir solo tiene sentido en la app Android
  if (!isNative) {
    const ex = document.getElementById('exit-btn');
    if (ex) ex.style.display = 'none';
  }
  const audio = new Audio();
  audio.preload = 'none';
  let hls = null;
  let currentItem = null;
  let isPlaying = false;
  let currentTab = 'tv';
  let favs = new Set(JSON.parse(localStorage.getItem('teleaudio_favs') || '[]'));

  let sleepTimer = null;
  let sleepEndTime = 0;
  let alarmInterval = null;
  let alarmTime = localStorage.getItem('teleaudio_alarm_time') || null;
  let alarmChannelId = localStorage.getItem('teleaudio_alarm_channel') || null;

  // ================= RENDER =================
  function getVisibleList(tab, query) {
    const q = (query || '').trim().toLowerCase();
    let list;
    if (tab === 'tv') list = TV_CHANNELS;
    else if (tab === 'radio') list = RADIO_STATIONS;
    else if (tab === 'cancion' || tab === 'comentarios' || tab === 'social' || tab === 'youtube') return [];
    else list = ALL.filter(c => favs.has(c.id));
    return list.filter(c => !q || c.name.toLowerCase().includes(q));
  }

  function fmtSeg(totalSeg) {
    if (!isFinite(totalSeg) || totalSeg < 0) totalSeg = 0;
    const m = Math.floor(totalSeg / 60);
    const s = Math.floor(totalSeg % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtFecha(fecha) {
    try {
      const d = new Date(fecha + 'T12:00:00');
      return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return fecha; }
  }

  function songLinks(song, big) {
    const wrap = document.createElement('div');
    wrap.className = 'song-links';
    if (song.youtube) {
      const b = document.createElement('button');
      b.className = big ? 'song-play-btn yt' : 'song-mini-btn yt';
      b.textContent = '▶ YouTube';
      b.addEventListener('click', () => openSongLink(song.youtube));
      wrap.appendChild(b);
    }
    if (song.spotify) {
      const b = document.createElement('button');
      b.className = big ? 'song-play-btn sp' : 'song-mini-btn sp';
      b.textContent = '🎧 Spotify';
      b.addEventListener('click', () => openSongLink(song.spotify));
      wrap.appendChild(b);
    }
    if (!song.youtube && !song.spotify) {
      const p = document.createElement('div');
      p.className = 'song-nolink';
      p.textContent = 'Enlace próximamente…';
      wrap.appendChild(p);
    }
    return wrap;
  }

  function songDayCard(s, today) {
    const card = document.createElement('div');
    card.className = 'song-day-card' + (today ? ' today' : '');

    // Cabeza: disco pequeño + título/artista/fecha
    const head = document.createElement('div');
    head.className = 'song-day-head';

    const thumb = document.createElement('div');
    thumb.className = 'song-day-thumb';
    thumb.textContent = '🎵';

    const info = document.createElement('div');
    info.className = 'song-day-info';

    if (today) {
      const badge = document.createElement('div');
      badge.className = 'song-day-badge';
      badge.textContent = '🎵 La canción de hoy';
      info.appendChild(badge);
    }
    const title = document.createElement('div');
    title.className = 'song-day-title';
    title.textContent = s.titulo;
    const artist = document.createElement('div');
    artist.className = 'song-day-artist';
    artist.textContent = s.artista || '';
    const date = document.createElement('div');
    date.className = 'song-day-date';
    date.textContent = fmtFecha(s.fecha || new Date().toISOString().slice(0, 10));
    info.appendChild(title);
    if (artist.textContent) info.appendChild(artist);
    info.appendChild(date);

    head.appendChild(thumb);
    head.appendChild(info);
    card.appendChild(head);

    // Acciones: like + enlaces mini
    const actions = document.createElement('div');
    actions.className = 'song-day-actions';
    actions.appendChild(likeButton(s));
    actions.appendChild(songLinks(s, false));
    card.appendChild(actions);
    return card;
  }

  function renderSongOfDay() {
    grid.innerHTML = '';
    const song = getSongOfDay();
    if (!song) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Aún no hay canción del día. ¡Vuelve pronto!</div>';
      return;
    }

    // --- Canción de hoy ---
    grid.appendChild(songDayCard(song, true));

    // --- Historial de canciones anteriores ---
    const rest = songHistory.filter(s => s.fecha !== (song.fecha || ''));
    if (rest.length) {
      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = '📜 Canciones anteriores';
      grid.appendChild(header);
      rest.forEach(s => grid.appendChild(songDayCard(s, false)));
    }
  }

  function renderComments() {
    grid.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'song-card';

    const icon = document.createElement('div');
    icon.className = 'song-disc';
    icon.innerHTML = '💬';
    icon.style.animation = 'none';

    const t = document.createElement('div');
    t.className = 'song-title';
    t.textContent = '¿Qué opinas?';

    const sub = document.createElement('div');
    sub.className = 'song-artist';
    sub.textContent = 'Cuéntame qué te gusta, qué falla o qué te gustaría añadir. Tu comentario me llega directo.';

    const nameInput = document.createElement('input');
    nameInput.className = 'comment-input';
    nameInput.placeholder = 'Tu nombre (opcional)';
    nameInput.maxLength = 30;

    const textInput = document.createElement('textarea');
    textInput.className = 'comment-textarea';
    textInput.placeholder = 'Escribe tu comentario o sugerencia…';
    textInput.maxLength = 500;

    const status = document.createElement('div');
    status.className = 'comment-status';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'song-play-btn';
    sendBtn.textContent = '📨 Enviar comentario';
    sendBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Anónimo';
      const text = textInput.value.trim();
      if (!text) { status.textContent = '✏️ Escribe algo primero'; return; }
      status.textContent = '⏳ Enviando…';
      sendBtn.disabled = true;
      sendComment(name, text).then(ok => {
        if (ok) {
          status.textContent = '✅ ¡Gracias! Comentario enviado';
          textInput.value = '';
          nameInput.value = '';
        } else {
          status.textContent = '❌ No se pudo enviar. Comprueba tu conexión.';
          sendBtn.disabled = false;
        }
      });
    });

    card.appendChild(icon);
    card.appendChild(t);
    card.appendChild(sub);
    card.appendChild(nameInput);
    card.appendChild(textInput);
    card.appendChild(sendBtn);
    card.appendChild(status);
    grid.appendChild(card);
  }

  // Envío: en la app nativa lo hace el plugin (sin CORS); en web, intento directo
  // ================= YOUTUBE (SOLO AUDIO) =================
  // Pestaña donde Manuel pega un enlace de YouTube y la app reproduce
  // únicamente el audio (pantalla apagada, notificación, sin datos de video).
  // En la app nativa lo resuelve el plugin (InnerTube, como yt-dlp); en web
  // no es posible (CORS), así que se avisa y se abre el video en YouTube.

  function thumbYt(videoId) {
    return 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
  }

  function ytHistory() {
    try { return JSON.parse(localStorage.getItem('teleaudio_yt_history') || '[]'); }
    catch (e) { return []; }
  }
  function ytAddHistory(item) {
    try {
      const h = ytHistory().filter(x => x.videoId !== item.videoId);
      h.unshift(item);
      localStorage.setItem('teleaudio_yt_history', JSON.stringify(h.slice(0, 8)));
    } catch (e) {}
  }

  function renderYoutube() {
    grid.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.gridColumn = '1 / -1';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    wrap.style.width = '100%';
    grid.appendChild(wrap);

    // ---------- Cabecera ----------
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.textAlign = 'center';
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';

    const icon = document.createElement('div');
    icon.className = 'song-disc';
    icon.innerHTML = '▶️';
    icon.style.animation = 'none';

    const t = document.createElement('div');
    t.className = 'song-title';
    t.textContent = 'YouTube solo audio';

    const sub = document.createElement('div');
    sub.className = 'song-artist';
    sub.textContent = isNative
      ? 'Pega un enlace y escucha SOLO el audio, con pantalla apagada y sin gastar datos de video. Funciona como un canal más: pausa, notificación y deslizar para apagar.'
      : 'Esto solo funciona dentro de la app de TeleAudio para Android (por las restricciones de YouTube en navegadores). En la web se abre el video normal.';

    card.appendChild(icon);
    card.appendChild(t);
    card.appendChild(sub);
    wrap.appendChild(card);

    if (!isNative) {
      // ---------- Web: no se puede extraer audio, abrir YouTube ----------
      const row = document.createElement('div');
      row.className = 'alarm-row';
      row.style.justifyContent = 'center';
      row.style.width = '100%';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Pega aquí el enlace de YouTube…';
      input.style.flex = '1';
      input.minWidth = '0';
      const btn = document.createElement('button');
      btn.className = 'song-play-btn';
      btn.textContent = 'Abrir';
      btn.addEventListener('click', () => {
        const v = input.value.trim();
        if (v) {
          try { window.open(v, '_blank'); } catch (e) {}
        }
      });
      row.appendChild(input);
      row.appendChild(btn);
      wrap.appendChild(row);
      const aviso = document.createElement('div');
      aviso.className = 'comment-status';
      aviso.textContent = '📲 Descarga la app de TeleAudio (Android) para escuchar solo el audio.';
      wrap.appendChild(aviso);
      return;
    }

    // ---------- Si suena un video ahora: tarjeta activa ----------
    if (currentItem && currentItem.esYoutube) {
      const np = document.createElement('div');
      np.className = 'song-card';
      np.style.width = '100%';
      np.style.boxSizing = 'border-box';
      np.style.textAlign = 'center';
      const img = document.createElement('img');
      img.src = currentItem.logo || thumbYt(currentItem.ytVideoId || '');
      img.alt = '';
      img.style.width = '100%';
      img.style.maxWidth = '260px';
      img.style.borderRadius = '10px';
      img.style.margin = '0 auto 8px';
      img.style.display = 'block';
      const nt = document.createElement('div');
      nt.className = 'song-title';
      nt.textContent = currentItem.name;
      nt.style.fontSize = '0.95rem';
      const st = document.createElement('div');
      st.className = 'comment-status';
      st.textContent = isPlaying ? '🔊 Sonando…' : '⏸ En pausa';
      // v4.3.4: barra de progreso (adelantar/atrasar + ver cuánto queda)
      const bar = document.createElement('div');
      bar.style.cssText = 'width:100%;box-sizing:border-box;margin:6px 0 2px;display:none;';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1000';
      input.value = '0';
      input.style.cssText = 'width:100%;accent-color:#f00;height:26px;';
      const times = document.createElement('div');
      times.style.cssText = 'display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted,#999);';
      const tAct = document.createElement('span');
      tAct.textContent = '0:00';
      const tDur = document.createElement('span');
      tDur.textContent = '';
      times.appendChild(tAct);
      times.appendChild(tDur);
      bar.appendChild(input);
      bar.appendChild(times);
      let dragging = false;
      let ultimoSeekMs = 0; // v4.3.8: evita seeks duplicados (arrastre + soltar)
      let barRect = null;   // v4.3.8: rect de la barra para calcular por coordenadas
      function fracDesdeX(clientX) {
        if (!barRect || barRect.width <= 0) return null;
        return Math.min(1, Math.max(0, (clientX - barRect.left) / barRect.width));
      }
      function hacerSeek(force) {
        // Throttle: durante el arrastre se salta ~cada 200 ms; al soltar se
        // fuerza (force=true) para que el último salto llegue siempre.
        const ahora = Date.now();
        if (!force && ahora - ultimoSeekMs < 200) return;
        ultimoSeekMs = ahora;
        const frac = Number(input.value) / 1000;
        if (currentItem && currentItem.esYoutube && currentItem._durMs > 0 && window.Capacitor && Capacitor.Plugins.BackgroundAudio) {
          const ms = Math.floor(frac * currentItem._durMs);
          Capacitor.Plugins.BackgroundAudio.seekTo({ posMs: ms }).catch(() => {});
        }
      }
      function pintarPos(frac) {
        input.value = String(Math.round(frac * 1000));
        tAct.textContent = fmtSeg(Math.floor(frac * (currentItem._durMs / 1000)));
      }
      // v4.3.8: la barra se maneja “a mano” por coordenadas del dedo, con
      // touch-action:none, para que funcione aunque el WebView de Android no
      // mueva el cursor del input range ni dispare input/change al arrastrar
      // o al tocar la pista (causa del fallo: “le doy a la barra y vuelve”).
      input.style.touchAction = 'none';
      input.addEventListener('pointerdown', (e) => {
        dragging = true;
        barRect = input.getBoundingClientRect();
        try { e.preventDefault(); } catch (err) {}
      });
      input.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const frac = fracDesdeX(e.clientX);
        if (frac === null) return;
        pintarPos(frac);
        hacerSeek(false);
      });
      // Refuerzo: si el WebView sí mueve el cursor nativo y lanza input
      input.addEventListener('input', () => {
        if (currentItem && currentItem.esYoutube && currentItem._durMs > 0 && dragging) {
          const frac = Number(input.value) / 1000;
          pintarPos(frac);
          hacerSeek(false);
        }
      });
      function alSoltar(e) {
        // Ajuste final con la posición exacta del dedo (el último salto SIEMPRE
        // se envía; los eventos duplicados change/pointerup/touchend que llegan
        // juntos se filtran por el throttle de hacerSeek).
        if (e && typeof e.clientX === 'number' && currentItem && currentItem.esYoutube && currentItem._durMs > 0) {
          const frac = fracDesdeX(e.clientX);
          if (frac !== null) pintarPos(frac);
        }
        dragging = false;
        barRect = null;
        hacerSeek(true);
      }
      input.addEventListener('change', alSoltar);
      input.addEventListener('pointerup', alSoltar);
      input.addEventListener('touchend', (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        alSoltar(t || e);
      });
      input.addEventListener('pointercancel', alSoltar);
      input.addEventListener('touchcancel', alSoltar);
      // v4.3.8: un simple toque (tap) sobre la pista también salta
      input.addEventListener('click', (e) => {
        if (currentItem && currentItem.esYoutube && currentItem._durMs > 0) {
          const frac = fracDesdeX(e.clientX);
          if (frac !== null) { pintarPos(frac); hacerSeek(true); }
        }
      });
      const btnStop = document.createElement('button');
      btnStop.className = 'song-play-btn';
      btnStop.textContent = '⏹ Parar';
      btnStop.addEventListener('click', () => {
        if (currentItem && currentItem.esYoutube) {
          stopPlayback();
          if (currentTab === 'youtube') renderYoutube();
        }
      });
      np.appendChild(img);
      np.appendChild(nt);
      np.appendChild(st);
      np.appendChild(bar);
      np.appendChild(btnStop);
      wrap.appendChild(np);
      // Ticker suave: refresca barra mientras suena este vídeo (solo si la
      // pestaña YouTube está a la vista) — además sirve de diagnóstico: si la
      // barra avanza pero no se oye → el audio llega; si se queda en 0:00 → no.
      const vId = currentItem.ytVideoId || '';
      if (currentTab === 'youtube' && vId && window.Capacitor && Capacitor.Plugins.BackgroundAudio) {
        (function pollYt() {
          if (currentTab !== 'youtube' || !currentItem || !currentItem.esYoutube || currentItem.ytVideoId !== vId) return;
          Capacitor.Plugins.BackgroundAudio.getEstado().then((est) => {
            const dur = Number(est.durMs) || 0;
            const pos = Number(est.posMs) || 0;
            // v4.3.6: SOLO actualizar la duración si ExoPlayer ya la conoce
            // (dur > 0). Antes se machacaba con 0 mientras el reproductor
            // arrancaba → la barra se ocultaba y el seek quedaba desactivado.
            if (dur > 0) currentItem._durMs = dur;
            const durRef = currentItem._durMs || 0;
            if (durRef > 0) {
              bar.style.display = 'block';
              tDur.textContent = fmtSeg(Math.floor(durRef / 1000));
              if (!dragging) {
                const frac = Math.min(1, pos / durRef);
                input.value = String(Math.round(frac * 1000));
                tAct.textContent = fmtSeg(Math.floor(pos / 1000));
              }
              // Diagnóstico visible: lleva X de Y aunque "no se oiga"
              if (pos > 2000 && !st.textContent.includes('✅') && st.textContent.includes('Sonando')) {
                st.textContent = '🔊 Sonando…';
              }
            } else {
              bar.style.display = 'none';
            }
          }).catch(() => {});
          setTimeout(pollYt, 1000);
        })();
      }
      return;
    }

    // ---------- Pegar enlace ----------
    const row = document.createElement('div');
    row.className = 'alarm-row';
    row.style.width = '100%';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Pega aquí el enlace de YouTube…';
    input.style.flex = '1';
    input.minWidth = '0';
    const btn = document.createElement('button');
    btn.className = 'song-play-btn';
    btn.textContent = '▶ Escuchar audio';
    const status = document.createElement('div');
    status.className = 'comment-status';
    status.style.width = '100%';
    status.id = 'yt-status';
    const errDiv = document.createElement('div');
    errDiv.id = 'yt-error';
    errDiv.style.display = 'none';
    errDiv.style.width = '100%';
    errDiv.style.color = '#ff6b6b';
    errDiv.style.fontSize = '0.8rem';
    errDiv.style.marginTop = '4px';

    function lanzar() {
      const v = input.value.trim();
      if (!v) { status.textContent = '✏️ Pega primero el enlace'; return; }
      errDiv.style.display = 'none';
      playYoutubeLink(v, status, btn);
    }
    btn.addEventListener('click', lanzar);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') lanzar(); });
    row.appendChild(input);
    row.appendChild(btn);
    wrap.appendChild(row);
    wrap.appendChild(errDiv);
    wrap.appendChild(status);

    // v4.3.8: sección de Recientes quitada (Manuel no quiere ver los audios
    // anteriores bajo el buscador). El historial sigue guardándose en local
    // pero ya no se muestra.
  }

  // Lanza la reproducción de solo-audio de un enlace de YouTube

  // Comprueba qué servicio intermedio responde (nativo: evita bloqueos de
  // mixed-content del WebView con HTTP local).
  function detectarProxyYt() {
    if (ytProxyActivo) return Promise.resolve(ytProxyActivo);
    const comprobar = (base) => {
      return Capacitor.Plugins.BackgroundAudio.proxyHealth({ proxy: base })
        .then(r => (r && r.ok) ? base : null)
        .catch(() => null);
    };
    return comprobar(YT_PROXY_CANDIDATOS[0]).then(ok1 => {
      if (ok1) { ytProxyActivo = ok1; return ok1; }
      return comprobar(YT_PROXY_CANDIDATOS[1]).then(ok2 => {
        if (ok2) { ytProxyActivo = ok2; return ok2; }
        return null;
      });
    });
  }

  // Pide título/duración/miniatura al servicio (nativo)
  function infoProxyYt(proxy, videoId) {
    return Capacitor.Plugins.BackgroundAudio.proxyInfo({ proxy: proxy, videoId: videoId })
      .then(r => r || null)
      .catch(() => null);
  }

  function playYoutubeLink(enlace, statusEl, btnEl) {
    errorBanner.style.display = 'none';
    const setSt = (txt) => { if (statusEl) statusEl.textContent = txt; };
    if (!isNative || !window.Capacitor || !Capacitor.Plugins.BackgroundAudio) {
      setSt('❌ Esto solo funciona en la app de Android');
      return;
    }
    if (btnEl) btnEl.disabled = true;
    setSt('⏳ Buscando el audio del video…');

    // 1) Intentar con el servicio intermedio (recomendado: trae la firma anti-bot)
    detectarProxyYt().then(function (proxy) {
      if (proxy) {
        setSt('⏳ Pidiendo el audio al servicio…');
        const videoId = extraerIdWeb(enlace);
        // Pedir título real al servicio (nativo; no bloquea si falla)
        const promInfo = (videoId ? infoProxyYt(proxy, videoId) : Promise.resolve(null));
        const promPlay = Capacitor.Plugins.BackgroundAudio.playYoutubeProxy({ url: enlace, proxy: proxy });
        return promInfo.then(info => {
          return promPlay.then(res => {
            if (btnEl) btnEl.disabled = false;
            if (!res || !res.videoId) { setSt('❌ No se pudo obtener el audio'); return; }
            const videoId2 = res.videoId;
            const nombre = (info && info.title) ? info.title : (res.title || 'Video de YouTube');
            const dur = (info && info.duration) ? info.duration : 0;
            // Parar cualquier Social Radio o canal anterior y marcar como item actual
            if (bsPlaying || bsPaused) bsStop();
            stopStream();
            currentItem = {
              id: 'yt:' + videoId2,
              esYoutube: true,
              ytVideoId: videoId2,
              ytLink: enlace,
              name: nombre,
              logo: (info && info.thumbnail) ? info.thumbnail : thumbYt(videoId2),
              url: res.audioUrl || '',
              _durMs: dur ? dur * 1000 : 0
            };
            isPlaying = true;
            if (currentTab === 'youtube') renderYoutube();
            updateUI();
            setSt('✅ Sonando: ' + nombre);
            showToast('▶ ' + nombre);
          });
        }).catch((err) => {
          if (btnEl) btnEl.disabled = false;
          const msg = (err && err.message) ? err.message : '';
          setSt('❌ No se pudo reproducir (servicio). ' + msg);
          showToast('❌ Error al reproducir YouTube');
        });
      }
      // 2) Sin servicio: método antiguo de resolución directa
      try {
        Capacitor.Plugins.BackgroundAudio.playYoutube({ url: enlace })
          .then((res) => {
            if (btnEl) btnEl.disabled = false;
            if (!res || !res.videoId) { setSt('❌ No se pudo obtener el audio'); return; }
            const videoId = res.videoId;
            const nombre = res.title || 'Video de YouTube';
            // Parar cualquier Social Radio o canal anterior y marcar como item actual
            if (bsPlaying || bsPaused) bsStop();
            stopStream();
            currentItem = {
              id: 'yt:' + videoId,
              esYoutube: true,
              ytVideoId: videoId,
              ytLink: enlace,
              name: nombre,
              logo: thumbYt(videoId),
              url: res.audioUrl || ''
            };
            isPlaying = true;
            if (currentTab === 'youtube') renderYoutube();
            updateUI();
            setSt('✅ Sonando: ' + nombre);
            showToast('▶ ' + nombre);
          })
          .catch((err) => {
            if (btnEl) btnEl.disabled = false;
            const msg = (err && err.message) ? err.message : '';
            setSt('❌ No se pudo reproducir. Comprueba el enlace y tu conexión.' + (msg ? ' (' + msg + ')' : ''));
            showToast('❌ Error al reproducir YouTube');
          });
      } catch (e) {
        if (btnEl) btnEl.disabled = false;
        setSt('❌ Fallo interno al reproducir');
      }
    });
  }

  // Extrae el ID de YouTube en la web (sin depender del plugin)
  function extraerIdWeb(enlace) {
    try {
      const m = String(enlace).match(/(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)?([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
      if (/^[A-Za-z0-9_-]{11}$/.test(String(enlace).trim())) return enlace.trim();
    } catch (e) { /* no */ }
    return null;
  }

  function sendComment(name, text) {    if (isNative) {
      return new Promise(resolve => {
        try {
          Capacitor.Plugins.BackgroundAudio.sendComment({ name: name, text: text })
            .then(() => resolve(true))
            .catch(() => resolve(false));
        } catch (e) { resolve(false); }
      });
    }
    // Web: sin backend propio, se abre el correo del desarrollador
    try {
      const body = encodeURIComponent('Nombre: ' + name + '\n\n' + text);
      window.open('mailto:aparatoia50@gmail.com?subject=' + encodeURIComponent('Sugerencia TeleAudio') + '&body=' + body, '_self');
      return Promise.resolve(true);
    } catch (e) { return Promise.resolve(false); }
  }

  function renderChannels() {
    grid.innerHTML = '';
    if (currentTab === 'social') {
      renderSocial();
      return;
    }
    if (currentTab === 'youtube') {
      renderYoutube();
      return;
    }
    if (currentTab === 'comentarios') {
      renderComments();
      return;
    }
    if (currentTab === 'cancion') {
      renderSongOfDay();
      return;
    }
    const list = getVisibleList(currentTab, search.value);
    const hasQuery = (search.value || '').trim().length > 0;

    if (list.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Nada por aquí' + (currentTab === 'favs' ? ' — pulsa ❤️ en un canal para añadirlo' : '') + '</div>';
      return;
    }

    // Si hay búsqueda, mostrar plano (sin secciones)
    if (hasQuery) {
      list.forEach(ch => renderCard(ch));
      return;
    }

    // Agrupar por categoría manteniendo el orden de definición
    const seen = {};
    list.forEach(ch => {
      const cat = ch.cat || 'generalista';
      if (!seen[cat]) seen[cat] = [];
      seen[cat].push(ch);
    });

    Object.keys(seen).forEach(cat => {
      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = CAT_LABELS[cat] || cat;
      grid.appendChild(header);
      seen[cat].forEach(ch => renderCard(ch));
    });
  }

  function renderCard(ch) {
    const card = document.createElement('div');
    card.className = 'channel-card' + (currentItem && currentItem.id === ch.id ? ' active' : '') + (isPlaying && currentItem && currentItem.id === ch.id ? ' playing-now' : '');

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (favs.has(ch.id) ? ' faved' : '');
    favBtn.textContent = '❤️';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(ch.id);
    });

    const img = document.createElement('img');
    img.className = 'channel-logo';
    img.src = ch.logo;
    img.alt = ch.name;
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'icon.svg'; };

    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = ch.name;

    card.appendChild(favBtn);
    card.appendChild(img);
    card.appendChild(name);
    card.addEventListener('click', () => playItem(ch));
    grid.appendChild(card);
  }

  function toggleFav(id) {
    if (favs.has(id)) { favs.delete(id); showToast('Quitado de favoritos'); }
    else { favs.add(id); showToast('❤️ Añadido a favoritos'); }
    localStorage.setItem('teleaudio_favs', JSON.stringify([...favs]));
    renderChannels();
  }

  // ================= REPRODUCCIÓN =================

  // Pausa la reproducción pero RECUERDA el canal para poder reanudar
  function pausePlayback() {
    if (isNative) {
      // v4.3.6: YouTube → PAUSA REAL (servicio vivo, posición conservada).
      // TV/Radio en directo → se para el servicio (al reanudar se relanza el
      // directo actual; pausar un stream en vivo y reanudar el buffer viejo
      // dejaría la emisora "atrasada").
      if (currentItem && currentItem.esYoutube) {
        try { Capacitor.Plugins.BackgroundAudio.pause(); } catch (e) {}
      } else {
        try { Capacitor.Plugins.BackgroundAudio.stop(); } catch (e) {}
      }
      try { Capacitor.Plugins.BackgroundAudio.stopSocialRadio(); } catch (e) {}
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    } else {
      // En web: pausar el audio sin soltar la fuente
      if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
      audio.pause();
    }
    isPlaying = false;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateUI();
    statusText.textContent = '⏸ Pausado: ' + (currentItem ? currentItem.name : '');
    showToast('⏸ Pausado');
    // Refrescar la tarjeta de la pestaña YouTube si es un video
    if (currentTab === 'youtube' && currentItem && currentItem.esYoutube) renderYoutube();
  }

  function playItem(ch) {
    errorBanner.style.display = 'none';
    // Item de YouTube: se re-resuelve el audio (la URL caduca a las ~6 h)
    if (ch && ch.esYoutube) {
      const statusEl = document.querySelector('#yt-status');
      playYoutubeLink(ch.ytLink || ch.url, statusEl, null);
      return;
    }
    currentItem = ch;
    if (bsPlaying || bsPaused) bsStop();
    stopStream();

    if (isNative) {
      try {
        // Pasamos la lista completa (TV o Radio) para que el reproductor del sistema
        // (notificación / pantalla bloqueo) pueda saltar de canal con ⏮/⏭.
        const enTv = TV_CHANNELS.some(c => c.id === ch.id);
        const lista = enTv ? TV_CHANNELS : (RADIO_STATIONS.some(c => c.id === ch.id) ? RADIO_STATIONS : null);
        const payload = { url: ch.url, title: ch.name, subtitle: 'TeleAudio' };
        if (lista && lista.length > 1) {
          payload.lista = lista.map(c => ({ url: c.url, title: c.name }));
          payload.idx = Math.max(0, lista.findIndex(c => c.id === ch.id));
        }
        Capacitor.Plugins.BackgroundAudio.play(payload);
        isPlaying = true;
        updateUI();
        showToast('▶ ' + ch.name);
      } catch (e) {
        showError();
      }
      return;
    }

    const canPlayHls = audio.canPlayType('application/vnd.apple.mpegurl');
    const isHls = ch.url.includes('.m3u8');

    if (isHls && !canPlayHls && window.Hls && Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 180, maxMaxBufferLength: 300 });
      hls.loadSource(ch.url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.ERROR, (e, data) => { if (data.fatal) showError(); });
    } else {
      audio.src = ch.url;
    }

    audio.play()
      .then(() => { isPlaying = true; updateUI(); setMediaSession(ch); })
      .catch(() => { audio.play().catch(showError); });
    updateUI();
    showToast('▶ ' + ch.name);
  }

  function stopStream() {
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }

  function stopPlayback() {
    if (isNative) {
      // v4.3.6: parar del todo (destruye el servicio) → método stop()
      try { Capacitor.Plugins.BackgroundAudio.stop(); } catch (e) {}
      try { Capacitor.Plugins.BackgroundAudio.stopSocialRadio(); } catch (e) {}
    }
    bsStop();
    stopStream();
    isPlaying = false;
    currentItem = null;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateUI();
    statusText.textContent = 'Toca un canal para escucharlo';
  }

  function showError() {
    errorBanner.style.display = 'block';
    isPlaying = false;
    updateUI();
  }

  // ================= UI =================
  function updateUI() {
    // El FAB muestra ⏸ si suena algo (canal o Social Radio) y ▶ si está pausado
    const algoSonando = isPlaying || bsPlaying;
    const algoPausado = (currentItem && !isPlaying) || bsPaused;
    powerBtn.classList.toggle('playing', algoSonando);
    powerBtn.classList.toggle('paused-state', algoPausado);
    if (typeof updateFabSide === 'function') updateFabSide();
    if (currentItem) {
      nowPlaying.style.display = 'flex';
      npLogo.src = currentItem.logo;
      npName.textContent = currentItem.name;
      npEq.classList.toggle('paused', !isPlaying);
      statusText.textContent = isPlaying ? 'Reproduciendo ' + currentItem.name : '⏸ Pausado: ' + currentItem.name;
    } else {
      nowPlaying.style.display = 'none';
      npEq.classList.add('paused');
    }
    updateTimerBadge();
    document.querySelectorAll('.channel-card').forEach(card => {
      const nm = card.querySelector('.channel-name');
      const isCur = currentItem && nm && nm.textContent === currentItem.name;
      card.classList.toggle('active', !!isCur);
      card.classList.toggle('playing-now', !!isCur && isPlaying);
    });
  }

  // ================= MEDIA SESSION (pantalla bloqueada) =================
  function setMediaSession(ch) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ch.name,
      artist: 'TeleAudio',
      album: 'En directo'
    });
    navigator.mediaSession.setActionHandler('play', () => { if (currentItem) playItem(currentItem); });
    navigator.mediaSession.setActionHandler('pause', pausePlayback);
    navigator.mediaSession.setActionHandler('previoustrack', () => changeChannel(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => changeChannel(+1));
  }

  function changeChannel(dir) {
    if (!currentItem) return;
    // Buscar el canal en su lista real (TV o Radio), sin depender de la pestaña
    const list = TV_CHANNELS.some(c => c.id === currentItem.id) ? TV_CHANNELS : RADIO_STATIONS;
    const idx = list.findIndex(c => c.id === currentItem.id);
    if (idx === -1) return;
    const next = list[(idx + dir + list.length) % list.length];
    playItem(next);
  }

  // ================= GESTOS (deslizar) =================
  let touchX = null;
  document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 60) changeChannel(dx > 0 ? -1 : +1);
    touchX = null;
  }, { passive: true });

  // ================= TEMPORIZADOR DE APAGADO =================
  function setSleepTimer(minutes) {
    clearTimeout(sleepTimer);
    if (!minutes) {
      sleepEndTime = 0;
      showToast('Temporizador apagado');
    } else {
      sleepEndTime = Date.now() + minutes * 60000;
      sleepTimer = setTimeout(() => {
        stopPlayback();
        showToast('⏱ Apagado por temporizador');
        sleepEndTime = 0;
        updateTimerBadge();
      }, minutes * 60000);
      showToast('⏱ Apaga en ' + minutes + ' min');
    }
    updateTimerBadge();
    closeModal('settings-modal');
  }

  function updateTimerBadge() {
    if (sleepEndTime > Date.now()) {
      const s = Math.max(1, Math.round((sleepEndTime - Date.now()) / 1000));
      const m = Math.floor(s / 60), ss = s % 60;
      timerBadge.textContent = '⏱ ' + m + ':' + String(ss).padStart(2, '0');
      timerBadge.style.display = 'inline';
      setTimeout(updateTimerBadge, 1000);
    } else {
      timerBadge.style.display = 'none';
    }
  }

  // ================= DESPERTADOR =================
  function setupAlarm() {
    const sel = $('alarm-channel');
    sel.innerHTML = '';
    ALL.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch.id;
      opt.textContent = ch.name;
      sel.appendChild(opt);
    });
    if (alarmChannelId && ALL.some(c => c.id === alarmChannelId)) sel.value = alarmChannelId;
    if (alarmTime) $('alarm-time').value = alarmTime;

    $('alarm-set-btn').addEventListener('click', () => {
      alarmTime = $('alarm-time').value;
      alarmChannelId = sel.value;
      localStorage.setItem('teleaudio_alarm_time', alarmTime);
      localStorage.setItem('teleaudio_alarm_channel', alarmChannelId);
      startAlarmCheck();
      showToast('⏰ Despertador a las ' + alarmTime);
    });

    startAlarmCheck();
  }

  function startAlarmCheck() {
    if (alarmInterval) clearInterval(alarmInterval);
    const statusEl = $('alarm-status');
    if (!alarmTime) { statusEl.textContent = ''; return; }
    alarmInterval = setInterval(() => {
      const now = new Date();
      const [h, m] = alarmTime.split(':').map(Number);
      if (now.getHours() === h && now.getMinutes() === m && now.getSeconds() === 0) {
        const ch = ALL.find(c => c.id === alarmChannelId);
        if (ch) playItem(ch);
        showToast('⏰ ¡Buenos días! ' + (ch ? ch.name : ''));
      }
    }, 1000);
    statusEl.textContent = '🔔 Despertador activo a las ' + alarmTime;
  }

  // ================= TEMA =================
  function setTheme(t) {
    document.body.classList.toggle('light', t === 'light');
    localStorage.setItem('teleaudio_theme', t);
    $('meta-theme').setAttribute('content', t === 'light' ? '#f1f5f9' : '#0b0f19');
  }

  // ================= MODAL =================
  function openModal(id) { $(id).style.display = 'flex'; }
  function closeModal(id) { $(id).style.display = 'none'; }

  // ================= EVENTOS =================
  powerBtn.addEventListener('click', () => {
    if (isPlaying) {
      // Canal sonando → pausa (recordando el canal)
      pausePlayback();
    } else if (currentItem) {
      // v4.3.6: si es un YouTube que el servicio aún tiene cargado (pausado),
      // reanudar EN EL SITIO (resume) en vez de re-resolver el vídeo desde 0.
      if (currentItem.esYoutube && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.BackgroundAudio && Capacitor.Plugins.BackgroundAudio.resume) {
        Capacitor.Plugins.BackgroundAudio.getEstado().then((est) => {
          if (est && est.tvUrl && est.tvUrl === currentItem.url && !est.tvSonando) {
            Capacitor.Plugins.BackgroundAudio.resume();
            isPlaying = true;
            updateUI();
            showToast('▶ ' + currentItem.name);
          } else {
            playItem(currentItem);
          }
        }).catch(() => playItem(currentItem));
        return;
      }
      // Canal pausado → reanudar el mismo canal
      playItem(currentItem);
      showToast('▶ ' + currentItem.name);
    } else if (bsPlaying) {
      // Social Radio sonando → pausa (se puede reanudar)
      bsPause();
      showToast('⏸ Social Radio en pausa');
    } else if (bsPaused) {
      // Social Radio pausada → reanudar
      bsResume();
      showToast('▶ Social Radio reanudada');
    } else {
      showToast('Selecciona un canal o emisora');
    }
  });

  // Botones anterior/siguiente de la barra flotante
  const prevFab = $('prev-fab');
  const nextFab = $('next-fab');
  function updateFabSide() {
    // Botones laterales activos si hay canal O social radio sonando/pausada
    const activo = !!currentItem || bsPlaying || bsPaused;
    prevFab.classList.toggle('has-item', activo);
    nextFab.classList.toggle('has-item', activo);
  }
  prevFab.addEventListener('click', () => {
    if (currentItem && currentItem.esYoutube) {
      showToast('▶️ YouTube: sin canales anterior/siguiente');
      return;
    }
    if (currentItem) {
      // Canal de TV/Radio sonando → canal anterior
      if (bsPlaying || bsPaused) bsStop();
      changeChannel(-1);
      showToast('◀ ' + currentItem.name);
      return;
    }
    // Social Radio: cambiar de emisora (o post anterior en el timeline nativo)
    if (bsPlaying || bsPaused) {
      if (isNative && bsSource === 'timeline') {
        try { Capacitor.Plugins.BackgroundAudio.prevSocialRadio(); } catch (e) {}
        return;
      }
      bsCambiarEmisora(-1);
      return;
    }
    showToast('Primero elige un canal o emisora');
  });
  nextFab.addEventListener('click', () => {
    if (currentItem && currentItem.esYoutube) {
      showToast('▶️ YouTube: sin canales anterior/siguiente');
      return;
    }
    if (currentItem) {
      // Canal de TV/Radio sonando → canal siguiente
      if (bsPlaying || bsPaused) bsStop();
      changeChannel(+1);
      showToast(currentItem.name + ' ▶');
      return;
    }
    // Social Radio: cambiar de emisora (o post siguiente en el timeline nativo)
    if (bsPlaying || bsPaused) {
      if (isNative && bsSource === 'timeline') {
        try { Capacitor.Plugins.BackgroundAudio.nextSocialRadio(); } catch (e) {}
        return;
      }
      bsCambiarEmisora(+1);
      return;
    }
    showToast('Primero elige un canal o emisora');
  });

  search.addEventListener('input', renderChannels);

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      // Cada vez que se abre 'Canción del día', buscar la versión más nueva
      if (currentTab === 'cancion') loadSongs();
      renderChannels();
    });
  });

  // Botón salir: cierra la app del todo (solo app nativa; en web avisa)
  const exitBtn = $('exit-btn');
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      try { stopPlayback(); } catch (e) {}
      if (isNative && window.Capacitor && Capacitor.Plugins.BackgroundAudio) {
        try {
          Capacitor.Plugins.BackgroundAudio.exitApp().then(() => {
            // si no se ha cerrado solo, forzar el cierre
            setTimeout(() => {
              try { Capacitor.Plugins.BackgroundAudio.exitApp(); } catch (e2) {}
            }, 800);
          }).catch(() => {
            try { Capacitor.Plugins.BackgroundAudio.exitApp(); } catch (e2) {}
          });
        } catch (e) {
          // último recurso: que el sistema lo gestione
        }
      } else {
        if (window.close) window.close();
        showToast('👋 ¡Hasta luego!');
      }
    });
  }

  $('settings-btn').addEventListener('click', () => openModal('settings-modal'));
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $('settings-modal').addEventListener('click', (e) => { if (e.target === $('settings-modal')) closeModal('settings-modal'); });

  document.querySelectorAll('[data-timer]').forEach(btn => {
    btn.addEventListener('click', () => setSleepTimer(parseInt(btn.dataset.timer, 10)));
  });

  // Canción del día personalizada
  $('song-set-btn').addEventListener('click', () => {
    const url = $('song-url').value.trim();
    const title = $('song-title').value.trim() || 'Mi canción';
    const artist = $('song-artist').value.trim() || '';
    if (!url) { showToast('Pon la URL del audio primero'); return; }
    localStorage.setItem('teleaudio_song_custom', JSON.stringify({ title: title, artist: artist, url: url }));
    if (currentTab === 'cancion') renderChannels();
    closeModal('settings-modal');
    showToast('🎵 Canción del día cambiada');
  });
  $('song-reset-btn').addEventListener('click', () => {
    localStorage.removeItem('teleaudio_song_custom');
    if (currentTab === 'cancion') renderChannels();
    closeModal('settings-modal');
    showToast('↺ Rotación automática de nuevo');
  });

  $('theme-dark-btn').addEventListener('click', () => setTheme('dark'));
  $('theme-light-btn').addEventListener('click', () => setTheme('light'));

  // ================= TOAST =================
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // ================= PWA =================
  if (!isNative && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ================= SOCIAL RADIO (BLUESKY) =================
  const BS_URL = 'https://bsky.social';
  const BS_PUBLIC = 'https://public.api.bsky.app';
  let bsToken = null;
  let bsFeed = [];
  let bsPlaying = false;
  let bsCurrent = -1;
  let bsTimer = null;
  let bsSource = null; // 'timeline' o id de emisora
  let bsPaused = false; // Social Radio en pausa (se puede reanudar)
  let bsEmisoraIdx = -1; // índice de la emisora actual en BS_EMISORAS (-1 = timeline)
  let bsRenderCb = null; // callback de renderSocial para refrescar botones al cambiar de emisora
  let bsFeedBox = null; // caja de feed visible (creada por renderSocial)

  // Emisoras generales: cuentas públicas que cualquiera puede escuchar SIN cuenta
  // name corto para la cuadrícula; handles = cuentas; desc = tooltip
  const BS_EMISORAS = [
    { id: 'noticias', icon: '📰', name: 'Noticias', desc: 'El País, RTVE, ABC, 20minutos, El Español', handles: ['elpais.com', 'rtvenoticias.rtve.es', 'abc.es', '20minutos.es', 'elespanol.com'] },
    { id: 'tiempo', icon: '🌡️', name: 'El Tiempo', desc: 'AEMET: avisos y temperaturas', handles: ['aemet.es'] },
    { id: 'deportes', icon: '⚽', name: 'Deportes', desc: 'AS, Sport', handles: ['as.com', 'sport.es'] },
    { id: 'cordoba', icon: '🏛️', name: 'Córdoba', desc: 'Cordópolis, tu tierra', handles: ['cordopolis.es'] },
    { id: 'tecnologia', icon: '💻', name: 'Tecnología', desc: 'Xataka, Genbeta: gadgets y software', handles: ['xataka.bsky.social', 'genbeta.bsky.social'] },
    { id: 'ia', icon: '🤖', name: 'Inteligencia Artificial', desc: 'RevistaIA y más', handles: ['revistaia.bsky.social', 'genbeta.bsky.social', 'elpaiscyt.bsky.social'] },
    { id: 'juegos', icon: '🎮', name: 'Videojuegos', desc: 'VidaExtra, Nintenderos, 3DJuegos', handles: ['vidaextracom.bsky.social', 'nintenderos.com', '3djuegos.bsky.social'] },
    { id: 'ciencia', icon: '🔬', name: 'Ciencia', desc: 'Muy Interesante, El País Ciencia', handles: ['muyinteresante.com', 'elpaiscyt.bsky.social', 'apuntesciencia.bsky.social'] },
    { id: 'humor', icon: '😂', name: 'Humor', desc: 'El Mundo Today', handles: ['elmundotoday.com'] },
    { id: 'cultura', icon: '🎨', name: 'Cultura', desc: 'elDiario Cultura, Min. Cultura', handles: ['eldiariocultura.bsky.social', 'culturagob.bsky.social'] },
    { id: 'musica', icon: '🎸', name: 'Música', desc: 'Historias y leyendas de la música', handles: ['lahistorieta.bsky.social'] },
    { id: 'salud', icon: '🩺', name: 'Salud', desc: 'Sanidad, MSF, Infosalus', handles: ['sanidad.gob.es', 'msfespana.bsky.social', 'infosalus.com'] },
    { id: 'economia', icon: '📈', name: 'Economía', desc: 'Economía Justa, CGT economía', handles: ['economiajusta.bsky.social', 'economiacgt.es'] },
    { id: 'animales', icon: '🐾', name: 'Animales', desc: 'Fotos y curiosidades animales', handles: ['animales.pro', 'animalesgob.bsky.social', 'animaritos.bsky.social'] },
    { id: 'comida', icon: '🍳', name: 'Comida', desc: 'El Comidista, Gastronomía y Cía', handles: ['elcomidista.bsky.social', 'gastronomiaycia.bsky.social'] }
  ];

  // Cargar credenciales guardadas
  function getBsCreds() {
    try {
      return JSON.parse(localStorage.getItem('teleaudio_bs_creds') || 'null');
    } catch (e) { return null; }
  }

  async function bsLogin(identifier, password) {
    const res = await fetch(BS_URL + '/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier, password: password })
    });
    const data = await res.json();
    if (!res.ok || !data.accessJwt) throw new Error(data.message || data.error || 'Error al conectar');
    bsToken = data.accessJwt;
    return data.handle;
  }

  async function bsFetchTimeline() {
    if (!bsToken) return [];
    const res = await fetch(BS_URL + '/xrpc/app.bsky.feed.getTimeline?limit=15', {
      headers: { 'Authorization': 'Bearer ' + bsToken }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al leer el timeline');
    return (data.feed || []).map(item => {
      const p = item.post || {};
      const rec = p.record || {};
      // Quitar URLs y menciones para que la voz lea mejor
      let text = limpiarPost(rec.text || '');
      const author = (p.author && (p.author.displayName || p.author.handle)) || 'Alguien';
      return { author: author, text: text, time: (rec.createdAt || '').slice(0, 10) };
    }).filter(s => s.text.length > 0);
  }

  // Lee los últimos posts de cuentas públicas SIN necesidad de cuenta
  async function bsFetchPublic(handles) {
    const todos = [];
    for (const h of handles) {
      try {
        const res = await fetch(BS_PUBLIC + '/xrpc/app.bsky.feed.getAuthorFeed?actor=' + encodeURIComponent(h) + '&limit=4');
        const data = await res.json();
        if (!res.ok) continue;
        (data.feed || []).forEach(item => {
          const p = item.post || {};
          const rec = p.record || {};
          const author = (p.author && (p.author.displayName || p.author.handle)) || h;
          todos.push({ author: author, text: limpiarPost(rec.text || ''), time: (rec.createdAt || '').slice(0, 10) });
        });
      } catch (e) { /* saltar cuenta con error */ }
    }
    return todos
      .filter(s => s.text.length > 0)
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 18);
  }

  // Limpia el texto de un post para que la voz lea bien: URLs, menciones, emojis raros
  function limpiarPost(txt) {
    return (txt || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/@\S+/g, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '')
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function bsStop() {
    bsResetLocal();
    if (isNative) {
      try { Capacitor.Plugins.BackgroundAudio.stopSocialRadio(); } catch (e) {}
    }
  }

  // Limpia SOLO el estado visual/UI (sin tocar el servicio nativo).
  // Útil cuando el usuario apaga la Social desde la notificación.
  function bsResetLocal() {
    bsPlaying = false;
    bsPaused = false;
    bsCurrent = -1;
    clearInterval(bsTimer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const st = document.getElementById('bs-status');
    if (st) st.textContent = '';
    bsMarcaEmisoras();
    updateUI();
  }

  // Nombre legible de lo que suena en la Social Radio (para estados y toasts)
  function bsLabelActual() {
    if (bsSource === 'timeline') return 'tu timeline';
    const em = BS_EMISORAS.find(e => e.id === bsSource);
    return em ? em.name : 'Social Radio';
  }

  // Pausa la Social Radio (guarda el feed para poder reanudar)
  function bsPause() {
    if (!bsPlaying) return;
    clearInterval(bsTimer);
    if (isNative) {
      try { Capacitor.Plugins.BackgroundAudio.pauseSocialRadio(); } catch (e) {}
    }
    if ('speechSynthesis' in window) {
      // Pausa real: conserva la posición exacta de la voz
      if (speechSynthesis.speaking) {
        speechSynthesis.pause();
      } else {
        speechSynthesis.cancel();
      }
    }
    bsPlaying = false;
    bsPaused = true;
    const st = document.getElementById('bs-status');
    if (st) st.textContent = '⏸ Pausado · ' + bsLabelActual();
    updateUI();
  }

  // Reanuda la Social Radio desde donde se quedó
  function bsResume() {
    if (!bsPaused) return;
    bsPaused = false;
    bsPlaying = true;
    if (isNative) {
      // El servicio nativo guarda el post actual y reanuda desde ahí
      try {
        Capacitor.Plugins.BackgroundAudio.resumeSocialRadio();
      } catch (e) {
        // Si el servicio se había cerrado, relanzamos el feed
        const frases = bsFeed.map(item => 'De ' + item.author + '. ' + item.text);
        try {
          Capacitor.Plugins.BackgroundAudio.startSocialRadio({ frases: frases });
        } catch (e2) { bsPlaying = false; bsPaused = true; }
      }
      return;
    }
    if ('speechSynthesis' in window) {
      if (speechSynthesis.paused) {
        speechSynthesis.resume(); // sigue en la misma palabra
      } else {
        bsSpeakNext();
        bsTimer = setInterval(() => { if (!speechSynthesis.speaking) bsSpeakNext(); }, 1000);
      }
    }
    updateUI();
  }

  function bsSpeakNext() {
    if (!bsPlaying) return;
    if ('speechSynthesis' in window && speechSynthesis.speaking) return;

    bsCurrent++;
    if (bsCurrent >= bsFeed.length) {
      // Bucle: empieza de nuevo (como una radio)
      bsCurrent = 0;
    }
    const item = bsFeed[bsCurrent];
    const st = document.getElementById('bs-status');
    if (st) st.textContent = '🎙️ ' + item.author;

    const frase = 'De ' + item.author + '. ' + item.text;
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = 'es-ES';
      u.rate = 1.05;
      const voices = speechSynthesis.getVoices();
      const es = voices.find(v => v.lang.startsWith('es'));
      if (es) u.voice = es;
      u.onend = () => setTimeout(bsSpeakNext, 4000); // pausa entre posts
      u.onerror = () => setTimeout(bsSpeakNext, 2000);
      speechSynthesis.speak(u);
    }
  }

  // Refresca qué botón de emisora se ve activo (si la cuadrícula está visible)
  function bsMarcaEmisoras() {
    const es = bsSource === 'timeline' ? null : BS_EMISORAS.find(e => e.id === bsSource);
    document.querySelectorAll('.social-emisora').forEach(b => {
      b.classList.toggle('playing', !!(es && b.dataset.emId === es.id && bsPlaying));
    });
  }

  // Arranca la lectura de un feed (común a emisoras y timeline)
  function arrancarFeed(feed, label, playBtnRef) {
    // Recordamos la fuente para poder restaurarla si Android recrea la vista
    try {
      localStorage.setItem('teleaudio_bs_last_source', bsSource || '');
      localStorage.setItem('teleaudio_bs_last_label', label || '');
    } catch (e) {}
    // Exclusión mutua con TV/radio: si sonaba un canal, lo paramos y limpiamos
    // currentItem. Si no, el FAB ⏮/⏭ sigue priorizando el canal y "salta la
    // radio" en vez de cambiar de emisora Social.
    if (currentItem) {
      if (isNative) {
        // v4.3.6: parar el canal del todo antes de la radio social
        try { Capacitor.Plugins.BackgroundAudio.stop(); } catch (e) {}
      }
      stopStream();
      isPlaying = false;
      currentItem = null;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
    // En nativo NO paramos el servicio antes de arrancar: ACTION_START ya corta la
    // voz anterior y reinicia solo. Parar (STOP) y arrancar (START) como dos intents
    // separados provoca una carrera que deja el servicio muerto y la radio "pillada
    // en pausa" al cambiar de emisora. En web sí paramos la voz previa.
    if (!isNative) {
      if (bsPlaying || bsPaused) bsStop();
    } else {
      clearInterval(bsTimer);
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
    bsFeed = feed;
    bsPlaying = true;
    bsPaused = false;
    bsCurrent = -1;
    if (playBtnRef) playBtnRef.textContent = '⏹ Parar radio';
    if (bsFeedBox) {
      bsFeedBox.style.display = 'block';
      bsFeedBox.innerHTML = '';
      feed.slice(0, 8).forEach(item => {
        const row = document.createElement('div');
        row.className = 'bs-feed-item';
        row.innerHTML = '<b>' + item.author + '</b> · ' + item.text.slice(0, 90) + '…';
        bsFeedBox.appendChild(row);
      });
    }
    const st = document.getElementById('bs-status');
    if (st) st.textContent = '🔊 ' + label + ' · ' + feed.length + ' mensajes en bucle';
    updateUI();

    if (isNative) {
      const frases = feed.map(item => 'De ' + item.author + '. ' + item.text);
      try {
        Capacitor.Plugins.BackgroundAudio.startSocialRadio({ frases: frases });
      } catch (e) {
        if (st) st.textContent = '❌ No se pudo iniciar la voz: ' + e.message;
        bsPlaying = false;
      }
    } else if ('speechSynthesis' in window) {
      bsSpeakNext();
      bsTimer = setInterval(() => { if (!speechSynthesis.speaking) bsSpeakNext(); }, 1000);
    } else {
      if (st) st.textContent = '❌ Tu navegador no tiene voz. Usa la app de Android.';
    }
  }

  // Reproduce (o para/reanuda) una emisora por su id. Usado por la cuadrícula y por los FAB ⏮⏭
  async function bsPlayEmisoraById(id, btnRef) {
    const em = BS_EMISORAS.find(e => e.id === id);
    if (!em) return;
    const st = document.getElementById('bs-status');

    // Misma emisora sonando → parar
    if (bsPlaying && bsSource === em.id) {
      bsStop();
      bsMarcaEmisoras();
      if (bsFeedBox) bsFeedBox.style.display = 'none';
      return;
    }
    // Misma emisora en pausa → reanudar
    if (bsPaused && bsSource === em.id) {
      bsResume();
      bsMarcaEmisoras();
      return;
    }
    if (st) st.textContent = '⏳ Buscando lo último de ' + em.name + '…';
    try {
      const feed = await bsFetchPublic(em.handles);
      if (!feed.length) { if (st) st.textContent = '😴 Ahora mismo no hay mensajes'; return; }
      bsSource = em.id;
      bsEmisoraIdx = BS_EMISORAS.indexOf(em);
      arrancarFeed(feed, em.name, null);
      bsMarcaEmisoras();
    } catch (e) {
      if (st) st.textContent = '❌ ' + e.message;
    }
  }

  // Cuando el usuario pulsa ⏮/⏭ en la notificación / pantalla de bloqueo / reloj
  // (pantalla apagada), el servicio nativo avisa y aquí cambiamos de emisora.
  function setupSocialNavListener() {
    if (!isNative || !window.Capacitor || !Capacitor.Plugins.BackgroundAudio) return;
    try {
      Capacitor.Plugins.BackgroundAudio.addListener('socialNav', (data) => {
        const dir = data && data.dir ? data.dir : 0;
        if (dir === 0) return;
        // Solo actuar si estamos en una emisora (no en el timeline personal)
        if (bsSource && bsSource !== 'timeline' && (bsPlaying || bsPaused)) {
          bsCambiarEmisora(dir);
        }
      });
    } catch (e) {
      // el plugin puede no soportar listeners en versiones viejas
    }
  }

  // El reproductor del sistema (notificación / reloj / pantalla bloqueo) cambió de
  // canal TV/radio por su cuenta (playlist nativa) o cambió play/pausa.
  // Sincronizamos la interfaz.
  function setupPlaybackChangedListener() {
    if (!isNative || !window.Capacitor || !Capacitor.Plugins.BackgroundAudio) return;
    try {
      Capacitor.Plugins.BackgroundAudio.addListener('playbackChanged', (data) => {
        if (!data || !data.url) return;
        const ch = ALL.find(c => c.url === data.url);
        // Video de YouTube sonando y el reloj/notificación cambió play/pausa
        if (!ch && currentItem && currentItem.esYoutube && data.url === currentItem.url) {
          const sonando = typeof data.sonando === 'boolean' ? data.sonando : true;
          if (isPlaying !== sonando) {
            isPlaying = sonando;
            if (!sonando && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            updateUI();
            if (currentTab === 'youtube') renderYoutube();
          }
          return;
        }
        // Mismo canal que ya mostramos → solo refrescar play/pausa (viene del reloj
        // o de la notificación: pausaron/reanudaron fuera de la app).
        if (ch && currentItem && currentItem.id === ch.id) {
          const sonando = typeof data.sonando === 'boolean' ? data.sonando : true;
          if (isPlaying !== sonando) {
            isPlaying = sonando;
            if (!sonando && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            updateUI();
          }
          return;
        }
        // Canal distinto (⏭/⏮ del reloj / notificación): cambiar de canal.
        if (!ch || (currentItem && currentItem.id === ch.id)) return;
        currentItem = ch;
        isPlaying = true;
        try { setMediaSession(ch); } catch (e) {}
        updateUI();
        showToast('▶ ' + ch.name);
      });
      // Pulsaron ⏻ Apagar en la notificación del reproductor TV/radio.
      // OJO: solo actuamos si según la web había algo SONANDO. Si la web pausó
      // (conservando el canal para reanudar), no borramos el recuerdo.
      Capacitor.Plugins.BackgroundAudio.addListener('playbackStopped', () => {
        if (isPlaying) {
          isPlaying = false;
          currentItem = null;
          stopStream();
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
          updateUI();
          statusText.textContent = 'Toca un canal para escucharlo';
        }
      });
      // v4.3.3: el reproductor nativo no pudo abrir/reproducir la URL (p. ej.
      // YouTube devuelve 403, red cortada, formato no soportado). Mostramos el
      // mensaje REAL en pantalla en vez de quedarnos en silencio.
      Capacitor.Plugins.BackgroundAudio.addListener('playbackError', (data) => {
        const msg = (data && data.message) ? String(data.message) : 'Error de reproducción';
        if (currentItem && currentItem.esYoutube) {
          // YouTube: dejar de "sonando" y pintar el error en la propia pestaña
          isPlaying = false;
          const st = document.getElementById('yt-status');
          const err = document.getElementById('yt-error');
          if (err) {
            err.textContent = '❌ ' + msg;
            err.style.display = 'block';
          }
          if (st) st.textContent = '❌ No se pudo reproducir';
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
          updateUI();
          showToast('❌ ' + msg);
        } else {
          showToast('❌ Error: ' + msg);
        }
      });
      // Pulsaron ⏻ Apagar en la notificación de la Social Radio
      Capacitor.Plugins.BackgroundAudio.addListener('socialStopped', () => {
        if (bsPlaying || bsPaused) {
          bsResetLocal();
          showToast('🦋 Social Radio apagada');
        }
      });
      // La Social Radio cambió de estado (pausa/reanuda) desde la notificación o el reloj
      Capacitor.Plugins.BackgroundAudio.addListener('socialState', (data) => {
        if (!data) return;
        const leyendo = !!data.leyendo;
        const iniciado = !!data.iniciado;
        if (!iniciado) {
          if (bsPlaying || bsPaused) { bsResetLocal(); }
          return;
        }
        if (leyendo && !bsPlaying && bsPaused) {
          // Reanudada desde el sistema
          bsPaused = false;
          bsPlaying = true;
          updateUI();
        } else if (!leyendo && bsPlaying && !bsPaused) {
          // Pausada desde el sistema
          bsPlaying = false;
          bsPaused = true;
          const st = document.getElementById('bs-status');
          if (st) st.textContent = '⏸ Pausado · ' + bsLabelActual();
          updateUI();
        }
      });
    } catch (e) {
      // plugin sin listeners en versiones viejas
    }
  }

  // Salta a la emisora anterior/siguiente (para los botones ⏮⏭ del reproductor)
  function bsCambiarEmisora(dir) {
    if (bsSource === 'timeline') {
      showToast('En tu timeline los posts van solos 😄');
      return;
    }
    let i = BS_EMISORAS.findIndex(e => e.id === bsSource);
    if (i === -1) i = 0;
    const next = BS_EMISORAS[(i + dir + BS_EMISORAS.length) % BS_EMISORAS.length];
    showToast(next.icon + ' ' + next.name);
    bsPlayEmisoraById(next.id);
  }

  function renderSocial() {
    grid.innerHTML = '';
    const creds = getBsCreds();

    // Contenedor único que ocupa todo el ancho del grid (3 columnas)
    const wrap = document.createElement('div');
    wrap.style.gridColumn = '1 / -1';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.gap = '6px';
    wrap.style.width = '100%';
    grid.appendChild(wrap);

    // ---------- Cabecera ----------
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.textAlign = 'center';
    card.style.width = '100%';
    card.style.boxSizing = 'border-box';

    const icon = document.createElement('div');
    icon.className = 'song-disc';
    icon.innerHTML = '🦋';
    icon.style.animation = 'none';

    const t = document.createElement('div');
    t.className = 'song-title';
    t.textContent = 'Social Radio';

    const sub = document.createElement('div');
    sub.className = 'song-artist';
    sub.textContent = 'Noticias, deportes y humor leídos en voz, como una radio. Funciona sin cuenta.';

    const status = document.createElement('div');
    status.id = 'bs-status';
    status.className = 'comment-status';

    card.appendChild(icon);
    card.appendChild(t);
    card.appendChild(sub);
    wrap.appendChild(card);

    // ---------- Emisoras generales (sin cuenta) ----------
    const gTitle = document.createElement('div');
    gTitle.className = 'song-artist';
    gTitle.style.margin = '14px 0 8px';
    gTitle.style.fontWeight = '700';
    gTitle.style.fontSize = '0.95rem';
    gTitle.textContent = '📻 Emisoras · sin necesidad de cuenta';
    wrap.appendChild(gTitle);

    bsFeedBox = document.createElement('div');
    bsFeedBox.className = 'bs-feed-box';
    bsFeedBox.style.display = 'none';
    bsFeedBox.style.width = '100%';
    wrap.appendChild(bsFeedBox);

    const emisoraGrid = document.createElement('div');
    emisoraGrid.className = 'social-emisoras';

    BS_EMISORAS.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'social-emisora' + (bsPlaying && bsSource === em.id ? ' playing' : '');
      btn.dataset.emId = em.id;
      btn.title = em.icon + ' ' + em.name + ' — ' + em.desc;
      btn.innerHTML = '<span class="em-icon">' + em.icon + '</span><span class="em-name">' + em.name + '</span>';
      btn.addEventListener('click', () => bsPlayEmisoraById(em.id, btn));
      emisoraGrid.appendChild(btn);
    });
    wrap.appendChild(emisoraGrid);

    // ---------- Timeline personal (con cuenta) ----------
    const pTitle = document.createElement('div');
    pTitle.className = 'song-artist';
    pTitle.style.margin = '20px 0 4px';
    pTitle.style.fontWeight = '700';
    pTitle.style.fontSize = '0.95rem';
    pTitle.textContent = '🦋 Tu timeline (con tu cuenta de Bluesky)';
    wrap.appendChild(pTitle);

    if (creds && creds.password) {
      // --- Conectado: controles ---
      const btnRow = document.createElement('div');
      btnRow.className = 'btn-row';
      btnRow.style.width = '100%';

      const playBtn = document.createElement('button');
      playBtn.className = 'btn btn-primary';
      playBtn.style.flex = '1';
      playBtn.textContent = bsPlaying && bsSource === 'timeline' ? '⏹ Parar radio' : '▶ Escuchar mi timeline';

      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn';
      refreshBtn.title = 'Traer los posts más recientes';
      refreshBtn.textContent = '🔄 Actualizar';

      async function cargarTimeline(autoplay) {
        if (!bsToken) {
          status.textContent = '⏳ Conectando…';
          await bsLogin(creds.identifier, creds.password);
        }
        status.textContent = '⏳ Leyendo tu timeline…';
        const feed = await bsFetchTimeline();
        if (!feed.length) { status.textContent = '😴 Tu timeline está vacío por ahora'; return; }
        bsSource = 'timeline';
        bsFeedBox.style.display = 'block';
        arrancarFeed(feed, 'Tu timeline', autoplay ? playBtn : null);
        if (!autoplay) status.textContent = '✅ Timeline actualizado: ' + feed.length + ' mensajes';
      }

      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '⏳…';
        try {
          await cargarTimeline(bsPlaying && bsSource === 'timeline');
        } catch (e) {
          status.textContent = '❌ ' + e.message;
        }
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Actualizar';
      });

      playBtn.addEventListener('click', async () => {
        if (bsPlaying && bsSource === 'timeline') {
          bsStop();
          playBtn.textContent = '▶ Escuchar mi timeline';
          return;
        }
        try {
          await cargarTimeline(true);
        } catch (e) {
          status.textContent = '❌ ' + e.message;
        }
      });

      btnRow.appendChild(playBtn);
      btnRow.appendChild(refreshBtn);
      wrap.appendChild(btnRow);
    } else {
      // --- Sin conectar: formulario de conexión (compacto, a ancho completo) ---
      const formCard = document.createElement('div');
      formCard.className = 'song-card';
      formCard.style.width = '100%';
      formCard.style.boxSizing = 'border-box';
      formCard.style.alignItems = 'stretch';

      const userIn = document.createElement('input');
      userIn.className = 'comment-input';
      userIn.style.width = '100%';
      userIn.placeholder = 'Tu usuario de Bluesky (manruca.bsky.social)';
      const passIn = document.createElement('input');
      passIn.className = 'comment-input';
      passIn.style.width = '100%';
      passIn.type = 'password';
      passIn.placeholder = 'Contraseña de aplicación (xxxx-xxxx-xxxx-xxxx)';
      const hint = document.createElement('div');
      hint.className = 'comment-status';
      hint.textContent = 'Opcional: crea una contraseña de app en Bluesky → Ajustes → Privacidad y seguridad → Contraseñas de aplicación';
      const connectBtn = document.createElement('button');
      connectBtn.className = 'song-play-btn';
      connectBtn.textContent = '🔗 Conectar Bluesky';

      connectBtn.addEventListener('click', async () => {
        const id = userIn.value.trim();
        const pw = passIn.value.trim();
        if (!id || !pw) { status.textContent = '✏️ Rellena usuario y contraseña'; return; }
        status.textContent = '⏳ Conectando…';
        try {
          const handle = await bsLogin(id, pw);
          localStorage.setItem('teleaudio_bs_creds', JSON.stringify({ identifier: id, password: pw }));
          status.textContent = '✅ Conectado como ' + handle;
          renderSocial();
        } catch (e) {
          status.textContent = '❌ ' + e.message;
        }
      });

      formCard.appendChild(userIn);
      formCard.appendChild(passIn);
      formCard.appendChild(hint);
      formCard.appendChild(connectBtn);
      wrap.appendChild(formCard);
    }

    wrap.appendChild(status);
  }

  // ================= SÍNCRONO CON EL NATIVO =================
  // Si Android recrea la vista (bloqueo + tiempo en segundo plano) la web
  // arranca de cero pero el audio nativo sigue sonando. Preguntamos al
  // servicio qué está sonando y restauramos la interfaz para poder pausar
  // desde la app (bug reportado: "no me deja pausar, me pide elegir canal").
  async function sincronizarConNativo() {
    if (!isNative || !window.Capacitor || !Capacitor.Plugins.BackgroundAudio) return;
    try {
      const est = await Capacitor.Plugins.BackgroundAudio.getEstado();
      if (!est) return;

      // --- TV / Radio / YouTube (solo audio) ---
      if (est.tvUrl) {
        const ch = ALL.find(c => c.url === est.tvUrl);
        // ¿Es un video de YouTube que sigue sonando? (su URL no está en ALL)
        const esYt = !ch && est.ytVideoId;
        if (esYt) {
          // El plugin guarda el último video lanzado; recuperamos su info
          const hist = ytHistory().find(h => h.videoId === est.ytVideoId);
          const vid = est.ytVideoId;
          if (!currentItem) {
            currentItem = {
              id: 'yt:' + vid,
              esYoutube: true,
              ytVideoId: vid,
              ytLink: hist ? hist.link : null,
              name: est.tvTitulo || (hist ? hist.title : 'Video de YouTube'),
              logo: hist ? hist.thumb : thumbYt(vid),
              url: est.tvUrl
            };
            isPlaying = !!est.tvSonando;
            if (!isPlaying && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            try { setMediaSession({ name: currentItem.name, esYoutube: true }); } catch (e) {}
            const pest = 'youtube';
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            const tab = document.querySelector('.tab[data-tab="' + pest + '"]');
            if (tab) tab.classList.add('active');
            currentTab = pest;
            renderChannels();
            updateUI();
            showToast('▶ Continúa: ' + currentItem.name);
          } else if (currentItem.esYoutube && currentItem.ytVideoId === vid) {
            const sonando = !!est.tvSonando;
            if (isPlaying !== sonando) {
              isPlaying = sonando;
              if (!sonando && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
              updateUI();
              if (currentTab === 'youtube') renderYoutube();
            }
          }
        } else if (ch && !currentItem) {
          currentItem = ch;
          isPlaying = !!est.tvSonando;
          try { setMediaSession(ch); } catch (e) {}
          if (!isPlaying && 'mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
          // Activar la pestaña del canal para que se vea la tarjeta activa
          const enTv = TV_CHANNELS.some(c => c.id === ch.id);
          const pest = enTv ? 'tv' : 'radio';
          document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          const tab = document.querySelector('.tab[data-tab="' + pest + '"]');
          if (tab) tab.classList.add('active');
          currentTab = pest;
          renderChannels();
          updateUI();
          showToast('▶ Continúa: ' + ch.name);
        } else if (ch && currentItem && currentItem.id === ch.id) {
          // Mismo canal: solo refrescar play/pausa
          const sonando = !!est.tvSonando;
          if (isPlaying !== sonando) {
            isPlaying = sonando;
            updateUI();
          }
        }
      }

      // --- Social Radio ---
      if (est.socialIniciado && !bsPlaying && !bsPaused) {
        // El servicio sigue leyendo (o en pausa). La web no tiene el feed en
        // memoria (lo pidió a Bluesky la sesión anterior), así que restauramos
        // un estado "en marcha" genérico: los controles (⏸ / ⏹) funcionan
        // porque hablan con el servicio nativo.
        bsPlaying = !!est.socialLeyendo;
        bsPaused = !est.socialLeyendo;
        // Intentar recuperar qué emisora/timeline era
        try {
          const src = localStorage.getItem('teleaudio_bs_last_source') || '';
          if (src) {
            bsSource = src;
            bsEmisoraIdx = BS_EMISORAS.findIndex(e => e.id === src);
          }
        } catch (e) {}
        updateUI();
        // Si estamos en la pestaña Social, repintar (renderSocial recrea
        // #bs-status, por eso el texto se pone DESPUÉS).
        if (currentTab === 'social') renderSocial();
        const st = document.getElementById('bs-status');
        const lbl = bsSource ? bsLabelActual() : 'Social Radio';
        if (st) st.textContent = bsPlaying ? '🔊 ' + lbl + ' en marcha' : '⏸ ' + lbl + ' en pausa';
        bsMarcaEmisoras();
        showToast('🦋 ' + (bsPlaying ? 'Sigue sonando' : 'En pausa') + ': ' + lbl);
      }
    } catch (e) {
      // si el plugin no soporta getEstado, seguimos como siempre
    }
  }

  // ================= INICIO =================
  setTheme(localStorage.getItem('teleaudio_theme') || 'dark');
  setupAlarm();
  loadSongs();
  setupSocialNavListener();
  setupPlaybackChangedListener();
  renderChannels();
  sincronizarConNativo();
  // Al volver a primer plano (sin recarga), re-sincronizar por si pausaron,
  // reanudaron o apagaron desde la notificación/reloj mientras estaba detrás.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sincronizarConNativo();
  });
})();
