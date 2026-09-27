# Project LockIn

An IoT-oriented classroom smartphone locker system for ICCBI, built as a full web
application with three roles — **Admin**, **Teacher**, and **Student** — plus a
public **Kiosk** scanning station that stands in for the physical locker's
QR scanner.

This repo is the software side of the "Project LockIn" proposal: a shared
locker bank where each student has a personal QR code, scanning it
deposits/retrieves their phone, access is restricted to scheduled class
periods, and teachers get a live dashboard with intrusion alerts. There is no
real ESP32-CAM hardware wired up yet — the kiosk uses a laptop/phone webcam
(or a manual "simulate scan" dropdown) in place of the camera module, and the
"is this really your phone?" check that a weight/photo sensor would do on
real hardware is simulated as a human confirm step.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS, React Router, Socket.IO client, `sonner` (toasts), `lucide-react` (icons), `html5-qrcode` (camera QR scanning) |
| Backend | Express + TypeScript, Prisma ORM, Socket.IO, `express-session` with a Postgres-backed session store, `bcryptjs` for password hashing, `qrcode` for generating QR images |
| Database | PostgreSQL 16 |
| Infra | Docker + Docker Compose (single `app` container serving both the API and the built React app, plus a `db` container) |

---

## Repository layout

```
project-lockin/
├── docker-compose.yml       # db + app services
├── Dockerfile                # multi-stage build: client → server → runtime
├── docker-entrypoint.sh      # runs migrations + seed, then starts the server
├── .env.example               # compose-level env vars (Postgres creds, session secret)
│
├── server/                    # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma      # data model
│   │   ├── migrations/        # SQL migration history
│   │   └── seed.ts            # demo data (skips if the DB already has users)
│   ├── src/
│   │   ├── index.ts           # app entry: middleware, sessions, sockets, static serving
│   │   ├── auth.ts            # session/role middleware, login verification
│   │   ├── socket.ts          # shared Socket.IO instance accessor
│   │   ├── lib/
│   │   │   ├── scheduling.ts  # weekly schedule + "is it active right now" logic
│   │   │   ├── locker.ts      # occupancy, scan evaluation, deposit/retrieve/intrusion
│   │   │   └── tokens.ts      # QR token generation
│   │   └── routes/
│   │       ├── auth.routes.ts
│   │       ├── admin.routes.ts
│   │       ├── teacher.routes.ts
│   │       ├── student.routes.ts
│   │       └── kiosk.routes.ts
│   └── .env.example           # local-dev DB connection (points at Docker's Postgres on 5433)
│
├── client/                    # React SPA
│   └── src/
│       ├── pages/              # LoginPage, AdminPage, TeacherPage, StudentPage, KioskPage
│       ├── components/         # AppShell (sidebar+topbar), Badge, StatCard, EmptyState, ProtectedRoute
│       ├── context/             # AuthContext, ConfirmContext (a promise-based confirm dialog)
│       └── lib/                 # api.ts (fetch wrapper), socket.ts, types.ts
│
└── legacy-vanilla/            # the original no-build vanilla JS/Express prototype (kept for reference)
```

---

## Running it

### Option A — Docker (recommended, matches production)

```bash
cp .env.example .env      # defaults are fine for local use
docker compose up -d --build
```

This builds the React app, builds the Express server, and starts two
containers: `db` (Postgres) and `app` (the API + the built SPA, served from
one process on port 4000, mapped to **http://localhost:3000**). On first
boot, `docker-entrypoint.sh` runs `prisma migrate deploy` and then the seed
script automatically — no manual setup needed.

Stop it with `docker compose down` (add `-v` to also wipe the database
volume and start completely fresh next time).

### Option B — Local development (hot reload)

Requires Node 20+ and a Postgres instance. The easiest way to get Postgres
without touching your OS install is to start just the `db` service from
Compose:

```bash
docker compose up -d db      # Postgres on localhost:5433 (not 5432, see note below)
```

Then in two terminals:

```bash
# Terminal 1 — API (http://localhost:4000)
cd server
cp .env.example .env
npm install
npx prisma migrate dev       # first time only: applies migrations + seeds
npm run dev

# Terminal 2 — React app (http://localhost:5173)
cd client
npm install
npm run dev
```

Vite's dev server proxies `/api` and `/socket.io` to `localhost:4000` (see
`client/vite.config.ts`), so open **http://localhost:5173** and everything
behaves as one app, with hot reload on both sides.

> **Why port 5433, not 5432?** The Postgres container's host port is
> remapped in `docker-compose.yml` to avoid clashing with a Postgres
> instance already installed natively on the host machine. Only the
> host-side port changes — inside Docker's network, other containers still
> reach it at `db:5432`.

---

## Demo accounts

Seeded automatically (`server/prisma/seed.ts`), safe to use for exploring
the app:

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Teacher | `teacher1` | `teacher123` |
| Student | `student1`, `student2`, `student3` | `student123` |

The seed also creates 6 lockers ("Locker 01"–"Locker 06") and one schedule
("STEM 12 - Ephesians", active every day 07:00–18:00) so the app is usable
immediately without any admin setup.

**Change these before any real deployment** — they're intentionally simple
for a school demo.

---

## How the system works

### Roles

**Admin**
- Creates Student and Teacher accounts (Users tab). Creating a student
  auto-assigns the next free locker unless you pick one manually.
- Creates lockers ("Slots") — each one gets its own unique QR code the moment
  it's created (Lockers tab).
