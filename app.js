/* TeleAudio - La tele en tu oreja */
(function () {
  'use strict';

  // --- CANALES (streams oficiales de audio/vídeo de TV española) ---
  const CHANNELS = [
    { id: 'la1',  name: 'La 1',           logo: 'logos/la1.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main_dvr.m3u8' },
    { id: 'la2',  name: 'La 2',           logo: 'logos/la2.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/la2/la2_main_dvr.m3u8' },
    { id: '24h',  name: '24h',            logo: 'logos/24h.png',        url: 'https://ztnr.rtve.es/ztnr/1694255.m3u8' },
    { id: 'tdp',  name: 'Teledeporte',    logo: 'logos/tdp.png',        url: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8' },
    { id: 'clan', name: 'Clan',           logo: 'logos/clan.png',       url: 'https://ztnr.rtve.es/ztnr/5466990.m3u8' },
    { id: 'canalsur', name: 'Canal Sur',  logo: 'logos/canalsur.png',   url: 'https://dfk2a268yviz9.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-ddiii1m6jt6of/CanalSurAndaluciaES.m3u8' },
    { id: 'canalsur2', name: 'C. Sur 2',  logo: 'logos/canalsur2.png',  url: 'https://rtva-channel22.flumotion.cloud/playlist.m3u8' },
    { id: 'canalsurmas', name: 'C. Sur Noticias', logo: 'logos/canalsurmas.png', url: 'https://rtva-channel42.flumotion.cloud/playlist.m3u8' },
    { id: 'eltoro', name: 'El Toro TV',   logo: 'logos/eltoro.png',     url: 'https://streaming-1.eltorotv.com/lb0/eltorotv-streaming-web/index.m3u8' },
    { id: 'trece', name: 'TRECE',         logo: 'logos/trece.png',      url: 'https://play.cdn.enetres.net/091DB7AFBD77442B9BA2F141DCC182F5021/021/playlist.m3u8' },
    { id: 'euronews', name: 'Euronews',   logo: 'logos/euronews.png',   url: 'https://euronews-live-spa-es.fast.rakuten.tv/v1/master/0547f18649bd788bec7b67b746e47670f558b6b2/production-LiveChannel-6571/bitok/eyJzdGlkIjoiMDA0YjY0NTMtYjY2MC00ZTZkLTlkNzEtMTk3YTM3ZDZhZWIxIiwibWt0IjoiZXMiLCJjaCI6NjU3MSwicHRmIjoxfQ==/26034/euronews-es.m3u8' },
    { id: 'rne',  name: 'RNE (TV)',       logo: 'logos/rne.png',        url: 'https://ztnr.rtve.es/ztnr/6688753.m3u8' },
    { id: 'r5',   name: 'Radio 5',        logo: 'logos/r5.png',         url: 'https://ztnr.rtve.es/ztnr/6982917.m3u8' }
  ];

  // --- ELEMENTOS DOM ---
  const grid = document.getElementById('channel-grid');
  const search = document.getElementById('search');
  const powerBtn = document.getElementById('power-btn');
  const nowPlaying = document.getElementById('now-playing');
  const npLogo = document.getElementById('np-logo');
  const npName = document.getElementById('np-name');
  const npEq = document.getElementById('np-eq');
  const statusText = document.getElementById('status-text');
  const errorBanner = document.getElementById('error-banner');
  const toast = document.getElementById('toast');

  // --- ESTADO ---
  const audio = new Audio();
  audio.preload = 'none';
  let hls = null;
  let currentChannel = null;
  let isPlaying = false;

  // --- RENDER DE CANALES ---
  function renderChannels(filter) {
    grid.innerHTML = '';
    const q = (filter || '').trim().toLowerCase();
    const list = CHANNELS.filter(c => !q || c.name.toLowerCase().includes(q));

    list.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'channel-card' + (currentChannel && currentChannel.id === ch.id ? ' active' : '') + (isPlaying && currentChannel && currentChannel.id === ch.id ? ' playing-now' : '');

      const img = document.createElement('img');
      img.className = 'channel-logo';
      img.src = ch.logo;
      img.alt = ch.name;
      img.loading = 'lazy';
      img.onerror = () => { img.src = 'icon.svg'; };

      const name = document.createElement('div');
      name.className = 'channel-name';
      name.textContent = ch.name;

      card.appendChild(img);
      card.appendChild(name);
      card.addEventListener('click', () => playChannel(ch));
      grid.appendChild(card);
    });

    if (list.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:30px;">Sin canales para "' + filter + '"</div>';
    }
  }

  // --- REPRODUCCIÓN ---
  function playChannel(ch) {
    errorBanner.style.display = 'none';
    currentChannel = ch;

    // Limpiar reproductor HLS anterior
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();

    const canPlayHls = audio.canPlayType('application/vnd.apple.mpegurl');
    if (canPlayHls) {
      // Android/iPhone: HLS nativo
      audio.src = ch.url;
    } else if (window.Hls && Hls.isSupported()) {
      // Escritorio: usar hls.js
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(ch.url);
      hls.attachMedia(audio);
      hls.on(Hls.Events.ERROR, (e, data) => {
        if (data.fatal) {
          showError();
        }
      });
    } else {
      showError();
      return;
    }

    audio.play().then(() => {
      isPlaying = true;
      updateUI();
    }).catch(() => {
      // El navegador puede requerir interacción (ya la hay: el clic)
      audio.play().catch(showError);
    });

    updateUI();
    showToast('▶ ' + ch.name);
  }

  function stopPlayback() {
    if (hls) { hls.destroy(); hls = null; }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    isPlaying = false;
    currentChannel = null;
    updateUI();
    statusText.textContent = 'Toca un canal para escucharlo';
  }

  function showError() {
    errorBanner.style.display = 'block';
    isPlaying = false;
    updateUI();
  }

  // --- UI ---
  function updateUI() {
    powerBtn.classList.toggle('playing', isPlaying);

    if (isPlaying && currentChannel) {
      nowPlaying.style.display = 'flex';
      npLogo.src = currentChannel.logo;
      npName.textContent = currentChannel.name;
      npEq.classList.remove('paused');
      statusText.textContent = 'Reproduciendo ' + currentChannel.name;
      audio.volume = 1;
    } else {
      nowPlaying.style.display = 'none';
      npEq.classList.add('paused');
    }

    // Actualizar tarjetas
    document.querySelectorAll('.channel-card').forEach(card => {
      const name = card.querySelector('.channel-name').textContent;
      const isCurrent = currentChannel && card.querySelector('.channel-name').textContent === currentChannel.name;
      card.classList.toggle('active', isCurrent);
      card.classList.toggle('playing-now', isCurrent && isPlaying);
    });
  }

  // --- EVENTOS ---
  powerBtn.addEventListener('click', () => {
    if (isPlaying) {
      stopPlayback();
      showToast('⏹ Parado');
    } else if (currentChannel) {
      playChannel(currentChannel);
    } else {
      showToast('Selecciona un canal primero');
    }
  });

  search.addEventListener('input', (e) => renderChannels(e.target.value));

  // Seguir sonando en segundo plano (bloqueo de pantalla) — requerido en Android
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audio && !audio.paused) {
      // Aseguramos que el audio no se pausa al bloquear (MediaSession)
    }
  });

  // Control por auriculares / pantalla bloqueada (MediaSession API)
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => { if (currentChannel) playChannel(currentChannel); });
    navigator.mediaSession.setActionHandler('pause', stopPlayback);
    navigator.mediaSession.setActionHandler('previoustrack', () => changeChannel(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => changeChannel(+1));
  }

  function changeChannel(dir) {
    if (!currentChannel) return;
    const idx = CHANNELS.findIndex(c => c.id === currentChannel.id);
    const next = CHANNELS[(idx + dir + CHANNELS.length) % CHANNELS.length];
    playChannel(next);
  }

  // --- TOAST ---
  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  // Registrar service worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // --- INICIO ---
  renderChannels('');
})();
