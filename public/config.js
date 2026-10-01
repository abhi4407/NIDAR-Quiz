// Set this to the public URL of the Render backend when deploying the frontend separately.
const localHosts = ['localhost', '127.0.0.1'];
window.NIDAR_BACKEND_URL = localHosts.includes(window.location.hostname) ? '' : 'https://nidar-quiz-2.onrender.com';