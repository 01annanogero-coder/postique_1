import { getDb } from '../db/index.js'
import { fail } from './http.js'

/** Remove suppressed addresses from every recipient field, or reject the send. */
export function filterSuppressed(workspaceId, { to = [], cc = [], bcc = [] } = {}) {
  const all = [...to, ...cc, ...bcc]
  if (!all.length) return { to, cc, bcc }
  const rows = getDb()
    .prepare(
      `SELECT email FROM suppressions WHERE workspace_id = ? AND email IN (${all.map(() => '?').join(',')})`,
    )
    .all(workspaceId, ...all.map((item) => item.email))
  const blocked = new Set(rows.map((row) => String(row.email).toLowerCase()))
  const keep = (items) => items.filter((item) => !blocked.has(String(item.email).toLowerCase()))
  const filteredTo = keep(to)
  if (!filteredTo.length) throw fail(422, 'suppressed_recipient', 'All recipients are suppressed.')
  return { to: filteredTo, cc: keep(cc), bcc: keep(bcc) }
}
