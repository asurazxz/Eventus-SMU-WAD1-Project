// QR Check-In utilities
// Depends on globals injected by scan.ejs:
// EVENT_ID, currentCheckedIn (let), totalRsvpsJs

// Toast
function showToast(message, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// Sound + Vibration
function playScanSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function vibrateDevice() {
  if ('vibrate' in navigator) navigator.vibrate([80, 30, 80]);
}

// Stats counter
function updateStatsCounters() {
  currentCheckedIn++;
  const pct = totalRsvpsJs > 0 ? Math.round(currentCheckedIn / totalRsvpsJs * 100) : 0;
  const h2 = document.getElementById('stat-checkedin');
  if (h2) h2.textContent = currentCheckedIn + '/' + totalRsvpsJs;
  const pctEl = document.getElementById('progress-pct');
  if (pctEl) pctEl.textContent = pct + '%';
  const barEl = document.getElementById('progress-bar');
  if (barEl) barEl.style.width = pct + '%';
}

// Table row helpers
function statusPill(status) {
  return '<span>' + status + '</span>';
}

function actionBtn(status, userId) {
  if (status === 'Checked-In') {
    return '<button type="button" class="js-edit-time-btn" data-user-id="' + userId + '">Edit Time</button> ' +
           '<button type="button" class="js-withdraw-btn" data-user-id="' + userId + '">Withdraw</button>';
  }
  const rsvpLabel     = status === 'Waitlist' ? '↑ Confirm' : '→ Waitlist';
  const newRsvpStatus = status === 'Waitlist' ? 'confirmed' : 'waitlist';
  return '<button type="button" class="js-rsvp-btn" data-user-id="' + userId + '" data-new-status="' + newRsvpStatus + '">' + rsvpLabel + '</button> ' +
         '<button type="button" class="js-checkin-btn" data-user-id="' + userId + '">Check In</button>';
}

function updateTableRow(userId, checkedInAt) {
  const row = document.querySelector('tr[data-user-id="' + userId + '"]');
  if (!row) return;
  row.dataset.status = 'Checked-In';
  // Store the ISO string so startEditTime and cancelEditTime can read it for pre-filling
  row.dataset.checkinIso = new Date(checkedInAt).toISOString();
  const timeStr = new Date(checkedInAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const timeTd = row.querySelector('[data-col="time"]');
  if (timeTd) timeTd.textContent = timeStr;
  const statusTd = row.querySelector('[data-col="status"]');
  if (statusTd) statusTd.innerHTML = statusPill('Checked-In');
  const actionTd = row.querySelector('[data-col="action"]');
  if (actionTd) actionTd.innerHTML = actionBtn('Checked-In', userId);
}

// Confetti on 100%
function checkConfetti() {
  if (totalRsvpsJs > 0 && currentCheckedIn >= totalRsvpsJs && typeof confetti === 'function') {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }
}

function updateAfterCheckin(data) {
  showToast('Checked in: ' + data.name, 'success');
  playScanSound();
  vibrateDevice();
  updateStatsCounters();
  updateTableRow(data.userId, data.checkedInAt);
  checkConfetti();
}

// Table button delegation
const withdrawTimers = {};

document.getElementById('rsvp-tbody').addEventListener('click', function(e) {
  const cb = e.target.closest('.js-checkin-btn');
  if (cb) { cb.disabled = true; cb.textContent = '...'; submitManualCheckin(cb.dataset.userId, cb); return; }
  const wb = e.target.closest('.js-withdraw-btn');
  if (wb) { initiateWithdraw(wb.dataset.userId, wb); return; }
  const eb = e.target.closest('.js-edit-time-btn');
  if (eb) { startEditTime(eb.dataset.userId); return; }
  const rb = e.target.closest('.js-rsvp-btn');
  if (rb) { submitRsvpUpdate(rb.dataset.userId, rb.dataset.newStatus, rb); return; }
});

function initiateWithdraw(userId, btn) {
  if (withdrawTimers[userId]) {
    clearTimeout(withdrawTimers[userId]);
    delete withdrawTimers[userId];
    submitWithdraw(userId, btn);
    return;
  }
  btn.textContent = 'Sure?';
  withdrawTimers[userId] = setTimeout(() => {
    btn.textContent = 'Withdraw';
    delete withdrawTimers[userId];
  }, 3000);
}

async function submitWithdraw(userId, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    const res  = await fetch('/checkin/' + EVENT_ID + '/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Withdrawn: ' + data.name, 'info');
      updateAfterWithdraw(userId);
    } else {
      showToast(data.message || 'Withdraw failed.', 'error');
      btn.disabled = false; btn.textContent = 'Withdraw';
    }
  } catch(e) {
    showToast('Network error.', 'error');
    btn.disabled = false; btn.textContent = 'Withdraw';
  }
}

