// Vercel serverless entry point.
// Vercel detects files in api/ and wraps them as serverless functions.
// All /api/* traffic is routed here; Express handles internal routing.
//
// On Vercel, env vars come from the dashboard (process.env is pre-populated).
// dotenv is a no-op in production but still works locally.
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') })

module.exports = require('../server/index.js')
