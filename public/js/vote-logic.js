// Supabase config — replace with real values before deploying
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Voting config
const TARGET_LAT    = -6.43956;
const TARGET_LON    = 106.9040208;
const MAX_RADIUS_M  = 1000;
const LS_VOTE_KEY   = 'lcgn_vote_v7_2026';
const LS_FP_PREFIX  = 'lcgn_fp_v7_';
const QR_TOKEN      = 'lcgn-direct';
const SECURITY_KEY  = 'WIKRAMA2026';

// URL params
const _params       = new URLSearchParams(window.location.search);
const QR_GAME_ID    = _params.get('gameId') || null;
const QR_TOKEN_VAL  = _params.get('t') || null;
const HAS_QR_TOKEN  = QR_TOKEN_VAL === QR_TOKEN;

// Game data
const GAMES = [
  { id: 'integrity_run', emoji: '🏃', title: 'Integrity Run', tag: 'Platformer · Edukatif', desc: 'Berlari melewati rintangan korupsi dalam dunia 2D yang penuh warna. Setiap keputusan menentukan nasib negeri.', players: '1–2', rating: '4.8' },
  { id: 'clean_nation', emoji: '🌿', title: 'Clean Nation', tag: 'Strategy · Simulation', desc: 'Bangun kota bersih dari korupsi dengan keputusan strategis. Kelola anggaran, awasi aparatur, wujudkan Indonesia bersih.', players: '1–4', rating: '4.9' },
  { id: 'jujur_quest', emoji: '⚖️', title: 'Jujur Quest', tag: 'RPG · Adventure', desc: 'RPG dengan narasi kuat bertema anti-korupsi. Jadilah pahlawan kejujuran dan selamatkan desa dengan kekuatan integritas.', players: '1', rating: '4.7' },
  { id: 'transparent_city', emoji: '🏙️', title: 'Transparent City', tag: 'Puzzle · Builder', desc: 'Puzzle builder di mana transparansi adalah kunci. Susun blok kebijakan dan bangun kota yang terbuka dan akuntabel.', players: '1–2', rating: '4.6' },
  { id: 'brave_reporter', emoji: '📰', title: 'Brave Reporter', tag: 'Stealth · Investigation', desc: 'Jadilah jurnalis pemberani yang mengungkap korupsi. Kumpulkan bukti, hindari ancaman, dan tulis laporan yang mengubah negeri.', players: '1', rating: '4.8' },
  { id: 'anti_corrupt', emoji: '🛡️', title: 'Anti-Corrupt Hero', tag: 'Action · Multiplayer', desc: 'Lawan koruptor dalam arena aksi cepat! Tim superhero anti-korupsi menghadapi gelombang musuh AI yang adaptif.', players: '1–4', rating: '4.9' },
];

let _pendingGameId  = null;
let _isQrDirectVote = false;
let _userLat        = null;
let _userLon        = null;

function haversineM(lat1, lon1, lat2, lon2) {
  const R  = 6371000;
  const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a  = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLocalVoteRecord() {
  try { return JSON.parse(localStorage.getItem(LS_VOTE_KEY) || 'null'); }
  catch { return null; }
}
function saveLocalVoteRecord(data) {
  localStorage.setItem(LS_VOTE_KEY, JSON.stringify(data));
}

async function getFingerprint() {
  try {
    const fp = await FingerprintJS.load();
    const r  = await fp.get();
    return r.visitorId;
  } catch {
    return 'fp_' + navigator.userAgent.slice(0, 60);
  }
}

async function getPublicIP() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const r = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timer);
    const j = await r.json();
    return j.ip || 'unknown';
  } catch { return 'unknown'; }
}

const STATES = ['state-loading','state-blocked','state-voted','state-security','state-voting'];
function showState(id) {
  STATES.forEach(s => {
    const el = document.getElementById(s);
    s === id ? el.classList.remove('hidden') : el.classList.add('hidden');
  });
}

