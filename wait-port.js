// Helper script to wait for dev server port (Windows-compatible)
const waitOn = require('wait-on');
const port = process.env.DEV_PORT || '5174';

waitOn({
    resources: [`tcp:${port}`],
    timeout: 30000,
})
    .then(() => {
        console.log(`[wait-port] Dev server ready on port ${port}`);
        process.exit(0);
    })
    .catch((err) => {
        console.error('[wait-port] Timeout waiting for dev server:', err);
        process.exit(1);
    });





