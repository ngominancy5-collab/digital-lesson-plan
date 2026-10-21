# Exact local setup commands

## A. PostgreSQL

### Option 1 — Docker
```bash
docker compose up -d
```
Uses `postgresql://planwise:planwise@localhost:5432/planwise`

### Option 2 — Existing local Postgres
Create a database and user, then set `DATABASE_URL` in `.env` and `backend/.env`, for example:
```text
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/planwise?schema=public
```

## B. Install & migrate
```bash
cd C:\Users\Liah\Desktop\digital-lesson-plan-main
npm install
cd backend
npm install
npx prisma generate
npx prisma db push
npm run db:seed
cd ..
```

## C. Environment
Ensure these exist in the **project root** `.env` (Gemini key can stay here — backend loads it):

```text
DATABASE_URL=postgresql://...
JWT_SECRET=any-long-random-string
GEMINI_API_KEY=your_key
AI_PROVIDER=gemini
PORT=3001
CLIENT_URL=http://localhost:5173
VITE_API_URL=http://localhost:3001/api
```

Also copy `backend/.env.example` → `backend/.env` with the same `DATABASE_URL` and `JWT_SECRET`.

## D. Run app
Stop any old `npm start`, then:

```bash
npm start
```

- Frontend: http://localhost:5173
- API health: http://localhost:3001/api/health

Admin login: set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` before starting the backend.

## E. Separate processes
```bash
npm run server
npm run client
```
