const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function newQrToken() {
  return crypto.randomBytes(9).toString("base64url");
}

function seed() {
  const teacherId = newId("usr");
  const adminId = newId("usr");
  const slotIds = Array.from({ length: 6 }, () => newId("slot"));
  const scheduleId = newId("sch");

  const store = {
    users: [
      {
        id: adminId,
        role: "admin",
        name: "System Administrator",
        username: "admin",
        passwordHash: bcrypt.hashSync("admin123", 8),
        createdAt: Date.now(),
      },
      {
        id: teacherId,
        role: "teacher",
        name: "Ms. Dyrelle Dominique Malunes",
        username: "teacher1",
        passwordHash: bcrypt.hashSync("teacher123", 8),
        createdAt: Date.now(),
      },
    ],
    slots: slotIds.map((id, i) => ({
      id,
      label: `Locker ${String(i + 1).padStart(2, "0")}`,
      qrToken: newQrToken(),
      createdAt: Date.now(),
    })),
    schedules: [
      {
        id: scheduleId,
        teacherId,
        sectionLabel: "STEM 12 - Ephesians",
        days: [0, 1, 2, 3, 4, 5, 6], // demo default: active every day so it's usable immediately
        startTime: "07:00",
        endTime: "18:00",
        createdAt: Date.now(),
      },
    ],
    logs: [],
  };

  const demoStudents = [
    "Manguiat, John Gabriel G.",
    "Candaza, Prince Abrielle",
    "Caraig, Kevin Lester G.",
  ];
  demoStudents.forEach((name, i) => {
    store.users.push({
      id: newId("usr"),
      role: "student",
      name,
      username: `student${i + 1}`,
      passwordHash: bcrypt.hashSync("student123", 8),
      qrToken: newQrToken(),
      slotId: slotIds[i],
      scheduleId,
      createdAt: Date.now(),
    });
  });

  return store;
}

let cache = null;

function load() {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    cache = seed();
    save(cache);
  } else {
    cache = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  }
  return cache;
}

function save(store) {
  cache = store;
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

function get() {
  return load();
}

function persist() {
  save(cache);
}

module.exports = { get, persist, newId, newQrToken };