function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function launchConfetti() {
  const colors = ['#a3ff00','#ffffff','#1f4ee9','#ffdd00','#ff6060'];
  for (let i = 0; i < 55; i++) {
    const bit = document.createElement('div');
    bit.className = 'confetti-bit';
    bit.style.cssText = [
      `left:${Math.random()*100}vw`, `top:-10px`,
      `background:${colors[Math.floor(Math.random()*colors.length)]}`,
      `animation-delay:${Math.random()*1.2}s`,
      `animation-duration:${2.2 + Math.random()*1.4}s`,
      `transform:rotate(${Math.random()*360}deg)`,
      `width:${6+Math.random()*8}px`, `height:${6+Math.random()*8}px`,
    ].join(';');
    document.body.appendChild(bit);
    setTimeout(() => bit.remove(), 4500);
  }
}

function renderGames(votedId = null) {
  const grid = document.getElementById('games-grid');
  grid.innerHTML = '';
  GAMES.forEach(g => {
    const isVoted  = g.id === votedId;
    const anyVoted = votedId !== null;
    const card = document.createElement('div');
    card.className = 'game-card' + (isVoted ? ' selected' : '');
    card.id = `game-card-${g.id}`;
    card.innerHTML = `
      ${isVoted ? `<div class="voted-overlay"><div class="voted-overlay-inner"><span class="chk">✅</span><p>Voted!</p></div></div>` : ''}
      <div class="card-hd"><div class="card-emoji">${g.emoji}</div><div class="card-title">${g.title}</div><span class="card-tag">${g.tag}</span></div>
      <div class="card-bd">
        <p class="card-desc">${g.desc}</p>
        <div class="card-meta"><span>👥 ${g.players} players</span><span>⭐ ${g.rating}</span></div>
        <button class="vote-btn${isVoted ? ' is-voted' : ''}" id="vote-btn-${g.id}" ${anyVoted ? 'disabled' : ''} onclick="openConfirmModal('${g.id}', false)">
          <span>${isVoted ? '✅ Voted!' : '🗳️ Vote'}</span>
        </button>
      </div>`;
    grid.appendChild(card);
  });
}

function openConfirmModal(gameId, isQrDirect = false) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return;
  _pendingGameId  = gameId;
  _isQrDirectVote = isQrDirect;
  document.getElementById('modal-emoji').textContent       = game.emoji;
  document.getElementById('modal-game-name').textContent   = game.title;
  document.getElementById('modal-game-name-2').textContent = game.title;
  const qrNote = document.getElementById('modal-qr-note');
  isQrDirect ? qrNote.classList.remove('hidden') : qrNote.classList.add('hidden');
  document.getElementById('confirm-modal').classList.remove('hidden');
}

document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.add('hidden');
  _pendingGameId = null;
  showToast('Voting dibatalkan.', 'info');
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
  if (!_pendingGameId) return;
  const gameIdToVote = _pendingGameId;
  _pendingGameId = null;
  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.disabled = true;
  confirmBtn.querySelector('span').textContent = '⏳ Menyimpan…';
  document.getElementById('confirm-modal').classList.add('hidden');
  await executeVote(gameIdToVote);
  confirmBtn.disabled = false;
  confirmBtn.querySelector('span').textContent = '✅ Ya, Konfirmasi';
});

async function executeVote(gameId) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return;
  document.querySelectorAll('.vote-btn').forEach(b => b.disabled = true);
  showToast('Merekam suaramu…', 'info');
  const [fp, ip] = await Promise.all([getFingerprint(), getPublicIP()]);
  const { error } = await supabase.from('votes').insert({ game_id: gameId, fingerprint: fp, ip_address: ip, latitude: _userLat, longitude: _userLon });
  if (error) {
    if (error.code === '23505') {
      showToast('⚠️ Kamu sudah voting sebelumnya.', 'error');
      saveLocalVoteRecord({ gameId, gameTitle: game.title, fingerprint: fp });
      localStorage.setItem(LS_FP_PREFIX + fp, '1');
      showState('state-voted');
      return;
    }
    console.error('Supabase insert error:', error);
    showToast(`❌ Gagal menyimpan: ${error.message}`, 'error');
    document.querySelectorAll('.vote-btn').forEach(b => b.disabled = false);
    return;
  }
  const record = { gameId, gameTitle: game.title, fingerprint: fp, ip, timestamp: new Date().toISOString(), via: _isQrDirectVote ? 'qr-direct' : HAS_QR_TOKEN ? 'qr-manual' : 'security-key' };
  saveLocalVoteRecord(record);
  localStorage.setItem(LS_FP_PREFIX + fp, '1');
  launchConfetti();
  showToast(`🎉 Voted untuk "${game.title}"!`, 'success');
  showState('state-voted');
}