function updateAfterWithdraw(userId) {
  currentCheckedIn = Math.max(0, currentCheckedIn - 1);
  const pct = totalRsvpsJs > 0 ? Math.round(currentCheckedIn / totalRsvpsJs * 100) : 0;
  const h2 = document.getElementById('stat-checkedin');
  if (h2) h2.textContent = currentCheckedIn + '/' + totalRsvpsJs;
  const pctEl = document.getElementById('progress-pct');
  if (pctEl) pctEl.textContent = pct + '%';
  const barEl = document.getElementById('progress-bar');
  if (barEl) barEl.style.width = pct + '%';

  const row = document.querySelector('tr[data-user-id="' + userId + '"]');
  if (!row) return;
  row.dataset.status = 'Pending';
  const timeTd = row.querySelector('[data-col="time"]');
  if (timeTd) timeTd.textContent = '—';
  const statusTd = row.querySelector('[data-col="status"]');
  if (statusTd) statusTd.innerHTML = statusPill('Pending');
  const actionTd = row.querySelector('[data-col="action"]');
  if (actionTd) actionTd.innerHTML = actionBtn('Pending', userId);
  applyFilters();
}

// Edit check-in time
function startEditTime(userId) {
  const row = document.querySelector('tr[data-user-id="' + userId + '"]');
  if (!row) return;
  const isoTime = row.dataset.checkinIso || '';
  let timeVal = '';
  if (isoTime) {
    const d = new Date(isoTime);
    timeVal = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  const timeTd = row.querySelector('[data-col="time"]');
  if (timeTd) timeTd.innerHTML = '<input type="time" id="edit-time-' + userId + '" value="' + timeVal + '">';
  const actionTd = row.querySelector('[data-col="action"]');
  if (actionTd) actionTd.innerHTML =
    '<button type="button" onclick="saveEditTime(\'' + userId + '\')">Save</button> ' +
    '<button type="button" onclick="cancelEditTime(\'' + userId + '\')">Cancel</button>';
}

async function saveEditTime(userId) {
  const input = document.getElementById('edit-time-' + userId);
  if (!input || !input.value) { showToast('Please select a time.', 'error'); return; }
  const row = document.querySelector('tr[data-user-id="' + userId + '"]');
  const base = new Date(row.dataset.checkinIso || new Date().toISOString());
  const [hh, mm] = input.value.split(':');
  base.setHours(parseInt(hh), parseInt(mm), 0, 0);
  const newIso = base.toISOString();
  try {
    const res  = await fetch('/checkin/' + EVENT_ID + '/update-time', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ userId, checkedInAt: newIso }),
    });
    const data = await res.json();
    if (data.success) {
      row.dataset.checkinIso = newIso;
      const timeTd = row.querySelector('[data-col="time"]');
      if (timeTd) timeTd.textContent = new Date(newIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const actionTd = row.querySelector('[data-col="action"]');
      if (actionTd) actionTd.innerHTML = actionBtn('Checked-In', userId);
      showToast('Check-in time updated.', 'success');
    } else {
      showToast(data.message || 'Update failed.', 'error');
    }
  } catch(e) { showToast('Network error.', 'error'); }
}

