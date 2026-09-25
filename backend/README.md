# PlanWise Backend

Node.js + Express + PostgreSQL (Prisma) API for the Digital Lesson Plan system.

## Quick start

### 1. Start PostgreSQL

With Docker:

```bash
docker compose up -d
```

Or use any hosted Postgres and set `DATABASE_URL`.

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Set at least:

- `DATABASE_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY` (or put it in the project root `.env`)

### 3. Install and migrate

```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

API: `http://localhost:3001`

### 4. Frontend

From the project root:

```bash
npm install
npm run client
```

Or run both:

```bash
npm start
```

## Architecture

- **Routes** → **Controllers** → **Services** → **Prisma / Gemini / file storage**
- JWT auth on protected routes
- Files stored under `backend/uploads` (path/URL saved in DB)
- Gemini keys never leave the server

## Main endpoints

See the project root README or `backend/.env.example` for configuration.
Auth: `/api/auth/*`
Lesson plans: `/api/lesson-plans`
AI: `/api/ai/*`
Documents: `/api/documents`
Quizzes / assessments / calendar / courses / dashboard under `/api/...`
