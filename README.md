# MBCIANS APPOINTIZEN

MBCIANS APPOINTIZEN is a full-stack registrar appointment system built with a Vite + vanilla JavaScript frontend, an Express + Socket.IO backend, and MySQL persistence. The current codebase supports the required roles:

- `student`
- `admin`
- `cashier`
- `registrar_staff`
- `registrar_head`

The frontend is prepared for Vercel, the backend is prepared for Railway, and the database bootstrap file is included for Railway MySQL or any compatible MySQL 8.x server.

## What is included

- JWT authentication with automatic role-based redirects
- Student self-registration
- Student dashboard, 3-step booking flow, request tracking, and payment submission
- Admin dashboard, catalog management, blocked dates, system settings, and user disabling
- Cashier payment verification
- Registrar head approval, rejection, and staff assignment
- Registrar staff processing workflow
- Real-time updates with Socket.IO for appointments, payments, settings, catalog changes, and notifications
- Audit logging for registration, login, logout, booking, payment, and status changes
- Railway-safe payment proof storage using MySQL instead of relying on local disk persistence

## Project structure

```text
frontend/
  admin/
  cashier/
  components/
  head/
  shared/
  staff/
  student/
  styles/
  config.js
  login.html
  register.html
  vite.config.js

backend/
  controllers/
  middlewares/
  routes/
  services/
  utils/
  db.js
  server.js

database/
  mbciansappointizen.sql
```

## Local development

1. Install dependencies:

   ```bash
   npm run install:all
   ```

2. Create environment files:

   ```bash
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

3. Create the database, then import the bootstrap file:

   ```bash
   mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS mbciansappointizen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   mysql -u root -p mbciansappointizen < database/mbciansappointizen.sql
   ```

4. Update `backend/.env` with your local MySQL credentials.

5. Keep `frontend/.env` using:

   ```env
   VITE_API_URL=/api
   VITE_SOCKET_URL=
   VITE_DEV_PROXY_TARGET=http://127.0.0.1:4000
   VITE_APP_TIMEZONE=Asia/Manila
   ```

6. Start the full stack:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:5173`.

## Seeded demo accounts

All seeded accounts use the same password:

```text
ChangeMe123!
```

- `admin@mbciansappointizen.local`
- `cashier@mbciansappointizen.local`
- `head@mbciansappointizen.local`
- `staff1@mbciansappointizen.local`
- `staff2@mbciansappointizen.local`
- `brendon.student@mbciansappointizen.local`

## Environment variables

### Frontend

Set these in Vercel or `frontend/.env`:

```env
VITE_API_URL=https://your-backend-production-url.up.railway.app/api
VITE_SOCKET_URL=https://your-backend-production-url.up.railway.app
VITE_APP_TIMEZONE=Asia/Manila
```

Optional local-only dev proxy:

```env
VITE_DEV_PROXY_TARGET=http://127.0.0.1:4000
```

### Backend

Set these in Railway or `backend/.env`:

```env
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://your-frontend.vercel.app
DB_HOST=your-mysql-host
DB_PORT=3306
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=mbciansappointizen
DB_CONNECTION_LIMIT=10
APP_TIMEZONE=Asia/Manila
TRUST_PROXY=1
JWT_SECRET=replace_this_with_a_long_secure_secret
JWT_EXPIRES_IN=7d
```

## Railway MySQL deployment

1. Create a new Railway project.
2. Add a MySQL service.
3. Open the MySQL service connection details and copy the host, port, database name, username, and password.
4. Import [`database/mbciansappointizen.sql`](database/mbciansappointizen.sql) into the Railway MySQL instance or run it inside the Railway MySQL console after selecting the target database.
5. Confirm that the `settings` table contains row `id = 1`.

## Railway backend deployment

1. Create a Railway service from the `backend` directory.
2. Set the start command to `npm start` if Railway does not detect it automatically.
3. Add the backend environment variables listed above.
4. Set `CLIENT_ORIGIN` to the exact Vercel domain that will host the frontend.
5. Deploy the service.
6. Verify the health endpoint:

   ```text
   https://your-backend-production-url.up.railway.app/api/health
   ```

7. Make sure `databaseReady` returns `true`.

## Vercel frontend deployment

1. Import the repository into Vercel.
2. Set the project root directory to `frontend`.
3. Keep the build command as `npm run build`.
4. Keep the output directory as `dist`.
5. Add:

   ```env
   VITE_API_URL=https://your-backend-production-url.up.railway.app/api
   VITE_SOCKET_URL=https://your-backend-production-url.up.railway.app
   VITE_APP_TIMEZONE=Asia/Manila
   ```

6. Deploy the project.
7. After Vercel gives you the final domain, add that exact URL to Railway `CLIENT_ORIGIN`.
8. Redeploy the backend if Railway does not auto-refresh env variables.

## Testing checklist

Run these flows after local setup or deployment:

1. Register a new student account from `register.html`.
2. Log in as the student and create one GCash appointment and one cash appointment.
3. Confirm the head account receives a real-time appointment update.
4. Approve an appointment as registrar head.
5. Assign the approved appointment to `Staff1` or `Staff2`.
6. Approve or reject payment as cashier.
7. Start processing and complete an assigned request as registrar staff.
8. Manage a document type, a time slot, a blocked date, and payment settings as admin.
9. Disable a non-admin user as admin.
10. Confirm notifications update without reloading the page.

## Common errors and fixes

- `CORS origin not allowed.`  
  Fix: Set `CLIENT_ORIGIN` to the exact Vercel domain, including `https://`.

- `Missing required environment variables` on backend boot  
  Fix: Set `DB_HOST`, `DB_USER`, `DB_NAME`, and `JWT_SECRET`.

- Frontend shows network errors immediately after deploy  
  Fix: Check `VITE_API_URL` and `VITE_SOCKET_URL`; they must point to the Railway backend domain, not localhost.

- Login suddenly returns `401` after a redeploy  
  Fix: Clear localStorage in the browser, then sign in again. Old JWTs become invalid if `JWT_SECRET` changes.

- MySQL access denied or connection refused  
  Fix: Recopy the Railway MySQL connection credentials and confirm the backend is using the same database name you imported.

- Socket updates do not appear in production  
  Fix: Confirm `VITE_SOCKET_URL` matches the Railway backend origin and that the frontend origin is included in `CLIENT_ORIGIN`.

- Payment proof uploads fail  
  Fix: Use JPG, PNG, or WEBP only, and keep files at or below 5 MB.

- System is stuck in maintenance mode  
  Fix: Sign in as admin and disable maintenance in Settings, or set `maintenance_mode = 0` in the `settings` table.

## Notes

- Payment proof images are stored in MySQL as data URLs so Railway deployments do not depend on local file persistence.
- Frontend runtime URLs are resolved through [`frontend/config.js`](frontend/config.js).
- The backend always listens on `process.env.PORT`, which is required for Railway.