function cancelEditTime(userId) {
  const row = document.querySelector('tr[data-user-id="' + userId + '"]');
  if (!row) return;
  const timeTd = row.querySelector('[data-col="time"]');
  if (timeTd) timeTd.textContent = row.dataset.checkinIso
    ? new Date(row.dataset.checkinIso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '—';
  const actionTd = row.querySelector('[data-col="action"]');
  if (actionTd) actionTd.innerHTML = actionBtn('Checked-In', userId);
}

// RSVP status update
async function submitRsvpUpdate(userId, newStatus, btn) {
  btn.disabled = true; btn.textContent = '...';
  try {
    const res  = await fetch('/checkin/' + EVENT_ID + '/update-rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ userId, status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      const displayStatus = newStatus === 'confirmed' ? 'Pending' : 'Waitlist';
      const row = document.querySelector('tr[data-user-id="' + userId + '"]');
      if (row) {
        row.dataset.status = displayStatus;
        const statusTd = row.querySelector('[data-col="status"]');
        if (statusTd) statusTd.innerHTML = statusPill(displayStatus);
        const actionTd = row.querySelector('[data-col="action"]');
        if (actionTd) actionTd.innerHTML = actionBtn(displayStatus, userId);
      }
      showToast('RSVP status updated.', 'info');
      applyFilters();
    } else {
      showToast(data.message || 'Update failed.', 'error');
      btn.disabled = false;
      btn.textContent = newStatus === 'waitlist' ? '→ Waitlist' : '↑ Confirm';
    }
  } catch(e) {
    showToast('Network error.', 'error');
    btn.disabled = false;
    btn.textContent = newStatus === 'waitlist' ? '→ Waitlist' : '↑ Confirm';
  }
}

async function submitManualCheckin(userId, btn) {
  try {
    const res  = await fetch('/checkin/' + EVENT_ID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (data.success) {
      updateAfterCheckin(data);
    } else {
      showToast(data.message || 'Check-in failed.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Check In'; }
    }
  } catch(e) {
    showToast('Network error. Please try again.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Check In'; }
  }
}

// Manual form (name/email)
document.getElementById('manual-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const identifier = document.getElementById('manual-identifier').value.trim();
  if (!identifier) { showToast('Please enter a name or email.', 'error'); return; }
  const submitBtn = this.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '...'; }
  try {
    const res  = await fetch('/checkin/' + EVENT_ID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (data.success) {
      updateAfterCheckin(data);
      document.getElementById('manual-identifier').value = '';
    } else {
      showToast(data.message || 'Check-in failed.', 'error');
    }
  } catch(e) {
    showToast('Network error. Please try again.', 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Check In'; }
  }
});

// Search + filter + pagination
let searchDebounceTimer = null;
let currentFilter = 'all';
let currentPage   = 1;
const itemsPerPage = 5;

document.getElementById('search-input').addEventListener('input', function() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => { currentPage = 1; applyFilters(); }, 250);
});

