import path from "node:path";
import fs from "node:fs";
import express from "express";
import http from "node:http";
import cors from "cors";
import session from "express-session";
import { Server } from "socket.io";
import pgSession from "connect-pg-simple";
import { Pool } from "pg";

import { attachUser } from "./auth";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";
import { studentRouter } from "./routes/student.routes";
import { teacherRouter } from "./routes/teacher.routes";
import { kioskRouter } from "./routes/kiosk.routes";
import { setIo } from "./socket";
import { slotOverview } from "./lib/locker";

const PORT = Number(process.env.PORT || 4000);
const NODE_ENV = process.env.NODE_ENV || "development";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const SESSION_SECRET = process.env.SESSION_SECRET || "lockin-dev-secret-change-me";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Check your .env file.");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: NODE_ENV === "production" ? undefined : { origin: CLIENT_ORIGIN, credentials: true },
});
setIo(io);

app.set("trust proxy", 1);
app.use(express.json());

if (NODE_ENV !== "production") {
  app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
}

const pgPool = new Pool({ connectionString: DATABASE_URL });
const PgStore = pgSession(session);

app.use(
  session({
    store: new PgStore({ pool: pgPool, tableName: "session", createTableIfMissing: true }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: NODE_ENV === "production" && process.env.COOKIE_SECURE === "true",
    },
  })
);

app.use(attachUser);

app.use("/api", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/student", studentRouter);
app.use("/api/teacher", teacherRouter);
app.use("/api/kiosk", kioskRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

// In production the React app is built into client/dist and served by this
// same server, so the whole thing ships as one container.
const clientDist = path.join(__dirname, "..", "public");
if (NODE_ENV === "production" && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

io.on("connection", (socket) => {
  slotOverview().then((overview) => socket.emit("slots:update", overview));
});

server.listen(PORT, () => {
  console.log(`Project LockIn API listening on http://localhost:${PORT} [${NODE_ENV}]`);
});
