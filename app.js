/* TeleAudio v3.1 - La tele y la radio en tu oreja */
(function () {
  'use strict';

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
    else if (tab === 'cancion' || tab === 'comentarios' || tab === 'social') return [];
    else list = ALL.filter(c => favs.has(c.id));
    return list.filter(c => !q || c.name.toLowerCase().includes(q));
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

  function renderSongOfDay() {
    grid.innerHTML = '';
    const song = getSongOfDay();
    if (!song) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Aún no hay canción del día. ¡Vuelve pronto!</div>';
      return;
    }

    // --- Canción de hoy (grande) ---
    const card = document.createElement('div');
    card.className = 'song-card';
    const disc = document.createElement('div');
    disc.className = 'song-disc';
    disc.innerHTML = '🎵';
    const title = document.createElement('div');
    title.className = 'song-title';
    title.textContent = song.titulo;
    const artist = document.createElement('div');
    artist.className = 'song-artist';
    artist.textContent = song.artista || '';
    const date = document.createElement('div');
    date.className = 'song-date';
    date.textContent = '🎵 La canción de hoy — ' + fmtFecha(song.fecha || new Date().toISOString().slice(0, 10));
    card.appendChild(date);
    card.appendChild(disc);
    card.appendChild(title);
    card.appendChild(artist);
    card.appendChild(likeButton(song));
    card.appendChild(songLinks(song, true));
    grid.appendChild(card);

    // --- Historial de canciones anteriores ---
    const rest = songHistory.filter(s => s.fecha !== (song.fecha || ''));
    if (rest.length) {
      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = '📜 Canciones anteriores';
      grid.appendChild(header);

      rest.forEach(s => {
        const row = document.createElement('div');
        row.className = 'song-history-row';
        const info = document.createElement('div');
        info.className = 'song-history-info';
        const t = document.createElement('div');
        t.className = 'song-history-title';
        t.textContent = s.titulo + (s.artista ? ' — ' + s.artista : '');
        const f = document.createElement('div');
        f.className = 'song-history-date';
        f.textContent = fmtFecha(s.fecha);
        info.appendChild(t);
        info.appendChild(f);
        row.appendChild(info);
        row.appendChild(likeButton(s));
        row.appendChild(songLinks(s, false));
        grid.appendChild(row);
      });
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
  function sendComment(name, text) {
    if (isNative) {
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
      // En nativo: paramos el servicio pero conservamos currentItem
      try { Capacitor.Plugins.BackgroundAudio.pause(); } catch (e) {}
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
  }

  function playItem(ch) {
    errorBanner.style.display = 'none';
    currentItem = ch;
    stopStream();

    if (isNative) {
      try {
        Capacitor.Plugins.BackgroundAudio.play({ url: ch.url, title: ch.name, subtitle: 'TeleAudio' });
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
      try { Capacitor.Plugins.BackgroundAudio.pause(); } catch (e) {}
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
    powerBtn.classList.toggle('playing', isPlaying);
    powerBtn.classList.toggle('paused-state', !!currentItem && !isPlaying);
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
    const list = currentTab === 'radio' ? RADIO_STATIONS : TV_CHANNELS;
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
      // Sonando → pausa (recordando el canal)
      pausePlayback();
    } else if (currentItem) {
      // Pausado → reanudar el mismo canal
      playItem(currentItem);
      showToast('▶ ' + currentItem.name);
    } else {
      // Nada → si la Social Radio suena, la paramos; si no, aviso
      if (bsPlaying) {
        bsStop();
        showToast('⏹ Social Radio parada');
      } else {
        showToast('Selecciona un canal primero');
      }
    }
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

  // Emisoras generales: cuentas públicas que cualquiera puede escuchar SIN cuenta
  const BS_EMISORAS = [
    { id: 'noticias', icon: '📰', name: 'Noticias de España', desc: 'El País, RTVE Noticias, ABC, 20minutos, El Español…', handles: ['elpais.com', 'rtvenoticias.rtve.es', 'abc.es', '20minutos.es', 'elespanol.com'] },
    { id: 'deportes', icon: '⚽', name: 'Deportes', desc: 'AS, Sport…', handles: ['as.com', 'sport.es'] },
    { id: 'humor', icon: '😂', name: 'Humor', desc: 'El Mundo Today', handles: ['elmundotoday.com'] },
    { id: 'cordoba', icon: '🏛️', name: 'Córdoba', desc: 'Cordópolis, lo de tu tierra', handles: ['cordopolis.es'] },
    { id: 'tiempo', icon: '🌡️', name: 'El Tiempo', desc: 'AEMET: avisos y temperaturas al momento', handles: ['aemet.es'] },
    { id: 'ciencia', icon: '🔬', name: 'Ciencia', desc: 'Muy Interesante, El País Ciencia, Apuntes de ciencia', handles: ['muyinteresante.com', 'elpaiscyt.bsky.social', 'apuntesciencia.bsky.social'] },
    { id: 'cultura', icon: '🎨', name: 'Cultura', desc: 'elDiario Cultura, Ministerio de Cultura', handles: ['eldiariocultura.bsky.social', 'culturagob.bsky.social'] },
    { id: 'musica', icon: '🎸', name: 'Historias de música', desc: 'Anécdotas y leyendas de la música', handles: ['lahistorieta.bsky.social'] }
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
    bsPlaying = false;
    bsCurrent = -1;
    clearInterval(bsTimer);
    if (isNative) {
      try { Capacitor.Plugins.BackgroundAudio.stopSocialRadio(); } catch (e) {}
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const st = document.getElementById('bs-status');
    if (st) st.textContent = '';
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

  function renderSocial() {
    grid.innerHTML = '';
    const creds = getBsCreds();

    // ---------- Cabecera ----------
    const card = document.createElement('div');
    card.className = 'song-card';
    card.style.textAlign = 'center';

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
    grid.appendChild(card);

    // ---------- Función común de arranque ----------
    // Muestra el feed en caja, y si autoplay, empieza a leer en bucle
    function arrancarFeed(feed, label, playBtnRef) {
      feedBox.innerHTML = '';
      feed.slice(0, 8).forEach(item => {
        const row = document.createElement('div');
        row.className = 'bs-feed-item';
        row.innerHTML = '<b>' + item.author + '</b> · ' + item.text.slice(0, 90) + '…';
        feedBox.appendChild(row);
      });
      if (bsPlaying) bsStop();
      bsFeed = feed;
      bsPlaying = true;
      bsCurrent = -1;
      if (playBtnRef) playBtnRef.textContent = '⏹ Parar radio';
      status.textContent = '🔊 ' + label + ' · ' + feed.length + ' mensajes en bucle';

      if (isNative) {
        const frases = feed.map(item => 'De ' + item.author + '. ' + item.text);
        try {
          Capacitor.Plugins.BackgroundAudio.startSocialRadio({ frases: frases });
        } catch (e) {
          status.textContent = '❌ No se pudo iniciar la voz: ' + e.message;
          bsPlaying = false;
        }
      } else if ('speechSynthesis' in window) {
        bsSpeakNext();
        bsTimer = setInterval(() => { if (!speechSynthesis.speaking) bsSpeakNext(); }, 1000);
      } else {
        status.textContent = '❌ Tu navegador no tiene voz. Usa la app de Android.';
      }
    }

    // ---------- Emisoras generales (sin cuenta) ----------
    const gTitle = document.createElement('div');
    gTitle.className = 'song-artist';
    gTitle.style.margin = '18px 0 4px';
    gTitle.style.fontWeight = '700';
    gTitle.style.fontSize = '0.95rem';
    gTitle.textContent = '📻 Emisoras generales (sin Bluesky)';
    grid.appendChild(gTitle);

    const feedBox = document.createElement('div');
    feedBox.className = 'bs-feed-box';
    feedBox.style.display = 'none';
    grid.appendChild(feedBox);

    const emisoraGrid = document.createElement('div');
    emisoraGrid.className = 'social-emisoras';

    BS_EMISORAS.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'social-emisora' + (bsPlaying && bsSource === em.id ? ' playing' : '');
      btn.innerHTML = '<span class="em-icon">' + em.icon + '</span><span><span class="em-name">' + em.name + '</span><span class="em-desc">' + em.desc + '</span></span>';
      btn.addEventListener('click', async () => {
        if (bsPlaying && bsSource === em.id) {
          bsStop();
          btn.classList.remove('playing');
          feedBox.style.display = 'none';
          return;
        }
        status.textContent = '⏳ Buscando lo último de ' + em.name + '…';
        try {
          const feed = await bsFetchPublic(em.handles);
          if (!feed.length) { status.textContent = '😴 Ahora mismo no hay mensajes'; return; }
          bsSource = em.id;
          feedBox.style.display = 'block';
          document.querySelectorAll('.social-emisora').forEach(b => b.classList.remove('playing'));
          btn.classList.add('playing');
          arrancarFeed(feed, em.name, null);
        } catch (e) {
          status.textContent = '❌ ' + e.message;
        }
      });
      emisoraGrid.appendChild(btn);
    });
    grid.appendChild(emisoraGrid);

    // ---------- Timeline personal (con cuenta) ----------
    const pTitle = document.createElement('div');
    pTitle.className = 'song-artist';
    pTitle.style.margin = '22px 0 4px';
    pTitle.style.fontWeight = '700';
    pTitle.style.fontSize = '0.95rem';
    pTitle.textContent = '🦋 Tu timeline (con tu cuenta de Bluesky)';
    grid.appendChild(pTitle);

    if (creds && creds.password) {
      // --- Conectado: controles ---
      const btnRow = document.createElement('div');
      btnRow.className = 'btn-row';

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
        feedBox.style.display = 'block';
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
      grid.appendChild(btnRow);
    } else {
      // --- Sin conectar: formulario de conexión ---
      const userIn = document.createElement('input');
      userIn.className = 'comment-input';
      userIn.placeholder = 'Tu usuario de Bluesky (manruca.bsky.social)';
      const passIn = document.createElement('input');
      passIn.className = 'comment-input';
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

      grid.appendChild(userIn);
      grid.appendChild(passIn);
      grid.appendChild(hint);
      grid.appendChild(connectBtn);
    }

    grid.appendChild(status);
  }

  // ================= INICIO =================
  setTheme(localStorage.getItem('teleaudio_theme') || 'dark');
  setupAlarm();
  loadSongs();
  renderChannels();
})();
