export const seedWorkspace = {
  name: 'Acme Commerce',
  slug: 'acme',
  plan: 'Scale',
  region: 'eu-west-1',
  replyDomain: 'in.postique.fyi',
  fromDomain: 'acme.co.ke',
  owner: 'Annan Ogero',
  email: 'annan@acme.co.ke',
  initials: 'AO',
  aiEnabled: true,
}

export const labels = [
  { id: 'orders', name: 'Orders', color: '#5E8C3A' },
  { id: 'payments', name: 'Payments', color: '#A86A2E' },
  { id: 'returns', name: 'Returns', color: '#B4543B' },
  { id: 'shipping', name: 'Shipping', color: '#4A6C9A' },
  { id: 'sales', name: 'Sales', color: '#7A5A9E' },
  { id: 'account', name: 'Account', color: '#66736A' },
  { id: 'billing', name: 'Billing', color: '#8C6A36' },
]

export const seedThreads = [
  {
    id: 'thr_8f2ka1',
    subject: 'Delivery before Friday?',
    customer: {
      name: 'Amara Njoroge',
      email: 'amara.njoroge@gmail.com',
      company: 'Njoroge Studio',
      initials: 'AN',
      color: '#D7E8C4',
    },
    status: 'open',
    unread: true,
    starred: true,
    matched: true,
    labels: ['Orders', 'Shipping'],
    lastActivity: '24m',
    lastActivityOrder: 1,
    snippet: 'I’m in Westlands and need the set before Friday for a client shoot…',
    replyAddress: 't_8f2ka1@in.postique.fyi',
    createdAt: '28 Oct 2026',
    assigned: 'Annan Ogero',
    order: 'AC-4821',
    messages: [
      {
        id: 'msg_a1',
        direction: 'out',
        author: 'Acme Commerce',
        email: 'orders@acme.co.ke',
        date: 'Yesterday, 4:12 PM',
        subject: 'Your Acme order #AC-4821 is confirmed',
        body: `Hi Amara,

Good news — your order AC-4821 is packed and on its way. You'll receive a delivery update as soon as it leaves our Nairobi studio.

You can follow the order any time using the link below.

Track your order → https://acme.co.ke/orders/AC-4821

— The Acme team`,
        status: 'delivered',
        template: 'Order confirmation',
      },
      {
        id: 'msg_a2',
        direction: 'in',
        author: 'Amara Njoroge',
        email: 'amara.njoroge@gmail.com',
        date: 'Today, 9:41 AM',
        subject: 'Re: Your Acme order #AC-4821 is confirmed',
        body: `Hi Acme,

Thanks for the update! I'm in Westlands and need the set before Friday for a client shoot. Will it arrive in time?

Also, does the courier call before delivery?

Amara`,
        status: 'received',
      },
    ],
  },
  {
    id: 'thr_4k9db2',
    subject: 'Return request — ceramic set',
    customer: {
      name: 'Daniel Mwangi',
      email: 'daniel.m@outlook.com',
      company: 'Independent',
      initials: 'DM',
      color: '#EBD8C5',
    },
    status: 'open',
    unread: false,
    starred: false,
    matched: true,
    labels: ['Returns'],
    lastActivity: '1h',
    lastActivityOrder: 2,
    snippet: 'I’d like to return the ceramic set — one bowl arrived chipped…',
    replyAddress: 't_4k9db2@in.postique.fyi',
    createdAt: '31 Oct 2026',
    assigned: 'Unassigned',
    order: 'AC-4790',
    messages: [
      {
        id: 'msg_b1',
        direction: 'out',
        author: 'Acme Commerce',
        email: 'orders@acme.co.ke',
        date: '31 Oct, 11:08 AM',
        subject: 'Your Acme order #AC-4790 is confirmed',
        body: `Hi Daniel,

Your order #AC-4790 is confirmed. We'll be in touch as soon as it ships.

— The Acme team`,
        status: 'delivered',
        template: 'Order confirmation',
      },
      {
        id: 'msg_b2',
        direction: 'in',
        author: 'Daniel Mwangi',
        email: 'daniel.m@outlook.com',
        date: 'Today, 8:03 AM',
        subject: 'Re: Your Acme order #AC-4790 is confirmed',
        body: `Hi Acme,

I'd like to return the ceramic set from order AC-4790 — one of the bowls arrived chipped. I've attached a photo of the packaging.

What do you need from me to start the return?

Thanks,
Daniel`,
        status: 'received',
        attachments: [{ name: 'bowl-damage.jpg', size: '2.4 MB' }],
      },
    ],
  },
  {
    id: 'thr_7m1pq3',
    subject: 'Can I pay with M-Pesa?',
    customer: {
      name: 'Grace Wambui',
      email: 'grace.wambui@yahoo.com',
      company: 'Independent',
      initials: 'GW',
      color: '#D8DDF0',
    },
    status: 'open',
    unread: true,
    starred: false,
    matched: true,
    labels: ['Payments'],
    lastActivity: '2h',
    lastActivityOrder: 3,
    snippet: 'I’m trying to check out but I only see card options…',
    replyAddress: 't_7m1pq3@in.postique.fyi',
    createdAt: 'Today',
    assigned: 'Unassigned',
    order: null,
    messages: [
      {
        id: 'msg_c1',
        direction: 'in',
        author: 'Grace Wambui',
        email: 'grace.wambui@yahoo.com',
        date: 'Today, 7:18 AM',
        subject: 'Can I pay with M-Pesa?',
        body: `Hello,

I'm trying to check out but I only see card options. Can I pay with M-Pesa?

I'd like to order the Everyday Set today if possible.

Thank you,
Grace`,
        status: 'received',
      },
    ],
  },
  {
    id: 'thr_2v8rz5',
    subject: 'Bulk order for our studio',
    customer: {
      name: 'Zuri Interiors',
      email: 'hello@zuri-interiors.co.ke',
      company: 'Zuri Interiors',
      initials: 'ZI',
      color: '#E7DFC2',
    },
    status: 'open',
    unread: false,
    starred: true,
    matched: true,
    labels: ['Sales'],
    lastActivity: 'Yesterday',
    lastActivityOrder: 4,
    snippet: 'Could you share trade pricing for 24 sets? We’re fitting out a lodge…',
    replyAddress: 't_2v8rz5@in.postique.fyi',
    createdAt: '24 Oct 2026',
    assigned: 'Annan Ogero',
    order: null,
    messages: [
      {
        id: 'msg_d1',
        direction: 'in',
        author: 'Zuri Interiors',
        email: 'hello@zuri-interiors.co.ke',
        date: '24 Oct, 2:31 PM',
        subject: 'Bulk order for our studio',
        body: `Hi Acme team,

We're fitting out a lodge in Naivasha and love the Everyday Set. Could you share trade pricing for 24 sets, with delivery to Nairobi?

We'd also love to see any other pieces suitable for guest rooms.

Best,
Nia
Zuri Interiors`,
        status: 'received',
      },
      {
        id: 'msg_d2',
        direction: 'out',
        author: 'Annan Ogero',
        email: 'hello@acme.co.ke',
        date: '24 Oct, 5:02 PM',
        subject: 'Re: Bulk order for our studio',
        body: `Hi Nia,

Lovely to hear from you — a lodge in Naivasha sounds like a wonderful project.

For 24 sets we can offer 18% off list, and delivery to Nairobi is included. I've attached our trade catalogue with a few additional pieces that work well in guest rooms.

Would you like me to hold stock for you while you review?

Annan
Acme Commerce`,
        status: 'delivered',
        template: null,
        attachments: [{ name: 'acme-trade-catalogue.pdf', size: '4.1 MB' }],
      },
      {
        id: 'msg_d3',
        direction: 'in',
        author: 'Zuri Interiors',
        email: 'hello@zuri-interiors.co.ke',
        date: '31 Oct, 9:22 AM',
        subject: 'Re: Bulk order for our studio',
        body: `Hi Annan,

That's very helpful, thank you. The catalogue is beautiful.

We're reviewing the selection with the client this week and will confirm by Thursday. Please hold 24 sets if you can.

Nia`,
        status: 'received',
      },
    ],
  },
  {
    id: 'thr_9c3xt7',
    subject: 'Delivery to Mombasa',
    customer: {
      name: 'Peter Otieno',
      email: 'potieno@gmail.com',
      company: 'Independent',
      initials: 'PO',
      color: '#CFE4E1',
    },
    status: 'open',
    unread: false,
    starred: false,
    matched: true,
    labels: ['Shipping'],
    lastActivity: 'Yesterday',
    lastActivityOrder: 5,
    snippet: 'Do you deliver to Mombasa, and how much would it cost?',
    replyAddress: 't_9c3xt7@in.postique.fyi',
    createdAt: '30 Oct 2026',
    assigned: 'Unassigned',
    order: null,
    messages: [
      {
        id: 'msg_e1',
        direction: 'in',
        author: 'Peter Otieno',
        email: 'potieno@gmail.com',
        date: '30 Oct, 11:45 AM',
        subject: 'Delivery to Mombasa',
        body: `Hello Acme,

Do you deliver to Mombasa? I'm interested in two sets, and I'd like to know the delivery cost and how long it would take.

Asante,
Peter`,
        status: 'received',
      },
      {
        id: 'msg_e2',
        direction: 'out',
        author: 'Acme Commerce',
        email: 'hello@acme.co.ke',
        date: '30 Oct, 2:14 PM',
        subject: 'Re: Delivery to Mombasa',
        body: `Hi Peter,

Yes — we deliver to Mombasa. It's KSh 600 for two sets, and delivery usually takes 3–5 business days.

If you'd like to go ahead, I can send a secure payment link, or you can check out directly on the site.

Warmly,
The Acme team`,
        status: 'delivered',
      },
    ],
  },
  {
    id: 'thr_5r0bn8',
    subject: 'My login link expired',
    customer: {
      name: 'Fatima Ali',
      email: 'fatima.ali@gmail.com',
      company: 'Independent',
      initials: 'FA',
      color: '#EAD6DD',
    },
    status: 'open',
    unread: true,
    starred: false,
    matched: true,
    labels: ['Account'],
    lastActivity: '2d',
    lastActivityOrder: 6,
    snippet: 'The link says it has expired. Could you send a new one?',
    replyAddress: 't_5r0bn8@in.postique.fyi',
    createdAt: '30 Oct 2026',
    assigned: 'Unassigned',
    order: null,
    messages: [
      {
        id: 'msg_f1',
        direction: 'in',
        author: 'Fatima Ali',
        email: 'fatima.ali@gmail.com',
        date: '30 Oct, 6:02 PM',
        subject: 'My login link expired',
        body: `Hi there,

I requested a login link earlier but by the time I opened it, it said it had expired. Could you send a new one?

My account email is fatima.ali@gmail.com.

Thanks,
Fatima`,
        status: 'received',
      },
    ],
  },
  {
    id: 'thr_1n6hy9',
    subject: 'Invoice AC-2201',
    customer: {
      name: 'Brian Kipchoge',
      email: 'brian@kipchoge.co.ke',
      company: 'Kipchoge & Co.',
      initials: 'BK',
      color: '#D9DFCC',
    },
    status: 'closed',
    unread: false,
    starred: false,
    matched: true,
    labels: ['Billing'],
    lastActivity: '3d',
    lastActivityOrder: 7,
    snippet: 'All settled — thanks for the quick help.',
    replyAddress: 't_1n6hy9@in.postique.fyi',
    createdAt: '20 Oct 2026',
    assigned: 'Annan Ogero',
    order: null,
    messages: [
      {
        id: 'msg_g1',
        direction: 'in',
        author: 'Brian Kipchoge',
        email: 'brian@kipchoge.co.ke',
        date: '27 Oct, 10:11 AM',
        subject: 'Invoice AC-2201',
        body: `Hi Acme,

I think there's a duplicate charge on invoice AC-2201. Could you take a look and let me know?

Brian`,
        status: 'received',
      },
      {
        id: 'msg_g2',
        direction: 'out',
        author: 'Annan Ogero',
        email: 'hello@acme.co.ke',
        date: '27 Oct, 11:37 AM',
        subject: 'Re: Invoice AC-2201',
        body: `Hi Brian,

You're right — there was a duplicate authorisation from our payment provider. I've reversed it, and the refund should land back on your card within 3–5 business days.

I'm sorry for the trouble.

Annan`,
        status: 'delivered',
      },
      {
        id: 'msg_g3',
        direction: 'in',
        author: 'Brian Kipchoge',
        email: 'brian@kipchoge.co.ke',
        date: '28 Oct, 9:04 AM',
        subject: 'Re: Invoice AC-2201',
        body: `All settled — thanks for the quick help.

Brian`,
        status: 'received',
      },
    ],
  },
  {
    id: 'thr_6u2we0',
    subject: 'Partnership enquiry',
    customer: {
      name: 'Nia Labs',
      email: 'partners@nia-labs.io',
      company: 'Nia Labs',
      initials: 'NL',
      color: '#D6D9EA',
    },
    status: 'open',
    unread: false,
    starred: false,
    matched: false,
    labels: ['Needs review'],
    lastActivity: '4d',
    lastActivityOrder: 8,
    snippet: 'We’re building a retail platform and would love to explore a partnership…',
    replyAddress: null,
    createdAt: 'Unknown',
    assigned: 'Unassigned',
    order: null,
    messages: [
      {
        id: 'msg_h1',
        direction: 'in',
        author: 'Nia Labs',
        email: 'partners@nia-labs.io',
        date: '29 Oct, 3:28 PM',
        subject: 'Partnership enquiry',
        body: `Hello,

We're building a retail platform for independent makers and would love to explore a partnership with Acme.

Who would be the right person to speak with?

Best,
The Nia Labs team`,
        status: 'received',
      },
    ],
  },
]

