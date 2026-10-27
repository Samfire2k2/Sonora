import { FFmpeg } from '@ffmpeg/ffmpeg';

(() => {
  const $ = (selector) => document.querySelector(selector);
  const queue = $('#queue');
  const ffmpeg = new FFmpeg();
  let tracks = [];
  let busy = false;
  let engineReady = false;
  const formats = {
    mp3: { ext: 'mp3', mime: 'audio/mpeg', codec: ['-c:a', 'libmp3lame'] },
    wav: { ext: 'wav', mime: 'audio/wav', codec: [] },
    flac: { ext: 'flac', mime: 'audio/flac', codec: ['-c:a', 'flac'] },
    ogg: { ext: 'ogg', mime: 'audio/ogg', codec: ['-c:a', 'libvorbis'] },
    opus: { ext: 'opus', mime: 'audio/ogg', codec: ['-c:a', 'libopus'] },
    m4a: { ext: 'm4a', mime: 'audio/mp4', codec: ['-c:a', 'aac', '-movflags', '+faststart'] },
  };

  const toast = (message) => {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2800);
  };
  const formatBytes = (size) => size < 1048576
    ? `${Math.max(1, Math.round(size / 1024))} Ko`
    : `${(size / 1048576).toFixed(1)} Mo`;
  const escapeHtml = (value) => value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

  function refreshQuality() {
    const format = $('#format').value;
    const quality = $('#quality');
    const label = $('#quality-label');
    const options = {
      mp3: ['128|128 kb/s · compact', '192|192 kb/s · équilibré', '256|256 kb/s · élevé', '320|320 kb/s · maximum'],
      wav: ['16|PCM 16 bits', '24|PCM 24 bits · élevé', '32|PCM 32 bits'],
      flac: ['0|Rapide · sans perte', '5|Équilibré · sans perte', '8|Compact · sans perte'],
      ogg: ['3|Qualité standard · VBR', '5|Qualité élevée · VBR', '8|Très haute qualité · VBR'],
      opus: ['96|96 kb/s · compact', '128|128 kb/s · équilibré', '192|192 kb/s · élevé', '256|256 kb/s · maximum'],
      m4a: ['128|128 kb/s · compact', '192|192 kb/s · équilibré', '256|256 kb/s · élevé', '320|320 kb/s · maximum'],
    }[format];
    label.textContent = format === 'wav' ? 'PROFONDEUR' : format === 'flac' ? 'COMPRESSION' : 'QUALITÉ';
    const surroundOption = $('#channels').querySelector('option[value="6"]');
    surroundOption.disabled = format === 'mp3';
    if (format === 'mp3' && $('#channels').value === '6') $('#channels').value = '2';
    quality.innerHTML = options.map((entry) => {
      const [value, text] = entry.split('|');
      return `<option value="${value}">${text}</option>`;
    }).join('');
    const defaults = { mp3: '192', wav: '24', flac: '5', ogg: '5', opus: '128', m4a: '192' };
    quality.value = defaults[format];
    $('#format-note').textContent = format === 'mp3'
      ? 'MP3 : mono ou stéréo, jusqu’à 320 kb/s.'
      : format === 'wav'
        ? 'WAV PCM : jusqu’à 8 canaux, en 16, 24 ou 32 bits.'
        : format === 'flac'
          ? 'FLAC est sans perte ; le réglage change la vitesse et la taille, pas le son.'
          : format === 'ogg'
            ? 'Ogg Vorbis utilise un débit variable ; la qualité choisie est une cible.'
            : format === 'opus'
              ? 'Opus : mono, stéréo ou jusqu’à 5.1 selon la source.'
              : 'M4A/AAC : mono, stéréo ou multicanal selon la source.';
  }

  function render() {
    $('#count').textContent = `${tracks.length} fichier${tracks.length > 1 ? 's' : ''}`;
    const pending = tracks.some((track) => track.status === 'À convertir');
    $('#process-all').hidden = !pending || busy;
    if (!tracks.length) {
      queue.innerHTML = '<div class="empty">Ta liste est prête à accueillir des liens audio.</div>';
      return;
    }
    queue.innerHTML = tracks.map((track, index) => `
      <div class="track">
        <div class="track-icon">♫</div>
        <div class="track-info">
          <div class="track-name" title="${escapeHtml(track.file.name)}">${escapeHtml(track.file.name)}</div>
          <div class="file-meta">${formatBytes(track.file.size)} · ${escapeHtml(track.file.type || 'audio')}</div>
        </div>
        <div class="track-actions">
          <span class="state ${track.status === 'Prêt' ? 'done' : ''}" id="state-${index}">${escapeHtml(track.status)}</span>
          ${track.status === 'À convertir' ? `<button class="small-btn convert-one" data-i="${index}" ${busy ? 'disabled' : ''}>Convertir</button>` : ''}
          ${track.url ? `<a class="small-btn" href="${track.url}" download="${escapeHtml(track.outputName)}">Télécharger ${escapeHtml(track.outputName.split('.').pop().toUpperCase())}</a>` : ''}
          <a class="small-btn source-download" href="${track.sourceUrl}" download="${escapeHtml(track.file.name)}">Source</a>
          <button class="remove" data-remove="${index}" aria-label="Retirer ${escapeHtml(track.file.name)}" ${busy ? 'disabled' : ''}>×</button>
        </div>
      </div>`).join('');
    queue.querySelectorAll('.convert-one').forEach((button) => {
      button.onclick = () => convert(Number(button.dataset.i));
    });
    queue.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = () => {
        const track = tracks[Number(button.dataset.remove)];
        URL.revokeObjectURL(track.sourceUrl);
        if (track.url) URL.revokeObjectURL(track.url);
        tracks.splice(Number(button.dataset.remove), 1);
        render();
      };
    });
  }

  function addAudio(file) {
    if (file.size > 250 * 1024 * 1024) {
      toast('Le fichier dépasse la limite de 250 Mo.');
      return;
    }
    tracks.push({ file, sourceUrl: URL.createObjectURL(file), status: 'À convertir', url: null, outputName: '' });
    render();
  }

  $('#pick-files').onclick = () => $('#local-files').click();
  $('#local-files').onchange = (event) => {
    for (const file of event.target.files) addAudio(file);
    event.target.value = '';
  };

  async function ensureEngine() {
    if (engineReady) return;
    const status = $('#engine-status');
    status.textContent = 'Chargement du moteur audio… (environ 30 Mo, première utilisation)';
    status.hidden = false;
    const base = new URL('ffmpeg/', document.baseURI);
    await ffmpeg.load({
      coreURL: new URL('ffmpeg-core.js', base).href,
      wasmURL: new URL('ffmpeg-core.wasm', base).href,
    });
    engineReady = true;
    status.textContent = 'Moteur audio prêt.';
    setTimeout(() => { status.hidden = true; }, 2200);
  }

  async function convert(index) {
    if (busy || !tracks[index]) return;
    const track = tracks[index];
    const format = $('#format').value;
    const quality = $('#quality').value;
    const channelChoice = $('#channels').value;
    const codec = formats[format];
    busy = true;
    track.status = 'Préparation…';
    render();
    try {
      await ensureEngine();
      track.status = 'Conversion…';
      render();
      const inputName = `input-${index}.${track.file.name.split('.').pop().replace(/[^a-z0-9]/gi, '') || 'audio'}`;
      const outputName = `sonora-output.${codec.ext}`;
      await ffmpeg.writeFile(inputName, new Uint8Array(await track.file.arrayBuffer()));
      const args = ['-y', '-i', inputName, '-vn'];
      if (format === 'mp3') args.push('-ac', channelChoice === 'source' ? '2' : Math.min(Number(channelChoice), 2).toString());
      else if (channelChoice !== 'source') args.push('-ac', channelChoice);
      if (format === 'mp3' || format === 'm4a' || format === 'opus') args.push('-b:a', `${quality}k`);
      if (format === 'ogg') args.push('-q:a', quality);
      if (format === 'flac') args.push('-compression_level', quality);
      if (format === 'wav') args.push('-c:a', `pcm_s${quality}le`);
      args.push(...codec.codec, outputName);
      const onProgress = ({ progress }) => {
        const state = $(`#state-${index}`);
        if (state && Number.isFinite(progress)) state.textContent = `${Math.min(99, Math.round(progress * 100))}%`;
      };
      ffmpeg.on('progress', onProgress);
      const result = await ffmpeg.exec(args);
      ffmpeg.off('progress', onProgress);
      if (result !== 0) throw new Error('FFmpeg n’a pas pu encoder ce fichier avec ces réglages.');
      const data = await ffmpeg.readFile(outputName);
      track.url = URL.createObjectURL(new Blob([data], { type: codec.mime }));
      track.outputName = `${track.file.name.replace(/\.[^.]+$/, '')}.${codec.ext}`;
      track.status = 'Prêt';
      toast('Conversion terminée.');
      try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); } catch { /* Nettoyage facultatif */ }
    } catch (error) {
      console.error(error);
      track.status = 'Erreur';
      toast(error.message || 'Impossible de convertir ce fichier avec ce format.');
    } finally {
      busy = false;
      render();
    }
  }

  function platformFor(url) {
    const host = url.hostname.toLowerCase();
    const idOk = (value) => /^[\w-]+$/.test(value);
    if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const video = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
      const list = url.searchParams.get('list');
      const embed = video && idOk(video)
        ? `https://www.youtube-nocookie.com/embed/${video}${list && idOk(list) ? `?list=${list}` : ''}`
        : list && idOk(list) ? `https://www.youtube-nocookie.com/embed/videoseries?list=${list}` : '';
      return { name: 'YouTube', embed };
    }
    if (host === 'spotify.com' || host.endsWith('.spotify.com')) {
      const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([\w]+)\/?$/);
      return { name: 'Spotify', embed: match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?theme=0` : '' };
    }
    if (host === 'soundcloud.com' || host.endsWith('.soundcloud.com')) {
      return { name: 'SoundCloud', embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&color=%239b1731&auto_play=false` };
    }
    if (host === 'deezer.com' || host.endsWith('.deezer.com')) {
      const match = url.pathname.match(/^\/(track|album|playlist)\/(\d+)/);
      return { name: 'Deezer', embed: match ? `https://widget.deezer.com/widget/dark/${match[1]}/${match[2]}` : '' };
    }
    if (host === 'music.apple.com' || host === 'itunes.apple.com') {
      return { name: 'Apple Music', embed: `https://embed.music.apple.com${url.pathname}${url.search}` };
    }
    const otherPlatforms = [
      ['tidal.com', 'Tidal'], ['bandcamp.com', 'Bandcamp'], ['mixcloud.com', 'Mixcloud'],
      ['audiomack.com', 'Audiomack'], ['audius.co', 'Audius'], ['music.amazon.', 'Amazon Music'],
      ['qobuz.com', 'Qobuz'], ['music.youtube.com', 'YouTube Music'], ['vimeo.com', 'Vimeo'],
      ['dailymotion.com', 'Dailymotion'], ['archive.org', 'Internet Archive'],
    ];
    const service = otherPlatforms.find(([domain]) => host === domain || host.endsWith(`.${domain}`) || (domain === 'music.amazon.' && /(^|\.)music\.amazon\./.test(host)));
    return service ? { name: service[1], embed: '' } : null;
  }

  $('#format').onchange = refreshQuality;
  $('#process-all').onclick = async () => {
    for (let i = 0; i < tracks.length; i += 1) {
      if (tracks[i].status === 'À convertir') await convert(i);
    }
  };
  $('#link-form').onsubmit = async (event) => {
    event.preventDefault();
    const box = $('#playlist-result');
    box.replaceChildren();
    box.classList.add('show');
    let raw = $('#playlist-url').value.trim().replace(/^<|>$/g, '');
    let url;
    try {
      const spotifyUri = raw.match(/^spotify:(track|album|playlist|artist|episode|show):([\w]+)$/i);
      if (spotifyUri) raw = `https://open.spotify.com/${spotifyUri[1].toLowerCase()}/${spotifyUri[2]}`;
      url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
    } catch {
      box.textContent = 'Lien non reconnu. Colle une adresse YouTube, Spotify ou une URL directe complète.';
      return;
    }
    $('#playlist-url').value = url.href;
    const platform = platformFor(url);
    if (platform) {
      const title = document.createElement('div');
      const message = platform.name === 'YouTube'
        ? 'Le lien ouvre la vidéo, mais ne fournit pas le fichier source à Sonora. Pour extraire son audio, choisis le fichier vidéo que tu es autorisé à convertir.'
        : platform.embed
          ? 'Écoute le contenu avec le lecteur officiel. Pour le convertir, charge un fichier source que tu as le droit d’utiliser.'
          : 'Ouvre le lien dans son lecteur officiel. Pour le convertir, charge un fichier source que tu as le droit d’utiliser.';
      title.innerHTML = `<b>Lien ${escapeHtml(platform.name)} reconnu.</b> ${message}`;
      box.append(title);
      if (platform.embed) {
        const frame = document.createElement('iframe');
        frame.src = platform.embed;
        frame.title = `Lecteur officiel ${platform.name}`;
        frame.loading = 'lazy';
        frame.allow = 'autoplay; encrypted-media; clipboard-write; fullscreen; picture-in-picture';
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.allowFullscreen = true;
        box.append(frame);
      } else {
        const link = document.createElement('a');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Ouvrir ${platform.name} ↗`;
        box.append(link);
      }
      return;
    }
    box.innerHTML = '<b>Lien audio direct détecté.</b> Chargement pour conversion…';
    try {
      const response = await fetch(url.href, { mode: 'cors', credentials: 'omit' });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const type = (response.headers.get('content-type') || blob.type).split(';')[0].toLowerCase();
      const extension = url.pathname.match(/\.(mp3|wav|flac|ogg|m4a|aac|opus|webm|aiff?|mp4|mov|mkv|avi|m4v|flv|mpeg|mpg)$/i)?.[1]?.toLowerCase();
      const audioInput = type.startsWith('audio/') || ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'aif', 'aiff'].includes(extension);
      const videoInput = type.startsWith('video/') || ['webm', 'mp4', 'mov', 'mkv', 'avi', 'm4v', 'flv', 'mpeg', 'mpg'].includes(extension);
      if (!audioInput && !videoInput) throw new Error();
      const filename = decodeURIComponent(url.pathname.split('/').pop() || 'audio').replace(/[\\/:*?"<>|]/g, '_');
      const mime = audioInput ? (type.startsWith('audio/') ? type : 'audio/octet-stream') : (type.startsWith('video/') ? type : 'video/mp4');
      addAudio(new File([blob], filename, { type: mime }));
      box.textContent = 'Fichier chargé. Télécharge la source ou choisis un format puis convertis l’audio.';
    } catch {
      box.innerHTML = '<b>Impossible de charger ce lien.</b> Il doit pointer vers un fichier audio ou vidéo direct, autoriser l’accès CORS et être téléchargeable avec les droits nécessaires. Les liens de lecteurs ne donnent pas accès au flux média.';
    }
  };

  const libraryKey = 'sonora-playlist-library-v1';
  let library = [];
  try { library = JSON.parse(localStorage.getItem(libraryKey) || '[]'); } catch { library = []; }
  if (!Array.isArray(library)) library = [];

  function csvRows(text) {
    const sample = text.split(/\r?\n/, 1)[0] || '';
    const candidates = [',', ';', '\t'];
    const delimiter = candidates.map((char) => ({ char, count: sample.split(char).length - 1 }))
      .sort((a, b) => b.count - a.count)[0].char;
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = []; cell = '';
      } else cell += char;
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function normalHeader(value) {
    return value.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parsePlaylistCsv(text) {
    const rows = csvRows(text);
    if (!rows.length) return [];
    const aliases = {
      title: ['title', 'track', 'trackname', 'name', 'song', 'songname'],
      artist: ['artist', 'artistname', 'artists', 'trackartist'],
      album: ['album', 'albumname'],
      duration: ['duration', 'durationms', 'trackduration', 'length'],
    };
    const first = rows[0].map(normalHeader);
    const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, first.findIndex((heading) => names.includes(heading))]));
    const hasHeader = columns.title >= 0;
    if (!hasHeader) Object.assign(columns, { title: 0, artist: 1, album: 2, duration: 3 });
    const data = hasHeader ? rows.slice(1) : rows;
    return data.map((cells) => ({
      title: (cells[columns.title] || '').trim(),
      artist: columns.artist >= 0 ? (cells[columns.artist] || '').trim() : '',
      album: columns.album >= 0 ? (cells[columns.album] || '').trim() : '',
      duration: columns.duration >= 0 ? (cells[columns.duration] || '').trim() : '',
    })).filter((item) => item.title).map((item) => ({ ...item, id: `${normalHeader(item.title)}-${normalHeader(item.artist)}` }));
  }

  function saveLibrary() {
    try { localStorage.setItem(libraryKey, JSON.stringify(library)); }
    catch { toast('La bibliothèque ne peut pas être enregistrée dans ce navigateur.'); }
  }

  function renderLibrary() {
    const list = $('#library-list');
    $('#library-count').textContent = `${library.length} morceau${library.length === 1 ? '' : 's'}`;
    $('#export-playlist').disabled = !library.length;
    $('#clear-library').disabled = !library.length;
    list.replaceChildren();
    if (!library.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Aucun morceau. Importe un CSV pour commencer.';
      list.append(empty);
      return;
    }
    library.forEach((track, index) => {
      const row = document.createElement('article');
      row.className = 'library-row';
      const number = document.createElement('span');
      number.className = 'library-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const info = document.createElement('div');
      info.className = 'library-track-info';
      const title = document.createElement('div');
      title.className = 'library-track-title';
      title.textContent = track.title;
      const meta = document.createElement('div');
      meta.className = 'library-track-meta';
      meta.textContent = [track.artist, track.album, track.duration].filter(Boolean).join(' · ') || 'Artiste non renseigné';
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'library-row-actions';
      const search = document.createElement('a');
      search.className = 'small-btn';
      search.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`.trim())}`;
      search.target = '_blank';
      search.rel = 'noopener noreferrer';
      search.textContent = 'Chercher sur YouTube';
      const remove = document.createElement('button');
      remove.className = 'library-remove';
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Retirer ${track.title}`);
      remove.onclick = () => { library.splice(index, 1); saveLibrary(); renderLibrary(); };
      actions.append(search, remove);
      row.append(number, info, actions);
      list.append(row);
    });
  }

  $('#import-playlist').onclick = () => $('#playlist-csv').click();
  $('#playlist-csv').onchange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const imported = parsePlaylistCsv(await file.text());
      if (!imported.length) throw new Error('Aucun titre trouvé. Vérifie que le CSV contient une colonne Track name ou Title.');
      const known = new Set(library.map((track) => track.id));
      const fresh = imported.filter((track) => !known.has(track.id));
      library.push(...fresh);
      saveLibrary();
      renderLibrary();
      toast(`${fresh.length} morceau${fresh.length === 1 ? '' : 's'} ajouté${fresh.length === 1 ? '' : 's'}.`);
    } catch (error) {
      toast(error.message || 'Impossible de lire ce fichier CSV.');
    }
  };
  $('#clear-library').onclick = () => {
    library = [];
    saveLibrary();
    renderLibrary();
  };
  $('#export-playlist').onclick = () => {
    const quote = (value) => `"${String(value || '').replace(/"/g, '""')}"`;
    const csv = [['Title', 'Artist', 'Album', 'Duration'], ...library.map((track) => [track.title, track.artist, track.album, track.duration])]
      .map((row) => row.map(quote).join(',')).join('\r\n');
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = 'sonora-playlist.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  refreshQuality();
  renderLibrary();
  render();
})();
