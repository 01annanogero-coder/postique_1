import { getDb, closeDb } from '../db/index.js'
import { hashPassword, normaliseEmail } from '../lib/crypto.js'

const [email, password] = process.argv.slice(2)

if (!email || !password) {
  console.error('Usage: node server/scripts/reset-password.js <email> <new-password>')
  process.exit(1)
}
if (password.length < 10) {
  console.error('The new password must be at least 10 characters.')
  process.exit(1)
}

const db = getDb()
const user = db.prepare('SELECT id, email FROM users WHERE email = ? COLLATE NOCASE').get(normaliseEmail(email))
if (!user) {
  console.error(`No account found for ${email}`)
  closeDb()
  process.exit(1)
}

db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id)
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id)
console.log(`Password updated for ${user.email}. Existing sessions were revoked.`)
closeDb()