export const seedDomains = [
  {
    id: 'dom_acme',
    name: 'acme.co.ke',
    status: 'verified',
    added: '21 Oct 2026',
    verifiedAt: '21 Oct 2026, 4:18 PM',
    provider: 'Amazon SES · eu-west-1',
    dkimSelector: 'pq1',
    identities: ['orders@acme.co.ke', 'hello@acme.co.ke', 'support@acme.co.ke'],
    records: [
      {
        id: 'spf',
        type: 'TXT',
        host: '@',
        value: 'v=spf1 include:amazonses.com ~all',
        purpose: 'Sender policy',
        status: 'verified',
      },
      {
        id: 'dkim1',
        type: 'CNAME',
        host: 'pq1._domainkey',
        value: 'pq1.dkim.amazonses.com',
        purpose: 'DKIM signature',
        status: 'verified',
      },
      {
        id: 'dkim2',
        type: 'CNAME',
        host: 'pq2._domainkey',
        value: 'pq2.dkim.amazonses.com',
        purpose: 'DKIM signature',
        status: 'verified',
      },
      {
        id: 'dmarc',
        type: 'TXT',
        host: '_dmarc',
        value: 'v=DMARC1; p=none; rua=mailto:dmarc@acme.co.ke',
        purpose: 'DMARC policy',
        status: 'verified',
      },
    ],
  },
  {
    id: 'dom_staging',
    name: 'acme-staging.com',
    status: 'pending',
    added: 'Today',
    verifiedAt: null,
    provider: 'Amazon SES · eu-west-1',
    dkimSelector: 'pq1',
    identities: [],
    records: [
      {
        id: 'spf2',
        type: 'TXT',
        host: '@',
        value: 'v=spf1 include:amazonses.com ~all',
        purpose: 'Sender policy',
        status: 'pending',
      },
      {
        id: 'dkim3',
        type: 'CNAME',
        host: 'pq1._domainkey',
        value: 'pq1.dkim.amazonses.com',
        purpose: 'DKIM signature',
        status: 'pending',
      },
      {
        id: 'dmarc2',
        type: 'TXT',
        host: '_dmarc',
        value: 'v=DMARC1; p=none; rua=mailto:dmarc@acme-staging.com',
        purpose: 'DMARC policy',
        status: 'pending',
      },
    ],
  },
]

