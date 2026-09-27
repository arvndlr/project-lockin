(async function () {
  const user = await requireRole("admin");
  document.getElementById("who").textContent = user.name;

  // ---- Tabs ----
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let cache = { users: [], slots: [], schedules: [] };

  async function loadAll() {
    const [users, slots, schedules] = await Promise.all([
      api("GET", "/api/admin/users"),
      api("GET", "/api/admin/slots"),
      api("GET", "/api/admin/schedules"),
    ]);
    cache = { users, slots, schedules };
    renderUsers();
    renderSlots();
    renderSchedules();
    populateSelects();
  }

  function populateSelects() {
    const slotSelect = document.getElementById("u-slot");
    slotSelect.innerHTML =
      `<option value="">Auto-assign next available</option>` +
      cache.slots.map((s) => `<option value="${s.id}">${s.label}${s.occupied ? " (occupied)" : ""}</option>`).join("");

    const scheduleSelect = document.getElementById("u-schedule");
    scheduleSelect.innerHTML =
      `<option value="">Always available</option>` +
      cache.schedules.map((s) => `<option value="${s.id}">${s.sectionLabel}</option>`).join("");

    const teacherSelect = document.getElementById("sc-teacher");
    const teachers = cache.users.filter((u) => u.role === "teacher");
    teacherSelect.innerHTML = teachers.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  }

  // ---- Users ----
  document.getElementById("u-role").addEventListener("change", (e) => {
    document.getElementById("student-fields").style.display = e.target.value === "student" ? "block" : "none";
  });

  document.getElementById("user-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("user-error");
    errorEl.textContent = "";
    try {
      await api("POST", "/api/admin/users", {
        role: document.getElementById("u-role").value,
        name: document.getElementById("u-name").value.trim(),
        username: document.getElementById("u-username").value.trim(),
        password: document.getElementById("u-password").value,
        slotId: document.getElementById("u-slot").value || null,
        scheduleId: document.getElementById("u-schedule").value || null,
      });
      e.target.reset();
      document.getElementById("student-fields").style.display = "block";
      await loadAll();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  function renderUsers() {
    const body = document.getElementById("user-body");
    body.innerHTML = cache.users
      .map((u) => {
        const slot = cache.slots.find((s) => s.id === u.slotId);
        const schedule = cache.schedules.find((s) => s.id === u.scheduleId);
        const slotCell =
          u.role === "student"
            ? `<select onchange="updateStudent('${u.id}','slotId',this.value)">
                 <option value="">— none —</option>
                 ${cache.slots.map((s) => `<option value="${s.id}" ${s.id === u.slotId ? "selected" : ""}>${s.label}</option>`).join("")}
               </select>`
            : "-";
        const scheduleCell =
          u.role === "student"
            ? `<select onchange="updateStudent('${u.id}','scheduleId',this.value)">
                 <option value="">Always available</option>
                 ${cache.schedules.map((s) => `<option value="${s.id}" ${s.id === u.scheduleId ? "selected" : ""}>${s.sectionLabel}</option>`).join("")}
               </select>`
            : "-";
        return `<tr>
          <td>${u.name}</td>
          <td><span class="pill muted">${u.role}</span></td>
          <td>${u.username}</td>
          <td>${slotCell}</td>
          <td>${scheduleCell}</td>
          <td><button class="danger" style="padding:4px 8px;font-size:11px;" onclick="deleteUser('${u.id}')">Delete</button></td>
        </tr>`;
      })
      .join("");
  }

  window.updateStudent = async (id, field, value) => {
    try {
      await api("PATCH", `/api/admin/users/${id}`, { [field]: value || null });
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  window.deleteUser = async (id) => {
    if (!confirm("Delete this user?")) return;
    try {
      await api("DELETE", `/api/admin/users/${id}`);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // ---- Slots ----
  document.getElementById("slot-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("slot-error");
    errorEl.textContent = "";
    try {
      await api("POST", "/api/admin/slots", { label: document.getElementById("s-label").value.trim() });
      e.target.reset();
      await loadAll();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  function renderSlots() {
    const grid = document.getElementById("slot-grid-admin");
    grid.innerHTML = cache.slots
      .map(
        (s) => `
        <div class="slot-card ${s.occupied ? "occupied" : "vacant"}">
          <img src="${s.qrImage}" style="width:90px;height:90px;background:white;border-radius:6px;padding:4px;" alt="QR for ${s.label}" />
          <div class="slot-label">${s.label}</div>
          <div class="slot-status">${s.occupied ? "Occupied" : "Vacant"}</div>
          <div class="slot-occupant">${s.occupantName || "&nbsp;"}</div>
          <button class="danger" style="margin-top:6px;padding:4px 8px;font-size:11px;" onclick="deleteSlot('${s.id}')">Delete</button>
        </div>`
      )
      .join("");
  }

  window.deleteSlot = async (id) => {
    if (!confirm("Delete this locker?")) return;
    try {
      await api("DELETE", `/api/admin/slots/${id}`);
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  // ---- Schedules ----
  let editingScheduleId = null;

  function setScheduleDays(days) {
    document.querySelectorAll("#sc-days input").forEach((c) => {
      c.checked = days.includes(Number(c.value));
    });
  }

  function cancelEditSchedule() {
    editingScheduleId = null;
    document.getElementById("schedule-form").reset();
    setScheduleDays([1, 2, 3, 4, 5]);
    document.getElementById("schedule-form-title").textContent = "Add Schedule";
    document.getElementById("schedule-submit-btn").textContent = "Create Schedule";
    document.getElementById("schedule-cancel-btn").style.display = "none";
  }

  window.startEditSchedule = (id) => {
    const s = cache.schedules.find((x) => x.id === id);
    if (!s) return;
    editingScheduleId = id;
    document.getElementById("sc-teacher").value = s.teacherId;
    document.getElementById("sc-label").value = s.sectionLabel;
    setScheduleDays(s.days);
    document.getElementById("sc-start").value = s.startTime;
    document.getElementById("sc-end").value = s.endTime;
    document.getElementById("schedule-form-title").textContent = `Edit Schedule — ${s.sectionLabel}`;
    document.getElementById("schedule-submit-btn").textContent = "Save Changes";
    document.getElementById("schedule-cancel-btn").style.display = "inline-block";
    document.getElementById("schedule-form").scrollIntoView({ behavior: "smooth", block: "center" });
  };

  document.getElementById("schedule-cancel-btn").addEventListener("click", cancelEditSchedule);

  document.getElementById("schedule-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("schedule-error");
    errorEl.textContent = "";
    const days = Array.from(document.querySelectorAll("#sc-days input:checked")).map((c) => c.value);
    const payload = {
      teacherId: document.getElementById("sc-teacher").value,
      sectionLabel: document.getElementById("sc-label").value.trim(),
      days,
      startTime: document.getElementById("sc-start").value,
      endTime: document.getElementById("sc-end").value,
    };
    try {
      if (editingScheduleId) {
        await api("PATCH", `/api/admin/schedules/${editingScheduleId}`, payload);
      } else {
        await api("POST", "/api/admin/schedules", payload);
      }
      cancelEditSchedule();
      await loadAll();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  function renderSchedules() {
    const body = document.getElementById("schedule-body");
    body.innerHTML = cache.schedules
      .map(
        (s) => `<tr>
          <td>${s.sectionLabel}</td>
          <td>${s.teacherName}</td>
          <td>${s.days.map((d) => dayNames[d]).join(", ")}</td>
          <td>${s.startTime}–${s.endTime}</td>
          <td>${s.activeNow ? `<span class="pill ok">Active</span>` : `<span class="pill muted">—</span>`}</td>
          <td>
            <button class="secondary" style="padding:4px 8px;font-size:11px;" onclick="startEditSchedule('${s.id}')">Edit</button>
            <button class="danger" style="padding:4px 8px;font-size:11px;" onclick="deleteSchedule('${s.id}')">Delete</button>
          </td>
        </tr>`
      )
      .join("");
  }

  window.deleteSchedule = async (id) => {
    if (!confirm("Delete this schedule?")) return;
    try {
      await api("DELETE", `/api/admin/schedules/${id}`);
      if (editingScheduleId === id) cancelEditSchedule();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  };

  await loadAll();
})();
