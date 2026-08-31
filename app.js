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

  // ================= DOM =================
  const $ = (id) => document.getElementById(id);
  const grid = $('channel-grid');
  const search = $('search');
  const powerBtn = $('power-btn');
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
    else list = ALL.filter(c => favs.has(c.id));
    return list.filter(c => !q || c.name.toLowerCase().includes(q));
  }

  function renderChannels() {
    grid.innerHTML = '';
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
    }
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
    if (isPlaying && currentItem) {
      nowPlaying.style.display = 'flex';
      npLogo.src = currentItem.logo;
      npName.textContent = currentItem.name;
      npEq.classList.remove('paused');
      statusText.textContent = 'Reproduciendo ' + currentItem.name;
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
    navigator.mediaSession.setActionHandler('pause', stopPlayback);
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
    if (isPlaying) { stopPlayback(); showToast('⏹ Parado'); }
    else if (currentItem) playItem(currentItem);
    else showToast('Selecciona un canal primero');
  });

  search.addEventListener('input', renderChannels);

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
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

  // ================= INICIO =================
  setTheme(localStorage.getItem('teleaudio_theme') || 'dark');
  setupAlarm();
  renderChannels();
})();
