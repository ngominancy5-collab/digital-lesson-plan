# PlanWise AI — Digital Lesson Plan System

Full-stack teaching workspace: React frontend + Express/Prisma API + PostgreSQL + Gemini.

## Architecture

1. Presentation — `src/` (Vite + React)
2. Application — `backend/src/` (Express REST API, JWT, Gemini)
3. Data — PostgreSQL via Prisma + `backend/uploads/` for files

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local install **or** Docker)

## 1. Database

**Docker (recommended):**

```bash
docker compose up -d
```

Default URL:

```text
postgresql://planwise:planwise@localhost:5432/planwise?schema=public
```

## 2. Environment

Copy examples and fill secrets:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Required:

- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY` (server only — never put this in Vite/`VITE_*` vars)

## 3. Install

```bash
npm install
cd backend && npm install && npx prisma generate && npx prisma db push && npm run db:seed && cd ..
```

Demo account after seed: `demo@planwise.local` / `Demo1234`

## 4. Run

```bash
npm start
```

- Frontend: http://localhost:5173  
- API: http://localhost:3001  
- Health: http://localhost:3001/api/health  

Or separately:

```bash
npm run server
npm run client
```

## Notes

- UI theme (light/dark) stays in browser `localStorage` only.
- Auth uses JWT (`planwiseToken`). Passwords are bcrypt-hashed in PostgreSQL — never stored in the browser.
- Legacy `server/` folder is superseded by `backend/`.