document.getElementById('filter-tabs').addEventListener('click', function(e) {
  const tab = e.target.closest('.ftab');
  if (!tab) return;
  document.querySelectorAll('.ftab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentFilter = tab.dataset.filter;
  currentPage = 1;
  applyFilters();
});

function applyFilters() {
  const q    = (document.getElementById('search-input').value || '').trim().toLowerCase();
  const rows = document.querySelectorAll('#rsvp-tbody tr[data-user-id]');
  const matched = [];

  rows.forEach(row => {
    const name   = (row.dataset.name  || '').toLowerCase();
    const email  = (row.dataset.email || '').toLowerCase();
    const status = row.dataset.status || '';
    const matchSearch = !q || name.includes(q) || email.includes(q);
    const matchFilter = currentFilter === 'all' || status === currentFilter;
    row.style.display = 'none';
    if (matchSearch && matchFilter) matched.push(row);
  });

  const totalPages = Math.max(1, Math.ceil(matched.length / itemsPerPage));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * itemsPerPage;
  matched.forEach((row, i) => {
    row.style.display = (i >= start && i < start + itemsPerPage) ? '' : 'none';
  });

  const rangeEl = document.getElementById('showing-range');
  const totalEl = document.getElementById('showing-total');
  if (rangeEl) rangeEl.textContent = matched.length === 0 ? '0' : (start + 1) + '–' + Math.min(start + itemsPerPage, matched.length);
  if (totalEl) totalEl.textContent = matched.length;

  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const container = document.getElementById('pagination-controls');
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const btn = (label, page, disabled) =>
    '<button onclick="goToPage(' + page + ')" ' + (disabled ? 'disabled' : '') + '>' + label + '</button> ';
  let html = btn('←', currentPage - 1, currentPage === 1);
  for (let i = 1; i <= totalPages; i++) html += btn(i, i, false);
  html += btn('→', currentPage + 1, currentPage === totalPages);
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  applyFilters();
}

applyFilters();

// QR Scanner
let scanning = false;
let stream = null;
let scanLineY = 0;

function startQrScanner() {
  if (scanning) return stopQrScanner();
  const video   = document.getElementById('qr-video');
  const preview = document.getElementById('qr-preview');
  const overlay = document.getElementById('qr-overlay');
  const label   = document.getElementById('scan-btn-label');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function(s) {
      stream = s;
      video.srcObject = stream;
      video.style.display = 'block';
      if (preview) preview.style.display = 'none';
      if (overlay) overlay.style.display = 'block';
      if (label)   label.textContent = 'Stop Scanning';
      scanning = true;
      scanLineY = 0;
      requestAnimationFrame(scanFrame);
      requestAnimationFrame(drawOverlay);
    })
    .catch(function() {
      showToast('Camera access denied or unavailable.', 'error');
    });
}

function stopQrScanner() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  const video   = document.getElementById('qr-video');
  const preview = document.getElementById('qr-preview');
  const overlay = document.getElementById('qr-overlay');
  const label   = document.getElementById('scan-btn-label');
  video.style.display = 'none';
  if (preview) preview.style.display = 'flex';
  if (overlay) overlay.style.display = 'none';
  if (label)   label.textContent = 'Scan QR Code';
  scanning = false;
  stream = null;
}

function scanFrame() {
  if (!scanning) return;
  const video = document.getElementById('qr-video');
  if (video.readyState !== video.HAVE_ENOUGH_DATA) { requestAnimationFrame(scanFrame); return; }
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  if (code) { stopQrScanner(); submitQrCheckin(code.data); }
  else requestAnimationFrame(scanFrame);
}

function drawOverlay() {
  if (!scanning) return;
  const video  = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-overlay');
  if (!canvas || video.readyState < video.HAVE_ENOUGH_DATA) { requestAnimationFrame(drawOverlay); return; }
  if (canvas.width !== video.videoWidth)   canvas.width  = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  scanLineY += 2.5;
  if (scanLineY > canvas.height) scanLineY = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, scanLineY);
  ctx.lineTo(canvas.width, scanLineY);
  ctx.stroke();
  requestAnimationFrame(drawOverlay);
}

async function submitQrCheckin(qrValue) {
  showQrStatus('Processing...', 'neutral');
  try {
    const res  = await fetch('/checkin/' + EVENT_ID + '/qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrValue }),
    });
    const data = await res.json();
    if (data.success) {
      showQrStatus('Checked in: ' + data.name, 'success');
      updateAfterCheckin(data);
    } else {
      showQrStatus(data.message, 'error');
    }
  } catch(e) {
    showQrStatus('Network error. Please try again.', 'error');
  }
}

function showQrStatus(msg, type) {
  const el = document.getElementById('qr-status');
  el.textContent = msg;
  el.className = 'qr-status-box' + (type === 'success' ? ' status-success' : type === 'error' ? ' status-error' : '');
  el.style.display = 'block';
}
