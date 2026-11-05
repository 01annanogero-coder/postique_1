/**
 * Small RFC-4180-ish CSV reader for audience exports. It supports quoted
 * fields, escaped quotes and CRLF, which covers exports from Mailchimp,
 * SendGrid, spreadsheets and S3 CSV files.
 */
function parseRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const input = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function parseCampaignCsv(text) {
  const rows = parseRows(text).filter((row) => row.some((value) => String(value).trim()))
  if (!rows.length) return []
  const first = rows[0].map((value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  const hasHeader = first.includes('email')
  const columns = hasHeader
    ? {
        email: first.indexOf('email'),
        name: first.indexOf('name'),
        externalUserId: first.indexOf('external_user_id'),
      }
    : { email: 0, name: 1, externalUserId: 2 }
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((row) => ({
      email: String(row[columns.email] || '').trim(),
      name: columns.name >= 0 ? String(row[columns.name] || '').trim() : '',
      external_user_id: columns.externalUserId >= 0 ? String(row[columns.externalUserId] || '').trim() : '',
    }))
    .filter((recipient) => recipient.email)
}
