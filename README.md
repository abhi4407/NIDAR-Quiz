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

The local default credentials are:

- Admin: `admin` / `admin@123`
- Participant: `nidar_aerovega` / `nidar@123`

Change the credentials before deploying. Admins create a room from the admin portal; each new room receives a random six-digit code. Quiz definitions and saved final results are stored in `data.json`.

For local use, open `http://localhost:3000/?portal=admin` for the admin portal or `http://localhost:3000/?portal=participant` for participants. The admin portal can copy a participant invite link with the room code prefilled.

## Deploy backend and frontend on Render

The backend can run as a Render **Web Service** and the frontend as a Render **Static Site**.

1. Deploy the repository as a Web Service with build command `npm install` and start command `npm start`.
2. Add backend environment variables in Render: `ADMIN_USER`, `ADMIN_PASS`, `PARTICIPANT_USER`, `PARTICIPANT_PASS`, and `MAX_PARTICIPANTS`.
3. Create a Static Site from the same repository with publish directory `public`.
4. In `public/config.js`, set `window.NIDAR_BACKEND_URL` to the backend URL, currently `https://nidar-quiz-2.onrender.com`, then redeploy the Static Site.
5. Set the backend `FRONTEND_URL` to the Static Site URL, currently `https://nidar-quiz-3.onrender.com`, then redeploy the backend.

The frontend uses the backend URL for login, admin requests, CSV export, and Socket.IO. The backend URL must not have a trailing slash. Keep the backend as one instance because live quiz state is held in memory.

For separate portals, share `https://nidar-quiz-3.onrender.com/?portal=admin` with admins and `https://nidar-quiz-3.onrender.com/?portal=participant` with participants. The admin can copy an invite link that includes the current room code.
