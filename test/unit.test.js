import test from 'node:test'
import assert from 'node:assert/strict'
import { analyseFaqs, scoreFaq } from '../server/lib/automation.js'
import { hashPassword, normaliseSubject, replySubject, verifyPassword } from '../server/lib/crypto.js'
import { parseAddressList } from '../server/lib/mailer.js'

test('password hashes verify only with the correct password', () => {
  const hash = hashPassword('correct horse battery staple')
  assert.equal(verifyPassword('correct horse battery staple', hash), true)
  assert.equal(verifyPassword('wrong password', hash), false)
  assert.notEqual(hash, 'correct horse battery staple')
})

test('reply subjects stay stable', () => {
  assert.equal(normaliseSubject('Re: Re: Hello world'), 'Hello world')
  assert.equal(replySubject('Re: Hello world'), 'Re: Hello world')
  assert.equal(replySubject(''), 'Re: Your message')
})

test('address lists accept strings and mailbox objects', () => {
  assert.deepEqual(parseAddressList('Amara <amara@example.com>, buyer@example.com'), [
    { name: 'Amara', email: 'amara@example.com' },
    { name: '', email: 'buyer@example.com' },
  ])
  assert.deepEqual(parseAddressList([{ name: 'Buyer', email: 'BUYER@example.com' }]), [
    { name: 'Buyer', email: 'buyer@example.com' },
  ])
})

const faqs = [
  {
    id: 'delivery',
    title: 'Delivery',
    answer: 'Delivery takes 2–4 days.',
    triggers: ['delivery', 'shipping', 'how long'],
  },
  {
    id: 'payments',
    title: 'Payments',
    answer: 'We accept M-Pesa and cards.',
    triggers: ['pay', 'm-pesa', 'mpesa'],
  },
]

test('FAQ matching combines multiple approved intents', () => {
  const result = analyseFaqs(faqs, 'How long is delivery and can I pay with M-Pesa?', {
    enabled: true,
    autoSend: false,
    combine: true,
    confidence: 92,
  })
  assert.equal(result.review, false)
  assert.equal(result.matches.length, 2)
  assert.match(result.reply, /Delivery takes/)
  assert.match(result.reply, /M-Pesa/)
})

test('FAQ matching holds unknown messages for review', () => {
  const result = analyseFaqs(faqs, 'I need to speak to a lawyer about a legal dispute.', {
    enabled: true,
    autoSend: true,
    combine: true,
    confidence: 92,
  })
  assert.equal(result.review, true)
  assert.equal(result.matches.length, 0)
  assert.equal(result.reply, '')
})

test('trigger scoring is deterministic', () => {
  assert.equal(scoreFaq('delivery', faqs[0]), 2)
  assert.equal(scoreFaq('how long', faqs[0]), 3)
  assert.equal(scoreFaq('nothing relevant', faqs[0]), 0)
})
