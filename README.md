# NIDAR Quiz

A real-time quiz platform for Team AEROVEGA, built with Node.js, Express, Socket.io, and a plain HTML/CSS/JavaScript frontend.

## Run locally

1. Install Node.js 18 or newer.
2. From this folder, run:

```bash
npm install
npm start
```

3. Open http://localhost:3000.

The default credentials are in `.env`:

- Admin: `admin` / `admin@123`
- Participant: `nidar_aerovega` / `nidar@123`
- Room: `123456`

Change `.env` before deploying. Quiz definitions and saved final results are stored in `data.json`.

## Deploy backend and frontend on Render

The backend can run as a Render **Web Service** and the frontend as a Render **Static Site**.

1. Deploy the repository as a Web Service with build command `npm install` and start command `npm start`.
2. Add backend environment variables in Render: `ADMIN_USER`, `ADMIN_PASS`, `PARTICIPANT_USER`, `PARTICIPANT_PASS`, `ROOM_CODE`, and `MAX_PARTICIPANTS`.
3. Create a Static Site from the same repository with publish directory `public`.
4. In `public/config.js`, set `window.NIDAR_BACKEND_URL` to the backend URL, for example `https://nidar-quiz-api.onrender.com`, then redeploy the Static Site.
5. Add the Static Site URL to the backend environment as `FRONTEND_URL`, for example `https://nidar-quiz.onrender.com`, then redeploy the backend.

The frontend uses the backend URL for login, admin requests, CSV export, and Socket.IO. The backend URL must not have a trailing slash. Keep the backend as one instance because live quiz state is held in memory.
