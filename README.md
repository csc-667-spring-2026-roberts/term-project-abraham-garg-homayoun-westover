# Team Name — Game Name

CSC 667 Term Project — Spring 2026

## Team Members

| Name | GitHub | Email |
|------|--------|-------|
| Jordan Westover | jwestover-123 | jwestover@sfsu.edu |
| Issac Abraham | Issac-Abraham | iabraham@sfsu.edu |
| Mohammad Massoud Homayoun | Massoud786 | mhomayoun@sfsu.edu |
| Shaurya Garg | sgarg923 | sgarg1@sfsu.edu |

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your database credentials
npm run dev
```

## Teammate DB Setup (Milestone 5)

Each teammate runs a local PostgreSQL database and verifies read/write routes.

```bash
# 1) Create local database (once)
createdb term_project_dev

# 2) Create test table (once)
psql term_project_dev -c "CREATE TABLE IF NOT EXISTS test_data (id SERIAL PRIMARY KEY, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"

# 3) Configure .env
cp .env.example .env
# Set DATABASE_URL to:
# postgres://<your-username>@localhost:5432/term_project_dev

# 4) Start server
npm run dev
```

In a second terminal:

```bash
# Write test row
curl -i -X POST http://localhost:3000/api/test-data \
  -H "Content-Type: application/json" \
  -d '{"message":"teammate test"}'

# Read test rows
curl -i http://localhost:3000/api/test-data
```

Expected result:
- POST returns `HTTP/1.1 201 Created`
- GET returns `HTTP/1.1 200 OK` with JSON data

## Scripts

- `npm run dev` — Start development server with hot reload
- `npm run build` — Compile TypeScript
- `npm start` — Run compiled server
- `npm run lint` — Check for lint errors
- `npm run lint:fix` — Auto-fix lint errors
- `npm run format` — Format code with Prettier
