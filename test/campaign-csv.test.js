import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCampaignCsv } from '../server/lib/campaign-csv.js'

test('campaign CSV imports quoted names and provider headers', () => {
  const rows = parseCampaignCsv(
    'Email,Name,External User ID\r\n"customer@example.com","Wanjiru, W.","user_1"\r\nsecond@example.com,Second,\r\n',
  )
  assert.deepEqual(rows, [
    { email: 'customer@example.com', name: 'Wanjiru, W.', external_user_id: 'user_1' },
    { email: 'second@example.com', name: 'Second', external_user_id: '' },
  ])
})

test('campaign CSV accepts headerless rows and escaped quotes', () => {
  const rows = parseCampaignCsv('a@example.com,"A ""Ace""",id1\nb@example.com,B\n')
  assert.equal(rows[0].name, 'A "Ace"')
  assert.equal(rows[1].email, 'b@example.com')
})
