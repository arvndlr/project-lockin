let scanner = null;
let scanningPaused = false;
let pendingToken = null;
let pendingAction = null;

const bannerArea = document.getElementById("banner-area");
const scanView = document.getElementById("scan-view");
const confirmView = document.getElementById("confirm-view");

function beep(freq = 880, duration = 200) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, duration);
  } catch (e) {
    // Audio not available — ignore, the visual banner still shows.
  }
}

function alarmBeep() {
  beep(440, 250);
  setTimeout(() => beep(440, 250), 300);
  setTimeout(() => beep(440, 250), 600);
}

function showBanner(text, kind, ttl = 4000) {
  const div = document.createElement("div");
  div.className = `banner ${kind === "alert" ? "alert" : ""}`;
  div.textContent = text;
  bannerArea.innerHTML = "";
  bannerArea.appendChild(div);
  if (ttl) setTimeout(() => { if (bannerArea.contains(div)) bannerArea.removeChild(div); }, ttl);
}

function showConfirm(student, slot, action) {
  scanView.style.display = "none";
  confirmView.style.display = "block";
  document.getElementById("confirm-title").textContent = `Hi, ${student.name}!`;
  document.getElementById("confirm-sub").textContent =
    `${slot.label} — ${action === "deposit" ? "depositing" : "retrieving"} your phone`;
}

function backToScan() {
  confirmView.style.display = "none";
  scanView.style.display = "block";
  pendingToken = null;
  pendingAction = null;
  if (scanner && scanningPaused) {
    scanner.resume();
    scanningPaused = false;
  }
}

async function handleToken(qrToken) {
  if (scanner && !scanningPaused) {
    try { scanner.pause(true); scanningPaused = true; } catch (e) {}
  }
  try {
    const result = await api("POST", "/api/kiosk/scan", { qrToken });
    if (!result.ok) {
      if (result.intrusion) {
        alarmBeep();
        showBanner(`🚨 ${result.reason}`, "alert", 5000);
      } else {
        showBanner(result.reason, "banner", 4000);
      }
      setTimeout(backToScan, 2000);
      return;
    }
    pendingToken = qrToken;
    pendingAction = result.action;
    showConfirm(result.student, result.slot, result.action);
  } catch (err) {
    showBanner(err.message, "banner", 4000);
    setTimeout(backToScan, 2000);
  }
}

document.getElementById("btn-correct").addEventListener("click", () => confirm(true));
document.getElementById("btn-wrong").addEventListener("click", () => confirm(false));

async function confirm(correct) {
  const result = await api("POST", "/api/kiosk/confirm", {
    qrToken: pendingToken,
    action: pendingAction,
    correct,
  });
  if (correct) {
    showBanner(
      `✅ ${pendingAction === "deposit" ? "Phone deposited" : "Phone retrieved"} successfully.`,
      "banner",
      3500
    );
  } else {
    alarmBeep();
    showBanner("🚨 INTRUSION REPORTED — teacher has been notified.", "alert", 6000);
  }
  setTimeout(backToScan, 1500);
}

// ---- Camera scanner ----
async function initScanner() {
  try {
    scanner = new Html5Qrcode("qr-reader");
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        if (!scanningPaused) handleToken(decodedText.trim());
      },
      () => {} // ignore per-frame "no QR found" noise
    );
  } catch (err) {
    document.getElementById("qr-reader").innerHTML =
      `<p class="hint">Camera unavailable (${err.message || err}). Use the simulate-scan option below.</p>`;
  }
}

// ---- No-camera fallback ----
async function loadSimStudents() {
  const students = await api("GET", "/api/kiosk/students");
  const select = document.getElementById("sim-student");
  select.innerHTML = students.map((s) => `<option value="${s.qrToken}">${s.name}</option>`).join("");
}

document.getElementById("sim-scan-btn").addEventListener("click", () => {
  const token = document.getElementById("sim-student").value;
  if (token) handleToken(token);
});

initScanner();
loadSimStudents();
