(async function () {
  const user = await requireRole("student");
  document.getElementById("who").textContent = user.name;

  async function refresh() {
    const data = await api("GET", "/api/student/me");
    document.getElementById("qr-image").src = data.qrImage;
    document.getElementById("student-name").textContent = data.name;
    document.getElementById("slot-label").textContent = data.slotLabel
      ? `Assigned locker: ${data.slotLabel}`
      : "No locker assigned yet — see the admin.";
    document.getElementById("schedule-label").textContent = `Schedule: ${data.scheduleLabel}`;

    const pill = document.getElementById("status-pill");
    if (!data.accessActive) {
      pill.className = "pill muted";
      pill.textContent = "Locker access closed right now";
    } else if (data.phoneDeposited) {
      pill.className = "pill ok";
      pill.textContent = "Your phone is deposited";
    } else {
      pill.className = "pill warn";
      pill.textContent = "Your phone is not deposited";
    }

    const body = document.getElementById("log-body");
    body.innerHTML = data.logs
      .map(
        (l) => `<tr>
          <td>${new Date(l.timestamp).toLocaleString("en-PH")}</td>
          <td>${labelForType(l.type)}</td>
          <td>${l.slotLabel || "-"}</td>
        </tr>`
      )
      .join("") || `<tr><td colspan="3" class="hint">No activity yet.</td></tr>`;
  }

  function labelForType(type) {
    return { deposit: "Deposited phone", retrieve: "Retrieved phone", intrusion: "⚠ Flagged / mismatch", override: "Teacher override" }[type] || type;
  }

  await refresh();
  setInterval(refresh, 15000);
})();