export const seedKeys = [
  {
    id: 'key_1',
    name: 'Production server',
    kind: 'secret',
    prefix: 'pq_live_9f2a',
    createdAt: '12 Oct 2026',
    lastUsed: '2 minutes ago',
    status: 'active',
    scope: 'Full API access',
  },
  {
    id: 'key_2',
    name: 'Checkout browser',
    kind: 'public',
    prefix: 'pq_pub_7c1d',
    createdAt: '18 Oct 2026',
    lastUsed: '14 minutes ago',
    status: 'active',
    scope: '3 sendable templates',
    origins: ['https://acme.co.ke', 'https://www.acme.co.ke'],
  },
  {
    id: 'key_3',
    name: 'Legacy integration',
    kind: 'secret',
    prefix: 'pq_live_0b3e',
    createdAt: '02 Sep 2026',
    lastUsed: '31 Oct 2026',
    status: 'revoked',
    scope: 'Revoked',
  },
]

export const seedAssets = [
  {
    id: 'asset_1',
    name: 'Spring edit — hero banner',
    kind: 'Image',
    dimensions: '1200 × 600',
    size: '184 KB',
    url: 'https://assets.postique.fyi/a_spring_edit',
    preview: '/assets/asset-spring.svg',
    uploaded: '2 days ago',
    public: true,
  },
  {
    id: 'asset_2',
    name: 'Acme wordmark — light',
    kind: 'Logo',
    dimensions: '640 × 200',
    size: '18 KB',
    url: 'https://assets.postique.fyi/a_acme_wordmark',
    preview: '/assets/asset-wordmark.svg',
    uploaded: '9 days ago',
    public: true,
  },
  {
    id: 'asset_3',
    name: 'Everyday Set — grid',
    kind: 'Image',
    dimensions: '1200 × 900',
    size: '312 KB',
    url: 'https://assets.postique.fyi/a_everyday_grid',
    preview: '/assets/asset-grid.svg',
    uploaded: '14 days ago',
    public: true,
  },
  {
    id: 'asset_4',
    name: 'Studio packaging detail',
    kind: 'Image',
    dimensions: '1200 × 800',
    size: '246 KB',
    url: 'https://assets.postique.fyi/a_packaging',
    preview: '/assets/asset-packaging.svg',
    uploaded: '18 days ago',
    public: true,
  },
  {
    id: 'asset_5',
    name: 'Payment & footer icons',
    kind: 'Icons',
    dimensions: 'SVG set',
    size: '42 KB',
    url: 'https://assets.postique.fyi/a_payment_icons',
    preview: '/assets/asset-icons.svg',
    uploaded: '22 days ago',
    public: true,
  },
]

