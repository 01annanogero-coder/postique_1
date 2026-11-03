import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'
import { logger } from '../lib/logger.js'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
let database = null

export function nowIso() {
  return new Date().toISOString()
}

export function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function stringifyJson(value) {
  return JSON.stringify(value ?? null)
}

export function transaction(callback) {
  const db = getDb()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = callback(db)
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // ignore rollback errors when the transaction never began
    }
    throw error
  }
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const applied = new Set(db.prepare('SELECT version FROM _migrations').all().map((row) => row.version))

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    logger.info({ migration: file }, 'Applying database migration')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (version, applied_at) VALUES (?, ?)').run(file, nowIso())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${file} failed: ${error.message}`)
    }
  }
}

export function getDb() {
  if (database) return database
  database = new DatabaseSync(config.dbPath)
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = NORMAL;')
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA busy_timeout = 5000;')
  migrate(database)
  return database
}

export function closeDb() {
  if (!database) return
  database.close()
  database = null
}

export function countUsers() {
  return getDb().prepare('SELECT COUNT(*) AS count FROM users').get().count
}

export function getWorkspaceForUser(userId) {
  return getDb()
    .prepare(
      `SELECT w.*, m.role
       FROM workspaces w
       JOIN members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY w.created_at ASC
       LIMIT 1`,
    )
    .get(userId)
}

export function getUserById(id) {
  return getDb().prepare('SELECT id, email, name, created_at, last_login_at FROM users WHERE id = ?').get(id)
}

export function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email)
}

export function getWorkspaceSetting(workspaceId, key, fallback = null) {
  const row = getDb()
    .prepare('SELECT value_json FROM workspace_settings WHERE workspace_id = ? AND key = ?')
    .get(workspaceId, key)
  return row ? parseJson(row.value_json, fallback) : fallback
}

export function setWorkspaceSetting(workspaceId, key, value) {
  getDb()
    .prepare(
      `INSERT INTO workspace_settings (workspace_id, key, value_json)
       VALUES (?, ?, ?)
       ON CONFLICT(workspace_id, key) DO UPDATE SET value_json = excluded.value_json`,
    )
    .run(workspaceId, key, JSON.stringify(value))
}
