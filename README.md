# Spades — Multiplayer Card Game

CSC 667 Term Project — Spring 2026

**Live App:** https://term-project-abraham-garg-homayoun.onrender.com

---

## Team Members

| Name | GitHub | Email |
|------|--------|-------|
| Jordan Westover | jwestover-123 | jwestover@sfsu.edu |
| Issac Abraham | Issac-Abraham | iabraham@sfsu.edu |
| Mohammad Massoud Homayoun | Massoud786 | mhomayoun@sfsu.edu |
| Shaurya Garg | sgarg923 | sgarg1@sfsu.edu |

---

## Tech Stack

- **Backend:** Node.js, Express 5, TypeScript
- **Database:** PostgreSQL via pg-promise + node-pg-migrate
- **Views:** EJS templates
- **Real-time:** Server-Sent Events (SSE)
- **Authentication:** express-session with connect-pg-simple
- **Build Tools:** ESBuild (client), TypeScript compiler (server)

---

## Local Development Setup

### Prerequisites

- Node.js >= 20
- PostgreSQL running locally

---

## First-Time Setup

```bash
# 1. Install dependencies
npm install

# 2. Create local database
createdb term_project_dev

# 3. Configure environment variables
cp .env.example .env
```

Edit `.env` and set:

```env
DATABASE_URL=postgres://<your-username>@localhost:5432/term_project_dev
```

Run migrations and start the development server:

```bash
# 4. Run database migrations
npm run migrate up

# 5. Start development server
npm run dev
```

Visit:

```text
http://localhost:3000
```

---

## Subsequent Runs

```bash
npm run dev
```

If new migrations were added by a teammate:

```bash
npm run migrate up
npm run dev
```

---

## Database Migrations

Migrations are located in `/migrations` and run in filename order.

> Never edit an existing migration. Always create a new migration file.

### Migration Commands

```bash
npm run migrate up      # Apply all pending migrations
npm run migrate down    # Roll back the last migration
```

---

## How the Game Works

1. Register or log in at:

```text
/auth/register
```

2. From the lobby, create or join a game.
3. Once 4 players have joined, any player can click **Start Game**.
4. During the bidding phase, each player bids between 0–13 tricks in seat order.
5. During gameplay:
   - Players must follow the lead suit if possible.
   - Spades cannot be led until spades have been broken.
6. After 13 tricks:
   - Scores are calculated.
   - The game is marked as finished.

### Persistence

Refreshing the page restores the full game state because all game data is persisted in PostgreSQL.

---

## Testing with Multiple Players Locally

Chrome incognito windows share cookies, so all windows will use the same user session.

Use separate browser profiles or separate browsers instead.

### Windows Example

```bash
chrome.exe --user-data-dir="C:\Temp\p1"
chrome.exe --user-data-dir="C:\Temp\p2"
chrome.exe --user-data-dir="C:\Temp\p3"
chrome.exe --user-data-dir="C:\Temp\p4"
```

---

## Deployment (Render)

Render automatically deploys from the `main` branch.

After merging a pull request:

1. Render runs:

```bash
npm install && npm run build
```

2. If a migration was added:
   - Run it manually against the production database using:
     - Render Shell, or
     - `psql` with the production connection string.

> There is currently no CI migration step. Production migrations are run manually after deployment.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript and bundle client |
| `npm run lint` | Check for lint errors |
| `npm run lint:fix` | Automatically fix lint errors |
| `npm run format` | Format code with Prettier |
| `npm run migrate up` | Apply pending migrations |
| `npm run migrate down` | Roll back the last migration |

---