export const seedLogs = [
  {
    id: 'msg_9k2la8',
    to: 'amara.njoroge@gmail.com',
    toName: 'Amara Njoroge',
    subject: 'Your Acme order #AC-4821 is confirmed',
    template: 'Order confirmation',
    status: 'delivered',
    time: 'Today, 4:12 PM',
    provider: 'ses-eu-west-1',
    messageId: '<9k2la8.7f1@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '4:12:04 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '4:12:05 PM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '4:12:07 PM', detail: 'Message delivered to recipient' },
    ],
  },
  {
    id: 'msg_8j1kz3',
    to: 'daniel.m@outlook.com',
    toName: 'Daniel Mwangi',
    subject: 'Your Acme order #AC-4790 is confirmed',
    template: 'Order confirmation',
    status: 'replied',
    time: 'Today, 8:03 AM',
    provider: 'ses-eu-west-1',
    messageId: '<8j1kz3.2b4@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: 'Yesterday, 11:08 AM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: 'Yesterday, 11:08 AM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: 'Yesterday, 11:08 AM', detail: 'Message delivered' },
      { label: 'Reply received', time: 'Today, 8:03 AM', detail: 'Matched by In-Reply-To header' },
    ],
  },
  {
    id: 'msg_7h0pq9',
    to: 'grace.wambui@yahoo.com',
    toName: 'Grace Wambui',
    subject: 'Your saved bag is waiting',
    template: 'Abandoned bag',
    status: 'delivered',
    time: 'Yesterday, 6:40 PM',
    provider: 'ses-eu-west-1',
    messageId: '<7h0pq9.9c2@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '6:40 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '6:40 PM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '6:40 PM', detail: 'Message delivered' },
    ],
  },
  {
    id: 'msg_6g8mn2',
    to: 'unknown@example.net',
    toName: 'Unknown recipient',
    subject: 'Your Acme order #AC-4818 is confirmed',
    template: 'Order confirmation',
    status: 'bounced',
    time: 'Yesterday, 2:19 PM',
    provider: 'ses-eu-west-1',
    messageId: '<6g8mn2.4ab@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '2:19 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '2:19 PM', detail: 'Accepted by Amazon SES' },
      {
        label: 'Bounced',
        time: '2:19 PM',
        detail: '550 5.1.1 recipient address rejected — mailbox does not exist',
        tone: 'error',
      },
    ],
  },
  {
    id: 'msg_5f7bc1',
    to: 'hello@zuri-interiors.co.ke',
    toName: 'Zuri Interiors',
    subject: 'Re: Bulk order for our studio',
    template: null,
    status: 'delivered',
    time: 'Yesterday, 9:10 AM',
    provider: 'ses-eu-west-1',
    messageId: '<5f7bc1.8d0@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '9:10 AM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '9:10 AM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '9:10 AM', detail: 'Message delivered' },
    ],
  },
  {
    id: 'msg_4e6xy8',
    to: 'fatima.ali@gmail.com',
    toName: 'Fatima Ali',
    subject: 'Reset your Acme password',
    template: 'Password reset',
    status: 'complained',
    time: '30 Oct, 6:01 PM',
    provider: 'ses-eu-west-1',
    messageId: '<4e6xy8.1f7@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '6:01 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '6:01 PM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '6:01 PM', detail: 'Message delivered' },
      { label: 'Complained', time: '6:44 PM', detail: 'Recipient marked message as spam', tone: 'error' },
    ],
  },
  {
    id: 'msg_3d5wa7',
    to: 'brian@kipchoge.co.ke',
    toName: 'Brian Kipchoge',
    subject: 'Re: Invoice AC-2201',
    template: null,
    status: 'delivered',
    time: '30 Oct, 11:37 AM',
    provider: 'ses-eu-west-1',
    messageId: '<3d5wa7.6e3@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '11:37 AM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '11:37 AM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '11:37 AM', detail: 'Message delivered' },
    ],
  },
  {
    id: 'msg_2c4vb6',
    to: 'potieno@gmail.com',
    toName: 'Peter Otieno',
    subject: 'Re: Delivery to Mombasa',
    template: null,
    status: 'replied',
    time: '30 Oct, 2:14 PM',
    provider: 'ses-eu-west-1',
    messageId: '<2c4vb6.9ad@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '2:14 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '2:14 PM', detail: 'Accepted by Amazon SES' },
      { label: 'Delivered', time: '2:14 PM', detail: 'Message delivered' },
      { label: 'Reply received', time: '2:22 PM', detail: 'Matched by reply address token' },
    ],
  },
  {
    id: 'msg_1b3ut5',
    to: 'partners@nia-labs.io',
    toName: 'Nia Labs',
    subject: 'Re: Partnership enquiry',
    template: null,
    status: 'sent',
    time: '29 Oct, 4:02 PM',
    provider: 'ses-eu-west-1',
    messageId: '<1b3ut5.3c8@mail.acme.co.ke>',
    events: [
      { label: 'Queued', time: '4:02 PM', detail: 'Accepted by Postique' },
      { label: 'Sent', time: '4:02 PM', detail: 'Accepted by Amazon SES' },
    ],
  },
  {
    id: 'msg_0a2ts4',
    to: 'ops@acme.co.ke',
    toName: 'Acme operations',
    subject: 'Your weekly delivery report',
    template: null,
    status: 'queued',
    time: 'Just now',
    provider: 'ses-eu-west-1',
    messageId: '<0a2ts4.0aa@mail.acme.co.ke>',
    events: [{ label: 'Queued', time: 'Just now', detail: 'Waiting for a worker' }],
  },
]

