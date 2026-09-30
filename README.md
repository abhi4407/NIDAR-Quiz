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
