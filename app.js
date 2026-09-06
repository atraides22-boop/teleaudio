/* TeleAudio v3.1 - La tele y la radio en tu oreja */
(function () {
  'use strict';

  // Servicio intermedio de YouTube (v4.3.5): el Mac resuelve el audio con la
  // firma anti-bot (n=/ns=) que YouTube exige y la app no puede generar.
  // Se auto-detecta al reproducir: si no responde, se usa la resolución
  // interna antigua (que fallará si YouTube bloquea la IP).
  const YT_PROXY_CANDIDATOS = [
    'http://192.168.1.117:8787',  // Mac en la red de casa (repetidor, IP fija desde 05-09)
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
    generalista: 'Generalistas',
    informativos: 'Informativos',
    deportes: 'Deportes',
    infantil: 'Infantil',
    local: 'Autonómicas y locales',
    populares: 'Populares',
    musicales: 'Musicales',
    autonomas: 'Autonómicas'
  };

  const ALL = [...TV_CHANNELS, ...RADIO_STATIONS];

  // ================= PODCAST (sistema Podcast Pro, v5.4) =================
  // Cómo añadir un podcast AL CATÁLOGO (para Manuel/el editor):
  //   1) Consigue el feed RSS OFICIAL del programa (p. ej. los de Prisa/SER:
  //      https://fapi-top.prisasd.com/podcast/playser/<slug>/itunestfp/podcast.xml
  //      o el que publique el autor). NO inventar feeds ni streams.
  //   2) Descarga su logo a logos/<id>.png (256×256 aprox.) y sincronízalo en
  //      las 3 copias (teleaudio, teleaudio-app/www, assets/public).
  //   3) Añade una entrada aquí copiando el formato de abajo: feed RSS con
  //      'feed' + 'cat' (id de PODCAST_CATS), stream continuo con 'url'.
  //   4) Copia app.js a las otras 2 copias (md5 idéntico) y commit+push.
  // Los podcasts que añada EL USUARIO se guardan en localStorage
  // ('teleaudio_mis_podcasts'), ver módulo Mis Podcasts. NO tocar TV/Radio.
  const PODCAST_CATS = [
    { id: '247', label: '24/7', icon: '📻' },
    { id: 'actualidad', label: 'Actualidad', icon: '🗞️' },
    { id: 'noticias', label: 'Noticias', icon: '📰' },
    { id: 'sociedad', label: 'Sociedad', icon: '🌍' },
    { id: 'deportes', label: 'Deportes', icon: '⚽' },
    { id: 'musica', label: 'Música', icon: '🎵' },
    { id: 'humor', label: 'Humor', icon: '😂' },
    { id: 'historia', label: 'Historia', icon: '📜' },
    { id: 'ciencia', label: 'Ciencia', icon: '🧪' },
    { id: 'tecnologia', label: 'Tecnología', icon: '💻' },
    { id: 'ia', label: 'Inteligencia Artificial', icon: '🤖' },
    { id: 'misterio', label: 'Misterio', icon: '🕵️' },
    { id: 'truecrime', label: 'True crime', icon: '🔍' },
    { id: 'entrevistas', label: 'Entrevistas', icon: '🎙️' },
    { id: 'cultura', label: 'Cultura', icon: '🎨' },
    { id: 'cine', label: 'Cine y TV', icon: '🎬' },
    { id: 'economia', label: 'Economía', icon: '💰' },
    { id: 'viajes', label: 'Viajes', icon: '✈️' },
    { id: 'salud', label: 'Salud', icon: '🧘' },
    { id: 'educacion', label: 'Educación', icon: '🎓' },
    { id: 'documentales', label: 'Documentales', icon: '🎥' },
    { id: 'relatos', label: 'Relatos', icon: '📖' },
    { id: 'ficcion', label: 'Ficción sonora', icon: '🎧' },
    { id: 'infantil', label: 'Infantil', icon: '🧸' },
    { id: 'personal', label: 'Personal', icon: '⭐' },
    { id: 'otros', label: 'Otros', icon: '📦' }
  ];
  // v5.2.0+: podcasts reales. Dos tipos:
  //  - cat '247' o campo 'url': stream continuo (p. ej. Radio Red).
  //  - campo 'feed': feed RSS de episodios. Al tocarlos se abre su lista de
  //    episodios (los últimos), que se reproducen bajo demanda. La categoría
  //    principal es 'cat' (id de PODCAST_CATS); 'cats' admite más (filtros).
  // Fuentes verificadas (06-09-2026): feeds oficiales Prisa/SER, CORS abierto
  // (*), MP3 directos (tritondigital), 600 episodios cada uno. NO inventar.
  const PODCASTS = [
    { id: 'radiored', name: 'Radio Red', logo: 'logos/radiored.png',
      url: 'https://streams.radio.co/s450f67578/listen',
      cat: '247', cats: ['247', 'actualidad'],
      author: 'Canal Red', priority: 1,
      desc: 'Canal Red 24 horas en audio: actualidad, análisis y entrevistas.' },
    { id: 'nsn', name: 'Nadie Sabe Nada', logo: 'logos/nsn.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/nadie_sabe_nada/itunestfp/podcast.xml',
      cat: 'humor', cats: ['humor'], author: 'Cadena SER', priority: 3,
      desc: 'Andreu Buenafuente y Berto Romero improvisan sin red: el humor de la SER que es oro para tus orejas.' },
    { id: 'tplr', name: 'Todo por la Radio', logo: 'logos/tplr.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/la_ventana_todo_por_la_radio/itunestfp/podcast.xml',
      cat: 'humor', cats: ['humor', 'actualidad'], author: 'Cadena SER', priority: 2,
      desc: 'Toni Martínez, Especialistas Secundarios y equipo se ríen de la política y de la actualidad cada tarde en La Ventana (SER).' },
    { id: 'serhistoria', name: 'SER Historia', logo: 'logos/serhistoria.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/ser_historia/itunestfp/podcast.xml',
      cat: 'historia', cats: ['historia', 'documentales'], author: 'Cadena SER', priority: 3,
      desc: 'Aprenderás historia disfrutando, con Nacho Ares. Porque el relato histórico no tiene por qué ser denso ni aburrido.' },
    { id: 'lascript', name: 'La Script', logo: 'logos/lascript.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/la_script/itunestfp/podcast.xml',
      cat: 'cine', cats: ['cine', 'cultura'], author: 'Cadena SER', priority: 2,
      desc: 'María Guerra abre una ventana al séptimo arte en la Cadena SER: cine, series y todo lo que se cuece en pantalla.' },
    { id: 'acontece', name: 'Acontece que no es poco', logo: 'logos/acontece.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/acontece_que_no_es_poco/itunestfp/podcast.xml',
      cat: 'historia', cats: ['historia', 'cultura'], author: 'Cadena SER', priority: 2,
      desc: 'Nieves Concostrina repasa la historia con ironía: lo que pasó tal día como hoy, sin anestesia y con mucho humor.' },
    { id: 'larguero', name: 'El Larguero', logo: 'logos/larguero.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/el_larguero/itunestfp/podcast.xml',
      cat: 'deportes', cats: ['deportes'], author: 'Cadena SER', priority: 1,
      desc: 'El deporte por dentro, con Manu Carreño: sin tremendismos, con humor y con el mejor análisis de la actualidad.' },
    { id: 'hora25', name: 'Hora 25', logo: 'logos/hora25.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/hora_25/itunestfp/podcast.xml',
      cat: 'actualidad', cats: ['actualidad', 'noticias', 'sociedad'], author: 'Cadena SER', priority: 2,
      desc: 'Cuando todo pasa demasiado deprisa: Hora 25 con José Luis Sastre, el pulso de la vida y de la actualidad.' },
    { id: 'avirir', name: 'A vivir que son dos días', logo: 'logos/avirir.png',
      feed: 'https://fapi-top.prisasd.com/podcast/playser/a_vivir_que_son_dos_dias/itunestfp/podcast.xml',
      cat: 'sociedad', cats: ['sociedad', 'cultura', 'entrevistas'], author: 'Cadena SER', priority: 1,
      desc: 'Tu tienda de campaña para las mañanas del fin de semana: otra forma de mirar la vida, las historias y el mundo.' }
  ];

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
  const npLabel = $('np-label');
  const npEq = $('np-eq');
  const statusText = $('status-text');
  const errorBanner = $('error-banner');
  const toast = $('toast');
  const timerBadge = $('timer-badge');

  // F8: reproductor completo (overlay) — refs DOM
  const playerOverlay = $('player-overlay');
  const ovLogo = $('ov-logo');
  const ovLabel = $('ov-label');
  const ovName = $('ov-name');
  const ovSub = $('ov-sub');
  const ovEq = $('ov-eq');
  const ovPower = $('ov-power');
  const ovProgress = $('ov-progress');
  const ovBar = $('ov-bar');
  const ovTAct = $('ov-tAct');
  const ovTDur = $('ov-tDur');

  // ================= ESTADO =================
  const isNative = typeof window !== 'undefined' && window.Capacitor && Capacitor.isNativePlatform();
  // El botón de salir solo tiene sentido en la app Android
  if (!isNative) {
    const ex = document.getElementById('exit-btn');
    if (ex) ex.style.display = 'none';
    const ch = document.getElementById('cuenta-hint');
    if (ch) ch.style.display = 'none';
  }

  // v4.5.1: muestra la versión REAL de la app en Ajustes → Acerca de
  (function mostrarVersion() {
    const el = document.getElementById('acerca-version');
    if (!el) return;
    if (isNative && window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.BackgroundAudio && Capacitor.Plugins.BackgroundAudio.getVersion) {
      Capacitor.Plugins.BackgroundAudio.getVersion()
        .then(r => { if (r && r.version) el.textContent = 'TeleAudio v' + r.version + ' — La tele y la radio en tu oreja. Solo audio, ahorro de datos. Los streams son los oficiales de cada cadena.'; })
        .catch(() => {});
    }
  })();
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
    else if (tab === 'podcast') list = PODCASTS;
    else if (tab === 'cancion' || tab === 'comentarios' || tab === 'social' || tab === 'youtube') return [];
    else list = [...ALL, ...PODCASTS].filter(c => favs.has(c.id));
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
  // Comprueba qué servicio intermedio responde (nativo: evita bloqueos de
  // mixed-content del WebView con HTTP local).
  function detectarProxyYt() {
    if (ytProxyActivo) return Promise.resolve(ytProxyActivo);
    const comprobar = (base) => {
      return Capacitor.Plugins.BackgroundAudio.proxyHealth({ proxy: base })
        .then(r => (r && r.ok) ? base : null)
        .catch(() => null);
    };
    // v4.5.3: descubrir la URL pública del túnel de Cloudflare (tunel.json en
    // GitHub Pages) y probarla primero; luego las de la red local. Así YouTube
    // funciona también fuera de casa (con el Mac encendido).
    const descubrirTunel = fetch('https://atraides22-boop.github.io/teleaudio/tunel.json?ts=' + Date.now(), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => (j && j.url) ? String(j.url).replace(/\/+$/, '') : null)
      .catch(() => null);
    return descubrirTunel.then(publica => {
      const candidatos = [];
      if (publica) candidatos.push(publica);
      YT_PROXY_CANDIDATOS.forEach(c => { if (candidatos.indexOf(c) === -1) candidatos.push(c); });
      const probar = (i) => {
        if (i >= candidatos.length) return Promise.resolve(null);
        return comprobar(candidatos[i]).then(ok => ok ? ok : probar(i + 1));
      };
      return probar(0).then(ok => { if (ok) ytProxyActivo = ok; return ok; });
    });
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

  // ================= RECIENTES (escuchado recientemente) =================
  // Guarda los últimos canales/emisoras reproducidos (por id + timestamp)
  // para ofrecerlos en una sección "🕘 Escuchado recientemente" al inicio
  // de las listas de TV y Radio. Máximo 15.
  function getRecientes() {
    try {
      const arr = JSON.parse(localStorage.getItem('teleaudio_recientes')) || [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function guardarReciente(ch) {
    if (!ch || !ch.id) return;
    let recs = getRecientes();
    recs = recs.filter(r => r && r.id !== ch.id);
    recs.unshift({ id: ch.id, ts: Date.now() });
    if (recs.length > 15) recs = recs.slice(0, 15);
    try { localStorage.setItem('teleaudio_recientes', JSON.stringify(recs)); } catch (e) {}
  }

  // Devuelve los canales recientes que pertenecen a la lista actual (TV o Radio)
  function recientesDeLista(lista) {
    const recs = getRecientes();
    const porId = {};
    lista.forEach(c => { porId[c.id] = c; });
    const out = [];
    recs.forEach(r => { if (porId[r.id]) out.push(porId[r.id]); });
    return out;
  }

  // ====== REDISEÑO 2.1: helpers de UI ======
  // Tipo legible de un canal/emisora (para etiquetas y reproductor)
  function tipoDe(ch) {
    if (!ch) return '';
    // Episodio de un podcast por feed (id propio, no está en TV/Radio/PODCASTS)
    if (String(ch.id || '').indexOf('pod:') === 0) return 'Podcast';
    // Podcast personalizado del usuario: RSS = Podcast, stream = Radio (directo)
    if (misPodcasts && misPodcasts.length) {
      const mio = misPodcasts.find(c => c.id === ch.id);
      if (mio) return mio.feed ? 'Podcast' : 'Radio';
    }
    if (ch.esVod) return 'Audioprograma';
    if (TV_CHANNELS.some(c => c.id === ch.id)) return 'TV';
    if (RADIO_STATIONS.some(c => c.id === ch.id)) return 'Radio';
    if (PODCASTS.some(c => c.id === ch.id)) return 'Podcast';
    return '';
  }
  function esDirecto(ch) {
    // Con feed RSS de episodios no es un directo: hay que elegir episodio
    return ch && !ch.esVod && !ch.feed;
  }
  // Tarjeta vacía elegante (grid-column 1/-1)
  function emptyState(icono, titulo, texto) {
    const box = document.createElement('div');
    box.className = 'empty-state';
    const ic = document.createElement('div');
    ic.className = 'empty-icon';
    ic.innerHTML = icono;
    const t = document.createElement('strong');
    t.textContent = titulo;
    const s = document.createElement('span');
    s.textContent = texto || '';
    box.appendChild(ic); box.appendChild(t); box.appendChild(s);
    return box;
  }
  // Botón "Ver todos" de una cabecera de categoría
  function botonVerTodos(cat, lista) {
    const b = document.createElement('button');
    b.className = 'see-all';
    b.textContent = 'Ver todos \u2192';
    b.setAttribute('aria-label', 'Ver todos los de ' + cat);
    b.addEventListener('click', () => {
      vistaCategoria = { titulo: cat, lista: lista.slice() };
      renderChannels();
    });
    return b;
  }
  // Cabecera de sección con acciones (usada en carruseles y grids)
  function sectionHead(titulo, accion) {
    const h = document.createElement('div');
    h.className = 'section-header';
    const span = document.createElement('span');
    span.textContent = titulo;
    h.appendChild(span);
    if (accion) h.appendChild(accion);
    return h;
  }
  // Contenedor de carrusel horizontal
  function carrusel() {
    const c = document.createElement('div');
    c.className = 'h-scroll';
    return c;
  }
  let vistaCategoria = null; // {titulo, lista} cuando se pulsa "Ver todos"
  // Favoritos de programas de TV (AudioprogramasTV) — uid en localStorage
  let progFavs = new Set(JSON.parse(localStorage.getItem('teleaudio_favs_programas') || '[]'));
  function progToggleFav(uid, btnEl) {
    if (!uid) return;
    const era = progFavs.has(uid);
    if (era) { progFavs.delete(uid); showToast('Quitado de programas favoritos'); }
    else { progFavs.add(uid); showToast('❤️ Programa guardado en favoritos'); }
    localStorage.setItem('teleaudio_favs_programas', JSON.stringify([...progFavs]));
    if (btnEl) {
      const ahora = progFavs.has(uid);
      btnEl.classList.toggle('faved', ahora);
      const uso = btnEl.querySelector('use');
      if (uso) uso.setAttribute('href', ahora ? '#i-fav-filled' : '#i-fav');
      btnEl.classList.remove('pop'); void btnEl.offsetWidth; btnEl.classList.add('pop');
    }
    if (currentTab === 'audioprogramas' && !rtveProg) renderAudioProgramas();
  }
  function botonFavPrograma(uid) {
    const b = document.createElement('button');
    b.className = 'fav-btn' + (progFavs.has(uid) ? ' faved' : '');
    b.setAttribute('aria-label', progFavs.has(uid) ? 'Quitar de programas favoritos' : 'Guardar programa en favoritos');
    b.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#' + (progFavs.has(uid) ? 'i-fav-filled' : 'i-fav') + '"/></svg>';
    b.addEventListener('click', (e) => { e.stopPropagation(); progToggleFav(uid, b); });
    return b;
  }

  function renderChannels() {
    grid.innerHTML = '';
    if (currentTab === 'social') { renderSocial(); return; }
    if (currentTab === 'comentarios') { renderComments(); return; }
    if (currentTab === 'audioprogramas') { renderAudioProgramas(); return; }
    if (currentTab === 'cancion') { renderSongOfDay(); return; }
    if (currentTab === 'podcast') { renderPodcast(); return; }

    const query = (search.value || '').trim();
    const hasQuery = query.length > 0;

    // ---------- Búsqueda global AGRUPADA por tipo (TV / Radio / Podcast) ----------
    if (hasQuery) {
      const q = query.toLowerCase();
      const grupos = { TV: [], Radio: [], Podcast: [] };
      TV_CHANNELS.forEach(ch => { if (ch.name.toLowerCase().includes(q)) grupos.TV.push(ch); });
      RADIO_STATIONS.forEach(ch => { if (ch.name.toLowerCase().includes(q)) grupos.Radio.push(ch); });
      PODCASTS.forEach(ch => { if (ch.name.toLowerCase().includes(q)) grupos.Podcast.push(ch); });
      (misPodcasts || []).forEach(ch => { if ((ch.name || '').toLowerCase().includes(q)) grupos.Podcast.push(ch); });
      const hayAlgo = grupos.TV.length || grupos.Radio.length || grupos.Podcast.length;
      if (!hayAlgo) {
        grid.appendChild(emptyState('<svg width="24" height="24" aria-hidden="true"><use href="#i-search"/></svg>',
          'Sin resultados', 'No encontramos nada para \u201c' + query + '\u201d. Prueba con otro nombre.'));
        return;
      }
      grid.appendChild(sectionHead('Resultados para \u201c' + query + '\u201d'));
      ['TV', 'Radio', 'Podcast'].forEach(tipo => {
        if (!grupos[tipo].length) return;
        const sub = document.createElement('div');
        sub.className = 'section-header cat-muted';
        sub.textContent = tipo + ' (' + grupos[tipo].length + ')';
        grid.appendChild(sub);
        grupos[tipo].forEach(ch => renderCard(ch));
      });
      return;
    }

    // ---------- Vista "Ver todos" de una categoría ----------
    if (vistaCategoria && (currentTab === 'tv' || currentTab === 'radio')) {
      const volver = document.createElement('button');
      volver.className = 'back-chip';
      volver.innerHTML = '<svg width="14" height="14" aria-hidden="true"><use href="#i-close"/></svg> Volver';
      volver.addEventListener('click', () => { vistaCategoria = null; renderChannels(); });
      const head = document.createElement('div');
      head.className = 'ep-top';
      head.appendChild(volver);
      const titulo = document.createElement('span');
      titulo.className = 'ep-prog-nombre';
      titulo.textContent = vistaCategoria.titulo;
      head.appendChild(titulo);
      grid.appendChild(head);
      grid.appendChild(sectionHead(vistaCategoria.titulo + ' \u00b7 ' + vistaCategoria.lista.length));
      vistaCategoria.lista.forEach(ch => renderCard(ch));
      return;
    }

    const list = currentTab === 'favs'
      ? [...ALL, ...PODCASTS].filter(c => favs.has(c.id))
      : (currentTab === 'tv' ? TV_CHANNELS : RADIO_STATIONS);

    // ---------- Favoritos: vacío elegante ----------
    if (currentTab === 'favs') {
      if (!list.length) {
        grid.appendChild(emptyState(
          '<svg width="26" height="26" aria-hidden="true"><use href="#i-fav"/></svg>',
          'Todavía no hay favoritos',
          'Toca el coraz\u00f3n de un canal, emisora o podcast para tenerlo siempre a mano.'));
        return;
      }
      grid.appendChild(sectionHead('Mis favoritos \u00b7 ' + list.length));
      list.forEach(ch => renderCard(ch));
      return;
    }

    if (!list.length) {
      grid.appendChild(emptyState(
        '<svg width="24" height="24" aria-hidden="true"><use href="#i-radio"/></svg>',
        'Nada por aqu\u00ed', ''));
      return;
    }

    // Hero "Continuar escuchando": algo quedó en pausa (o restaurado) y el
    // usuario vuelve a la app → un toque y sigue sonando
    if (currentItem && !isPlaying && !bsPlaying && !bsPaused) {
      const hero = document.createElement('div');
      hero.className = 'resume-hero';
      hero.setAttribute('role', 'button');
      hero.setAttribute('tabindex', '0');
      hero.setAttribute('aria-label', 'Continuar escuchando ' + currentItem.name);
      const logo = document.createElement('img');
      logo.className = 'rh-logo';
      logo.src = currentItem.logo || 'icon.svg';
      logo.alt = '';
      const txt = document.createElement('div');
      txt.className = 'rh-text';
      const lab = document.createElement('div');
      lab.className = 'rh-label';
      lab.textContent = 'Continuar escuchando';
      const nom = document.createElement('div');
      nom.className = 'rh-name';
      nom.textContent = currentItem.name;
      const tip = document.createElement('div');
      tip.className = 'rh-type';
      tip.textContent = (tipoDe(currentItem) || 'Contenido') + ' \u00b7 en pausa';
      txt.appendChild(lab); txt.appendChild(nom); txt.appendChild(tip);
      const play = document.createElement('button');
      play.className = 'rh-play';
      play.setAttribute('aria-label', 'Reanudar');
      play.innerHTML = '<svg width="22" height="22" aria-hidden="true"><use href="#i-play"/></svg>';
      const reanudar = () => {
        try { powerBtn.click(); } catch (e) { if (currentItem) playItem(currentItem); }
      };
      hero.addEventListener('click', reanudar);
      play.addEventListener('click', (e) => { e.stopPropagation(); reanudar(); });
      hero.appendChild(logo); hero.appendChild(txt); hero.appendChild(play);
      grid.appendChild(hero);
    }

    // ---------- Recientes (carrusel horizontal) ----------
    const recs = recientesDeLista(list);
    if (currentTab === 'tv' || currentTab === 'radio') {
      if (recs.length) {
        grid.appendChild(sectionHead('Escuchado recientemente'));
        const c = carrusel();
        recs.forEach(ch => renderCard(ch, c));
        grid.appendChild(c);
      } else {
        // Estado vacío elegante del historial (solo la primera vez que se ve)
        const hint = document.createElement('div');
        hint.className = 'recents-hint';
        hint.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-history"/></svg><span>Aqu\u00ed aparecer\u00e1n tus \u00faltimos canales y emisoras.</span>';
        grid.appendChild(hint);
      }
    }

    // ---------- Categorías como carruseles + "Ver todos" ----------
    const seen = {};
    list.forEach(ch => {
      const cat = ch.cat || 'generalista';
      if (!seen[cat]) seen[cat] = [];
      seen[cat].push(ch);
    });
    const esUltimaCategoriaGrande = Object.keys(seen).length === 1;
    Object.keys(seen).forEach((cat, idx) => {
      const items = seen[cat];
      const etiqueta = (CAT_LABELS[cat] || cat);
      const conIcono = (currentTab === 'tv' ? 'TV' : 'Radio') + ' \u00b7 ' + etiqueta;
      // "Ver todos" solo cuando la categoría tiene más de 6 elementos
      const verTodos = items.length > 6 ? botonVerTodos(etiqueta, items) : null;
      grid.appendChild(sectionHead(conIcono, verTodos));
      if (verTodos) {
        // Carrusel horizontal (categoría grande)
        const c = carrusel();
        items.forEach(ch => renderCard(ch, c));
        grid.appendChild(c);
      } else {
        // Categoría pequeña: rejilla normal (no ocupa carrusel)
        items.forEach(ch => renderCard(ch));
      }
    });
  }

  function renderCard(ch, contenedor) {
    const card = document.createElement('div');
    card.className = 'channel-card' + (currentItem && currentItem.id === ch.id ? ' active' : '') + (isPlaying && currentItem && currentItem.id === ch.id ? ' playing-now' : '');
    card.setAttribute('data-id', ch.id);

    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (favs.has(ch.id) ? ' faved' : '');
    const esFav = favs.has(ch.id);
    favBtn.setAttribute('aria-label', esFav ? 'Quitar de favoritos' : 'A\u00f1adir a favoritos');
    favBtn.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#' + (esFav ? 'i-fav-filled' : 'i-fav') + '"/></svg>';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav(ch.id);
    });

    const plate = document.createElement('div');
    plate.className = 'logo-plate';
    const img = document.createElement('img');
    img.className = 'channel-logo';
    img.src = ch.logo;
    img.alt = ch.name;
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'icon.svg'; };
    plate.appendChild(img);

    const body = document.createElement('div');
    body.className = 'card-body';
    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = ch.name;
    const type = document.createElement('div');
    type.className = 'card-type';
    const esActivo = !!(currentItem && currentItem.id === ch.id);
    // Un feed RSS de episodios se distingue en la tarjeta (no es un directo)
    if (ch.feed) {
      type.textContent = 'Podcast \u00b7 Episodios';
    } else {
      type.textContent = tipoDe(ch) + (esDirecto(ch) ? ' \u00b7 En directo' : '');
    }
    body.appendChild(name);
    body.appendChild(type);

    card.appendChild(favBtn);
    card.appendChild(plate);
    card.appendChild(body);
    // v5.3.1: los podcasts de episodios (campo feed) abren su lista, no suenan
    card.addEventListener('click', () => {
      if (ch.feed) { abrirPodcastFeed(ch); return; }
      playItem(ch);
    });

    // Indicador animado dentro de la tarjeta activa (CSS lo muestra al tener .playing-now)
    const eq = document.createElement('span');
    eq.className = 'eq-mini';
    eq.setAttribute('aria-hidden', 'true');
    eq.innerHTML = '<span></span><span></span><span></span>';
    type.appendChild(eq);

    (contenedor || grid).appendChild(card);
  }

  function toggleFav(id) {
    const eraFav = favs.has(id);
    if (eraFav) { favs.delete(id); showToast('Quitado de favoritos'); }
    else { favs.add(id); showToast('❤️ Añadido a favoritos'); }
    localStorage.setItem('teleaudio_favs', JSON.stringify([...favs]));
    // En la pestaña Favoritos, al quitar uno desaparece de la lista
    if (currentTab === 'favs' && eraFav) { renderChannels(); return; }
    // Actualizar el corazón en sitio con micro-animación (sin recargar)
    const card = grid.querySelector('.channel-card[data-id="' + id + '"]');
    if (card) {
      const favBtn = card.querySelector('.fav-btn');
      if (favBtn) {
        const ahoraFav = favs.has(id);
        favBtn.classList.toggle('faved', ahoraFav);
        favBtn.setAttribute('aria-label', ahoraFav ? 'Quitar de favoritos' : 'Añadir a favoritos');
        const uso = favBtn.querySelector('use');
        if (uso) uso.setAttribute('href', ahoraFav ? '#i-fav-filled' : '#i-fav');
        favBtn.classList.remove('pop');
        void favBtn.offsetWidth; // reiniciar animación
        favBtn.classList.add('pop');
      }
    }
    // Refrescar el resto de corazones sin recargar (puede haber duplicados en vista "todos")
    grid.querySelectorAll('.channel-card[data-id="' + id + '"] .fav-btn').forEach(b => {
      b.classList.toggle('faved', favs.has(id));
    });
  }

  // ================= AUDIOPROGRAMAS TV =================
  // F6 (v4.4.5): programas de TV de RTVE en audio bajo demanda, en su propia
  // pestaña (Manuel: no mezclar con Podcast). Catálogo fijo de programas
  // (uid oficial de RTVE); los episodios se listan desde su API pública
  // (videos.json, con CORS abierto) y el audio (MPD DASH solo-audio) lo
  // resuelve el servicio del Mac (/rtve?id=) porque la API no expone la URL.
  const RTVE_PROGRAMAS = [
    { uid: '1030536', nombre: 'El Perro Andaluz', canal: 'La 1', img: 'https://img.rtve.es/imagenes/miguel-rellan-vuelve-mirar-tetuan-perro-andaluz/01788448276526.jpg' },
    { uid: '1000646', nombre: 'La Revuelta', canal: 'La 1', img: 'https://img.rtve.es/imagenes/revuelta-vuelve-7-septiembre-nuevo-teatro/01788378371065.jpg' },
    { uid: '129646', nombre: 'El Cazador', canal: 'La 2', img: 'https://img.rtve.es/imagenes/cazador-especial-5/01767741580083.jpg' },
    { uid: '67990', nombre: 'Cachitos de hierro y cromo', canal: 'La 2', img: 'https://img.rtve.es/imagenes/cachitos-hierro-cromo-bis-2/1767478025404.jpg' },
    { uid: '1029008', nombre: 'La Casa de la Música', canal: 'La 1', img: 'https://img.rtve.es/imagenes/la-casa-de-la-musica/01778746804555.jpg' },
    { uid: '174712', nombre: 'Grand Prix', canal: 'La 1', img: 'https://img.rtve.es/imagenes/grand-prix/01783430260063.jpg' },
    { uid: '1030975', nombre: 'Malas Lenguas Noche', canal: 'La 2', img: 'https://img.rtve.es/imagenes/malas-lenguas-noche/01787312208122.jpg' },
    { uid: '11332', nombre: 'Comando Actualidad', canal: 'La 2', img: 'https://img.rtve.es/imagenes/comando-actualidad/01718631050863.jpg' },
    { uid: '176290', nombre: 'Late Xou con Marc Giró', canal: 'La 1', img: 'https://img.rtve.es/imagenes/late-xou-con-marc-giro/01757575876849.jpg' },
    { uid: '174711', nombre: 'José Mota Live Show', canal: 'La 1', img: 'https://img.rtve.es/imagenes/jose-mota-live-show/1689671229579.jpg' },
    { uid: '1000191', nombre: 'Ovejas eléctricas', canal: 'La 2', img: 'https://img.rtve.es/imagenes/ovejas-electricas/01712573032490.jpg' },
    { uid: '135710', nombre: 'Un país para reírlo', canal: 'La 2', img: 'https://img.rtve.es/imagenes/un-pais-para-reirlo/1649684732851.jpg' },
    { uid: '1674', nombre: 'Muchachada Nui', canal: 'La 2', img: 'https://img.rtve.es/imagenes/muchachada-nui/1599474285307.jpg' }
  ];
  // v4.4.9: TODOS los programas de TV de La 2 (catálogo RTVE, generado 05-09-2026).
  // Sin los ya elegidos en 'Tus programas' (para no duplicar). Categoría en 'cat'.
  const RTVE_PROGRAMAS_LA2 = [
    { uid: "113550", nombre: "Clásicos y Reverentes", cat: "Conciertos" },
    { uid: "67030", nombre: "El palco", cat: "Conciertos" },
    { uid: "48751", nombre: "Espíritu flamenco", cat: "Conciertos" },
    { uid: "57011", nombre: "Festivales de verano de La 2", cat: "Conciertos" },
    { uid: "46831", nombre: "Jóvenes solistas", cat: "Conciertos" },
    { uid: "128870", nombre: "Las noches del Monumental", cat: "Conciertos" },
    { uid: "1653", nombre: "Los conciertos de La 2", cat: "Conciertos" },
    { uid: "1654", nombre: "Los conciertos de Radio 3 en La 2", cat: "Conciertos" },
    { uid: "82870", nombre: "Más que en vivo", cat: "Conciertos" },
    { uid: "49270", nombre: "Música para tus ojos", cat: "Conciertos" },
    { uid: "34010", nombre: "Orquesta y Coro de RTVE", cat: "Conciertos" },
    { uid: "58290", nombre: "Pizzicato", cat: "Conciertos" },
    { uid: "1031025", nombre: "Premios Juventud", cat: "Conciertos" },
    { uid: "31971", nombre: "Tenderete", cat: "Conciertos" },
    { uid: "85730", nombre: "This is Opera", cat: "Conciertos" },
    { uid: "173050", nombre: "A este paso (no) estrenamos", cat: "Concursos" },
    { uid: "1029595", nombre: "Captcha: No soy un robot", cat: "Concursos" },
    { uid: "117610", nombre: "Cifras y letras", cat: "Concursos" },
    { uid: "119490", nombre: "Código final", cat: "Concursos" },
    { uid: "1000237", nombre: "El cazador STARS", cat: "Concursos" },
    { uid: "44830", nombre: "Gafapastas", cat: "Concursos" },
    { uid: "178230", nombre: "Jeopardy", cat: "Concursos" },
    { uid: "1686", nombre: "Palabra por palabra", cat: "Concursos" },
    { uid: "1710", nombre: "Saber y ganar", cat: "Concursos" },
    { uid: "1029405", nombre: "Trivial Pursuit", cat: "Concursos" },
    { uid: "99610", nombre: "Virtuosos", cat: "Concursos" },
    { uid: "1559", nombre: "Cine de barrio", cat: "Contenedor Películas" },
    { uid: "136150", nombre: "Cine de siempre", cat: "Contenedor Películas" },
    { uid: "120171", nombre: "Días de cine clásico", cat: "Contenedor Películas" },
    { uid: "43530", nombre: "El cine de La 2", cat: "Contenedor Películas" },
    { uid: "130790", nombre: "La 2 es teatro", cat: "Contenedor Películas" },
    { uid: "1742", nombre: "Versión española", cat: "Contenedor Películas" },
    { uid: "38642", nombre: "Vivir rodando", cat: "Contenedor Películas" },
    { uid: "54270", nombre: "Documenta2", cat: "Documental" },
    { uid: "54271", nombre: "Documentales culturales", cat: "Documental" },
    { uid: "44510", nombre: "El documental", cat: "Documental" },
    { uid: "54290", nombre: "Grandes documentales", cat: "Documental" },
    { uid: "38631", nombre: "Los debates de Cultural.es", cat: "Documental" },
    { uid: "1029009", nombre: "Rescate de animales bebé", cat: "Documental" },
    { uid: "69750", nombre: "Somos Documentales", cat: "Documental" },
    { uid: "143310", nombre: "La última frontera", cat: "Documental Original" },
    { uid: "20204", nombre: "Bricolocus", cat: "Entretenimiento" },
    { uid: "144370", nombre: "Caminos del Flamenco", cat: "Entretenimiento" },
    { uid: "38593", nombre: "Centros en red", cat: "Entretenimiento" },
    { uid: "73610", nombre: "Cinefilia", cat: "Entretenimiento" },
    { uid: "76431", nombre: "Con mis ojos", cat: "Entretenimiento" },
    { uid: "60250", nombre: "Cómo nos reímos", cat: "Entretenimiento" },
    { uid: "67610", nombre: "Efecto Ciudadano", cat: "Entretenimiento" },
    { uid: "1030117", nombre: "El juicio", cat: "Entretenimiento" },
    { uid: "16510", nombre: "En construcción", cat: "Entretenimiento" },
    { uid: "78790", nombre: "En movimiento", cat: "Entretenimiento" },
    { uid: "121670", nombre: "Ese programa del que usted me habla", cat: "Entretenimiento" },
    { uid: "38612", nombre: "Extras DVD", cat: "Entretenimiento" },
    { uid: "117590", nombre: "Frontera Europa", cat: "Entretenimiento" },
    { uid: "86250", nombre: "Generación web", cat: "Entretenimiento" },
    { uid: "120090", nombre: "Gigantes de La 2", cat: "Entretenimiento" },
    { uid: "82030", nombre: "GIRA ¡Construye tu pasión!", cat: "Entretenimiento" },
    { uid: "92430", nombre: "Libros con uasabi", cat: "Entretenimiento" },
    { uid: "43570", nombre: "Muchoviaje", cat: "Entretenimiento" },
    { uid: "96090", nombre: "Oficiorama", cat: "Entretenimiento" },
    { uid: "34080", nombre: "Saca la lengua", cat: "Entretenimiento" },
    { uid: "58594", nombre: "Sin barreras", cat: "Entretenimiento" },
    { uid: "38641", nombre: "Tengo una pregunta para mí", cat: "Entretenimiento" },
    { uid: "130793", nombre: "Tesoros de la tele", cat: "Entretenimiento" },
    { uid: "117010", nombre: "Tribus viajeras", cat: "Entretenimiento" },
    { uid: "43890", nombre: "Viva América", cat: "Entretenimiento" },
    { uid: "65210", nombre: "Buenas ideas TED", cat: "Entrevistas" },
    { uid: "72150", nombre: "Capitulares", cat: "Entrevistas" },
    { uid: "40572", nombre: "Carta blanca", cat: "Entrevistas" },
    { uid: "40810", nombre: "Científicos de frontera", cat: "Entrevistas" },
    { uid: "1000228", nombre: "En primicia", cat: "Entrevistas" },
    { uid: "168290", nombre: "Encuentros en RTVE", cat: "Entrevistas" },
    { uid: "128651", nombre: "Generacion.es", cat: "Entrevistas" },
    { uid: "40470", nombre: "Gent de paraula", cat: "Entrevistas" },
    { uid: "88070", nombre: "Historia de nuestro cine", cat: "Entrevistas" },
    { uid: "38597", nombre: "La entrevista de Cultural.es", cat: "Entrevistas" },
    { uid: "1001343", nombre: "La garita", cat: "Entrevistas" },
    { uid: "118491", nombre: "La hora musa", cat: "Entrevistas" },
    { uid: "142050", nombre: "La matemática del espejo", cat: "Entrevistas" },
    { uid: "55170", nombre: "La nube", cat: "Entrevistas" },
    { uid: "146310", nombre: "Las tres puertas", cat: "Entrevistas" },
    { uid: "1030318", nombre: "Me meto en un jardín", cat: "Entrevistas" },
    { uid: "80451", nombre: "Pecadores impequeibols", cat: "Entrevistas" },
    { uid: "49370", nombre: "Pienso luego existo", cat: "Entrevistas" },
    { uid: "148650", nombre: "Plano general", cat: "Entrevistas" },
    { uid: "38640", nombre: "Somos cortos", cat: "Entrevistas" },
    { uid: "125450", nombre: "Terenci a la fresca", cat: "Entrevistas" },
    { uid: "68390", nombre: "Torres y Reyes", cat: "Entrevistas" },
    { uid: "134512", nombre: "Vostè pregunta", cat: "Entrevistas" },
    { uid: "50570", nombre: "Yo de mayor quiero ser español", cat: "Entrevistas" },
    { uid: "127090", nombre: "Yo soy Erasmus", cat: "Entrevistas" },
    { uid: "91251", nombre: "Yo, mono", cat: "Entrevistas" },
    { uid: "1029649", nombre: "Zero dramas", cat: "Entrevistas" },
    { uid: "61570", nombre: "Carnaval de Canarias", cat: "Especial Evento" },
    { uid: "54670", nombre: "Fallas", cat: "Especial Evento" },
    { uid: "23234", nombre: "Festival de cine de San Sebastián", cat: "Especial Evento" },
    { uid: "59410", nombre: "Festivales de cine", cat: "Especial Evento" },
    { uid: "129456", nombre: "Navidad en la 2", cat: "Especial Evento" },
    { uid: "1000394", nombre: "Premios Academia de la Moda Española", cat: "Especial Evento" },
    { uid: "1000971", nombre: "Premios Feroz", cat: "Especial Evento" },
    { uid: "52650", nombre: "Premios José María Forqué", cat: "Especial Evento" },
    { uid: "29830", nombre: "Premios Max", cat: "Especial Evento" },
    { uid: "90130", nombre: "Premios Platino", cat: "Especial Evento" },
    { uid: "86050", nombre: "Premis Sant Jordi de Cinematografia", cat: "Especial Evento" },
    { uid: "1587", nombre: "El conciertazo", cat: "Infantiles" },
    { uid: "1620", nombre: "Gomaespuminglish", cat: "Infantiles" },
    { uid: "1649", nombre: "Leonart", cat: "Infantiles" },
    { uid: "60311", nombre: "+Canarias", cat: "Informativos Noticias" },
    { uid: "20199", nombre: "59 segons", cat: "Informativos Noticias" },
    { uid: "69470", nombre: "A la carrera", cat: "Informativos Noticias" },
    { uid: "1535", nombre: "Agrosfera", cat: "Informativos Noticias" },
    { uid: "106370", nombre: "Conecta con el mercado", cat: "Informativos Noticias" },
    { uid: "50350", nombre: "Economía a fondo", cat: "Informativos Noticias" },
    { uid: "45150", nombre: "El debate de La 2", cat: "Informativos Noticias" },
    { uid: "16530", nombre: "En lengua de signos", cat: "Informativos Noticias" },
    { uid: "62430", nombre: "Espacio Empresa", cat: "Informativos Noticias" },
    { uid: "1604", nombre: "España en comunidad", cat: "Informativos Noticias" },
    { uid: "68670", nombre: "Frontera límite", cat: "Informativos Noticias" },
    { uid: "1635", nombre: "La 2 Noticias", cat: "Informativos Noticias" },
    { uid: "87770", nombre: "La luchada", cat: "Informativos Noticias" },
    { uid: "1678", nombre: "Nosotros también", cat: "Informativos Noticias" },
    { uid: "76210", nombre: "Semana Santa en RTVE", cat: "Informativos Noticias" },
    { uid: "40450", nombre: "Sempre positius", cat: "Informativos Noticias" },
    { uid: "35150", nombre: "ZigaZaga", cat: "Informativos Noticias" },
    { uid: "48371", nombre: "25(...)50", cat: "Magacines" },
    { uid: "1530", nombre: "59 segundos", cat: "Magacines" },
    { uid: "94270", nombre: "A punto con La 2", cat: "Magacines" },
    { uid: "113010", nombre: "Activa2", cat: "Magacines" },
    { uid: "86590", nombre: "Al punto", cat: "Magacines" },
    { uid: "74070", nombre: "Alaska y Coronas", cat: "Magacines" },
    { uid: "34270", nombre: "Babel en TVE", cat: "Magacines" },
    { uid: "37771", nombre: "Biodiario", cat: "Magacines" },
    { uid: "171950", nombre: "Brigada Tech", cat: "Magacines" },
    { uid: "58593", nombre: "Capacitados", cat: "Magacines" },
    { uid: "56310", nombre: "Cocina con Sergio", cat: "Magacines" },
    { uid: "1567", nombre: "Con todos los acentos", cat: "Magacines" },
    { uid: "63270", nombre: "Con una sonrisa", cat: "Magacines" },
    { uid: "38594", nombre: "Con visado de calle", cat: "Magacines" },
    { uid: "54173", nombre: "Convive!", cat: "Magacines" },
    { uid: "93230", nombre: "Culto Evangélico", cat: "Magacines" },
    { uid: "176510", nombre: "Curioseando", cat: "Magacines" },
    { uid: "97790", nombre: "Economía de bolsillo", cat: "Magacines" },
    { uid: "1588", nombre: "El día del Señor", cat: "Magacines" },
    { uid: "50390", nombre: "El exportador", cat: "Magacines" },
    { uid: "95850", nombre: "El Ojo Clínico", cat: "Magacines" },
    { uid: "38595", nombre: "Escala 1:1", cat: "Magacines" },
    { uid: "1602", nombre: "Escuela de padres en apuros", cat: "Magacines" },
    { uid: "26210", nombre: "Fábrica de ideas", cat: "Magacines" },
    { uid: "1633", nombre: "Islam hoy", cat: "Magacines" },
    { uid: "40571", nombre: "La Casa Encendida", cat: "Magacines" },
    { uid: "115630", nombre: "La ciencia de la salud", cat: "Magacines" },
    { uid: "20270", nombre: "La mandrágora", cat: "Magacines" },
    { uid: "51210", nombre: "La Sala", cat: "Magacines" },
    { uid: "1001094", nombre: "Malas lenguas", cat: "Magacines" },
    { uid: "38930", nombre: "Mi reino por un caballo", cat: "Magacines" },
    { uid: "76490", nombre: "Millennium", cat: "Magacines" },
    { uid: "1670", nombre: "Miradas 2", cat: "Magacines" },
    { uid: "50670", nombre: "Más que perros y gatos", cat: "Magacines" },
    { uid: "38636", nombre: "Nube de tags", cat: "Magacines" },
    { uid: "45010", nombre: "Pasándolo de cine", cat: "Magacines" },
    { uid: "68730", nombre: "Piensa en positivo", cat: "Magacines" },
    { uid: "55171", nombre: "Ritmo urbano", cat: "Magacines" },
    { uid: "32070", nombre: "RTVE responde", cat: "Magacines" },
    { uid: "38639", nombre: "Sala", cat: "Magacines" },
    { uid: "63190", nombre: "Se trata de ti", cat: "Magacines" },
    { uid: "1712", nombre: "Shalom", cat: "Magacines" },
    { uid: "45370", nombre: "Singular.es", cat: "Magacines" },
    { uid: "128650", nombre: "Sobresalientes", cat: "Magacines" },
    { uid: "46550", nombre: "Soy cámara. El programa del CCCB", cat: "Magacines" },
    { uid: "129511", nombre: "Sánchez y Carbonell", cat: "Magacines" },
    { uid: "1728", nombre: "Tendido cero", cat: "Magacines" },
    { uid: "59630", nombre: "Tenemos chico nuevo en la oficina", cat: "Magacines" },
    { uid: "1730", nombre: "Testimonio", cat: "Magacines" },
    { uid: "101630", nombre: "Tips", cat: "Magacines" },
    { uid: "72730", nombre: "Todos somos raros, todos somos únicos", cat: "Magacines" },
    { uid: "53150", nombre: "Un espíritu, una meta", cat: "Magacines" },
    { uid: "58591", nombre: "Un mundo mejor", cat: "Magacines" },
    { uid: "109830", nombre: "Unidos por el Patrimonio", cat: "Magacines" },
    { uid: "68830", nombre: "Viaje al interior de la cultura", cat: "Magacines" },
    { uid: "28950", nombre: "Zoom Tendencias", cat: "Magacines" },
    { uid: "38643", nombre: "Zzz", cat: "Magacines" },
    { uid: "1739", nombre: "Últimas preguntas", cat: "Magacines" },
    { uid: "1542", nombre: "Aquí hay trabajo", cat: "Magacines diarios" },
    { uid: "168410", nombre: "Culturas 2", cat: "Magacines diarios" },
    { uid: "69890", nombre: "Fiesta suprema", cat: "Magacines diarios" },
    { uid: "129590", nombre: "Inglés en TVE", cat: "Magacines diarios" },
    { uid: "1637", nombre: "La aventura del Saber", cat: "Magacines diarios" },
    { uid: "130434", nombre: "Muévete en casa", cat: "Magacines diarios" },
    { uid: "1000725", nombre: "RTVE es cine", cat: "Magacines diarios" },
    { uid: "172472", nombre: "Somos 8", cat: "Magacines diarios" },
    { uid: "1029443", nombre: "Sukha", cat: "Magacines diarios" },
    { uid: "1731", nombre: "That's English", cat: "Magacines diarios" },
    { uid: "30670", nombre: "Actívate. El reto del bienestar", cat: "Magacín semanal" },
    { uid: "62770", nombre: "Atención obras", cat: "Magacín semanal" },
    { uid: "1549", nombre: "Buenas noticias TV", cat: "Magacín semanal" },
    { uid: "1556", nombre: "Cartelera (2010)", cat: "Magacín semanal" },
    { uid: "124230", nombre: "De seda y hierro", cat: "Magacín semanal" },
    { uid: "20210", nombre: "Días de cine", cat: "Magacín semanal" },
    { uid: "133512", nombre: "El condensador de fluzo", cat: "Magacín semanal" },
    { uid: "1589", nombre: "El escarabajo verde", cat: "Magacín semanal" },
    { uid: "37610", nombre: "El mundo se mueve contigo", cat: "Magacín semanal" },
    { uid: "56811", nombre: "Flash moda", cat: "Magacín semanal" },
    { uid: "95430", nombre: "Medina en TVE", cat: "Magacín semanal" },
    { uid: "46310", nombre: "Naturalmente", cat: "Magacín semanal" },
    { uid: "37410", nombre: "Para todos La 2", cat: "Magacín semanal" },
    { uid: "1001339", nombre: "Pasa sin llamar", cat: "Magacín semanal" },
    { uid: "170191", nombre: "Pipper en ruta", cat: "Magacín semanal" },
    { uid: "38637", nombre: "Programa de mano", cat: "Magacín semanal" },
    { uid: "1685", nombre: "Página Dos", cat: "Magacín semanal" },
    { uid: "111570", nombre: "Saber vivir", cat: "Magacín semanal" },
    { uid: "1001641", nombre: "Se hace lo que se puede", cat: "Magacín semanal" },
    { uid: "72792", nombre: "Tengo once años", cat: "Magacín semanal" },
    { uid: "144610", nombre: "This is philosophy", cat: "Magacín semanal" },
    { uid: "1736", nombre: "tres14", cat: "Magacín semanal" },
    { uid: "168132", nombre: "Un país para leerlo", cat: "Magacín semanal" },
    { uid: "172830", nombre: "Una matemática viene a verte", cat: "Magacín semanal" },
    { uid: "1740", nombre: "Universo UNED", cat: "Magacín semanal" },
    { uid: "82230", nombre: "Órbita Laika", cat: "Magacín semanal" },
    { uid: "43110", nombre: "Alatul", cat: "Otros" },
    { uid: "41030", nombre: "Alquibla", cat: "Otros" },
    { uid: "43130", nombre: "América total", cat: "Otros" },
    { uid: "20194", nombre: "Anecdotari", cat: "Otros" },
    { uid: "21450", nombre: "Calle del agua", cat: "Otros" },
    { uid: "30011", nombre: "Calle del aire", cat: "Otros" },
    { uid: "20195", nombre: "Continuarà...", cat: "Otros" },
    { uid: "32559", nombre: "Disculpin la interrupció", cat: "Otros" },
    { uid: "121771", nombre: "Doble Hélice", cat: "Otros" },
    { uid: "37710", nombre: "Estudio 1", cat: "Otros" },
    { uid: "20198", nombre: "Memòries de la tele", cat: "Otros" },
    { uid: "141750", nombre: "Un país en danza", cat: "Otros" },
    { uid: "132013", nombre: "Banana Split", cat: "Recetas" },
    { uid: "92350", nombre: "80 cm", cat: "Reportajes Factual" },
    { uid: "124330", nombre: "Acceso autorizado", cat: "Reportajes Factual" },
    { uid: "68671", nombre: "Ahora, también", cat: "Reportajes Factual" },
    { uid: "1000756", nombre: "Beatus Ille", cat: "Reportajes Factual" },
    { uid: "1000742", nombre: "Caravana educativa", cat: "Reportajes Factual" },
    { uid: "89330", nombre: "Costa España", cat: "Reportajes Factual" },
    { uid: "1572", nombre: "Crónicas", cat: "Reportajes Factual" },
    { uid: "1000177", nombre: "De tapas por España", cat: "Reportajes Factual" },
    { uid: "133530", nombre: "Deslenguados", cat: "Reportajes Factual" },
    { uid: "119330", nombre: "Dfiesta en La 2", cat: "Reportajes Factual" },
    { uid: "112950", nombre: "El señor de los bosques", cat: "Reportajes Factual" },
    { uid: "46250", nombre: "En movimiento con", cat: "Reportajes Factual" },
    { uid: "1598", nombre: "En portada", cat: "Reportajes Factual" },
    { uid: "68290", nombre: "España a ras de cielo", cat: "Reportajes Factual" },
    { uid: "51810", nombre: "Esto está muy bien", cat: "Reportajes Factual" },
    { uid: "48750", nombre: "Flash Moda Monográficos", cat: "Reportajes Factual" },
    { uid: "46350", nombre: "Guggenheim", cat: "Reportajes Factual" },
    { uid: "61911", nombre: "I+", cat: "Reportajes Factual" },
    { uid: "38613", nombre: "Inquietos", cat: "Reportajes Factual" },
    { uid: "20211", nombre: "Jara y sedal", cat: "Reportajes Factual" },
    { uid: "49810", nombre: "La felicidad (en cuatro minutos)", cat: "Reportajes Factual" },
    { uid: "1000759", nombre: "La fiesta digital", cat: "Reportajes Factual" },
    { uid: "1000923", nombre: "La vuelta a la España digital", cat: "Reportajes Factual" },
    { uid: "1029538", nombre: "Limpia y ordena", cat: "Reportajes Factual" },
    { uid: "38634", nombre: "Mapa sonoro", cat: "Reportajes Factual" },
    { uid: "175377", nombre: "Mi cole es rural", cat: "Reportajes Factual" },
    { uid: "91070", nombre: "Mi Familia En La Mochila - Family Run", cat: "Reportajes Factual" },
    { uid: "98190", nombre: "Mundo Hacker", cat: "Reportajes Factual" },
    { uid: "1000495", nombre: "Por fin es lunes", cat: "Reportajes Factual" },
    { uid: "130664", nombre: "Ruralitas", cat: "Reportajes Factual" },
    { uid: "132614", nombre: "Ruta 17", cat: "Reportajes Factual" },
    { uid: "135350", nombre: "Rutas bizarras", cat: "Reportajes Factual" },
    { uid: "34390", nombre: "Seguridad vital 5.0", cat: "Reportajes Factual" },
    { uid: "169910", nombre: "Senderos con Juan y Migas", cat: "Reportajes Factual" },
    { uid: "144450", nombre: "Senderos del mundo", cat: "Reportajes Factual" },
    { uid: "111131", nombre: "Un país mágico", cat: "Reportajes Factual" },
    { uid: "122910", nombre: "Un país para escucharlo", cat: "Reportajes Factual" },
    { uid: "88190", nombre: "Versión europea", cat: "Reportajes Factual" },
    { uid: "1000743", nombre: "Yo soy de Formación Profesional", cat: "Reportajes Factual" },
    { uid: "120170", nombre: "Zona indie", cat: "Reportajes Factual" },
    { uid: "129130", nombre: "200. Una noche en El Prado", cat: "Serie Documental" },
    { uid: "1001564", nombre: "A flor de tierra", cat: "Serie Documental" },
    { uid: "20203", nombre: "A pedir de boca", cat: "Serie Documental" },
    { uid: "20255", nombre: "Acción directa", cat: "Serie Documental" },
    { uid: "30010", nombre: "Agua, la gota de la vida", cat: "Serie Documental" },
    { uid: "1537", nombre: "Al filo de lo imposible", cat: "Serie Documental" },
    { uid: "20312", nombre: "América / Indonesia mítica", cat: "Serie Documental" },
    { uid: "1030053", nombre: "Animales extraordinarios de Australia", cat: "Serie Documental" },
    { uid: "1000716", nombre: "Antiguos asentamientos de Europa", cat: "Serie Documental" },
    { uid: "166212", nombre: "Apocalipsis", cat: "Serie Documental" },
    { uid: "149571", nombre: "Apocalipsis de la Antigüedad", cat: "Serie Documental" },
    { uid: "61670", nombre: "Aquellas movidas", cat: "Serie Documental" },
    { uid: "40430", nombre: "Archivos Tema", cat: "Serie Documental" },
    { uid: "1000958", nombre: "Argentina indómita", cat: "Serie Documental" },
    { uid: "175910", nombre: "Arkeo", cat: "Serie Documental" },
    { uid: "51450", nombre: "Arqueomanía", cat: "Serie Documental" },
    { uid: "136111", nombre: "Arsenal animal", cat: "Serie Documental" },
    { uid: "117470", nombre: "Atleta gourmet", cat: "Serie Documental" },
    { uid: "178450", nombre: "Australia indómita", cat: "Serie Documental" },
    { uid: "1000103", nombre: "Austria salvaje. La fuerza del agua", cat: "Serie Documental" },
    { uid: "20191", nombre: "Azahar", cat: "Serie Documental" },
    { uid: "43310", nombre: "Baleares, un viaje en el tiempo", cat: "Serie Documental" },
    { uid: "1029418", nombre: "Baserri Gourmet", cat: "Serie Documental" },
    { uid: "1000922", nombre: "Belleza septentrional", cat: "Serie Documental" },
    { uid: "1029770", nombre: "Belleza y seducción en la naturaleza", cat: "Serie Documental" },
    { uid: "1029855", nombre: "Benita", cat: "Serie Documental" },
    { uid: "43131", nombre: "Bubbles", cat: "Serie Documental" },
    { uid: "130574", nombre: "Caminando sobre las olas", cat: "Serie Documental" },
    { uid: "43136", nombre: "Camino a casa", cat: "Serie Documental" },
    { uid: "168772", nombre: "Caminos de Santiago, entre el cielo y la tierra", cat: "Serie Documental" },
    { uid: "1000738", nombre: "Caminos de Sefarad. Diario de un ciclista", cat: "Serie Documental" },
    { uid: "1001000", nombre: "Campos de batalla naturales", cat: "Serie Documental" },
    { uid: "166010", nombre: "Canarias bajo el mar", cat: "Serie Documental" },
    { uid: "175030", nombre: "Canas de viajar", cat: "Serie Documental" },
    { uid: "123230", nombre: "Carlos V. Los caminos del Emperador", cat: "Serie Documental" },
    { uid: "43330", nombre: "Carlos V. Un monarca, un imperio", cat: "Serie Documental" },
    { uid: "177950", nombre: "Carrero Blanco, las cuatro muertes del presidente", cat: "Serie Documental" },
    { uid: "113670", nombre: "Cartas en el tiempo", cat: "Serie Documental" },
    { uid: "145570", nombre: "Castillos de leyenda", cat: "Serie Documental" },
    { uid: "1001494", nombre: "Ciberdelitos", cat: "Serie Documental" },
    { uid: "45374", nombre: "Cierta idea de Europa", cat: "Serie Documental" },
    { uid: "51570", nombre: "Cims", cat: "Serie Documental" },
    { uid: "104110", nombre: "Ciudades españolas Patrimonio de la Humanidad", cat: "Serie Documental" },
    { uid: "1562", nombre: "Ciudades para el siglo XXI", cat: "Serie Documental" },
    { uid: "57934", nombre: "Colón y la era del descubrimiento", cat: "Serie Documental" },
    { uid: "70870", nombre: "Con ciencia", cat: "Serie Documental" },
    { uid: "49010", nombre: "Con los 6 sentidos", cat: "Serie Documental" },
    { uid: "130830", nombre: "Costas de la España Mediterránea", cat: "Serie Documental" },
    { uid: "40570", nombre: "Creadores de hoy", cat: "Serie Documental" },
    { uid: "43270", nombre: "Creadores del siglo XX", cat: "Serie Documental" },
    { uid: "1029535", nombre: "Crecemos juntas", cat: "Serie Documental" },
    { uid: "49191", nombre: "Cruce de caminos", cat: "Serie Documental" },
    { uid: "1030466", nombre: "Crías. Una bienvenida salvaje", cat: "Serie Documental" },
    { uid: "167330", nombre: "Cuaderno de campo", cat: "Serie Documental" },
    { uid: "37150", nombre: "Cuadernos de paso", cat: "Serie Documental" },
    { uid: "66510", nombre: "Cumbres", cat: "Serie Documental" },
    { uid: "1030350", nombre: "Curiosidades naturales de David Attenborough", cat: "Serie Documental" },
    { uid: "1030468", nombre: "Cómo entrenar a tu depredador", cat: "Serie Documental" },
    { uid: "1000869", nombre: "De la fábrica al consumidor", cat: "Serie Documental" },
    { uid: "148150", nombre: "De parque en parque", cat: "Serie Documental" },
    { uid: "1001662", nombre: "Dehesa", cat: "Serie Documental" },
    { uid: "155150", nombre: "Dehesa, el bosque del lince ibérico", cat: "Serie Documental" },
    { uid: "176990", nombre: "Del amanecer al crepúsculo", cat: "Serie Documental" },
    { uid: "1029754", nombre: "Depredadores letales", cat: "Serie Documental" },
    { uid: "47011", nombre: "Desafío 14+1: Everest sin O2", cat: "Serie Documental" },
    { uid: "136070", nombre: "Descubrir", cat: "Serie Documental" },
    { uid: "129463", nombre: "Detrás del instante", cat: "Serie Documental" },
    { uid: "74710", nombre: "Diario de un nómada", cat: "Serie Documental" },
    { uid: "1029725", nombre: "Diarios de Yellowstone", cat: "Serie Documental" },
    { uid: "1000326", nombre: "Dioses de Egipto", cat: "Serie Documental" },
    { uid: "176230", nombre: "Diseños fabulosos", cat: "Serie Documental" },
    { uid: "87271", nombre: "Documaster", cat: "Serie Documental" },
    { uid: "1580", nombre: "Documentos TV", cat: "Serie Documental" },
    { uid: "1000159", nombre: "Dun Huang, antigua fortaleza de la frontera", cat: "Serie Documental" },
    { uid: "1000158", nombre: "Ecuador en la cima de la diversidad", cat: "Serie Documental" },
    { uid: "82810", nombre: "Edificios", cat: "Serie Documental" },
    { uid: "177690", nombre: "El antártico salvaje", cat: "Serie Documental" },
    { uid: "1001333", nombre: "El arma del siglo", cat: "Serie Documental" },
    { uid: "65510", nombre: "El arrecife de coral", cat: "Serie Documental" },
    { uid: "136290", nombre: "El año de la naturaleza canadiense", cat: "Serie Documental" },
    { uid: "176391", nombre: "El año salvaje en África", cat: "Serie Documental" },
    { uid: "30671", nombre: "El bosque protector", cat: "Serie Documental" },
    { uid: "33471", nombre: "El camino del Cid (2008)", cat: "Serie Documental" },
    { uid: "57870", nombre: "El Canal de Castilla", cat: "Serie Documental" },
    { uid: "101610", nombre: "El cazador de cerebros", cat: "Serie Documental" },
    { uid: "89692", nombre: "El chef del mar", cat: "Serie Documental" },
    { uid: "1000826", nombre: "El chef errante", cat: "Serie Documental" },
    { uid: "1000391", nombre: "El día D Las grabaciones desconocidas", cat: "Serie Documental" },
    { uid: "1000956", nombre: "El engaño: La Segunda Guerra Mundial", cat: "Serie Documental" },
    { uid: "175871", nombre: "El gran tour de Bettany Hughes. De París a Roma", cat: "Serie Documental" },
    { uid: "82850", nombre: "El Greco, alma y luz universales", cat: "Serie Documental" },
    { uid: "36971", nombre: "El hombre y la Tierra", cat: "Serie Documental" },
    { uid: "1001299", nombre: "El juego de tronos de los leopardos", cat: "Serie Documental" },
    { uid: "1028648", nombre: "El lenguaje de las máquinas", cat: "Serie Documental" },
    { uid: "138771", nombre: "El mar Arábigo", cat: "Serie Documental" },
    { uid: "177330", nombre: "El Mediterráneo, la vida bajo asedio", cat: "Serie Documental" },
    { uid: "1028885", nombre: "El mundo de los océanos", cat: "Serie Documental" },
    { uid: "1000899", nombre: "El mundo perdido de Angkor Wat", cat: "Serie Documental" },
    { uid: "1001235", nombre: "El Okavango. El río de los sueños", cat: "Serie Documental" },
    { uid: "1000075", nombre: "El Pacífico más salvaje", cat: "Serie Documental" },
    { uid: "173650", nombre: "El planeta verde", cat: "Serie Documental" },
    { uid: "1029557", nombre: "El renacimiento. Arte y violencia", cat: "Serie Documental" },
    { uid: "66090", nombre: "El río de la vida", cat: "Serie Documental" },
    { uid: "1029305", nombre: "El sistema solar", cat: "Serie Documental" },
    { uid: "43290", nombre: "El universo escondido", cat: "Serie Documental" },
    { uid: "178010", nombre: "El valle indómito", cat: "Serie Documental" },
    { uid: "1000860", nombre: "El viaje de la vida", cat: "Serie Documental" },
    { uid: "1000837", nombre: "El viajero. 48 horas en.....", cat: "Serie Documental" },
    { uid: "43150", nombre: "El vínculo con la Tierra", cat: "Serie Documental" },
    { uid: "167430", nombre: "Elefantes de cerca", cat: "Serie Documental" },
    { uid: "42733", nombre: "Elogio de la luz", cat: "Serie Documental" },
    { uid: "24590", nombre: "Els camins de la calma", cat: "Serie Documental" },
    { uid: "50654", nombre: "Emprendedores e innovadores", cat: "Serie Documental" },
    { uid: "175911", nombre: "En busca de secretos", cat: "Serie Documental" },
    { uid: "1001077", nombre: "En busca del arte perdido", cat: "Serie Documental" },
    { uid: "1001143", nombre: "En la naturaleza india", cat: "Serie Documental" },
    { uid: "38611", nombre: "En memoria de...", cat: "Serie Documental" },
    { uid: "68330", nombre: "Entre vinyes", cat: "Serie Documental" },
    { uid: "49890", nombre: "Entre2aguas", cat: "Serie Documental" },
    { uid: "176457", nombre: "Erase una vez en Tsavo", cat: "Serie Documental" },
    { uid: "122530", nombre: "Escala humana", cat: "Serie Documental" },
    { uid: "1001056", nombre: "Escapadas extraordinarias", cat: "Serie Documental" },
    { uid: "1030422", nombre: "Escapadas por los pelos en la naturaleza", cat: "Serie Documental" },
    { uid: "1001084", nombre: "Escocia. Un año salvaje", cat: "Serie Documental" },
    { uid: "43170", nombre: "Espacios arquitectónicos", cat: "Serie Documental" },
    { uid: "136831", nombre: "Espacios increíbles", cat: "Serie Documental" },
    { uid: "1000790", nombre: "Espacios increíbles. La aventura en Alaska de George Clarke", cat: "Serie Documental" },
    { uid: "42990", nombre: "Espacios naturales", cat: "Serie Documental" },
    { uid: "1000807", nombre: "Espacios naturales espectaculares", cat: "Serie Documental" },
    { uid: "1030060", nombre: "España pueblo a pueblo", cat: "Serie Documental" },
    { uid: "1029065", nombre: "España sin asfalto", cat: "Serie Documental" },
    { uid: "169670", nombre: "España, el siglo XX en color", cat: "Serie Documental" },
    { uid: "20313", nombre: "España, entre el cielo y la tierra", cat: "Serie Documental" },
    { uid: "1001499", nombre: "Esto es España", cat: "Serie Documental" },
    { uid: "1000141", nombre: "Eva Longoria. Recorriendo México", cat: "Serie Documental" },
    { uid: "45373", nombre: "Expedición 1808", cat: "Serie Documental" },
    { uid: "1000181", nombre: "Expedición Mednight. Los puertos de la ciencia", cat: "Serie Documental" },
    { uid: "1000621", nombre: "Explorando la India con Bettany Hughes", cat: "Serie Documental" },
    { uid: "33792", nombre: "Fauna callejera", cat: "Serie Documental" },
    { uid: "1000436", nombre: "Fauna ibérica", cat: "Serie Documental" },
    { uid: "1029177", nombre: "Fauna letal", cat: "Serie Documental" },
    { uid: "1001169", nombre: "Forjadores del mañana", cat: "Serie Documental" },
    { uid: "1000990", nombre: "Fortalezas asediadas", cat: "Serie Documental" },
    { uid: "43970", nombre: "Gaudiana", cat: "Serie Documental" },
    { uid: "1001303", nombre: "Genderless", cat: "Serie Documental" },
    { uid: "1000123", nombre: "Gigantes y salvajes", cat: "Serie Documental" },
    { uid: "1000714", nombre: "Gladiadores", cat: "Serie Documental" },
    { uid: "20197", nombre: "Granangular.cat", cat: "Serie Documental" },
    { uid: "142510", nombre: "Grandes diseños", cat: "Serie Documental" },
    { uid: "172050", nombre: "Grandes diseños por el mundo", cat: "Serie Documental" },
    { uid: "1001371", nombre: "Grandes especies de África", cat: "Serie Documental" },
    { uid: "43410", nombre: "Grandes obras universales", cat: "Serie Documental" },
    { uid: "178351", nombre: "Grandes parques naturales de África", cat: "Serie Documental" },
    { uid: "1000915", nombre: "Grandes viajes ferroviarios por Gran Bretaña", cat: "Serie Documental" },
    { uid: "43332", nombre: "Guardianes de hábitat", cat: "Serie Documental" },
    { uid: "129461", nombre: "Guardianes del Patrimonio", cat: "Serie Documental" },
    { uid: "174473", nombre: "Hijas del sol", cat: "Serie Documental" },
    { uid: "1001663", nombre: "Hijos de Saliega. El retorno del lince ibérico", cat: "Serie Documental" },
    { uid: "37190", nombre: "Historias del milenio", cat: "Serie Documental" },
    { uid: "77270", nombre: "Històries de taula i llit", cat: "Serie Documental" },
    { uid: "137430", nombre: "Históricos anónimos", cat: "Serie Documental" },
    { uid: "177170", nombre: "Hogares increíbles con Dermot Bannon", cat: "Serie Documental" },
    { uid: "178030", nombre: "Holanda salvaje", cat: "Serie Documental" },
    { uid: "172570", nombre: "Hollywood rueda en España 1955-1980", cat: "Serie Documental" },
    { uid: "1030433", nombre: "Hoteles con Alma", cat: "Serie Documental" },
    { uid: "1001415", nombre: "Hoteles Gourmet", cat: "Serie Documental" },
    { uid: "119510", nombre: "Hundidos", cat: "Serie Documental" },
    { uid: "101750", nombre: "Héroes invisibles", cat: "Serie Documental" },
    { uid: "45990", nombre: "Igual-es", cat: "Serie Documental" },
    { uid: "38596", nombre: "Imprescindibles", cat: "Serie Documental" },
    { uid: "48790", nombre: "Imágenes prohibidas", cat: "Serie Documental" },
    { uid: "137710", nombre: "Infierno arábigo", cat: "Serie Documental" },
    { uid: "92990", nombre: "Ingeniería romana", cat: "Serie Documental" },
    { uid: "149370", nombre: "Into the blue", cat: "Serie Documental" },
    { uid: "1030514", nombre: "Islas", cat: "Serie Documental" },
    { uid: "1000122", nombre: "Italia. El último territorio salvaje", cat: "Serie Documental" },
    { uid: "1000825", nombre: "Italiana TV Magazine", cat: "Serie Documental" },
    { uid: "133113", nombre: "Jardines con historia", cat: "Serie Documental" },
    { uid: "1029475", nombre: "Jerte. Vida salvaje en el valle de los cerezos", cat: "Serie Documental" },
    { uid: "148210", nombre: "Jesús de Nazaret", cat: "Serie Documental" },
    { uid: "1000647", nombre: "La asombrosa aventura estadounidense de George Clarke", cat: "Serie Documental" },
    { uid: "43172", nombre: "La batalla del Ebro", cat: "Serie Documental" },
    { uid: "138250", nombre: "La carrera de la vida", cat: "Serie Documental" },
    { uid: "1001003", nombre: "La conquista de la democracia", cat: "Serie Documental" },
    { uid: "168270", nombre: "La controversia del arte", cat: "Serie Documental" },
    { uid: "1000088", nombre: "La corriente de Humboldt", cat: "Serie Documental" },
    { uid: "129512", nombre: "La cuarta revolución", cat: "Serie Documental" },
    { uid: "43132", nombre: "La dieta mediterránea", cat: "Serie Documental" },
    { uid: "1000791", nombre: "La dinastía Kim. Una cuestión de familia", cat: "Serie Documental" },
    { uid: "67410", nombre: "La España salvaje", cat: "Serie Documental" },
    { uid: "44870", nombre: "La expedición Malaspina", cat: "Serie Documental" },
    { uid: "43139", nombre: "La frontera invisible", cat: "Serie Documental" },
    { uid: "44030", nombre: "La fábrica. Cultura en movimiento", cat: "Serie Documental" },
    { uid: "1001534", nombre: "La gran aventura de la lengua española", cat: "Serie Documental" },
    { uid: "1000074", nombre: "La gran sequía", cat: "Serie Documental" },
    { uid: "43151", nombre: "La huella", cat: "Serie Documental" },
    { uid: "174510", nombre: "La Italia que gusta", cat: "Serie Documental" },
    { uid: "1001689", nombre: "La Jayona. Un nuevo mundo enterrado", cat: "Serie Documental" },
    { uid: "61230", nombre: "La luz y el misterio de las catedrales", cat: "Serie Documental" },
    { uid: "38614", nombre: "La mirada fotográfica", cat: "Serie Documental" },
    { uid: "38630", nombre: "La mitad invisible", cat: "Serie Documental" },
    { uid: "129412", nombre: "La navaja de Ockham", cat: "Serie Documental" },
    { uid: "1641", nombre: "La noche temática", cat: "Serie Documental" },
    { uid: "43312", nombre: "La ruta alternativa", cat: "Serie Documental" },
    { uid: "1000861", nombre: "La ruta de la seda desde el aire", cat: "Serie Documental" },
    { uid: "43291", nombre: "La ruta de los exploradores", cat: "Serie Documental" },
    { uid: "45376", nombre: "La ruta de Samarkanda", cat: "Serie Documental" },
    { uid: "1000620", nombre: "La tierra ancestral. Dinosaurios del continente helado", cat: "Serie Documental" },
    { uid: "43391", nombre: "La tierra vista desde el cielo", cat: "Serie Documental" },
    { uid: "1000765", nombre: "La tumba tóxica de Tutankamón", cat: "Serie Documental" },
    { uid: "1001168", nombre: "La vida en el reino animal", cat: "Serie Documental" },
    { uid: "1000766", nombre: "La vida secreta de los canguros", cat: "Serie Documental" },
    { uid: "1000970", nombre: "La vida secreta de los koalas", cat: "Serie Documental" },
    { uid: "1000247", nombre: "La vida secreta del demonio de Tasmania", cat: "Serie Documental" },
    { uid: "1029050", nombre: "La Vuelta al Mundo en 80 Likes", cat: "Serie Documental" },
    { uid: "1001254", nombre: "Las aventuras de Antón y Giovanni en Sicilia", cat: "Serie Documental" },
    { uid: "1028740", nombre: "Las aves del frío", cat: "Serie Documental" },
    { uid: "1000921", nombre: "Las caras salvajes", cat: "Serie Documental" },
    { uid: "1646", nombre: "Las claves del Románico", cat: "Serie Documental" },
    { uid: "1030132", nombre: "Las cuatro esquinas del plato", cat: "Serie Documental" },
    { uid: "145971", nombre: "Las historias del bosque mediterráneo", cat: "Serie Documental" },
    { uid: "1000324", nombre: "Las islas salvajes de Irlanda", cat: "Serie Documental" },
    { uid: "135491", nombre: "Las recetas de Julie", cat: "Serie Documental" },
    { uid: "1001124", nombre: "Las revoluciones que cambiaron la historia", cat: "Serie Documental" },
    { uid: "43411", nombre: "Las riberas del mar océano", cat: "Serie Documental" },
    { uid: "128790", nombre: "Las Rutas de...", cat: "Serie Documental" },
    { uid: "1000982", nombre: "Las salvajes islas Tuamotu", cat: "Serie Documental" },
    { uid: "134990", nombre: "Las Sinsombrero", cat: "Serie Documental" },
    { uid: "21090", nombre: "Linatakalam", cat: "Serie Documental" },
    { uid: "48390", nombre: "Linguàrium", cat: "Serie Documental" },
    { uid: "1030603", nombre: "Los animales más salvajes del planeta", cat: "Serie Documental" },
    { uid: "70790", nombre: "Los balleneros del norte", cat: "Serie Documental" },
    { uid: "172910", nombre: "Los cazadores de África", cat: "Serie Documental" },
    { uid: "38632", nombre: "Los documentales de Cultural.es", cat: "Serie Documental" },
    { uid: "105070", nombre: "Los enigmas de Cervantes", cat: "Serie Documental" },
    { uid: "43293", nombre: "Los moriscos", cat: "Serie Documental" },
    { uid: "38633", nombre: "Los oficios de la cultura", cat: "Serie Documental" },
    { uid: "177870", nombre: "Los paisajes mas bellos del mundo", cat: "Serie Documental" },
    { uid: "148810", nombre: "Los pilares del tiempo", cat: "Serie Documental" },
    { uid: "43133", nombre: "Los pueblos", cat: "Serie Documental" },
    { uid: "1000845", nombre: "Los recién llegados de la naturaleza", cat: "Serie Documental" },
    { uid: "1001234", nombre: "Los secretos de la civilización", cat: "Serie Documental" },
    { uid: "1000248", nombre: "Los secretos sexuales de Hitler", cat: "Serie Documental" },
    { uid: "1000329", nombre: "Los señores del Reich", cat: "Serie Documental" },
    { uid: "1001391", nombre: "Los supervivientes definitivos de la naturaleza", cat: "Serie Documental" },
    { uid: "20310", nombre: "Los trabajos y los días", cat: "Serie Documental" },
    { uid: "177710", nombre: "Los trenes panorámicos de Escocia", cat: "Serie Documental" },
    { uid: "40510", nombre: "Los últimos indígenas", cat: "Serie Documental" },
    { uid: "1000929", nombre: "Los últimos secretos de la humanidad", cat: "Serie Documental" },
    { uid: "1001574", nombre: "Lugares extraordinarios del mundo", cat: "Serie Documental" },
    { uid: "1029764", nombre: "Lugares indómitos. La gran barrera de coral", cat: "Serie Documental" },
    { uid: "1001249", nombre: "Lugares que visitar antes de morir", cat: "Serie Documental" },
    { uid: "1000739", nombre: "Maestros de los sabores", cat: "Serie Documental" },
    { uid: "144090", nombre: "Magnífico Magreb", cat: "Serie Documental" },
    { uid: "1000909", nombre: "Maravillas de Europa", cat: "Serie Documental" },
    { uid: "176455", nombre: "Maravillas de la arquitectura francesa", cat: "Serie Documental" },
    { uid: "178352", nombre: "Maravillas inmortales del planeta Tierra", cat: "Serie Documental" },
    { uid: "1000019", nombre: "Maravillas salvajes de Madagascar", cat: "Serie Documental" },
    { uid: "1000018", nombre: "Mares supremos", cat: "Serie Documental" },
    { uid: "1001619", nombre: "Matar a Sherlock", cat: "Serie Documental" },
    { uid: "43138", nombre: "Memoria de España", cat: "Serie Documental" },
    { uid: "1001366", nombre: "Mercados del mundo. En la panza de la ciudad", cat: "Serie Documental" },
    { uid: "1665", nombre: "Metrópolis", cat: "Serie Documental" },
    { uid: "168131", nombre: "Mi casa flotante", cat: "Serie Documental" },
    { uid: "148451", nombre: "Miguel Hernández (Centenario)", cat: "Serie Documental" },
    { uid: "1029307", nombre: "Mindful earth", cat: "Serie Documental" },
    { uid: "35610", nombre: "Mis hermanos y yo", cat: "Serie Documental" },
    { uid: "58531", nombre: "Mitos y leyendas", cat: "Serie Documental" },
    { uid: "50170", nombre: "Moments", cat: "Serie Documental" },
    { uid: "130052", nombre: "Mujeres en La 2", cat: "Serie Documental" },
    { uid: "33472", nombre: "Mujeres en la historia", cat: "Serie Documental" },
    { uid: "43313", nombre: "Mujeres para una época", cat: "Serie Documental" },
    { uid: "56870", nombre: "Mundos diminutos", cat: "Serie Documental" },
    { uid: "83350", nombre: "Música ligerísima", cat: "Serie Documental" },
    { uid: "176490", nombre: "Nacidos de la tormenta", cat: "Serie Documental" },
    { uid: "43271", nombre: "Navarra al natural", cat: "Serie Documental" },
    { uid: "132891", nombre: "New Neighbours", cat: "Serie Documental" },
    { uid: "1000390", nombre: "Ningaloo. La maravilla del océano de Australia", cat: "Serie Documental" },
    { uid: "38635", nombre: "Nostromo", cat: "Serie Documental" },
    { uid: "1000846", nombre: "Nueva Zelanda en tren", cat: "Serie Documental" },
    { uid: "165511", nombre: "Nunca es demasiado pequeño", cat: "Serie Documental" },
    { uid: "143350", nombre: "Origen", cat: "Serie Documental" },
    { uid: "40130", nombre: "Otros documentales", cat: "Serie Documental" },
    { uid: "1683", nombre: "Otros pueblos", cat: "Serie Documental" },
    { uid: "1001172", nombre: "Padres en la naturaleza", cat: "Serie Documental" },
    { uid: "43272", nombre: "Paisajes de la historia", cat: "Serie Documental" },
    { uid: "43294", nombre: "Paisajes del castellano", cat: "Serie Documental" },
    { uid: "1001154", nombre: "Pambara", cat: "Serie Documental" },
    { uid: "1687", nombre: "Panorama", cat: "Serie Documental" },
    { uid: "175252", nombre: "Panteras", cat: "Serie Documental" },
    { uid: "1688", nombre: "Paraísos cercanos", cat: "Serie Documental" },
    { uid: "43174", nombre: "Paraísos de Centroamérica", cat: "Serie Documental" },
    { uid: "1001092", nombre: "Pasión y gloria", cat: "Serie Documental" },
    { uid: "43371", nombre: "Paso a paso con Nacho Duato", cat: "Serie Documental" },
    { uid: "1000379", nombre: "Paul va a Hollywood", cat: "Serie Documental" },
    { uid: "1000745", nombre: "Persiguiendo la lluvia", cat: "Serie Documental" },
    { uid: "1000265", nombre: "Planeta arqueología cuando el pasado se explica...", cat: "Serie Documental" },
    { uid: "81290", nombre: "Planeta Comida", cat: "Serie Documental" },
    { uid: "135290", nombre: "Planeta selva", cat: "Serie Documental" },
    { uid: "33473", nombre: "Por la ruta de la memoria", cat: "Serie Documental" },
    { uid: "1028744", nombre: "Profesiones salvajes", cat: "Serie Documental" },
    { uid: "1701", nombre: "Protagonistas del recuerdo", cat: "Serie Documental" },
    { uid: "1702", nombre: "Pueblo de Dios", cat: "Serie Documental" },
    { uid: "48310", nombre: "Racons", cat: "Serie Documental" },
    { uid: "1000930", nombre: "Rapaces. Un puño de dagas", cat: "Serie Documental" },
    { uid: "95550", nombre: "Red Natura 2000", cat: "Serie Documental" },
    { uid: "1705", nombre: "Redes", cat: "Serie Documental" },
    { uid: "131986", nombre: "Reduce tu huella", cat: "Serie Documental" },
    { uid: "1000897", nombre: "Reinas que cambiaron el mundo", cat: "Serie Documental" },
    { uid: "43273", nombre: "Relatos de otras tierras", cat: "Serie Documental" },
    { uid: "175390", nombre: "Relatos de Zambia", cat: "Serie Documental" },
    { uid: "38638", nombre: "Reportero de la historia", cat: "Serie Documental" },
    { uid: "132960", nombre: "Rescate", cat: "Serie Documental" },
    { uid: "43352", nombre: "Retratos de danza", cat: "Serie Documental" },
    { uid: "1000380", nombre: "Rico rico. El documental", cat: "Serie Documental" },
    { uid: "43274", nombre: "Ruta ibérica", cat: "Serie Documental" },
    { uid: "24030", nombre: "Ruta vía de la Plata", cat: "Serie Documental" },
    { uid: "135391", nombre: "Ruta Vía de la Plata: Diario de un Ciclista", cat: "Serie Documental" },
    { uid: "1000908", nombre: "Rutas increíbles", cat: "Serie Documental" },
    { uid: "1029073", nombre: "Ríos", cat: "Serie Documental" },
    { uid: "1001064", nombre: "Sabores del mundo", cat: "Serie Documental" },
    { uid: "1015364", nombre: "Salvajes", cat: "Serie Documental" },
    { uid: "1028871", nombre: "Secretos de los dinosaurios jurásicos", cat: "Serie Documental" },
    { uid: "43134", nombre: "Senderos de gran recorrido", cat: "Serie Documental" },
    { uid: "149150", nombre: "Ser mare", cat: "Serie Documental" },
    { uid: "149050", nombre: "Siete mundos un planeta", cat: "Serie Documental" },
    { uid: "137730", nombre: "Sin equipaje", cat: "Serie Documental" },
    { uid: "1000810", nombre: "Sorolla, una mirada inédita", cat: "Serie Documental" },
    { uid: "178350", nombre: "Stanley Tucci. Recorriendo Italia", cat: "Serie Documental" },
    { uid: "168113", nombre: "Supersentidos. Fuerzas especiales", cat: "Serie Documental" },
    { uid: "175170", nombre: "Supervivientes de la naturaleza", cat: "Serie Documental" },
    { uid: "58830", nombre: "Talento 100", cat: "Serie Documental" },
    { uid: "92770", nombre: "También entre pucheros anda el Señor", cat: "Serie Documental" },
    { uid: "1029551", nombre: "Tecnología animal", cat: "Serie Documental" },
    { uid: "1001555", nombre: "Territorio salvaje", cat: "Serie Documental" },
    { uid: "43370", nombre: "Tesoro del sur", cat: "Serie Documental" },
    { uid: "118050", nombre: "Tesoros de la corona", cat: "Serie Documental" },
    { uid: "1001338", nombre: "Tiburones de cerca", cat: "Serie Documental" },
    { uid: "46490", nombre: "Todo el mundo es música", cat: "Serie Documental" },
    { uid: "43135", nombre: "Trajano, emperador de Roma", cat: "Serie Documental" },
    { uid: "1030464", nombre: "Travesías animales épicas", cat: "Serie Documental" },
    { uid: "42734", nombre: "Tres arquitecturas", cat: "Serie Documental" },
    { uid: "64990", nombre: "Trucks. Estrellas en la carretera", cat: "Serie Documental" },
    { uid: "115150", nombre: "Turismo rural en el mundo", cat: "Serie Documental" },
    { uid: "95050", nombre: "Turismo rural en Europa", cat: "Serie Documental" },
    { uid: "1030515", nombre: "Un año en la selva", cat: "Serie Documental" },
    { uid: "1000305", nombre: "Un año salvaje en la Tierra", cat: "Serie Documental" },
    { uid: "1029300", nombre: "Un país en bicicleta. Diario de una ciclista", cat: "Serie Documental" },
    { uid: "42590", nombre: "Un país en la mochila", cat: "Serie Documental" },
    { uid: "1000006", nombre: "Una banda muy salvaje", cat: "Serie Documental" },
    { uid: "1001027", nombre: "Una manada de guepardos", cat: "Serie Documental" },
    { uid: "43351", nombre: "Unidad de naturaleza", cat: "Serie Documental" },
    { uid: "84210", nombre: "Urbanitas por el campo", cat: "Serie Documental" },
    { uid: "155350", nombre: "Viajar en tren", cat: "Serie Documental" },
    { uid: "1029173", nombre: "Viajes con Ágatha Christie y sir David Suchet", cat: "Serie Documental" },
    { uid: "1000809", nombre: "Vientos poderosos", cat: "Serie Documental" },
    { uid: "56490", nombre: "Viva la Pepa", cat: "Serie Documental" },
    { uid: "1000325", nombre: "Viviente", cat: "Serie Documental" },
    { uid: "108210", nombre: "¡Qué animal!", cat: "Serie Documental" },
    { uid: "175171", nombre: "África extrema", cat: "Serie Documental" },
    { uid: "1630", nombre: "Índico", cat: "Serie Documental" },
    { uid: "94810", nombre: "Ciencia forense", cat: "Series" },
    { uid: "1030665", nombre: "Locomía", cat: "Series" },
    { uid: "57933", nombre: "Lorca, muerte de un poeta", cat: "Series" },
    { uid: "129353", nombre: "El comisario Montalbano", cat: "Series Internacionales" },
    { uid: "1001378", nombre: "El conde de Montecristo", cat: "Series Internacionales" },
    { uid: "1000301", nombre: "Grantchester", cat: "Series Internacionales" },
    { uid: "174190", nombre: "Imma Tataranni", cat: "Series Internacionales" },
    { uid: "131650", nombre: "Los bastardos de Pizzofalcone", cat: "Series Internacionales" },
    { uid: "37330", nombre: "Ciudad K", cat: "Series Prime Time" },
    { uid: "126690", nombre: "Cuatro estaciones en La Habana", cat: "Series Prime Time" },
    { uid: "24331", nombre: "Guante blanco", cat: "Series Prime Time" },
    { uid: "113690", nombre: "Sabuesos", cat: "Series Prime Time" },
    { uid: "118210", nombre: "Les nits de la tieta Rosa", cat: "Series catalán" },
    { uid: "63030", nombre: "Anillos de oro", cat: "Series de Archivo" },
    { uid: "125470", nombre: "Terra d'escudella", cat: "Series de Archivo" },
  ];

  let rtveProg = null;      // programa abierto (vista episodios)
  let rtveEpis = [];        // episodios cargados del programa
  // v5.3.1: podcast por feed RSS abierto (vista de sus episodios)
  let podFeed = null;       // objeto PODCASTS con campo 'feed'
  let podEpis = [];         // episodios parseados del feed
  let podErr = '';          // error al cargar el feed
  let podCargando = false;  // feed en proceso de carga
  let rtveCargando = false;
  let rtveErr = '';

  // Sección nueva (estructura): categorías fijas + podcasts que se irán
  // añadiendo. Mientras no haya podcasts REALES, se muestra un estado
  // "próximamente" con las categorías, nunca se inventan streams.
  function renderPodcast() {
    // v5.4: la pestaña Podcast usa la interfaz Podcast Pro (renderPodcastPro),
    // que conserva la vista de episodios del feed abierto (pintarPodEpisodios)
    // y la búsqueda, y añade inicio con 24/7, continuar escuchando, destacados,
    // últimos episodios, categorías, Mis podcasts y Favoritos.
    renderPodcastPro();
  }

  // ================= PODCASTS POR FEED RSS (v5.3.1) =================
  // Los podcasts de la lista con campo 'feed' (no 'url') son feeds RSS de
  // episodios: al tocarlos se abre su lista y cada episodio suena bajo
  // demanda (MP3 directo del <enclosure>). Los 24/7 (campo url) siguen
  // sonando directo como siempre.
  const POD_CACHE_MS = 6 * 3600 * 1000; // 6 horas

  function abrirPodcastFeed(p) {
    // v5.4: unifica el parser en fetchPodEps (misma caché teleaudio_podfeed_<id>).
    podFeed = p;
    podEpis = [];
    podErr = '';
    podCargando = true;
    grid.innerHTML = '';
    pintarPodEpisodios(); // skeleton mientras llega
    podEpsDe(p, { force: false })
      .then(epis => {
        if (!podFeed || podFeed.id !== p.id) return; // cambió mientras cargaba
        podEpis = epis;
        podCargando = false;
        pintarPodEpisodios();
      })
      .catch(err => {
        if (!podFeed || podFeed.id !== p.id) return;
        podCargando = false;
        podErr = err && err.message ? err.message : 'error';
        pintarPodEpisodios();
      });
  }

  function formatearFechaRSS(pub) {
    // "Sat, 05 Sep 2026 12:45:00 +0200" -> "05-09-2026" (dd-mm-yyyy)
    const d = new Date(pub);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '-' + mm + '-' + d.getFullYear();
  }

  function durRSSaMs(raw) {
    // Acepta "3210" (segundos), "53:33" o "00:53:33"
    const s = String(raw || '').trim();
    if (!s) return 0;
    const partes = s.split(':').map(Number);
    if (partes.some(isNaN)) return 0;
    let seg = 0;
    if (partes.length === 3) seg = partes[0] * 3600 + partes[1] * 60 + partes[2];
    else if (partes.length === 2) seg = partes[0] * 60 + partes[1];
    else seg = partes[0];
    return seg > 0 ? seg * 1000 : 0;
  }

  function volverPodcastFeed() {
    podFeed = null;
    podEpis = [];
    podErr = '';
    podCargando = false;
    renderChannels(); // repinta la pestaña actual (podcast)
  }

  function pintarPodEpisodios() {
    if (!podFeed) return;
    grid.innerHTML = '';
    // Fila superior: volver + nombre del podcast
    const top = document.createElement('div');
    top.className = 'ep-top';
    const back = document.createElement('button');
    back.className = 'back-chip';
    back.textContent = '← Podcasts';
    back.addEventListener('click', volverPodcastFeed);
    const nom = document.createElement('span');
    nom.className = 'ep-prog-nombre';
    nom.textContent = '🎙️ ' + podFeed.name;
    top.appendChild(back);
    top.appendChild(nom);
    grid.appendChild(top);

    // v5.4: cabecera de detalle del podcast (portada, autor, desc, categorías)
    if (!podCargando && !podErr && podFeed) {
      const detalle = document.createElement('div');
      detalle.className = 'pod-detail';
      const dImg = document.createElement('img');
      dImg.className = 'pod-detail-img';
      dImg.src = podFeed.logo || 'icon.svg';
      dImg.alt = podFeed.name || '';
      dImg.onerror = () => { dImg.src = 'icon.svg'; };
      const dInfo = document.createElement('div');
      dInfo.className = 'pod-detail-info';
      const dNombre = document.createElement('div');
      dNombre.className = 'pod-detail-nombre';
      dNombre.textContent = podFeed.name || '';
      const dAutor = document.createElement('div');
      dAutor.className = 'pod-detail-autor';
      dAutor.textContent = podFeed.author || 'Podcast';
      const catsTxt = (podCatsDe(podFeed) || [])
        .map(c => { const m = PODCAST_CATS.find(x => x.id === c); return m ? m.icon + ' ' + m.label : ''; })
        .filter(Boolean).join(' · ');
      const dDesc = document.createElement('div');
      dDesc.className = 'pod-detail-desc';
      if (catsTxt) {
        const c = document.createElement('span');
        c.className = 'pod-detail-cats';
        c.textContent = catsTxt;
        dDesc.appendChild(c);
      }
      if (podFeed.desc) {
        const t = document.createElement('div');
        t.textContent = podFeed.desc;
        dDesc.appendChild(t);
      }
      dInfo.appendChild(dNombre);
      dInfo.appendChild(dAutor);
      dInfo.appendChild(dDesc);
      detalle.appendChild(dImg);
      detalle.appendChild(dInfo);
      // Botones rápidos
      const dAcciones = document.createElement('div');
      dAcciones.className = 'btn-row pod-detail-acciones';
      const bUltimo = document.createElement('button');
      bUltimo.className = 'btn btn-primary';
      bUltimo.textContent = '▶ Reproducir último';
      bUltimo.addEventListener('click', () => { if (podEpis.length) playItemPodcast(podFeed, podEpis[0]); });
      const b247 = document.createElement('button');
      b247.className = 'btn';
      b247.textContent = '📻 ' + (podFeed.name || 'Podcast') + ' 24/7';
      b247.addEventListener('click', () => pod247Start([podFeed.id], podFeed.name + ' 24/7'));
      const bFav = document.createElement('button');
      bFav.className = 'btn';
      const esFavPod = favs.has(podFeed.id);
      bFav.innerHTML = esFavPod ? '❤️ Favorito' : '♡ Favorito';
      bFav.addEventListener('click', () => {
        toggleFav(podFeed.id);
        bFav.textContent = favs.has(podFeed.id) ? '❤️ Favorito' : '♡ Favorito';
      });
      dAcciones.appendChild(bUltimo);
      dAcciones.appendChild(b247);
      dAcciones.appendChild(bFav);
      detalle.appendChild(dAcciones);
      grid.appendChild(detalle);
    }

    if (podCargando) {
      for (let i = 0; i < 5; i++) {
        const row = document.createElement('div');
        row.className = 'ep-row';
        row.style.border = 'none';
        row.style.background = 'transparent';
        row.style.cursor = 'default';
        const th = document.createElement('div');
        th.className = 'skeleton sk-thumb';
        const info = document.createElement('div');
        info.className = 'ep-info';
        const l1 = document.createElement('div');
        l1.className = 'skeleton sk-line w60';
        const l2 = document.createElement('div');
        l2.className = 'skeleton sk-line w30';
        info.appendChild(l1); info.appendChild(l2);
        row.appendChild(th); row.appendChild(info);
        grid.appendChild(row);
      }
      return;
    }
    if (podErr) {
      const sinConexion = typeof navigator !== 'undefined' && navigator.onLine === false;
      const box = document.createElement('div');
      box.className = 'conn-error';
      const ic = document.createElement('div');
      ic.className = 'ce-icon';
      ic.innerHTML = sinConexion
        ? '<svg width="26" height="26" aria-hidden="true"><use href="#i-wifi-off"/></svg>'
        : '<svg width="26" height="26" aria-hidden="true"><use href="#i-info"/></svg>';
      const t = document.createElement('strong');
      t.textContent = sinConexion ? 'Sin conexión' : 'No se pudo cargar el podcast';
      const s = document.createElement('span');
      s.textContent = 'Comprueba tu conexión o inténtalo más tarde.';
      const retry = document.createElement('button');
      retry.className = 'btn btn-primary';
      retry.textContent = '↺ Reintentar';
      retry.addEventListener('click', () => {
        podErr = '';
        podCargando = true;
        pintarPodEpisodios();
        // fuerza recarga (sin caché)
        try { localStorage.removeItem('teleaudio_podfeed_' + podFeed.id); } catch (e) {}
        abrirPodcastFeed(podFeed);
      });
      box.appendChild(ic); box.appendChild(t); box.appendChild(s); box.appendChild(retry);
      grid.appendChild(box);
      return;
    }
    if (!podEpis.length) {
      const av = document.createElement('div');
      av.className = 'comment-status';
      av.textContent = 'Este podcast aún no tiene episodios disponibles.';
      grid.appendChild(av);
      return;
    }
    const sub = document.createElement('div');
    sub.className = 'ep-sub';
    sub.textContent = 'Últimos ' + podEpis.length + ' episodios · toca uno para escucharlo';
    grid.appendChild(sub);
    podEpis.forEach(ep => grid.appendChild(filaEpisodioPod(ep)));
  }

  function filaEpisodioPod(ep) {
    // v5.4: versión Pro (favorito ♡, ⋮, continuar). Mismo aspecto que antes.
    return filaEpisodioPodPro(podFeed, ep, { fav: true, menu: true });
  }

  // Reproduce el MP3 directo de un episodio (bajo demanda, pausa real)
  // v5.4: delega en el reproductor de Podcast Pro (progreso, MediaSession, cola).
  function reproducirEpisodioPod(ep) {
    playItemPodcast(podFeed, ep);
  }

  // ================= PODCAST PRO v5.4 (colas 24/7, mis podcasts, continuar) =================
  // Añadido sobre el sistema v5.3.1 sin tocar TV/Radio/reproductor base.
  // Almacenamiento local (todo persistente en este dispositivo):
  //   teleaudio_mis_podcasts    → array de podcasts del usuario {id,name,logo,url|feed,cat,desc,tipo,meta}
  //   teleaudio_fav_episodios   → episodios favoritos [{key,podId,podName,titulo,url,img,durMs,fecha}]
  //   teleaudio_pod_progreso    → posiciones de escucha {key:{posMs,durMs,ts,podId,podName,titulo,url,img}}
  //   teleaudio_mis_stations    → estaciones 24/7 del usuario {id,name,desc,icon,podIds}
  //   teleaudio_pod247_shuffle  → '1' si 24/7 en modo aleatorio
  let podVista = 'inicio';      // 'inicio' | '247' | 'mis' | 'favs' | 'cat:<catId>'
  let misPodcasts = [];
  let favEps = [];
  let podProg = {};
  let misStations = [];
  let podQueue = [];            // cola activa: [{pod, ep}]
  let podQueueIdx = -1;         // -1 = cola cargada sin reproducir
  let pod247Mode = false;       // true si la cola es un 24/7 automático
  let pod247Shuffle = localStorage.getItem('teleaudio_pod247_shuffle') === '1';
  let podPlayed = [];           // últimos ids reproducidos (evitar repeticiones)
  let podQueueTimer = null;     // polling nativo para autoplay al terminar
  let podReintentos = 0;        // reintentos del item actual (máx 2)
  try { podPlayed = JSON.parse(localStorage.getItem('teleaudio_pod_played') || '[]') || []; } catch (e) {}

  function podLsGet(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? def : v; }
    catch (e) { return def; }
  }
  function podLsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function cargarPodcastLocal() {
    misPodcasts = podLsGet('teleaudio_mis_podcasts', []);
    favEps = podLsGet('teleaudio_fav_episodios', []);
    podProg = podLsGet('teleaudio_pod_progreso', {});
    misStations = podLsGet('teleaudio_mis_stations', []);
  }
  // Categorías de un podcast (puede tener varias: 'cats' o la principal 'cat')
  function podCatsDe(p) {
    if (!p) return [];
    const arr = Array.isArray(p.cats) && p.cats.length ? p.cats : (p.cat ? [p.cat] : []);
    return arr;
  }
  // ¿Es un feed de episodios (reproducible bajo demanda) o un stream directo?
  function esPodFeed(p) { return !!(p && p.feed); }
  function esPodStream(p) { return !!(p && !p.feed && p.url); }
  // Todos los podcasts visibles: catálogo + los del usuario
  function todosLosPodcasts() {
    return PODCASTS.concat(misPodcasts);
  }
  // Busca un podcast (catálogo o personalizado) por id
  function podPorId(id) {
    if (!id) return null;
    return todosLosPodcasts().find(p => p.id === id) || null;
  }
  // Episodios en caché (teleaudio_podfeed_<id>) sin red, o null si no hay
  function podEpsCache(p) {
    try {
      const c = JSON.parse(localStorage.getItem('teleaudio_podfeed_' + p.id) || 'null');
      if (c && Array.isArray(c.epis) && c.epis.length) return c.epis;
    } catch (e) {}
    return null;
  }
  function podEpsCacheFresh(p) {
    try {
      const c = JSON.parse(localStorage.getItem('teleaudio_podfeed_' + p.id) || 'null');
      if (c && Array.isArray(c.epis) && c.epis.length && Date.now() - c.ts < POD_CACHE_MS) return c.epis;
    } catch (e) {}
    return null;
  }
  // Carga (con red) los episodios de un feed y los guarda en caché. Usada por
  // el 24/7 y por "Probar conexión". No toca la vista actual.
  function fetchPodEps(p) {
    return fetch(p.feed, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(xml => {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const items = Array.from(doc.querySelectorAll('item')).slice(0, 40);
        const epis = items.map((it, i) => {
          const t = (it.querySelector('title') || {}).textContent || '';
          let titulo = t;
          if (p.name && titulo.indexOf(p.name + ' | ') === 0) titulo = titulo.slice(p.name.length + 3);
          const pub = (it.querySelector('pubDate') || {}).textContent || '';
          const durRaw = (it.getElementsByTagNameNS('*', 'duration')[0] || {}).textContent || '';
          const enc = it.querySelector('enclosure');
          const imgEl = it.getElementsByTagNameNS('*', 'image')[0];
          const guid = (it.querySelector('guid') || {}).textContent || ('ep' + i);
          return {
            idx: i,
            guid: guid,
            titulo: titulo || 'Episodio',
            fecha: formatearFechaRSS(pub),
            pubISO: new Date(pub).getTime() || 0,
            durMs: durRSSaMs(durRaw),
            url: enc ? (enc.getAttribute('url') || '') : '',
            type: enc ? (enc.getAttribute('type') || '') : '',
            img: imgEl ? (imgEl.getAttribute('href') || p.logo) : (p.logo || 'icon.svg')
          };
        }).filter(ep => ep.url);
        try { localStorage.setItem('teleaudio_podfeed_' + p.id, JSON.stringify({ ts: Date.now(), epis: epis })); } catch (e) {}
        return epis;
      });
  }
  // Devuelve episodios del feed: caché fresca, caché vieja (deja refrescar en
  // segundo plano) o fetch directo. Promesa siempre.
  function podEpsDe(p, opts) {
    opts = opts || {};
    const fresca = podEpsCacheFresh(p);
    if (fresca) return Promise.resolve(fresca);
    const vieja = podEpsCache(p);
    if (vieja && !opts.force) {
      // Devolver la vieja ya (no bloquear) y refrescar en silencio
      fetchPodEps(p).catch(() => {});
      return Promise.resolve(vieja);
    }
    return fetchPodEps(p).catch(err => { throw err; });
  }
  // ---- Continuar escuchando: guardar posición de un episodio podcast ----
  function podClave(podId, ep) {
    return podId + '::' + (ep && ep.guid ? ep.guid : (ep && ep.idx !== undefined ? 'idx' + ep.idx : ''));
  }
  function podGuardarProgreso() {
    if (!currentItem || !currentItem._pod || !(currentItem.esVod)) return;
    if (isNative) {
      // El progreso nativo lo leemos con getEstado (polling del ticker)
      if (window.Capacitor && Capacitor.Plugins.BackgroundAudio) {
        Capacitor.Plugins.BackgroundAudio.getEstado().then(est => {
          const pos = Number(est.posMs) || 0; const dur = Number(est.durMs) || currentItem._durMs || 0;
          if (dur > 5000) podGuardarProgresoDe(currentItem, pos, dur);
        }).catch(() => {});
      }
      return;
    }
    try {
      const dur = audio.duration && isFinite(audio.duration) ? audio.duration * 1000 : (currentItem._durMs || 0);
      if (dur > 5000) podGuardarProgresoDe(currentItem, audio.currentTime * 1000, dur);
    } catch (e) {}
  }
  function podGuardarProgresoDe(item, posMs, durMs) {
    if (!item || !item._pod) return;
    const key = podClave(item._podId, { guid: item._guid, idx: item._epIdx });
    podProg[key] = { posMs: Math.max(0, posMs), durMs: durMs, ts: Date.now(), podId: item._podId, podName: item._pod, titulo: item.name, url: item.url, img: item.logo || 'icon.svg' };
    if (posMs <= 5000 || (durMs > 0 && posMs > durMs - 8000)) {
      // Casi al principio o casi terminado → no ofrecer "continuar"
      delete podProg[key];
    }
    podLsSet('teleaudio_pod_progreso', podProg);
  }
  function podProgresoDe(podId, ep) {
    const key = podClave(podId, ep);
    const v = podProg[key];
    if (v && v.durMs > 5000 && v.posMs > 5000 && v.posMs < v.durMs - 8000) return v;
    return null;
  }
  // ---- Favoritos de episodios ----
  function podEsFavEp(pod, ep) {
    const key = podClave(pod.id, ep);
    return favEps.some(f => f.key === key);
  }
  function podToggleFavEp(pod, ep) {
    const key = podClave(pod.id, ep);
    const i = favEps.findIndex(f => f.key === key);
    if (i !== -1) {
      favEps.splice(i, 1);
      showToast('Quitado de episodios favoritos');
    } else {
      favEps.push({
        key: key, podId: pod.id, podName: pod.name, titulo: ep.titulo,
        url: ep.url, img: ep.img || pod.logo || 'icon.svg',
        durMs: ep.durMs || 0, fecha: ep.fecha || ''
      });
      showToast('❤️ Episodio favorito');
    }
    podLsSet('teleaudio_fav_episodios', favEps);
    // Refrescar corazones visibles sin recargar
    grid.querySelectorAll('.ep-row[data-key="' + key + '"] .ep-fav').forEach(b => {
      const uso = b.querySelector('use');
      if (uso) uso.setAttribute('href', podEsFavEp(pod, ep) ? '#i-fav-filled' : '#i-fav');
      b.classList.toggle('faved', podEsFavEp(pod, ep));
    });
  }
  // ---- MediaSession específica de episodios de podcast (web) ----
  function setMediaSessionPod(pod, ep) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'playing';
      const artwork = [];
      if (pod && pod.logo) artwork.push({ src: pod.logo, sizes: '256x256' });
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.titulo || pod.name,
        artist: pod.name || 'TeleAudio',
        album: 'TeleAudio · Podcast',
        artwork: artwork
      });
      navigator.mediaSession.setActionHandler('play', () => { if (currentItem && currentItem._pod) playItemPodcast(currentItem._podObj || pod, currentItem._ep || ep, currentItem); });
      navigator.mediaSession.setActionHandler('pause', pausePlayback);
      navigator.mediaSession.setActionHandler('previoustrack', () => podSaltar(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => podSaltar(+1));
    } catch (e) {}
  }
  // ---- Reproducción de un episodio con contexto de podcast (pod, ep) ----
  // Es el mismo reproductor único: si hay algo de TV/Radio sonando lo para.
  function playItemPodcast(pod, ep, itemRef, desdeMs) {
    if (!ep || !ep.url) { showToast('❌ Episodio sin audio disponible'); return; }
    errorBanner.style.display = 'none';
    if (bsPlaying || bsPaused) bsStop();
    stopStream();
    const idItem = 'pod:' + pod.id + ':' + (ep.guid || ep.idx);
    currentItem = {
      id: idItem,
      esVod: true,
      name: ep.titulo,
      logo: ep.img || pod.logo || 'icon.svg',
      url: ep.url,
      _durMs: ep.durMs || 0,
      _subtitulo: pod.name,
      _pod: pod.name,
      _podId: pod.id,
      _podObj: pod,
      _ep: ep,
      _guid: ep.guid || '',
      _epIdx: ep.idx !== undefined ? ep.idx : -1
    };
    if (itemRef && itemRef._restaurar) itemRef._restaurar = false;
    // Memoria de lo reproducido (evitar repetir el mismo en 24/7)
    podPlayed = podPlayed.filter(x => x !== idItem);
    podPlayed.unshift(idItem);
    if (podPlayed.length > 30) podPlayed = podPlayed.slice(0, 30);
    try { localStorage.setItem('teleaudio_pod_played', JSON.stringify(podPlayed)); } catch (e) {}
    if (isNative) {
      try {
        Capacitor.Plugins.BackgroundAudio.play({
          url: ep.url, title: ep.titulo, subtitle: pod.name
        });
        isPlaying = true;
        updateUI();
        if (desdeMs > 5000 && Capacitor.Plugins.BackgroundAudio.seekTo) {
          setTimeout(() => { try { Capacitor.Plugins.BackgroundAudio.seekTo({ posMs: Math.floor(desdeMs) }); } catch (e2) {} }, 900);
        }
        if (currentTab === 'podcast') renderChannels();
        showToast('▶ ' + ep.titulo);
      } catch (e) { showError(); }
      return;
    }
    audio.src = ep.url;
    if (podRate && podRate !== 1) { try { audio.playbackRate = podRate; } catch (e) {} }
    if (desdeMs > 5000) { audio.currentTime = desdeMs / 1000; }
    audio.play()
      .then(() => { isPlaying = true; updateUI(); setMediaSessionPod(pod, ep); })
      .catch(() => { audio.play().catch(showError); });
    updateUI();
    if (currentTab === 'podcast') renderChannels();
    showToast('▶ ' + ep.titulo);
  }
  // ---- Saltar en la cola (anterior/siguiente) ----
  function podSaltar(dir) {
    if (!podQueue.length || podQueueIdx === -1) return;
    const n = podQueue.length;
    let i = podQueueIdx + dir;
    if (i < 0) i = 0;
    if (i >= n) i = n - 1;
    if (i === podQueueIdx) return;
    podQueueIdx = i;
    podReintentos = 0;
    pod247LanzarItem(podQueue[i]);
  }
  // ---- Fin de episodio: siguiente de la cola (autoplay real) ----
  function podAlTerminar() {
    if (!podQueue.length) return;
    if (currentItem && !currentItem.esVod) return;
    // Cola creada "para después" (algo sonaba suelto): arrancar el primero
    if (podQueueIdx === -1) {
      podQueueIdx = 0;
      podReintentos = 0;
      pod247LanzarItem(podQueue[0]);
      return;
    }
    const siguiente = podQueueIdx + 1;
    if (siguiente >= podQueue.length) {
      if (pod247Mode) {
        // Modo continuo: se rellena de nuevo con variedad
        podQueue = podConstruirCola247(pod247CatsActuales());
        podQueueIdx = 0;
        if (podQueue.length) { podReintentos = 0; pod247LanzarItem(podQueue[0]); }
        else showToast('🎉 Fin de la selección');
      } else {
        showToast('🎉 Fin de la cola');
        podQueue = [];
        podQueueIdx = -1;
        pod247Mode = false;
        updateUI();
        if (currentTab === 'podcast') renderChannels();
      }
      return;
    }
    podReintentos = 0;
    podQueueIdx = siguiente;
    pod247LanzarItem(podQueue[siguiente]);
  }
  // Escucha el fin natural del <audio> web (los streams en directo no suelen
  // terminar; los episodios sí). Solo actúa si hay cola activa.
  function podInstalarOnEnded() {
    if (audio.__podEndedInstalado) return;
    audio.__podEndedInstalado = true;
    audio.addEventListener('ended', () => {
      if (!podQueue.length) return;
      if (currentItem && currentItem.esVod) podAlTerminar();
    });
    // Guardar progreso periódico (web) mientras suena un episodio de podcast
    audio.addEventListener('timeupdate', () => {
      if (!currentItem || !currentItem.esVod || !currentItem._pod) return;
      if (Math.floor(audio.currentTime * 2) % 6 === 0) podGuardarProgreso();
    });
  }
  // En Android el audio lo toca el plugin (no hay evento 'ended' en la web).
  // Polling ligero SOLO con cola activa: si el servicio llegó al final del
  // episodio (pos≈dur y ya no suena), lanzamos el siguiente.
  function podPollingNativo() {
    if (podQueueTimer) clearInterval(podQueueTimer);
    podQueueTimer = setInterval(() => {
      if (!podQueue.length || podQueueIdx === -1) { clearInterval(podQueueTimer); podQueueTimer = null; return; }
      if (!currentItem || !currentItem.esVod) return;
      if (!window.Capacitor || !Capacitor.Plugins.BackgroundAudio) return;
      Capacitor.Plugins.BackgroundAudio.getEstado().then(est => {
        const dur = Number(est.durMs) || currentItem._durMs || 0;
        const pos = Number(est.posMs) || 0;
        const sonando = !!est.sonando;
        if (dur > 10000 && !sonando && pos > dur - 2500) {
          podAlTerminar();
        } else if (dur > 0 && !sonando && pos < 3000 && podReintentos < 2 && currentItem._pod) {
          // Posible error de arranque: reintentar una vez y luego saltar
          podReintentos++;
          if (podReintentos >= 2) { podReintentos = 0; podAlTerminar(); }
        }
      }).catch(() => {});
    }, 2500);
  }
  // Lanza un item de la cola (pod o ep) usando el reproductor único
  function pod247LanzarItem(item) {
    if (!item) return;
    updateUI();
    const prog = podProgresoDe(item.pod.id, item.ep);
    playItemPodcast(item.pod, item.ep, null, prog ? prog.posMs : 0);
    if (isNative) podPollingNativo();
    if (currentTab === 'podcast' && podFeed && podFeed.id === item.pod.id) pintarPodEpisodios();
  }
  // ================= CONSTRUCCIÓN DE COLAS 24/7 =================
  let pod247Cats = [];
  function pod247CatsActuales() { return pod247Cats; }
  // 'filtro' puede contener: ids de CATEGORÍA (p. ej. ['historia']) o ids de
  // PODCAST concretos (p. ej. ['serhistoria','nsn']). Se normaliza:
  function pod247FiltroAPool(filtro) {
    const todos = todosLosPodcasts().filter(p => esPodFeed(p));
    if (!filtro || !filtro.length) return todos;
    const catsValidas = PODCAST_CATS.filter(c => c.id !== '247').map(c => c.id);
    const sonCats = filtro.every(f => catsValidas.includes(f));
    if (sonCats) {
      // Si es UNA categoría con todo su contenido, ok; si mezcla, agrupa por cat
      return todos.filter(p => podCatsDe(p).some(c => filtro.includes(c)));
    }
    // Ids de podcast concretos
    return todos.filter(p => filtro.includes(p.id));
  }
  function podConstruirCola247(filtro) {
    const pool = pod247FiltroAPool(filtro);
    if (!pool.length) return [];
    const porPod = pool.map(p => ({ pod: p, epis: podEpsCache(p) }))
      .filter(e => e.epis && e.epis.length);
    if (!porPod.length) return [];
    porPod.forEach(entry => {
      let eps = entry.epis.slice();
      if (pod247Shuffle) {
        for (let i = eps.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [eps[i], eps[j]] = [eps[j], eps[i]];
        }
      } else {
        eps = eps.slice().sort((a, b) => (b.pubISO || 0) - (a.pubISO || 0));
      }
      const sinRepetir = eps.filter(e => podPlayed.indexOf('pod:' + entry.pod.id + ':' + (e.guid || e.idx)) === -1);
      entry.candidatos = (sinRepetir.length ? sinRepetir : eps).slice(0, 5);
    });
    const conEps = porPod.filter(e => e.candidatos && e.candidatos.length);
    if (!conEps.length) return [];
    let orden = conEps.slice();
    if (pod247Shuffle) {
      for (let i = orden.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orden[i], orden[j]] = [orden[j], orden[i]];
      }
    } else {
      orden = orden.sort((a, b) => (b.pod.priority || 1) - (a.pod.priority || 1));
    }
    const cola = [];
    const idxs = orden.map(() => 0);
    let rondas = 8;
    while (rondas-- > 0) {
      let movidos = false;
      for (let i = 0; i < orden.length; i++) {
        const entry = orden[i];
        if (idxs[i] < entry.candidatos.length) {
          cola.push({ pod: entry.pod, ep: entry.candidatos[idxs[i]++] });
          movidos = true;
        }
      }
      if (!movidos) break;
    }
    return cola.slice(0, 40);
  }
  // Arranca el 24/7 (filtro = [] todo, categorías o ids de podcast concretos)
  function pod247Start(filtro, estacionNombre) {
    pod247Cats = filtro || [];
    podQueue = podConstruirCola247(pod247Cats);
    if (!podQueue.length) {
      const todos = pod247FiltroAPool(pod247Cats);
      if (!todos.length) { showToast('❌ No hay podcasts con feed para esta selección'); return; }
      showToast('⏳ Cargando episodios…');
      Promise.all(todos.map(p => podEpsDe(p, { force: true }).catch(() => []))).then(() => {
        podQueue = podConstruirCola247(pod247Cats);
        if (!podQueue.length) { showToast('❌ No hay episodios disponibles'); return; }
        pod247Mode = true;
        podQueueIdx = 0;
        pod247LanzarItem(podQueue[0]);
        if (currentTab === 'podcast') { podVista = '247'; renderChannels(); }
      });
      return;
    }
    pod247Mode = true;
    podQueueIdx = 0;
    if (estacionNombre) showToast('🎙️ ' + estacionNombre);
    pod247LanzarItem(podQueue[0]);
    if (currentTab === 'podcast') { podVista = '247'; renderChannels(); }
  }
  function pod247Stop() {
    if (podQueueTimer) { clearInterval(podQueueTimer); podQueueTimer = null; }
    podQueue = [];
    podQueueIdx = -1;
    pod247Mode = false;
    stopPlayback();
    if (currentTab === 'podcast') renderChannels();
  }
  // Encolar un episodio concreto (menú ⋮ de una fila)
  function podAnadirACola(pod, ep) {
    if (podQueue.length && podQueueIdx >= 0) {
      podQueue.splice(podQueueIdx + 1, 0, { pod: pod, ep: ep });
      showToast('＋ Añadido a la cola (sonará después)');
    } else if (currentItem && currentItem._pod) {
      // Algo suelto sonando: la cola arrancará al terminar este episodio
      podQueue = [{ pod: pod, ep: ep }];
      podQueueIdx = -1;
      showToast('＋ Se reproducirá al terminar el episodio actual');
      pod247Mode = false;
    } else {
      podQueue = [{ pod: pod, ep: ep }];
      podQueueIdx = 0;
      pod247LanzarItem(podQueue[0]);
    }
  }
  // ================= MIS PODCASTS (CRUD localStorage) =================
  function misGuardar() {
    podLsSet('teleaudio_mis_podcasts', misPodcasts);
    if (currentTab === 'podcast') renderChannels();
  }
  function misNuevoId(nombre) {
    const base = 'mp_' + (nombre || 'pod').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24);
    let id = base; let n = 1;
    while (todosLosPodcasts().some(p => p.id === id)) { id = base + '_' + (n++); }
    return id;
  }
  function misEliminar(id) {
    misPodcasts = misPodcasts.filter(p => p.id !== id);
    misGuardar();
    showToast('🗑️ Podcast eliminado');
  }
  function misExportar() {
    if (!misPodcasts.length) { showToast('No tienes podcasts personalizados'); return; }
    const blob = new Blob([JSON.stringify(misPodcasts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'teleaudio-podcasts.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
    showToast('📤 Exportados ' + misPodcasts.length + ' podcasts');
  }
  function misImportarTexto(texto) {
    try {
      const arr = JSON.parse(texto);
      if (!Array.isArray(arr)) throw new Error('no es un array');
      let n = 0;
      arr.forEach(p => {
        if (!p || (!p.feed && !p.url)) return;
        const cat0 = podCatsDe(p)[0] || 'otros';
        const id = misNuevoId(p.name);
        misPodcasts.push({
          id: id,
          name: String(p.name || 'Podcast'),
          desc: String(p.desc || ''),
          cat: cat0,
          cats: Array.isArray(p.cats) && p.cats.length ? p.cats : [cat0],
          tipo: p.tipo || (p.feed ? 'rss' : 'stream'),
          logo: p.logo || 'icon.svg',
          feed: p.feed || undefined,
          url: p.url || undefined,
          meta: p.meta || null,
          priority: 1
        });
        n++;
      });
      misGuardar();
      showToast('📥 Importados ' + n + ' podcasts');
      return true;
    } catch (e) {
      showToast('❌ JSON no válido');
      return false;
    }
  }
  function probarFuentePod(p) {
    return new Promise((resolve) => {
      if (esPodFeed(p)) {
        const t0 = Date.now();
        fetchPodEps(p)
          .then(epis => {
            const meta = { ok: true, ms: Date.now() - t0, episodios: epis.length, tipoAudio: (epis[0] && (epis[0].type || 'audio')) || 'audio' };
            p.meta = meta;
            resolve(meta);
          })
          .catch(err => resolve({ ok: false, ms: Date.now() - t0, error: err && err.message ? err.message : 'Error de red' }));
        return;
      }
      const url = p.url || '';
      const t0 = Date.now();
      fetch(url, { headers: { 'Range': 'bytes=0-1' } })
        .then(r => {
          const tipo = (r.headers.get('content-type') || '').toLowerCase();
          resolve({ ok: r.ok || r.status === 206, ms: Date.now() - t0, tipo: tipo || 'audio', status: r.status });
        })
        .catch(() => {
          const probe = new Audio();
          const fin = (ok, info) => {
            probe.removeAttribute('src'); probe.load();
            resolve({ ok: ok, ms: Date.now() - t0, info: info, probadoConAudio: true });
          };
          const t = setTimeout(() => fin(false, 'timeout'), 9000);
          probe.addEventListener('error', () => { clearTimeout(t); fin(false, 'error'); });
          probe.addEventListener('canplay', () => { clearTimeout(t); fin(true, 'canplay'); });
          probe.src = url;
          probe.preload = 'metadata';
          probe.load();
        });
    });
  }

  // ================= UI PODCAST PRO (pestaña Podcast rediseñada) =================
  // Estructura de la pestaña (spec 62-63): cabecera + chips de sub-vista
  // [Todos] [24/7] [Mis podcasts] [Favoritos] y debajo las secciones según la
  // vista elegida. Todo se pinta dentro de #channel-grid (igual que el resto).
  function renderPodcastPro() {
    grid.innerHTML = '';
    // Vista de episodios de un feed abierto (p. ej. Nadie Sabe Nada)
    if (podFeed) { pintarPodEpisodios(); return; }

    const query = (search.value || '').trim();
    const hasQuery = query.length > 0;

    // ---- Cabecera + chips de sub-vista ----
    if (!hasQuery) {
      // Cabecera general solo en la vista principal; las sub-vistas (24/7,
      // Mis podcasts, Favoritos) tienen la suya propia más abajo.
      const esInicio = podVista === 'inicio' || podVista.indexOf('cat:') === 0;
      if (esInicio) {
        const head = document.createElement('div');
        head.className = 'pod-head';
        const titulo = document.createElement('div');
        titulo.className = 'pod-head-titulo';
        titulo.textContent = '🎧 PODCAST';
        const sub = document.createElement('div');
        sub.className = 'pod-head-sub';
        sub.textContent = 'Escucha podcasts, programas y contenido hablado.';
        head.appendChild(titulo);
        head.appendChild(sub);
        grid.appendChild(head);
      }
      const chips = document.createElement('div');
      chips.className = 'pod-chips';
      const vistas = [
        { id: 'inicio', label: '🏠 Todos' },
        { id: '247', label: '📻 24/7' },
        { id: 'mis', label: '⭐ Mis podcasts' },
        { id: 'favs', label: '❤️ Favoritos' }
      ];
      vistas.forEach(v => {
        const b = document.createElement('button');
        b.className = 'chip-btn' + (podVista === v.id || (v.id === 'inicio' && podVista.indexOf('cat:') === 0) ? ' on' : '');
        b.textContent = v.label;
        b.setAttribute('aria-label', v.label);
        b.addEventListener('click', () => {
          podVista = v.id;
          search.value = '';
          renderChannels();
        });
        chips.appendChild(b);
      });
      grid.appendChild(chips);
    }

    // ---- Búsqueda activa: resultados agrupados ----
    if (hasQuery) {
      pintarResultadosPodcast(query);
      return;
    }

    if (podVista === 'mis') { pintarMisPodcasts(); return; }
    if (podVista === 'favs') { pintarFavsPodcast(); return; }
    if (podVista === '247') { pintar247(); return; }
    if (podVista.indexOf('cat:') === 0) { pintarCategoriaPodcast(podVista.slice(4)); return; }
    pintarInicioPodcast();
  }

  // Cabecera de sub-sección con "volver" (para cat: y detalles)
  function podChipVolver(texto, accion) {
    const top = document.createElement('div');
    top.className = 'ep-top';
    const back = document.createElement('button');
    back.className = 'back-chip';
    back.innerHTML = '<svg width="14" height="14" aria-hidden="true"><use href="#i-close"/></svg> ' + texto;
    back.addEventListener('click', accion);
    top.appendChild(back);
    return top;
  }

  // ---- Búsqueda: podcasts + episodios (caché) + mis podcasts ----
  function pintarResultadosPodcast(q) {
    const qq = q.toLowerCase();
    const grupos = { Podcasts: [], Episodios: [], 'Mis podcasts': [] };
    PODCASTS.forEach(p => {
      if ((p.name || '').toLowerCase().includes(qq) || (p.desc || '').toLowerCase().includes(qq)) grupos.Podcasts.push(p);
    });
    misPodcasts.forEach(p => {
      if ((p.name || '').toLowerCase().includes(qq) || (p.desc || '').toLowerCase().includes(qq)) grupos['Mis podcasts'].push(p);
    });
    // Episodios: buscar en la caché local de feeds (rápido, sin red)
    const feedsCache = [];
    todosLosPodcasts().forEach(p => {
      const eps = podEpsCache(p);
      if (eps) feedsCache.push({ pod: p, epis: eps });
    });
    const ya = {};
    feedsCache.forEach(fc => {
      fc.epis.forEach(ep => {
        if (ya[fc.pod.id + ':' + (ep.guid || ep.idx)]) return;
        if ((ep.titulo || '').toLowerCase().includes(qq) || (ep.fecha || '').includes(qq)) {
          ya[fc.pod.id + ':' + (ep.guid || ep.idx)] = true;
          grupos.Episodios.push({ pod: fc.pod, ep: ep });
          if (grupos.Episodios.length >= 30) return;
        }
      });
    });
    const total = grupos.Podcasts.length + grupos.Episodios.length + grupos['Mis podcasts'].length;
    if (!total) {
      grid.appendChild(emptyState('<svg width="24" height="24" aria-hidden="true"><use href="#i-search"/></svg>',
        'Sin resultados', 'No encontramos nada para \u201c' + q + '\u201d en podcasts.'));
      return;
    }
    grid.appendChild(sectionHead('Resultados en Podcast \u00b7 ' + total));
    if (grupos.Podcasts.length) {
      const h = document.createElement('div');
      h.className = 'section-header cat-muted';
      h.textContent = '🎙️ Podcasts (' + grupos.Podcasts.length + ')';
      grid.appendChild(h);
      grupos.Podcasts.forEach(p => renderCard(p));
    }
    if (grupos.Episodios.length) {
      const h = document.createElement('div');
      h.className = 'section-header cat-muted';
      h.textContent = '🎧 Episodios (' + grupos.Episodios.length + ')';
      grid.appendChild(h);
      grupos.Episodios.forEach(par => grid.appendChild(filaEpisodioPodPro(par.pod, par.ep)));
    }
    if (grupos['Mis podcasts'].length) {
      const h = document.createElement('div');
      h.className = 'section-header cat-muted';
      h.textContent = '⭐ Mis podcasts (' + grupos['Mis podcasts'].length + ')';
      grid.appendChild(h);
      grupos['Mis podcasts'].forEach(p => grid.appendChild(tarjetaMisPodcast(p)));
    }
  }

  // ================= VISTA INICIO (Todos) =================
  function pintarInicioPodcast() {
    // ---- Hero 24/7 (si hay algún feed de episodios) ----
    const conFeed = todosLosPodcasts().some(p => esPodFeed(p));
    if (conFeed) {
      const hero = document.createElement('div');
      hero.className = 'pod-247-hero';
      hero.setAttribute('role', 'button');
      hero.setAttribute('tabindex', '0');
      const lab = document.createElement('div');
      lab.className = 'pod-247-lab';
      lab.textContent = '🎙️ PODCAST 24/7';
      const txt = document.createElement('div');
      txt.className = 'pod-247-txt';
      txt.textContent = 'Escucha una selección continua de podcasts sin elegir cada episodio.';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary pod-247-btn';
      btn.textContent = '▶ ESCUCHAR AHORA';
      btn.setAttribute('aria-label', 'Escuchar Podcast 24/7');
      const click = (e) => { if (e) e.stopPropagation(); pod247Start([], 'Podcast 24/7'); };
      btn.addEventListener('click', click);
      hero.appendChild(lab);
      hero.appendChild(txt);
      hero.appendChild(btn);
      hero.addEventListener('click', click);
      grid.appendChild(hero);
    }

    // ---- Continuar escuchando (progresos guardados) ----
    const progList = Object.keys(podProg)
      .map(k => ({ k: k, v: podProg[k] }))
      .filter(x => x.v && x.v.url)
      .sort((a, b) => (b.v.ts || 0) - (a.v.ts || 0))
      .slice(0, 6);
    if (progList.length) {
      grid.appendChild(sectionHead('▶ Continuar escuchando'));
      progList.forEach(x => {
        const pod = podPorId(x.v.podId);
        const fila = document.createElement('div');
        fila.className = 'ep-row';
        fila.setAttribute('role', 'button');
        const img = document.createElement('img');
        img.className = 'ep-thumb';
        img.src = x.v.img || 'icon.svg';
        img.alt = '';
        img.onerror = () => { img.src = 'icon.svg'; };
        const info = document.createElement('div');
        info.className = 'ep-info';
        const t = document.createElement('div');
        t.className = 'ep-titulo';
        t.textContent = x.v.titulo;
        const m = document.createElement('div');
        m.className = 'ep-meta';
        const dur = (x.v.durMs || 0) / 1000;
        const pos = (x.v.posMs || 0) / 1000;
        m.textContent = (x.v.podName || 'Podcast') + ' · ⏵ ' + fmtSeg(Math.floor(pos)) + ' / ' + fmtSeg(Math.floor(dur));
        info.appendChild(t);
        info.appendChild(m);
        const play = document.createElement('div');
        play.className = 'ep-play';
        play.innerHTML = '<svg width="16" height="16" aria-hidden="true"><use href="#i-play"/></svg>';
        fila.appendChild(img);
        fila.appendChild(info);
        fila.appendChild(play);
        fila.addEventListener('click', () => {
          const pod2 = pod || (x.v.url ? { id: x.v.podId, name: x.v.podName, logo: x.v.img } : null);
          if (!pod2) { showToast('Ese podcast ya no existe'); return; }
          const ep = { titulo: x.v.titulo, url: x.v.url, img: x.v.img, durMs: x.v.durMs, guid: 'resume', idx: -1 };
          playItemPodcast(pod2, ep, null, x.v.posMs);
        });
        grid.appendChild(fila);
      });
    }

    // ---- Destacados (priority >= 2) ----
    const destacados = PODCASTS.filter(p => (p.priority || 1) >= 2 && esPodFeed(p));
    const misDestacados = misPodcasts.filter(p => (p.priority || 1) >= 2);
    if (destacados.length || misDestacados.length) {
      grid.appendChild(sectionHead('🔥 Podcasts destacados'));
      const c = carrusel();
      destacados.forEach(p => renderCard(p, c));
      misDestacados.forEach(p => renderCard(p, c));
      grid.appendChild(c);
    }

    // ---- Últimos episodios (desde la caché de feeds, sin bloquear) ----
    const ultimos = [];
    todosLosPodcasts().forEach(p => {
      const eps = podEpsCache(p);
      if (!eps) return;
      eps.slice(0, 1).forEach(ep => {
        if (!ep.pubISO) {
          const fp = (ep.fecha || '').split('-');
          ep.pubISO = fp.length === 3 ? new Date(fp[2], fp[1] - 1, fp[0]).getTime() : 0;
        }
        ultimos.push({ pod: p, ep: ep });
      });
    });
    ultimos.sort((a, b) => (b.ep.pubISO || 0) - (a.ep.pubISO || 0));
    const recientes = ultimos.slice(0, 8);
    if (recientes.length) {
      grid.appendChild(sectionHead('🆕 Últimos episodios'));
      recientes.forEach(par => grid.appendChild(filaEpisodioPodPro(par.pod, par.ep)));
    } else {
      const hint = document.createElement('div');
      hint.className = 'recents-hint';
      hint.textContent = '🆕 Aquí aparecerán los últimos episodios cuando abras un podcast (se guardan en caché).';
      grid.appendChild(hint);
    }

    // ---- Categorías con contenido ----
    const catsConContenido = PODCAST_CATS.filter(cat => {
      return todosLosPodcasts().some(p => podCatsDe(p).indexOf(cat.id) !== -1);
    });
    if (catsConContenido.length) {
      grid.appendChild(sectionHead('📚 Categorías'));
      const catsWrap = document.createElement('div');
      catsWrap.className = 'pod-cats';
      catsConContenido.forEach(cat => {
        const b = document.createElement('button');
        b.className = 'pod-cat-chip';
        const cuantos = todosLosPodcasts().filter(p => podCatsDe(p).indexOf(cat.id) !== -1).length;
        b.innerHTML = '<span class="pod-cat-ico">' + cat.icon + '</span><span>' + cat.label + '</span><span class="pod-cat-n">' + cuantos + '</span>';
        b.setAttribute('aria-label', cat.label);
        b.addEventListener('click', () => { podVista = 'cat:' + cat.id; renderChannels(); });
        catsWrap.appendChild(b);
      });
      grid.appendChild(catsWrap);
    }

    // ---- Todos los podcasts por categoría (grid) ----
    const conAlgo = PODCAST_CATS.filter(cat => PODCASTS.some(p => podCatsDe(p).indexOf(cat.id) !== -1));
    conAlgo.forEach(cat => {
      const items = PODCASTS.filter(p => podCatsDe(p).indexOf(cat.id) !== -1);
      const etiqueta = cat.icon + ' ' + cat.label;
      grid.appendChild(sectionHead(etiqueta));
      items.forEach(p => renderCard(p));
    });

    // ---- Mis podcasts (mini-lista) + botón añadir ----
    grid.appendChild(sectionHead('⭐ Mis podcasts'));
    if (!misPodcasts.length) {
      const invite = document.createElement('div');
      invite.className = 'pod-invite';
      const t = document.createElement('div');
      t.textContent = '¿Tienes un podcast o una emisora propia?';
      const s = document.createElement('div');
      s.textContent = 'Añádela a TeleAudio mediante un feed RSS o una URL de audio.';
      const b = document.createElement('button');
      b.className = 'btn btn-primary';
      b.textContent = '＋ AÑADIR MI PODCAST';
      b.setAttribute('aria-label', 'Añadir mi podcast');
      b.addEventListener('click', () => abrirModalPodcast());
      invite.appendChild(t);
      invite.appendChild(s);
      invite.appendChild(b);
      grid.appendChild(invite);
    } else {
      misPodcasts.forEach(p => grid.appendChild(tarjetaMisPodcast(p)));
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-primary pod-add-btn';
      addBtn.textContent = '＋ AÑADIR PODCAST';
      addBtn.addEventListener('click', () => abrirModalPodcast());
      grid.appendChild(addBtn);
    }
  }

  // ================= VISTA 24/7 =================
  function pintar247() {
    // Hero grande con el estado actual si está sonando
    const enMarcha = pod247Mode && podQueue.length > 0 && podQueueIdx >= 0 && currentItem;
    if (enMarcha) {
      const ahora = document.createElement('div');
      ahora.className = 'pod-now';
      const lab = document.createElement('div');
      lab.className = 'pod-now-lab';
      lab.textContent = '🔴 AHORA SONANDO';
      const art = document.createElement('div');
      art.className = 'pod-now-art';
      const img = document.createElement('img');
      img.src = currentItem.logo || 'icon.svg';
      img.alt = '';
      img.onerror = () => { img.src = 'icon.svg'; };
      const meta = document.createElement('div');
      meta.className = 'pod-now-meta';
      const nm = document.createElement('div');
      nm.className = 'pod-now-name';
      nm.textContent = currentItem._pod || '';
      const tt = document.createElement('div');
      tt.className = 'pod-now-titulo';
      tt.textContent = currentItem.name;
      meta.appendChild(nm);
      meta.appendChild(tt);
      art.appendChild(img);
      art.appendChild(meta);
      ahora.appendChild(lab);
      ahora.appendChild(art);
      // Siguiente
      const sig = podQueue[podQueueIdx + 1];
      if (sig) {
        const nxt = document.createElement('div');
        nxt.className = 'pod-now-next';
        nxt.textContent = 'Siguiente: ' + sig.ep.titulo + ' (' + sig.pod.name + ')';
        ahora.appendChild(nxt);
      }
      const ctrls = document.createElement('div');
      ctrls.className = 'btn-row';
      const pausa = document.createElement('button');
      pausa.className = 'btn';
      pausa.textContent = isPlaying ? '⏸ Pausar' : '▶ Reanudar';
      pausa.addEventListener('click', () => powerBtn.click());
      const saltar = document.createElement('button');
      saltar.className = 'btn';
      saltar.textContent = '⏭ Saltar';
      saltar.addEventListener('click', () => podSaltar(+1));
      const detener = document.createElement('button');
      detener.className = 'btn btn-danger';
      detener.textContent = '⏹ Detener 24/7';
      detener.addEventListener('click', () => { pod247Stop(); });
      ctrls.appendChild(pausa);
      ctrls.appendChild(saltar);
      ctrls.appendChild(detener);
      ahora.appendChild(ctrls);
      grid.appendChild(ahora);
    }

    // Tarjeta principal: escuchar todo
    const hero = document.createElement('div');
    hero.className = 'pod-247-hero';
    const lab = document.createElement('div');
    lab.className = 'pod-247-lab';
    lab.textContent = '📻 PODCAST 24/7';
    const txt = document.createElement('div');
    txt.className = 'pod-247-txt';
    txt.textContent = 'Selección variada de todos tus podcasts: sin elegir episodio, en cadena.';
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary pod-247-btn';
    btn.textContent = '▶ ESCUCHAR 24/7';
    const lanzar = (e) => { if (e) e.stopPropagation(); pod247Start([], 'Podcast 24/7'); };
    btn.addEventListener('click', lanzar);
    hero.appendChild(lab);
    hero.appendChild(txt);
    hero.appendChild(btn);
    hero.addEventListener('click', lanzar);
    grid.appendChild(hero);

    // Aleatorio on/off
    const shuffleRow = document.createElement('div');
    shuffleRow.className = 'btn-row';
    const sh = document.createElement('button');
    sh.className = 'btn' + (pod247Shuffle ? ' btn-primary' : '');
    sh.textContent = pod247Shuffle ? '🔀 Aleatorio: ON' : '🔀 Aleatorio: OFF';
    sh.addEventListener('click', () => {
      pod247Shuffle = !pod247Shuffle;
      localStorage.setItem('teleaudio_pod247_shuffle', pod247Shuffle ? '1' : '0');
      renderChannels();
    });
    shuffleRow.appendChild(sh);
    grid.appendChild(shuffleRow);

    // ---- Emisoras 24/7 temáticas (dinámicas por categoría con feeds) ----
    const catConFeed = PODCAST_CATS.filter(cat => {
      return todosLosPodcasts().some(p => esPodFeed(p) && podCatsDe(p).indexOf(cat.id) !== -1 && cat.id !== '247');
    });
    if (catConFeed.length) {
      grid.appendChild(sectionHead('📡 Emisoras 24/7'));
      const filaCats = document.createElement('div');
      filaCats.className = 'h-scroll';
      const cards = [];
      catConFeed.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'pod-station';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        const ico = document.createElement('div');
        ico.className = 'pod-station-ico';
        ico.textContent = cat.icon;
        const nm = document.createElement('div');
        nm.className = 'pod-station-name';
        nm.textContent = cat.label + ' 24/7';
        const dc = document.createElement('div');
        dc.className = 'pod-station-desc';
        const cuantos = todosLosPodcasts().filter(p => esPodFeed(p) && podCatsDe(p).indexOf(cat.id) !== -1).length;
        dc.textContent = cuantos + (cuantos === 1 ? ' podcast' : ' podcasts');
        const pb = document.createElement('div');
        pb.className = 'pod-station-play';
        pb.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-play"/></svg>';
        card.appendChild(ico);
        card.appendChild(nm);
        card.appendChild(dc);
        card.appendChild(pb);
        const lanzarCat = (e) => { if (e) e.stopPropagation(); pod247Start([cat.id], cat.label + ' 24/7'); };
        card.addEventListener('click', lanzarCat);
        filaCats.appendChild(card);
        cards.push(card);
      });
      grid.appendChild(filaCats);
    }

    // ---- Mis estaciones 24/7 ----
    if (misStations.length) {
      grid.appendChild(sectionHead('⭐ Mis 24/7'));
      misStations.forEach(st => {
        const card = document.createElement('div');
        card.className = 'pod-station wide';
        card.setAttribute('role', 'button');
        const ico = document.createElement('div');
        ico.className = 'pod-station-ico';
        ico.textContent = st.icon || '🎙️';
        const nm = document.createElement('div');
        nm.className = 'pod-station-name';
        nm.textContent = st.name;
        const dc = document.createElement('div');
        dc.className = 'pod-station-desc';
        dc.textContent = st.desc || '';
        const pb = document.createElement('div');
        pb.className = 'pod-station-play';
        pb.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-play"/></svg>';
        card.appendChild(ico);
        card.appendChild(nm);
        card.appendChild(dc);
        card.appendChild(pb);
        card.addEventListener('click', () => {
          pod247Start(st.podIds || [], st.name);
        });
        grid.appendChild(card);
      });
    }
    // Botón crear estación
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary pod-add-btn';
    addBtn.textContent = '＋ Crear mi estación 24/7';
    addBtn.addEventListener('click', abrirModalEstacion);
    grid.appendChild(addBtn);
  }

  // ---- Modal crear estación 24/7 (elegir podcasts) ----
  function abrirModalEstacion() {
    const candidatos = todosLosPodcasts().filter(p => esPodFeed(p));
    if (!candidatos.length) { showToast('Añade primero algún podcast con feed'); return; }
    const idModal = 'modal-estacion';
    const ya = document.getElementById(idModal);
    if (ya) ya.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = idModal;
    modal.style.display = 'flex';
    const content = document.createElement('div');
    content.className = 'modal-content';
    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = 'Crear estación 24/7';
    const close = document.createElement('button');
    close.className = 'modal-close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '✕';
    close.addEventListener('click', () => modal.remove());
    header.appendChild(h2);
    header.appendChild(close);
    content.appendChild(header);
    const body = document.createElement('div');
    body.className = 'modal-body';
    const lab = document.createElement('label');
    lab.textContent = 'Nombre de la estación';
    const nom = document.createElement('input');
    nom.className = 'comment-input';
    nom.placeholder = 'p. ej. Misterio de Manuel';
    const lab2 = document.createElement('label');
    lab2.textContent = 'Descripción (opcional)';
    const desc = document.createElement('input');
    desc.className = 'comment-input';
    desc.placeholder = 'p. ej. Mis podcasts favoritos en cadena';
    const lab3 = document.createElement('label');
    lab3.textContent = 'Icono (opcional)';
    const ico = document.createElement('input');
    ico.className = 'comment-input';
    ico.placeholder = '👻';
    const lab4 = document.createElement('label');
    lab4.textContent = 'Podcasts de la estación';
    body.appendChild(lab); body.appendChild(nom);
    body.appendChild(lab2); body.appendChild(desc);
    body.appendChild(lab3); body.appendChild(ico);
    body.appendChild(lab4);
    const elegidos = new Set();
    candidatos.forEach(p => {
      const fila = document.createElement('label');
      fila.className = 'pod-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      elegidos.add(p.id);
      cb.addEventListener('change', () => {
        if (cb.checked) elegidos.add(p.id); else elegidos.delete(p.id);
      });
      const img = document.createElement('img');
      img.src = p.logo || 'icon.svg';
      img.alt = '';
      img.onerror = () => { img.src = 'icon.svg'; };
      const nm = document.createElement('span');
      nm.textContent = p.name;
      fila.appendChild(cb);
      fila.appendChild(img);
      fila.appendChild(nm);
      body.appendChild(fila);
    });
    const err = document.createElement('div');
    err.className = 'comment-status';
    body.appendChild(err);
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const guardar = document.createElement('button');
    guardar.className = 'btn btn-primary';
    guardar.textContent = '💾 Guardar estación';
    guardar.addEventListener('click', () => {
      const name = nom.value.trim();
      if (!name) { err.textContent = 'Ponle nombre a la estación'; return; }
      if (!elegidos.size) { err.textContent = 'Elige al menos un podcast'; return; }
      const st = { id: 'ms_' + Date.now(), name: name, desc: desc.value.trim(), icon: ico.value.trim() || '🎙️', podIds: [...elegidos] };
      misStations.push(st);
      podLsSet('teleaudio_mis_stations', misStations);
      modal.remove();
      showToast('⭐ Estación creada: ' + name);
      renderChannels();
    });
    btnRow.appendChild(guardar);
    body.appendChild(btnRow);
    content.appendChild(body);
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  // ================= VISTA CATEGORÍA =================
  function pintarCategoriaPodcast(catId) {
    const meta = PODCAST_CATS.find(c => c.id === catId);
    grid.appendChild(podChipVolver('Volver', () => { podVista = 'inicio'; renderChannels(); }));
    const items = PODCASTS.filter(p => podCatsDe(p).indexOf(catId) !== -1);
    const mios = misPodcasts.filter(p => podCatsDe(p).indexOf(catId) !== -1);
    const titulo = meta ? meta.icon + ' ' + meta.label : catId;
    grid.appendChild(sectionHead(titulo + ' \u00b7 ' + (items.length + mios.length)));
    items.forEach(p => renderCard(p));
    mios.forEach(p => renderCard(p));
    if (!items.length && !mios.length) {
      grid.appendChild(emptyState('📦', 'Sin podcasts aquí', 'Esta categoría aún no tiene podcasts.'));
    }
  }

  // ================= VISTA MIS PODCASTS =================
  function pintarMisPodcasts() {
    const head = document.createElement('div');
    head.className = 'pod-head';
    const titulo = document.createElement('div');
    titulo.className = 'pod-head-titulo';
    titulo.textContent = '⭐ MIS PODCASTS';
    const sub = document.createElement('div');
    sub.className = 'pod-head-sub';
    sub.textContent = 'Tus podcasts y emisoras personalizadas.';
    head.appendChild(titulo);
    head.appendChild(sub);
    grid.appendChild(head);

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary pod-add-btn big';
    addBtn.textContent = '＋ AÑADIR PODCAST';
    addBtn.addEventListener('click', () => abrirModalPodcast());
    grid.appendChild(addBtn);

    if (!misPodcasts.length) {
      grid.appendChild(emptyState('🎙️', 'Todavía no hay podcasts',
        'Añade un feed RSS, un MP3/stream o una radio online y aparecerá aquí.'));
      return;
    }
    misPodcasts.forEach(p => grid.appendChild(tarjetaMisPodcast(p)));

    // Exportar / importar
    const exp = document.createElement('button');
    exp.className = 'btn';
    exp.textContent = '📤 Exportar mis podcasts';
    exp.addEventListener('click', misExportar);
    const imp = document.createElement('button');
    imp.className = 'btn';
    imp.textContent = '📥 Importar (JSON)';
    imp.addEventListener('click', () => {
      const val = prompt('Pega aquí el JSON exportado de otra instalación:', '');
      if (val === null) return;
      if (val.trim()) misImportarTexto(val.trim());
    });
    const row = document.createElement('div');
    row.className = 'btn-row';
    row.appendChild(exp);
    row.appendChild(imp);
    grid.appendChild(row);
  }

  // Tarjeta de un podcast personalizado con menú ⋮
  function tarjetaMisPodcast(p) {
    const card = document.createElement('div');
    card.className = 'channel-card' + (currentItem && currentItem.id === ('pod:' + p.id) ? ' active' : '');
    card.setAttribute('data-id', p.id);
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn';
    favBtn.setAttribute('aria-label', 'Favorito');
    favBtn.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-fav"/></svg>';
    // Los personalizados no usan el fav global de canales (no mezclar); se
    // guardan en la lista de "favoritos" de podcast si está marcado en favs.
    favBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); });
    const plate = document.createElement('div');
    plate.className = 'logo-plate';
    const img = document.createElement('img');
    img.className = 'channel-logo';
    img.src = p.logo || 'icon.svg';
    img.alt = p.name;
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'icon.svg'; };
    plate.appendChild(img);
    const body = document.createElement('div');
    body.className = 'card-body';
    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = p.name;
    const type = document.createElement('div');
    type.className = 'card-type';
    const etiqueta = esPodFeed(p) ? '🎙️ Podcast · RSS' : (p.tipo === 'hls' ? '📡 HLS/Stream' : '🔊 Stream/MP3');
    type.textContent = etiqueta;
    body.appendChild(name);
    body.appendChild(type);
    const more = document.createElement('button');
    more.className = 'ep-more';
    more.textContent = '⋮';
    more.setAttribute('aria-label', 'Opciones de ' + p.name);
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      menuMisPodcast(p, more);
    });
    card.appendChild(favBtn);
    card.appendChild(plate);
    card.appendChild(body);
    card.appendChild(more);
    card.addEventListener('click', () => {
      if (esPodFeed(p)) { abrirPodcastFeed(p); return; }
      // Stream directo propio → suena como radio EN DIRECTO
      playItem({ id: p.id, name: p.name, logo: p.logo || 'icon.svg', url: p.url, _subtitulo: 'Stream propio', cat: 'personal' });
    });
    return card;
  }

  // Menú contextual (⋮) de un podcast personalizado
  function menuMisPodcast(p, anchorEl) {
    const ya = document.getElementById('pod-menu');
    if (ya) ya.remove();
    const menu = document.createElement('div');
    menu.className = 'pod-menu';
    menu.id = 'pod-menu';
    const items = [
      { t: '▶ Reproducir', a: () => { if (esPodFeed(p)) abrirPodcastFeed(p); else playItem(p); } },
      { t: '✏️ Editar', a: () => abrirModalPodcast(p) },
      { t: '🧪 Probar conexión', a: () => probarFuentePod(p).then(r => {
        if (r.ok) showToast('✅ ' + p.name + ' responde (' + (r.ms || 0) + ' ms' + (r.episodios !== undefined ? ', ' + r.episodios + ' episodios' : '') + ')');
        else showToast('❌ ' + p.name + ' no responde' + (r.error ? ': ' + r.error : ''));
        misGuardar();
      }) },
      { t: '🗑️ Eliminar', a: () => { if (confirm('¿Eliminar "' + p.name + '"?')) misEliminar(p.id); } }
    ];
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'pod-menu-item';
      b.textContent = it.t;
      b.addEventListener('click', () => { menu.remove(); it.a(); });
      menu.appendChild(b);
    });
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 180) + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 180)) + 'px';
    document.body.appendChild(menu);
    const cerrar = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', cerrar); } };
    setTimeout(() => document.addEventListener('click', cerrar), 50);
  }

  // ---- MODAL AÑADIR / EDITAR PODCAST PERSONALIZADO ----
  function abrirModalPodcast(editar) {
    const editando = !!editar;
    const p = editar || { tipo: 'rss', cat: 'otros', cats: ['otros'], logo: 'icon.svg' };
    const idModal = 'modal-mispod';
    const ya = document.getElementById(idModal);
    if (ya) ya.remove();
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = idModal;
    modal.style.display = 'flex';
    const content = document.createElement('div');
    content.className = 'modal-content';
    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = editando ? '✏️ Editar podcast' : 'AÑADIR PODCAST';
    const close = document.createElement('button');
    close.className = 'modal-close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '✕';
    close.addEventListener('click', () => modal.remove());
    header.appendChild(h2);
    header.appendChild(close);
    content.appendChild(header);
    const body = document.createElement('div');
    body.className = 'modal-body';

    // Tipo
    const labT = document.createElement('label');
    labT.textContent = 'Tipo de fuente';
    const selTipo = document.createElement('select');
    selTipo.className = 'comment-input';
    const optRss = document.createElement('option');
    optRss.value = 'rss'; optRss.textContent = '📡 Feed RSS (episodios)';
    const optStream = document.createElement('option');
    optStream.value = 'stream'; optStream.textContent = '🔊 Stream directo (MP3/AAC/HLS)';
    selTipo.appendChild(optRss);
    selTipo.appendChild(optStream);
    selTipo.value = p.tipo === 'stream' ? 'stream' : 'rss';
    body.appendChild(labT);
    body.appendChild(selTipo);

    // URL
    const labU = document.createElement('label');
    labU.textContent = 'URL del feed o del stream';
    const url = document.createElement('input');
    url.className = 'comment-input';
    url.placeholder = p.tipo === 'stream' ? 'https://servidor.com/radio.mp3' : 'https://ejemplo.com/podcast/feed.xml';
    url.value = p.feed || p.url || '';
    body.appendChild(labU);
    body.appendChild(url);

    // Comprobar
    const status = document.createElement('div');
    status.className = 'comment-status';
    const btnCheck = document.createElement('button');
    btnCheck.className = 'btn';
    btnCheck.textContent = '🔍 COMPROBAR FUENTE';
    btnCheck.addEventListener('click', () => {
      const u = url.value.trim();
      if (!u) { status.textContent = 'Escribe la URL primero'; return; }
      if (!/^https?:\/\//i.test(u)) { status.textContent = '⚠️ Solo se permiten URLs http(s).'; return; }
      status.textContent = '⏳ Comprobando…';
      const probe = { id: 'probe', name: 'Probe', logo: 'icon.svg' };
      if (selTipo.value === 'rss') {
        probe.feed = u;
        probarFuentePod(probe).then(r => {
          if (r.ok) {
            status.textContent = '✅ Fuente válida · ' + r.episodios + ' episodios · ' + (r.tipoAudio || 'audio') + ' (' + r.ms + ' ms)';
          } else {
            status.textContent = '⚠️ No se pudo leer el feed' + (r.error ? ': ' + r.error : '') + '. ¿Tiene CORS abierto o existe la URL?';
          }
        });
      } else {
        probe.url = u;
        probarFuentePod(probe).then(r => {
          if (r.ok) status.textContent = '✅ Conexión correcta (' + (r.tipo || (r.info || 'audio')) + ')';
          else status.textContent = '⚠️ Error de conexión. Si el stream suena en el navegador pero aquí falla, puede ser por CORS (prueba MP3 directo).';
        });
      }
    });
    body.appendChild(btnCheck);
    body.appendChild(status);

    // Nombre
    const labN = document.createElement('label');
    labN.textContent = 'Nombre';
    const nombre = document.createElement('input');
    nombre.className = 'comment-input';
    nombre.placeholder = 'p. ej. Radio de Manuel';
    nombre.value = p.name || '';
    body.appendChild(labN);
    body.appendChild(nombre);

    // Descripción
    const labD = document.createElement('label');
    labD.textContent = 'Descripción';
    const desc = document.createElement('input');
    desc.className = 'comment-input';
    desc.placeholder = '¿De qué va? (opcional)';
    desc.value = p.desc || '';
    body.appendChild(labD);
    body.appendChild(desc);

    // Logo
    const labL = document.createElement('label');
    labL.textContent = 'Imagen / logo (URL, opcional)';
    const logo = document.createElement('input');
    logo.className = 'comment-input';
    logo.placeholder = 'https://…/logo.png';
    logo.value = (p.logo && p.logo !== 'icon.svg' && String(p.logo).indexOf('http') === 0) ? p.logo : '';
    body.appendChild(labL);
    body.appendChild(logo);

    // Categoría
    const labC = document.createElement('label');
    labC.textContent = 'Categoría';
    const selCat = document.createElement('select');
    selCat.className = 'comment-input';
    PODCAST_CATS.filter(c => c.id !== '247').forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.icon + ' ' + c.label;
      selCat.appendChild(o);
    });
    selCat.value = p.cat && PODCAST_CATS.some(c => c.id === p.cat) ? p.cat : 'otros';
    body.appendChild(labC);
    body.appendChild(selCat);

    const err = document.createElement('div');
    err.className = 'comment-status';
    body.appendChild(err);
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';
    const guardar = document.createElement('button');
    guardar.className = 'btn btn-primary';
    guardar.textContent = editando ? '💾 Guardar cambios' : '＋ AÑADIR A TELEAUDIO';
    guardar.addEventListener('click', () => {
      const u = url.value.trim();
      const n = nombre.value.trim();
      if (!u) { err.textContent = 'Falta la URL'; return; }
      if (!/^https?:\/\//i.test(u)) { err.textContent = '⚠️ URL no válida. Solo http(s).'; return; }
      if (!n) { err.textContent = 'Ponle un nombre'; return; }
      const tipo = selTipo.value;
      const cat = selCat.value;
      const obj = {
        id: editando ? p.id : misNuevoId(n),
        name: n,
        desc: desc.value.trim(),
        cat: cat,
        cats: [cat],
        tipo: tipo,
        logo: logo.value.trim() || 'icon.svg',
        feed: tipo === 'rss' ? u : undefined,
        url: tipo === 'stream' ? u : undefined,
        meta: p.meta || null,
        priority: 1
      };
      if (editando) {
        const i = misPodcasts.findIndex(x => x.id === p.id);
        if (i !== -1) misPodcasts[i] = obj;
      } else {
        misPodcasts.push(obj);
      }
      misGuardar();
      modal.remove();
      showToast(editando ? '✏️ Podcast actualizado' : '＋ ' + n + ' añadido a Mis podcasts');
    });
    btnRow.appendChild(guardar);
    body.appendChild(btnRow);
    content.appendChild(body);
    modal.appendChild(content);
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    setTimeout(() => { try { nombre.focus(); } catch (e) {} }, 100);
  }

  // ================= VISTA FAVORITOS (podcast) =================
  function pintarFavsPodcast() {
    grid.appendChild(sectionHead('❤️ Favoritos de podcast'));
    // 1. Podcasts del catálogo marcados como favoritos (usuario)
    const podFavs = PODCASTS.filter(p => favs.has(p.id));
    const misFavs = misPodcasts.filter(p => favs.has(p.id));
    if (podFavs.length || misFavs.length) {
      const h = document.createElement('div');
      h.className = 'section-header cat-muted';
      h.textContent = '🎙️ Podcasts (' + (podFavs.length + misFavs.length) + ')';
      grid.appendChild(h);
      podFavs.forEach(p => renderCard(p));
      misFavs.forEach(p => tarjetaMisPodcast(p));
    }
    // 2. Episodios favoritos
    if (favEps.length) {
      const h = document.createElement('div');
      h.className = 'section-header cat-muted';
      h.textContent = '🎧 Episodios (' + favEps.length + ')';
      grid.appendChild(h);
      favEps.forEach(ep => {
        const pod = podPorId(ep.podId) || { id: ep.podId, name: ep.podName, logo: ep.img };
        grid.appendChild(filaEpisodioPodPro(pod, {
          idx: -1, guid: ep.key, titulo: ep.titulo, url: ep.url, img: ep.img,
          durMs: ep.durMs || 0, fecha: ep.fecha || ''
        }));
      });
    }
    // 3. Mis estaciones 24/7 favoritas → se ven en 24/7; aquí solo aviso
    if (!podFavs.length && !misFavs.length && !favEps.length) {
      grid.appendChild(emptyState('❤️', 'Sin favoritos de podcast',
        'Marca podcasts con el corazón o episodios con el botón ♡ de cada fila.'));
    }
  }

  // ---- Fila de episodio Pro (favorito ♡ + menú ⋮ + continuar) ----
  function filaEpisodioPodPro(pod, ep, extras) {
    extras = extras || {};
    const fila = document.createElement('div');
    fila.className = 'ep-row';
    const key = podClave(pod.id, ep);
    fila.setAttribute('data-key', key);
    const idItem = 'pod:' + pod.id + ':' + (ep.guid || ep.idx);
    const reproduciendo = currentItem && currentItem.id === idItem;
    if (reproduciendo) fila.classList.add('ep-activo');
    const img = document.createElement('img');
    img.className = 'ep-thumb';
    img.src = ep.img || pod.logo || 'icon.svg';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.src = pod.logo || 'icon.svg'; };
    const info = document.createElement('div');
    info.className = 'ep-info';
    const t = document.createElement('div');
    t.className = 'ep-titulo';
    t.textContent = ep.titulo;
    const m = document.createElement('div');
    m.className = 'ep-meta';
    const fp = (ep.fecha || '').split('-');
    const fecha = fp.length === 3 ? fp[0] + '/' + fp[1] + '/' + fp[2] : '';
    const dur = ep.durMs > 0 ? ' · ' + fmtSeg(Math.floor(ep.durMs / 1000)) : '';
    // Continuar si hay progreso guardado
    const prog = podProgresoDe(pod.id, ep);
    let metaTxt = (fecha || 'fecha desconocida') + dur;
    if (prog) {
      metaTxt = '⏵ Continuar · ' + fmtSeg(Math.floor(prog.posMs / 1000)) + ' / ' + fmtSeg(Math.floor(prog.durMs / 1000));
    }
    m.textContent = metaTxt;
    info.appendChild(t);
    info.appendChild(m);
    fila.appendChild(img);
    fila.appendChild(info);
    // Favorito de episodio (si no se desactiva)
    if (extras.fav !== false) {
      const esFav = podEsFavEp(pod, ep);
      const fav = document.createElement('button');
      fav.className = 'ep-fav' + (esFav ? ' faved' : '');
      fav.setAttribute('aria-label', esFav ? 'Quitar de favoritos' : 'Guardar episodio');
      fav.innerHTML = '<svg width="17" height="17" aria-hidden="true"><use href="#' + (esFav ? 'i-fav-filled' : 'i-fav') + '"/></svg>';
      fav.addEventListener('click', (e) => { e.stopPropagation(); podToggleFavEp(pod, ep); });
      fila.appendChild(fav);
    }
    // Menú ⋮ (cola / compartir)
    if (extras.menu !== false) {
      const mas = document.createElement('button');
      mas.className = 'ep-more';
      mas.textContent = '⋮';
      mas.setAttribute('aria-label', 'Más opciones del episodio');
      mas.addEventListener('click', (e) => {
        e.stopPropagation();
        menuEpisodioPod(pod, ep, mas);
      });
      fila.appendChild(mas);
    }
    const play = document.createElement('div');
    play.className = 'ep-play';
    play.innerHTML = reproduciendo && isPlaying
      ? '<svg width="16" height="16" aria-hidden="true"><use href="#i-pause"/></svg>'
      : '<svg width="16" height="16" aria-hidden="true"><use href="#i-play"/></svg>';
    fila.appendChild(play);
    fila.addEventListener('click', () => {
      if (reproduciendo && isPlaying) { pausePlayback(); return; }
      const prog2 = podProgresoDe(pod.id, ep);
      playItemPodcast(pod, ep, null, prog2 ? prog2.posMs : 0);
    });
    return fila;
  }
  // Menú de un episodio: añadir a la cola / reproducir / compartir
  function menuEpisodioPod(pod, ep, anchorEl) {
    const ya = document.getElementById('pod-menu-ep');
    if (ya) ya.remove();
    const menu = document.createElement('div');
    menu.className = 'pod-menu';
    menu.id = 'pod-menu-ep';
    const items = [
      { t: '▶ Reproducir', a: () => playItemPodcast(pod, ep) },
      { t: '＋ Añadir a la cola', a: () => podAnadirACola(pod, ep) },
      { t: '🔀 Poner en un 24/7', a: () => pod247Start(podCatsDe(pod), pod.name + ' 24/7') },
      { t: '📤 Compartir episodio', a: () => {
        const txt = '🎧 ' + ep.titulo + ' — ' + pod.name + ' (TeleAudio)';
        if (navigator.share) {
          navigator.share({ title: ep.titulo, text: txt, url: ep.url }).catch(() => {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt + ' ' + ep.url).then(() => showToast('📋 Copiado al portapapeles')).catch(() => showToast('📤 ' + txt));
        } else {
          prompt('Comparte este episodio (copia el texto):', txt + ' ' + ep.url);
        }
      } },
      { t: '↺ Recargar feed', a: () => {
        if (esPodFeed(pod)) {
          try { localStorage.removeItem('teleaudio_podfeed_' + pod.id); } catch (e2) {}
          if (podFeed && podFeed.id === pod.id) abrirPodcastFeed(pod);
          else showToast('↺ Feed recargado en la caché');
        }
      } }
    ];
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'pod-menu-item';
      b.textContent = it.t;
      b.addEventListener('click', () => { menu.remove(); it.a(); });
      menu.appendChild(b);
    });
    const rect = anchorEl.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = Math.min(rect.bottom + 4, window.innerHeight - 200) + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 190)) + 'px';
    document.body.appendChild(menu);
    const cerrar = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', cerrar); } };
    setTimeout(() => document.addEventListener('click', cerrar), 50);
  }

  // ---------- Audioprogramas TV (F6, v4.4.5+): pestaña propia ----------
  // Portada genérica de un programa en la API de RTVE (por uid)
  function imgProgRTVE(uid) {
    return 'https://img.rtve.es/p/' + uid + '?imgProgApi=imgPortada&w=400';
  }
  function renderAudioProgramas() {
    grid.innerHTML = '';

    // Un programa abierto → vista de sus episodios
    if (rtveProg) {
      pintarEpisodios();
      return;
    }

    const q = (search.value || '').trim().toLowerCase();

    // Búsqueda activa → resultados planos de TODO (elegidos + La 2)
    if (q) {
      const res = [...RTVE_PROGRAMAS, ...RTVE_PROGRAMAS_LA2]
        .filter(p => (p.nombre || '').toLowerCase().includes(q))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      if (!res.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Sin resultados para “' + q + '”</div>';
        return;
      }
      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = '🔍 Resultados (' + res.length + ')';
      grid.appendChild(header);
      res.forEach(p => tarjetaProgramaRTVE(p));
      return;
    }

    const intro = document.createElement('div');
    intro.className = 'ep-sub';
    intro.textContent = 'Programas de TV de RTVE en audio · toca uno para ver sus episodios · usa el buscador para encontrar rápido';
    grid.appendChild(intro);

    // ⭐ Tus programas (elegidos)
    const h1 = document.createElement('div');
    h1.className = 'section-header';
    h1.textContent = '⭐ Tus programas';
    grid.appendChild(h1);
    RTVE_PROGRAMAS.forEach(p => tarjetaProgramaRTVE(p));

    // ❤️ Programas que el usuario marcó como favoritos (los que no estén ya arriba)
    const misFavs = programasFavoritos().filter(f => !RTVE_PROGRAMAS.some(p => p.uid === f.uid));
    if (misFavs.length) {
      const hf = document.createElement('div');
      hf.className = 'section-header';
      hf.textContent = '❤️ Tus favoritos';
      grid.appendChild(hf);
      misFavs.forEach(p => tarjetaProgramaRTVE(p));
    }

    // 🎬 La 2 completa, agrupada por tipo
    const h2 = document.createElement('div');
    h2.className = 'section-header';
    h2.textContent = '🎬 La 2 · todos los programas (' + RTVE_PROGRAMAS_LA2.length + ')';
    grid.appendChild(h2);
    const seen = {};
    RTVE_PROGRAMAS_LA2.forEach(p => {
      const cat = p.cat || 'Otros';
      if (!seen[cat]) seen[cat] = [];
      seen[cat].push(p);
    });
    Object.keys(seen).sort((a, b) => a.localeCompare(b, 'es')).forEach(cat => {
      const hc = document.createElement('div');
      hc.className = 'section-header cat-muted';
      hc.textContent = cat + ' (' + seen[cat].length + ')';
      grid.appendChild(hc);
      seen[cat].forEach(p => tarjetaProgramaRTVE(p));
    });
  }

  // Tarjeta de un programa (elegido o del catálogo de La 2)
  function tarjetaProgramaRTVE(p) {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.style.cursor = 'pointer';
    const plate = document.createElement('div');
    plate.className = 'logo-plate';
    const img = document.createElement('img');
    img.className = 'channel-logo';
    img.src = p.img || imgProgRTVE(p.uid);
    img.alt = p.nombre;
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'icon.svg'; };
    plate.appendChild(img);
    const body = document.createElement('div');
    body.className = 'card-body';
    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = p.nombre;
    const tipo = document.createElement('div');
    tipo.className = 'card-type';
    tipo.textContent = 'Audioprograma · ' + (p.canal || 'RTVE');
    body.appendChild(name);
    body.appendChild(tipo);
    const favP = p.uid ? botonFavPrograma(p.uid) : null;
    if (favP) card.appendChild(favP);
    card.appendChild(plate);
    card.appendChild(body);
    card.addEventListener('click', () => abrirProgramaRTVE(p));
    grid.appendChild(card);
  }

  // Programas favoritos del usuario (para mostrarlos arriba en AudioprogramasTV)
  function programasFavoritos() {
    const catalogo = {};
    [...RTVE_PROGRAMAS, ...RTVE_PROGRAMAS_LA2].forEach(p => { catalogo[p.uid] = p; });
    return [...progFavs].map(uid => catalogo[uid]).filter(Boolean);
  }

  function abrirProgramaRTVE(p) {
    rtveProg = p;
    rtveEpis = [];
    rtveErr = '';
    rtveCargando = true;
    grid.innerHTML = '';
    pintarEpisodios();
    cargarEpisodiosRTVE(p.uid);
  }

  function volverProgramasRTVE() {
    rtveProg = null;
    rtveEpis = [];
    rtveErr = '';
    rtveCargando = false;
    renderChannels(); // repinta la pestaña actual (AudioprogramasTV)
  }

  function cargarEpisodiosRTVE(uid) {
    const url = 'https://www.rtve.es/api/programas/' + uid + '/videos.json?page=1&size=15';
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        const items = (d && d.page && d.page.items) || [];
        rtveEpis = items.map(it => ({
          id: String(it.id || ''),
          titulo: it.title || it.longTitle || 'Episodio',
          fecha: String(it.dateOfEmission || '').slice(0, 10), // dd-mm-yyyy
          durMs: Number(it.duration) || 0,
          img: it.thumbnail || '',
          enlace: it.htmlUrl || ''
        }));
        rtveCargando = false;
        pintarEpisodios();
      })
      .catch(err => {
        rtveCargando = false;
        rtveErr = err && err.message ? err.message : 'error';
        pintarEpisodios();
      });
  }

  function pintarEpisodios() {
    if (!rtveProg) return;
    grid.innerHTML = '';
    // Fila superior: volver + nombre del programa
    const top = document.createElement('div');
    top.className = 'ep-top';
    const back = document.createElement('button');
    back.className = 'back-chip';
    back.textContent = '← Programas';
    back.addEventListener('click', volverProgramasRTVE);
    const nom = document.createElement('span');
    nom.className = 'ep-prog-nombre';
    nom.textContent = '📺 ' + rtveProg.nombre;
    top.appendChild(back);
    top.appendChild(nom);
    grid.appendChild(top);

    if (rtveCargando) {
      // Skeleton discreto (shimmer) mientras llegan los episodios
      for (let i = 0; i < 5; i++) {
        const row = document.createElement('div');
        row.className = 'ep-row';
        row.style.border = 'none';
        row.style.background = 'transparent';
        row.style.cursor = 'default';
        const th = document.createElement('div');
        th.className = 'skeleton sk-thumb';
        const info = document.createElement('div');
        info.className = 'ep-info';
        const l1 = document.createElement('div');
        l1.className = 'skeleton sk-line w60';
        const l2 = document.createElement('div');
        l2.className = 'skeleton sk-line w30';
        info.appendChild(l1); info.appendChild(l2);
        row.appendChild(th); row.appendChild(info);
        grid.appendChild(row);
      }
      return;
    }
    if (rtveErr) {
      const sinConexion = typeof navigator !== 'undefined' && navigator.onLine === false;
      const box = document.createElement('div');
      box.className = 'conn-error';
      const ic = document.createElement('div');
      ic.className = 'ce-icon';
      ic.innerHTML = sinConexion
        ? '<svg width="26" height="26" aria-hidden="true"><use href="#i-wifi-off"/></svg>'
        : '<svg width="26" height="26" aria-hidden="true"><use href="#i-info"/></svg>';
      const t = document.createElement('strong');
      t.textContent = sinConexion ? 'Sin conexión' : 'No se pudieron cargar los episodios';
      const s = document.createElement('span');
      s.textContent = sinConexion
        ? 'Comprueba tu conexión a internet y vuelve a intentarlo.'
        : 'Algo falló al contactar con RTVE. Inténtalo de nuevo.';
      const retry = document.createElement('button');
      retry.className = 'btn btn-primary';
      retry.textContent = '↺ Reintentar';
      retry.addEventListener('click', () => {
        rtveCargando = true;
        rtveErr = '';
        pintarEpisodios();
        cargarEpisodiosRTVE(rtveProg.uid);
      });
      box.appendChild(ic); box.appendChild(t); box.appendChild(s); box.appendChild(retry);
      grid.appendChild(box);
      return;
    }
    if (!rtveEpis.length) {
      const av = document.createElement('div');
      av.className = 'comment-status';
      av.textContent = 'Este programa aún no tiene episodios disponibles.';
      grid.appendChild(av);
      return;
    }
    const sub = document.createElement('div');
    sub.className = 'ep-sub';
    sub.textContent = 'Últimos ' + rtveEpis.length + ' episodios · toca uno para escucharlo en audio';
    grid.appendChild(sub);
    rtveEpis.forEach(ep => grid.appendChild(filaEpisodio(ep)));
  }

  function filaEpisodio(ep) {
    const fila = document.createElement('div');
    fila.className = 'ep-row';
    if (currentItem && currentItem.id === 'rtve:' + ep.id) fila.classList.add('ep-activo');
    const img = document.createElement('img');
    img.className = 'ep-thumb';
    img.src = ep.img || 'icon.svg';
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.src = 'icon.svg'; };
    const info = document.createElement('div');
    info.className = 'ep-info';
    const t = document.createElement('div');
    t.className = 'ep-titulo';
    t.textContent = ep.titulo;
    const m = document.createElement('div');
    m.className = 'ep-meta';
    const fp = (ep.fecha || '').split('-'); // dd-mm-aaaa
    const fecha = fp.length === 3 ? fp[0] + '/' + fp[1] + '/' + fp[2] : '';
    const dur = ep.durMs > 0 ? ' · ' + fmtSeg(Math.floor(ep.durMs / 1000)) : '';
    m.textContent = (fecha || 'fecha desconocida') + dur;
    info.appendChild(t);
    info.appendChild(m);
    const play = document.createElement('div');
    play.className = 'ep-play';
    play.textContent = (currentItem && currentItem.id === 'rtve:' + ep.id && isPlaying) ? '🔊' : '▶';
    fila.appendChild(img);
    fila.appendChild(info);
    fila.appendChild(play);
    fila.addEventListener('click', () => reproducirEpisodioRTVE(ep));
    return fila;
  }

  function reproducirEpisodioRTVE(ep) {
    if (!isNative || !window.Capacitor || !Capacitor.Plugins || !Capacitor.Plugins.BackgroundAudio) {
      showToast('📲 Esto solo va en la app de Android');
      if (ep.enlace) { try { window.open(ep.enlace, '_blank'); } catch (e) {} }
      return;
    }
    // v4.5.0: primero intento DIRECTO (resuelve el audio en el propio móvil,
    // sin el Mac → funciona en cualquier WiFi/datos, también fuera de casa).
    showToast('⏳ Buscando el audio del episodio…');
    let errDirecto = '';
    const lanzarDirecto = () => {
      Capacitor.Plugins.BackgroundAudio.playRtveDirect({ id: ep.id, title: ep.titulo })
        .then(res => marcarReproducido(ep, res))
        .catch(err => {
          errDirecto = (err && err.message) ? String(err.message) : '';
          // Plan B: servicio del Mac (si está en la misma red)
          detectarProxyYt().then(proxy => {
            if (!proxy) {
              showToast('❌ No se pudo obtener el audio' + (errDirecto ? ' (' + errDirecto + ')' : ''));
              return;
            }
            Capacitor.Plugins.BackgroundAudio.playRtveProxy({ id: ep.id, proxy: proxy, title: ep.titulo })
              .then(res => marcarReproducido(ep, res))
              .catch(err2 => {
                const msg = (err2 && err2.message) ? err2.message : '';
                showToast('❌ No se pudo reproducir el episodio' + (msg ? ': ' + msg : (errDirecto ? ' (directo: ' + errDirecto + ')' : '')));
              });
          }).catch(() => showToast('❌ No se pudo obtener el audio' + (errDirecto ? ' (' + errDirecto + ')' : '')));
        });
    };
    const marcarReproducido = (episodio, res) => {
      if (!res || !res.audioUrl) { showToast('❌ No se pudo obtener el audio'); return; }
      if (bsPlaying || bsPaused) bsStop();
      stopStream();
      currentItem = {
        id: 'rtve:' + episodio.id,
        esVod: true, // bajo demanda: pausa real (no como directo)
        name: episodio.titulo,
        logo: episodio.img || 'icon.svg',
        url: res.audioUrl,
        _durMs: episodio.durMs || 0
      };
      isPlaying = true;
      updateUI();
      if (currentTab === 'audioprogramas' && rtveProg) pintarEpisodios();
      showToast('▶ ' + episodio.titulo);
    };
    lanzarDirecto();
  }


  // ================= REPRODUCCIÓN =================

  // Pausa la reproducción pero RECUERDA el canal para poder reanudar
  function pausePlayback() {
    if (isNative) {
      // v4.3.6: YouTube → PAUSA REAL (servicio vivo, posición conservada).
      // v4.4.4: lo mismo para episodios bajo demanda (esVod, p. ej. RTVE).
      // TV/Radio en directo → se para el servicio (al reanudar se relanza el
      // directo actual; pausar un stream en vivo y reanudar el buffer viejo
      // dejaría la emisora "atrasada").
      if (currentItem && (currentItem.esVod)) {
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
    if (currentItem && currentItem._pod) podGuardarProgreso();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateUI();
    statusText.textContent = '⏸ Pausado: ' + (currentItem ? currentItem.name : '');
    showToast('⏸ Pausado');
  }

  function playItem(ch) {
    errorBanner.style.display = 'none';
    currentItem = ch;
    if (ch && ch.id) guardarReciente(ch);
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
    if (currentItem && currentItem._pod) podGuardarProgreso();
    stopStream();
    isPlaying = false;
    currentItem = null;
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    updateUI();
    statusText.textContent = 'Toca un canal para escucharlo';
  }

  function showError() {
    errorBanner.style.display = 'flex';
    isPlaying = false;
    if (retryBtn) retryBtn.style.display = 'inline-flex';
    updateUI();
  }

  // ================= UI =================
  function updateUI() {
    // El botón central muestra ⏸ si suena algo (canal o Social Radio) y ▶ si está pausado
    const algoSonando = isPlaying || bsPlaying;
    const algoPausado = (currentItem && !isPlaying) || bsPaused;
    powerBtn.classList.toggle('playing', algoSonando);
    powerBtn.classList.toggle('paused-state', algoPausado);
    if (typeof updateFabSide === 'function') updateFabSide();
    // El miniplayer aparece cuando hay algo activo (canal o Social Radio)
    const hayAlgo = !!currentItem || bsPlaying || bsPaused;
    document.body.classList.toggle('player-active', hayAlgo);
    if (hayAlgo) {
      nowPlaying.style.display = 'flex';
      if (currentItem) {
        npLogo.src = currentItem.logo;
        npName.textContent = currentItem.name;
        const tipo = tipoDe(currentItem);
        const estado = esDirecto(currentItem) ? (isPlaying ? 'EN DIRECTO' : 'EN PAUSA') : (isPlaying ? 'REPRODUCIENDO' : 'EN PAUSA');
        npLabel.textContent = (tipo ? tipo.toUpperCase() + ' \u00b7 ' : '') + estado;
        statusText.textContent = isPlaying ? 'Reproduciendo ' + currentItem.name : '⏸ Pausado: ' + currentItem.name;
      } else if (bsPlaying || bsPaused) {
        // Social Radio: la barra muestra la fuente activa
        npLogo.src = 'icon.svg';
        npName.textContent = bsLabelActual();
        npLabel.textContent = bsPlaying ? 'SOCIAL RADIO' : 'SOCIAL EN PAUSA';
        statusText.textContent = bsPlaying ? '▶ Social Radio: ' + bsLabelActual() : '⏸ Social en pausa';
      }
      npEq.classList.toggle('paused', !algoSonando);
      if (typeof actualizarBotonVelocidad === 'function') actualizarBotonVelocidad();
      sincronizarOverlay(currentItem, isPlaying, bsPlaying, bsPaused, algoSonando);
    } else {
      nowPlaying.style.display = 'none';
      npEq.classList.add('paused');
      sincronizarOverlay(null, false, false, false, false);
    }
    updateTimerBadge();
    // Quitar el hero "Continuar escuchando" si ya no aplica (p. ej. tras detener)
    const heroEl = grid.querySelector('.resume-hero');
    if (heroEl && (!currentItem || isPlaying || bsPlaying || bsPaused)) heroEl.remove();
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
      // Canal pausado → reanudar el mismo canal
      if (currentItem._pod) {
        // Episodio de podcast: reanudar con su contexto (podcast + progreso)
        const podOk = currentItem._podObj || podPorId(currentItem._podId);
        if (podOk) playItemPodcast(podOk, currentItem._ep || { titulo: currentItem.name, url: currentItem.url, img: currentItem.logo, durMs: currentItem._durMs }, currentItem, 0);
        else playItem(currentItem);
      } else {
        playItem(currentItem);
      }
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
    if (currentItem && currentItem._pod && podQueue.length && podQueueIdx > 0) {
      podSaltar(-1);
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
    if (currentItem && currentItem._pod && podQueue.length && podQueueIdx >= 0) {
      podSaltar(+1);
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

  // Botón ✕ del miniplayer: detener del todo (canal o Social Radio)
  const stopFab = $('stop-fab');
  if (stopFab) {
    stopFab.addEventListener('click', () => {
      if (currentItem) {
        stopPlayback();
        showToast('⏹ Detenido');
      } else if (bsPlaying || bsPaused) {
        bsStop();
        showToast('⏹ Social Radio detenida');
      } else {
        showToast('No hay nada reproduciéndose');
      }
    });
  }

  // ===== F8: REPRODUCTOR COMPLETO (OVERLAY) =====
  // Tocar el miniplayer (fuera de sus botones) abre la pantalla completa.
  // Los controles del overlay DELEGAN en los del miniplayer (misma lógica,
  // un solo sitio que mantener). El estado visual lo sincroniza updateUI.
  let ovDragging = false;
  let ovTicker = null;

  function ovAbierto() {
    return playerOverlay && playerOverlay.style.display !== 'none';
  }
  function abrirOverlay() {
    if (!playerOverlay) return;
    playerOverlay.style.display = 'flex';
    document.body.classList.add('full-open');
    updateUI(); // rellena carátula, nombre, estado y botón ▶/⏸
    ovTickerStart();
  }
  function cerrarOverlay() {
    if (!playerOverlay) return;
    playerOverlay.style.display = 'none';
    document.body.classList.remove('full-open');
    ovTickerStop();
  }

  // Refresca el overlay con el estado actual (llamado desde updateUI)
  function sincronizarOverlay(item, sonando, bsPlay, bsPausa, eqActivo) {
    if (!ovName || !ovLogo) return;
    const hay = !!item || bsPlay || bsPausa;
    if (hay) {
      const datos = item
        ? { src: item.logo || 'icon.svg', nombre: item.name, etiqueta: sonando ? 'EN DIRECTO' : 'EN PAUSA' }
        : { src: 'icon.svg', nombre: bsLabelActual(), etiqueta: bsPlay ? 'SOCIAL RADIO' : 'SOCIAL EN PAUSA' };
      ovLogo.src = datos.src || 'icon.svg';
      ovName.textContent = datos.nombre;
      ovLabel.textContent = datos.etiqueta;
      ovEq.classList.toggle('paused', !eqActivo);
      if (ovSub) {
        const t = item ? tipoDe(item) : '';
        const sub = item
          ? (item._pod ? item._pod : (t ? t + ' \u00b7 ' : '') + (esDirecto(item) ? (sonando ? 'En directo' : 'En pausa') : (sonando ? 'Reproduciendo' : 'En pausa')))
          : (bsPlay || bsPausa ? 'Social Radio' : '');
        ovSub.textContent = sub;
        if (item && item._pod) {
          ovLabel.textContent = sonando ? 'PODCAST · REPRODUCIENDO' : 'PODCAST · EN PAUSA';
        } else {
          ovLabel.textContent = datos.etiqueta;
        }
      }
      // Barra de progreso: solo contenido bajo demanda (YouTube o episodios) con duración conocida
      const conBarra = !!(item && (item.esVod) && item._durMs > 0);
      ovProgress.style.display = conBarra ? 'block' : 'none';
    }
    if (ovPower) {
      ovPower.classList.toggle('playing', !!sonando || !!bsPlay);
      ovPower.classList.toggle('paused-state', (item && !sonando) || !!bsPausa);
    }
    // Si ya no suena nada, el overlay se cierra solo
    if (!hay && ovAbierto()) cerrarOverlay();
  }

  // Ticker: refresca posición/duración del overlay cuando suena YouTube
  function ovTickerStart() {
    ovTickerStop();
    if (!ovBar) return;
    ovTicker = setInterval(() => {
      if (!ovAbierto()) { ovTickerStop(); return; }
      if (!currentItem || !(currentItem.esVod)) return;
      // En Android la posición la conoce el plugin; en web, el <audio>.
      const leer = () => {
        if (!currentItem || !(currentItem.esVod)) return;
        if (ovProgress && ovTDur && (!ovDragging)) {
          let pos = 0, dur = 0;
          try {
            if (audio.duration && isFinite(audio.duration)) dur = audio.duration * 1000;
            pos = (audio.currentTime || 0) * 1000;
          } catch (e) {}
          if (dur > 0) currentItem._durMs = dur;
          const durRef = currentItem._durMs || 0;
          if (durRef > 0) {
            ovProgress.style.display = 'block';
            ovTDur.textContent = fmtSeg(Math.floor(durRef / 1000));
            ovBar.value = String(Math.round(Math.min(1, pos / durRef) * 1000));
            ovTAct.textContent = fmtSeg(Math.floor(pos / 1000));
          }
        }
      };
      if (!isNative) { leer(); return; }
      if (!window.Capacitor || !Capacitor.Plugins.BackgroundAudio) return;
      Capacitor.Plugins.BackgroundAudio.getEstado().then((est) => {
        const dur = Number(est.durMs) || 0;
        const pos = Number(est.posMs) || 0;
        if (dur > 0) currentItem._durMs = dur;
        const durRef = currentItem._durMs || 0;
        if (durRef > 0) {
          ovProgress.style.display = 'block';
          ovTDur.textContent = fmtSeg(Math.floor(durRef / 1000));
          if (!ovDragging) {
            ovBar.value = String(Math.round(Math.min(1, pos / durRef) * 1000));
            ovTAct.textContent = fmtSeg(Math.floor(pos / 1000));
          }
        }
      }).catch(leer);
    }, 1000);
  }
  function ovTickerStop() {
    if (ovTicker) { clearInterval(ovTicker); ovTicker = null; }
  }

  // Barra de progreso del overlay: misma mecánica por coordenadas de dedo
  // que la barra de la pestaña YouTube (tap o arrastre saltan siempre).
  if (ovBar) {
    let ovRect = null;
    let ovUltimoSeek = 0;
    const ovFrac = (cx) => {
      if (!ovRect || ovRect.width <= 0) return null;
      return Math.min(1, Math.max(0, (cx - ovRect.left) / ovRect.width));
    };
    const ovSeek = (force) => {
      const ahora = Date.now();
      if (!force && ahora - ovUltimoSeek < 200) return;
      ovUltimoSeek = ahora;
      const frac = Number(ovBar.value) / 1000;
      if (currentItem && (currentItem.esVod) && currentItem._durMs > 0) {
        if (!isNative && audio) {
          try { audio.currentTime = frac * (currentItem._durMs / 1000); } catch (e) {}
        } else if (window.Capacitor && Capacitor.Plugins.BackgroundAudio) {
          Capacitor.Plugins.BackgroundAudio.seekTo({ posMs: Math.floor(frac * currentItem._durMs) }).catch(() => {});
        }
      }
    };
    const ovPintar = (frac) => {
      ovBar.value = String(Math.round(frac * 1000));
      if (currentItem) ovTAct.textContent = fmtSeg(Math.floor(frac * (currentItem._durMs / 1000)));
    };
    ovBar.style.touchAction = 'none';
    ovBar.addEventListener('pointerdown', (e) => {
      ovDragging = true;
      ovRect = ovBar.getBoundingClientRect();
      try { e.preventDefault(); } catch (err) {}
    });
    ovBar.addEventListener('pointermove', (e) => {
      if (!ovDragging) return;
      const f = ovFrac(e.clientX);
      if (f === null) return;
      ovPintar(f);
      ovSeek(false);
    });
    ovBar.addEventListener('input', () => {
      if (currentItem && (currentItem.esVod) && currentItem._durMs > 0 && ovDragging) {
        const f = Number(ovBar.value) / 1000;
        ovPintar(f);
        ovSeek(false);
      }
    });
    const ovSoltar = (e) => {
      if (e && typeof e.clientX === 'number' && currentItem && (currentItem.esVod) && currentItem._durMs > 0) {
        const f = ovFrac(e.clientX);
        if (f !== null) ovPintar(f);
      }
      ovDragging = false;
      ovRect = null;
      ovSeek(true);
    };
    ovBar.addEventListener('change', ovSoltar);
    ovBar.addEventListener('pointerup', ovSoltar);
    ovBar.addEventListener('touchend', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      ovSoltar(t || e);
    });
    ovBar.addEventListener('pointercancel', ovSoltar);
    ovBar.addEventListener('touchcancel', ovSoltar);
    ovBar.addEventListener('click', (e) => {
      if (currentItem && (currentItem.esVod) && currentItem._durMs > 0) {
        const f = ovFrac(e.clientX);
        if (f !== null) { ovPintar(f); ovSeek(true); }
      }
    });
  }

  // Velocidad de reproducción de podcasts (web; el nativo la gestiona aparte)
  let podRate = 1;
  try { podRate = parseFloat(localStorage.getItem('teleaudio_pod_rate') || '1') || 1; } catch (e) {}
  const ovRate = document.getElementById('ov-rate');
  const ovRateBtn = document.getElementById('ov-rate-btn');
  function actualizarBotonVelocidad() {
    if (!ovRate || !ovRateBtn) return;
    const visible = !isNative && currentItem && currentItem._pod && (currentItem.esVod);
    ovRate.style.display = visible ? 'flex' : 'none';
    ovRateBtn.textContent = podRate + '×';
  }
  function setVelocidadPod(v) {
    podRate = v;
    try { localStorage.setItem('teleaudio_pod_rate', String(v)); } catch (e) {}
    if (audio) { try { audio.playbackRate = v; } catch (e) {} }
    if (ovRateBtn) ovRateBtn.textContent = v + '×';
    showToast('⏩ Velocidad ' + v + '×');
  }
  if (ovRateBtn) {
    ovRateBtn.addEventListener('click', () => {
      const opciones = [0.75, 1, 1.25, 1.5, 1.75, 2];
      const i = opciones.indexOf(podRate);
      setVelocidadPod(opciones[(i + 1) % opciones.length]);
    });
  }

  // Abrir al tocar el miniplayer (cualquier sitio menos sus botones)
  if (nowPlaying) {
    nowPlaying.addEventListener('click', (e) => {
      if (e.target.closest('.mini-ctrls')) return;
      abrirOverlay();
    });
  }
  // Gesto táctil: deslizar hacia ARRIBA en el miniplayer abre el reproductor
  // completo (como en las apps de audio modernas)
  let miniTouchY = null;
  if (nowPlaying) {
    nowPlaying.addEventListener('touchstart', (e) => {
      miniTouchY = e.touches[0].clientY;
    }, { passive: true });
    nowPlaying.addEventListener('touchend', (e) => {
      if (miniTouchY === null) return;
      const dy = e.changedTouches[0].clientY - miniTouchY;
      if (dy < -48) abrirOverlay(); // arriba
      miniTouchY = null;
    }, { passive: true });
  }
  // Gesto: deslizar hacia ABAJO en el reproductor completo lo cierra
  let ovTouchY = null;
  if (playerOverlay) {
    playerOverlay.addEventListener('touchstart', (e) => {
      ovTouchY = e.touches[0].clientY;
    }, { passive: true });
    playerOverlay.addEventListener('touchend', (e) => {
      if (ovTouchY === null) return;
      const dy = e.changedTouches[0].clientY - ovTouchY;
      if (dy > 60 && ovAbierto()) cerrarOverlay(); // abajo
      ovTouchY = null;
    }, { passive: true });
  }
  const ovCloseBtn = $('ov-close');
  if (ovCloseBtn) ovCloseBtn.addEventListener('click', cerrarOverlay);
  // Controles grandes: delegan en los del miniplayer (una sola lógica)
  const ovPrevBtn = $('ov-prev');
  const ovNextBtn = $('ov-next');
  const ovStopBtn = $('ov-stop');
  if (ovPrevBtn) ovPrevBtn.addEventListener('click', () => prevFab.click());
  if (ovNextBtn) ovNextBtn.addEventListener('click', () => nextFab.click());
  if (ovStopBtn && stopFab) ovStopBtn.addEventListener('click', () => stopFab.click());
  if (ovPower) ovPower.addEventListener('click', () => powerBtn.click());

  search.addEventListener('input', renderChannels);

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab !== 'audioprogramas') rtveProg = null; // salir de la vista de episodios
      if (currentTab !== 'podcast') podFeed = null;         // salir de la vista de episodios de un podcast
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

  // Reintentar reproducción tras un error (red, stream caído…)
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      errorBanner.style.display = 'none';
      if (currentItem) {
        try { playItem(currentItem); } catch (e) { showError(); }
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
  // v5.4: opciones extra del temporizador (45/90 min) insertadas por JS
  (function ampliarTemporizador() {
    const fila = document.querySelector('.setting-group .btn-row');
    if (!fila) return;
    if (fila.querySelector('[data-timer="45"]')) return;
    [45, 90].forEach(min => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.dataset.timer = String(min);
      b.textContent = min + ' min';
      b.addEventListener('click', () => setSleepTimer(min));
      fila.appendChild(b);
    });
  })();

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
        showToast('❌ Error: ' + msg);
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

      // --- TV / Radio ---
      if (est.tvUrl) {
        const ch = ALL.find(c => c.url === est.tvUrl);
        if (ch && !currentItem) {
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
  cargarPodcastLocal();
  podInstalarOnEnded();
  renderChannels();
  sincronizarConNativo();
  // Al volver a primer plano (sin recarga), re-sincronizar por si pausaron,
  // reanudaron o apagaron desde la notificación/reloj mientras estaba detrás.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sincronizarConNativo();
  });
})();