export const seedFaqs = [
  {
    id: 'faq_delivery',
    title: 'Delivery information',
    triggers: ['delivery', 'deliver', 'shipping', 'how long', 'arrive', 'take'],
    answer:
      'Standard delivery takes 2–4 business days within Nairobi and 3–5 business days elsewhere in Kenya. You will receive a tracking link as soon as your order leaves our studio.',
    usage: 38,
  },
  {
    id: 'faq_returns',
    title: 'Return policy',
    triggers: ['return', 'refund', 'exchange', 'damaged', 'broken', 'chipped'],
    answer:
      'Unused items can be returned within 14 days of delivery for a full refund. If something arrived damaged, reply with a photo and we will arrange a replacement or refund at no cost.',
    usage: 24,
  },
  {
    id: 'faq_payment',
    title: 'Payment methods',
    triggers: ['pay', 'payment', 'mpesa', 'm-pesa', 'card', 'visa', 'mastercard'],
    answer:
      'We accept M-Pesa, Visa, Mastercard, and bank transfer. For M-Pesa, choose “Pay with M-Pesa” at checkout and enter your phone number to receive the payment prompt.',
    usage: 31,
  },
  {
    id: 'faq_tracking',
    title: 'Order tracking',
    triggers: ['track', 'tracking', 'where is my order', 'status of my order', 'courier'],
    answer:
      'You can track your order from the link in your confirmation email. If you cannot find it, send us your order number and we will check the latest courier update for you.',
    usage: 19,
  },
  {
    id: 'faq_hours',
    title: 'Business hours',
    triggers: ['hours', 'open', 'available', 'when are you', 'weekend', 'closed'],
    answer:
      'Our studio is open Monday to Friday, 9:00 AM – 5:00 PM EAT, and Saturday 10:00 AM – 2:00 PM. We reply to messages received outside these hours on the next business day.',
    usage: 12,
  },
]

