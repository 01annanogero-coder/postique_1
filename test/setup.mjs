// Test isolation. This must be the FIRST import in test/run.mjs.
//
// server/config.js reads process.env once, when it is first imported, and then
// creates the data directory and loads (or generates) the app secret. Setting
// the environment here guarantees tests never touch the real data/ directory,
// the real SQLite database or the real .app-secret.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = path.join(root, '.test-data')

let dataDir = path.join(base, 'integration')
try {
  fs.rmSync(dataDir, { recursive: true, force: true })
} catch {
  // A previous run may still hold a file open on Windows; use a unique directory.
  dataDir = path.join(base, `run-${process.pid}`)
}
fs.mkdirSync(dataDir, { recursive: true })

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATA_DIR: dataDir,
  DATABASE_PATH: path.join(dataDir, 'postique.db'),
  APP_URL: 'http://localhost:3000',
  APP_SECRET: 'test-secret-'.padEnd(48, 'x'),
  MAIL_TRANSPORT: 'file',
  INBOUND_SMTP_ENABLED: 'false',
  WORKER_ENABLED: 'false',
  VERIFY_DEBUG_LINKS: 'true',
  VERIFY_MAX_PER_HOUR: '5',
  TURNSTILE_SECRET_KEY: '',
  LOG_LEVEL: 'silent',
})
