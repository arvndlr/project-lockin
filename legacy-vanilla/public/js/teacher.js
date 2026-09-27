(async function () {
  const user = await requireRole("teacher");
  document.getElementById("who").textContent = user.name;
  const socket = io();

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 440;
      osc.type = "square";
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 500);
    } catch (e) {}
  }

  function labelForType(type) {
    return {
      deposit: "Deposited phone",
      retrieve: "Retrieved phone",
      intrusion: "⚠ Intrusion",
      override: "Teacher override",
    }[type] || type;
  }

  async function renderPeriodBanner() {
    const overview = await api("GET", "/api/teacher/overview");
    const el = document.getElementById("period-banner");
    if (overview.myActiveSchedule) {
      el.innerHTML = `<strong>Active period:</strong> ${overview.myActiveSchedule.sectionLabel}
        (${overview.myActiveSchedule.startTime}–${overview.myActiveSchedule.endTime}) — you have locker control now.`;
    } else {
      el.innerHTML = `<span class="hint">No active class period right now — locker override is disabled.</span>`;
    }
    renderSlots(overview.slots, !!overview.myActiveSchedule);
  }

  function renderSlots(slots, canOverride) {
    const grid = document.getElementById("slot-grid");
    grid.innerHTML = slots
      .map(
        (s) => `
        <div class="slot-card ${s.occupied ? "occupied" : "vacant"}">
          <div class="slot-label">${s.label}</div>
          <div class="slot-status">${s.occupied ? "Occupied" : "Vacant"}</div>
          <div class="slot-occupant">${s.occupantName || "&nbsp;"}</div>
          <div style="margin-top:8px; display:flex; gap:4px; justify-content:center;">
            <button class="secondary" style="padding:4px 8px; font-size:11px;" ${canOverride ? "" : "disabled"}
              onclick="doOverride('${s.id}','unlock')">Unlock</button>
            <button class="secondary" style="padding:4px 8px; font-size:11px;" ${canOverride ? "" : "disabled"}
              onclick="doOverride('${s.id}','lock')">Lock</button>
          </div>
        </div>`
      )
      .join("");
  }

  window.doOverride = async (slotId, action) => {
    try {
      await api("POST", "/api/teacher/override", { slotId, action });
    } catch (err) {
      alert(err.message);
    }
  };

  async function renderIntrusions() {
    const logs = await api("GET", "/api/teacher/logs");
    const intrusions = logs.filter((l) => l.type === "intrusion");
    const body = document.getElementById("intrusion-body");
    body.innerHTML = intrusions.length
      ? intrusions
          .map(
            (l) => `<tr>
              <td>${new Date(l.timestamp).toLocaleString("en-PH")}</td>
              <td>${l.slotLabel || "-"}</td>
              <td>${l.note || l.studentName}</td>
              <td>${
                l.acknowledged
                  ? `<span class="pill muted">Acknowledged</span>`
                  : `<button class="secondary" style="padding:4px 8px;font-size:11px;" onclick="ackLog('${l.id}')">Acknowledge</button>`
              }</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="hint">No intrusions logged.</td></tr>`;

    const logBody = document.getElementById("log-body");
    logBody.innerHTML = logs
      .slice(0, 50)
      .map(
        (l) => `<tr>
          <td>${new Date(l.timestamp).toLocaleString("en-PH")}</td>
          <td>${labelForType(l.type)}</td>
          <td>${l.studentName || "-"}</td>
          <td>${l.slotLabel || "-"}</td>
        </tr>`
      )
      .join("");
  }

  window.ackLog = async (id) => {
    await api("POST", `/api/teacher/logs/${id}/ack`);
    renderIntrusions();
  };

  socket.on("slots:update", (slots) => {
    api("GET", "/api/teacher/overview").then((o) => renderSlots(slots, !!o.myActiveSchedule));
  });
  socket.on("log:new", (entry) => {
    if (entry.type === "intrusion") {
      beep();
      const el = document.getElementById("alert-area");
      const div = document.createElement("div");
      div.className = "banner alert";
      div.textContent = `🚨 Intrusion — ${entry.slotLabel}: ${entry.note || entry.studentName}`;
      el.innerHTML = "";
      el.appendChild(div);
      setTimeout(() => { if (el.contains(div)) el.removeChild(div); }, 8000);
    }
    renderIntrusions();
  });
  socket.on("log:update", renderIntrusions);

  await renderPeriodBanner();
  await renderIntrusions();
  setInterval(renderPeriodBanner, 20000);
})();