- Creates and edits **Schedules**: a teacher, a section label, which days of
  the week, and a start/end time (Schedules tab). A schedule can be edited
  in place, not just deleted and recreated.
- Can assign the *same* locker to different students under different
  schedules (e.g. Locker 03 used by one student in the morning shift and
  another in the afternoon), by editing a student's locker/schedule directly
  in the Users table.

**Student**
- Logs in and sees nothing but their own big personal QR code (their
  identity credential — analogous to the printed QR ID card in the original
  hardware proposal), their assigned locker, their current schedule, whether
  their phone is currently deposited, and a short personal activity log.
- Does **not** interact with the kiosk while logged in as themselves — the
  QR code is what gets scanned at the physical locker station.

**Teacher**
- Sees a live locker grid (occupied/vacant, who's holding what), a
  dedicated Intrusions view with acknowledge actions, and a full history
  log — all pushed in real time over Socket.IO.
- Gets a manual lock/unlock override button per locker, but it's only
  enabled while the teacher has an **active** scheduled class period right
  now — this mirrors "the teacher only has access and control of the locker
  during their scheduled time" from the original spec.

**Kiosk** (`/kiosk`, no login — the QR code itself is the credential)
- Meant to run on a tablet/laptop mounted at the physical locker bank.
- Scans a student's personal QR via the device camera (`html5-qrcode`), or
  via a "simulate scan" dropdown if no camera is available.
- On a valid scan it shows a confirm screen ("Hi, \<name\>! Please confirm —
  is the phone in the locker actually yours?"). This confirm step stands in
  for the camera/weight-sensor comparison a real ESP32 build would do
  automatically.
  - **Yes, it's mine** → logs a deposit or retrieve (whichever direction was
    happening) and the teacher dashboard updates instantly.
  - **No, wrong phone** → logs an **intrusion**, plays an alarm sound, and
    pushes a real-time alert to every connected teacher dashboard.
- If the system detects a locker already holds a *different* student's
  phone than expected, that's auto-flagged as an intrusion immediately —
  no human confirmation needed for that case, since it's a system-detected
  anomaly rather than a visual check.

### Access control logic

- A student's locker access is only open during their assigned schedule's
  active window (or always, if no schedule is assigned). A schedule is
  "active" if today's day-of-week is included and the current time falls
  inside `[startTime, endTime)` — including windows that cross midnight
  (e.g. `23:00`–`00:00`), which are handled explicitly rather than naively
  comparing minute numbers.
- Locker **occupancy is derived from history**, not stored as separate
  state: the most recent `DEPOSIT`/`RETRIEVE` log entry for a locker tells
  you whether it currently holds a phone and whose. `INTRUSION` entries
  never change occupancy — the system doesn't trust an unconfirmed action.
- A teacher's manual override is gated the same way: it only works while
  that teacher has at least one schedule that's active right now.

### Data model (see `server/prisma/schema.prisma`)

- **User** — `role` (`ADMIN`/`TEACHER`/`STUDENT`), name, username,
  password hash. Students additionally have a `qrToken` (their scan
  credential), an optional `slotId`, and an optional `scheduleId`.
- **Slot** — a physical locker: a label and its own unique `qrToken` (used
  for admin-side identification/printing, distinct from a student's
  personal QR).
- **Schedule** — a teacher, a section label, an array of weekday numbers
  (`0`=Sunday…`6`=Saturday), and a start/end time.
- **Log** — every deposit, retrieve, intrusion, and manual override, with a
  timestamp, the student/locker/schedule involved, and an `acknowledged`
  flag for intrusions a teacher has reviewed.

---

## Real-time updates

The server keeps a single Socket.IO instance (`server/src/socket.ts`) and
emits three events from the kiosk and teacher-override routes:

- `slots:update` — full locker occupancy snapshot, broadcast after any scan
  or override.
- `log:new` — a freshly created log entry (deposit/retrieve/intrusion/
  override).
- `log:update` — a log entry changed (currently just intrusion
  acknowledgement).
- `intrusion:new` — specifically for intrusions, so the teacher UI can play
  a sound and flash a banner without filtering every `log:new` event.

The teacher dashboard listens for all of these to stay live without polling
(it does poll `/api/teacher/overview` every 20s as a safety net, in case a
socket event is missed).

---

## Environment variables

**Root `.env`** (used by `docker-compose.yml`):

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `lockin` / `lockin` / `lockin` | Postgres container credentials |
| `SESSION_SECRET` | placeholder | Signs the session cookie — **set a real random value before deploying anywhere but localhost** |

**`server/.env`** (local dev only, outside Docker):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | Same as above |
| `PORT` | API port (default 4000) |
| `NODE_ENV` | `development` enables CORS for the Vite dev server and disables static-file serving |
| `CLIENT_ORIGIN` | Vite dev server origin, for CORS (default `http://localhost:5173`) |

---

## Known limitations / not-yet-done

- No automated test suite — everything so far has been verified manually
  (API smoke tests + a headless-browser pass over every screen and the
  kiosk scan/confirm/intrusion flow).
- Session store uses `express-session` + `connect-pg-simple`; fine for a
  single-server deployment, would need a shared store (e.g. Redis) if ever
  scaled to multiple API instances.
- `npm audit` flags a couple of moderate-severity issues in transitive dev
  dependencies (esbuild's dev-server, react-router). Low risk for local/
  school use; fixing them means a major-version bump of Vite/react-router.
- No real ESP32-CAM integration yet — see the top of this document for what
  the kiosk simulates in its place.