export const seedAutomationSettings = {
  enabled: true,
  autoSend: false,
  humanReview: true,
  combine: true,
  confidence: 92,
  tone: 'Warm and concise',
}

export const seedWebhooks = [
  {
    id: 'wh_1',
    url: 'https://acme.co.ke/api/postique',
    events: ['message.delivered', 'message.bounced', 'thread.reply_received'],
    status: 'active',
    lastDelivery: '2 minutes ago',
  },
  {
    id: 'wh_2',
    url: 'https://hooks.acme.co.ke/email-events',
    events: ['message.complained'],
    status: 'paused',
    lastDelivery: '30 Oct 2026',
  },
]

export const activityFeed = [
  {
    id: 'act_1',
    type: 'reply',
    title: 'Amara Njoroge replied',
    detail: 'Delivery before Friday?',
    time: '24m',
    color: '#C6F26B',
  },
  {
    id: 'act_2',
    type: 'delivered',
    title: 'Order confirmation delivered',
    detail: 'amara.njoroge@gmail.com',
    time: '1h',
    color: '#9CCB5B',
  },
  {
    id: 'act_3',
    type: 'bounce',
    title: 'Hard bounce detected',
    detail: 'unknown@example.net · suppressed',
    time: '3h',
    color: '#E0996A',
  },
  {
    id: 'act_4',
    type: 'template',
    title: 'Delivery update published',
    detail: 'Version 3 by Annan',
    time: 'Yesterday',
    color: '#8FA8D8',
  },
  {
    id: 'act_5',
    type: 'system',
    title: 'Reply address verified',
    detail: 't_8f2ka1@in.postique.fyi',
    time: 'Yesterday',
    color: '#A5A79F',
  },
]

export const sendVolume = [
  { day: 'Oct 20', sent: 312, delivered: 309, replies: 14 },
  { day: 'Oct 21', sent: 428, delivered: 424, replies: 19 },
  { day: 'Oct 22', sent: 381, delivered: 378, replies: 17 },
  { day: 'Oct 23', sent: 496, delivered: 491, replies: 23 },
  { day: 'Oct 24', sent: 444, delivered: 440, replies: 18 },
  { day: 'Oct 25', sent: 292, delivered: 289, replies: 11 },
  { day: 'Oct 26', sent: 318, delivered: 314, replies: 13 },
  { day: 'Oct 27', sent: 522, delivered: 517, replies: 27 },
  { day: 'Oct 28', sent: 578, delivered: 573, replies: 31 },
  { day: 'Oct 29', sent: 540, delivered: 535, replies: 25 },
  { day: 'Oct 30', sent: 614, delivered: 608, replies: 34 },
  { day: 'Oct 31', sent: 488, delivered: 484, replies: 22 },
  { day: 'Nov 1', sent: 356, delivered: 353, replies: 15 },
  { day: 'Nov 2', sent: 421, delivered: 418, replies: 19 },
]