async function checkAlreadyVoted() {
  const stored = getLocalVoteRecord();
  if (stored) return true;
  const fp = await getFingerprint();
  if (localStorage.getItem(LS_FP_PREFIX + fp) === '1') return true;
  localStorage.setItem(LS_FP_PREFIX + fp, '0');
  return false;
}

function setupSecurityGate(onSuccess) {
  const submitBtn = document.getElementById('sg-submit');
  const input     = document.getElementById('sg-input');
  const errMsg    = document.getElementById('sg-error');
  const attempt = () => {
    const val = input.value.trim().toUpperCase();
    if (val === SECURITY_KEY) {
      input.classList.remove('error');
      errMsg.classList.remove('visible');
      showToast('🔓 Kunci diterima!', 'success');
      onSuccess();
    } else {
      input.classList.add('error');
      errMsg.classList.add('visible');
      input.value = '';
      input.focus();
      showToast('Kunci keamanan salah.', 'error');
    }
  };
  submitBtn.addEventListener('click', attempt);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attempt();
    errMsg.classList.remove('visible');
    input.classList.remove('error');
  });
}

function bootVotingUI(distM) {
  document.getElementById('loc-pill-text').textContent = `${Math.round(distM)} m dari venue ✓`;
  const votedRecord = getLocalVoteRecord();
  if (HAS_QR_TOKEN) {
    renderGames(votedRecord ? votedRecord.gameId : null);
    showState('state-voting');
    if (QR_GAME_ID && !votedRecord) {
      setTimeout(() => {
        const targetCard = document.getElementById(`game-card-${QR_GAME_ID}`);
        if (targetCard) { targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => openConfirmModal(QR_GAME_ID, true), 500); }
        else { openConfirmModal(QR_GAME_ID, true); }
      }, 400);
    }
  } else {
    showState('state-security');
    setupSecurityGate(() => {
      renderGames(votedRecord ? votedRecord.gameId : null);
      showState('state-voting');
      if (QR_GAME_ID && !votedRecord) {
        setTimeout(() => {
          const targetCard = document.getElementById(`game-card-${QR_GAME_ID}`);
          if (targetCard) { targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => openConfirmModal(QR_GAME_ID, false), 500); }
          else { openConfirmModal(QR_GAME_ID, false); }
        }, 300);
      }
    });
  }
}

window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  window.scrollY > 50 ? nav.classList.add('scrolled') : nav.classList.remove('scrolled');
}, { passive: true });

const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.1 });
document.querySelectorAll('.fade-in-up').forEach(el => io.observe(el));

(async () => {
  showState('state-loading');
  if (!navigator.geolocation) {
    document.getElementById('blocked-msg').textContent = 'Browser kamu tidak mendukung geolokasi. Gunakan browser modern di venue acara.';
    showState('state-blocked');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      _userLat = pos.coords.latitude;
      _userLon = pos.coords.longitude;
      const dist = haversineM(_userLat, _userLon, TARGET_LAT, TARGET_LON);
      if (dist > MAX_RADIUS_M) {
        document.getElementById('blocked-msg').innerHTML = `Kamu berada sejauh <strong style="color:var(--lime)">${Math.round(dist).toLocaleString()} m</strong> dari <strong>Mal Ciputra Cibubur</strong>.<br>Voting memerlukan kehadiran dalam radius 1 km dari venue.`;
        showState('state-blocked');
        return;
      }
      const alreadyVoted = await checkAlreadyVoted();
      if (alreadyVoted) { showState('state-voted'); return; }
      bootVotingUI(dist);
    },
    (err) => {
      const msgs = { [GeolocationPositionError.PERMISSION_DENIED]: 'Akses lokasi ditolak. Mohon izinkan akses lokasi di venue acara.', [GeolocationPositionError.POSITION_UNAVAILABLE]: 'Informasi lokasi tidak tersedia. Aktifkan GPS dan coba lagi.', [GeolocationPositionError.TIMEOUT]: 'Permintaan lokasi timeout. Refresh halaman dan coba lagi.' };
      document.getElementById('blocked-msg').textContent = msgs[err.code] || 'Terjadi error lokasi yang tidak diketahui.';
      showState('state-blocked');
    },
    { enableHighAccuracy: true, timeout: 14000, maximumAge: 0 }
  );
})();
