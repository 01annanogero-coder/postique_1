# Meet Postique: Email infrastructure built around your application

## 1. What is Postique?

Postique is a developer-focused email communication platform that combines beautifully designed email templates, reliable email delivery, conversation threading, inbound email processing, an embeddable inbox, developer APIs, and intelligent response automation.

It gives developers the ability to integrate professional email communication into their websites, SaaS platforms, marketplaces, e-commerce applications, booking systems, and other software products without having to build and maintain the underlying email infrastructure themselves.

Imagine building a marketplace.

A customer places an order. Your application sends them a beautifully designed confirmation email. The customer replies to ask about delivery. Your application receives that reply, identifies the original conversation, and displays the message inside your marketplace's administration dashboard.

You can then respond directly from your marketplace.

The customer receives your response in their ordinary email inbox, whether they use Gmail, Outlook, Yahoo, or another email provider.

You never needed to open Gmail or Outlook to manage that conversation.

That is the experience Postique is designed to make possible.

**Your application. Your inbox. Your conversations.**

## 2. The problems Postique solves

Developers currently have to combine several services and technologies to achieve a complete email communication experience.

For example:

- EmailJS makes it relatively easy to send emails from a website, but developers still need another solution for managing complete conversations and receiving replies.
- Email delivery platforms provide APIs, templates, and delivery infrastructure, but developers often have to build their own customer-facing inbox and conversation management experience.
- Gmail and Outlook are excellent email clients, but they are not designed to be embedded as a complete communication system inside every custom application.
- Building a custom email infrastructure requires handling sending providers, DNS verification, authentication, message headers, threading, inbound processing, attachments, delivery events, and security.

Postique brings these capabilities together into one developer-oriented platform.

Instead of assembling multiple disconnected services, developers can use Postique as the communication layer behind their applications.

## 3. Postique Template Studio

At the heart of Postique is a browser-based email design environment.

Developers can create professional, responsive email templates without having to design every email manually or repeatedly write HTML from scratch.

The Template Studio includes:

### MJML email editor

Developers can create email layouts using MJML, a markup language designed for responsive email development.

The editor provides:

- A code editor with syntax support.
- Live email preview.
- HTML compilation.
- Template variables.
- Reusable email structures.
- Test email sending.
- Draft and published versions.

### Dynamic variables

Templates can contain variables that are populated by the developer's application when an email is sent.

For example, a welcome email might contain:

- `{{name}}`
- `{{email}}`
- `{{company}}`
- `{{verification_link}}`

Your application supplies the appropriate values, and Postique renders the final email.

The same template can therefore serve thousands of customers with different information.

### Template versioning

Developers can maintain draft and published versions of their templates.

They can experiment with a new design without immediately affecting emails being sent by their production applications.

### Test sending

Before publishing a template, developers can send test emails to themselves to inspect the actual result in an email client.

### Template rendering API

Developers can also render a template through the API without sending it. This is useful when they need the generated HTML for another workflow.

The result is a reusable email design system rather than a collection of hardcoded email strings scattered throughout an application.

## 4. Email sending infrastructure

Postique provides the infrastructure required to send emails from a developer's application.

Developers can send messages through a REST API or a browser SDK.

For example, a server-side application could make a request containing:

- The sender identity.
- The recipient.
- The template to use.
- The dynamic variables.
- An optional conversation or thread ID.

Postique handles the rendering, queuing, delivery, and message tracking.

Developers can also send raw HTML or plain-text emails when they do not need a saved template.

Other supported sending capabilities include:

- Small email attachments.
- Custom sender names and email addresses.
- Verified sending domains.
- Multiple sender identities.
- Idempotency keys to prevent accidental duplicate sends.
- Delivery and failure reporting.

### Custom sending domains

Developers can connect their own domains instead of sending everything from a Postique-owned address.

Postique guides them through the required DNS configuration, including SPF, DKIM, and return-path records.

Once verified, they can send emails using their own professional email identities.

## 5. API and developer SDK

Postique is designed to integrate into existing applications rather than forcing developers to change their technology stacks.

It provides two primary integration approaches.

### REST API

Developers can use the API from virtually any backend language or framework.

They can:

- Send emails.
- Send template-based messages.
- Render templates.
- Retrieve messages.
- Retrieve conversations.
- Search conversation threads.
- Reply to existing conversations.
- Receive delivery and reply events through webhooks.

### Browser SDK

For frontend applications, Postique provides a browser SDK that simplifies sending emails without requiring developers to manually construct API requests.

A simplified example:

```javascript
postique.send({
  template: "welcome",
  variables: {
    name: "Wanjiru"
  },
  to: "customer@example.com"
});
```

Browser integrations use public API keys with restrictions such as allowed origins, rate limits, template permissions, and recipient restrictions.

Secret API keys remain on the server. They should never be exposed in frontend code.

The objective is to make email integration straightforward for developers while maintaining appropriate security controls.

## 6. Threaded conversations and inbound email

This is one of the most important parts of Postique.

Traditional email-sending integrations often treat every email as an independent message.

Postique is designed to treat emails as conversations.

For example:

1. Your application sends an order confirmation to a customer.
2. The customer replies from Gmail.
3. Postique receives the reply.
4. It identifies the original message and attaches the reply to the correct conversation.
5. Your application receives a webhook notifying it of the reply.
6. The conversation becomes available through the Postique API and inbox.

When your application sends another response using the existing thread ID, Postique maintains the email conversation headers so that the recipient's email client can group the messages into the same conversation.

### How does Postique receive replies?

Every workspace gets an inbound email configuration.

Postique uses a dedicated reply domain and unique reply addresses associated with individual conversations.

For example:

` t_exampletoken@in.postique.fyi `

When a customer replies, the message is received, processed, matched to its conversation, and made available to the developer.

Postique also uses email headers such as `In-Reply-To` and `References` to identify the correct conversation.

If a reply cannot be matched automatically, it is retained for manual linking rather than silently discarded.

This is what makes Postique more than an email-sending API: it supports communication in both directions.

## 7. The Postique Inbox

Postique provides its own dashboard inbox where developers can view and manage conversations.

The inbox is intentionally focused on application-related communication rather than trying to reproduce every feature of Gmail or Outlook.

It includes:

- A list of conversations.
- Individual conversation views.
- Incoming and outgoing messages.
- Conversation labels.
- Search.
- Replying with saved templates.
- Message history.
- Conversation activity.

Developers can use this inbox when they want a central place to manage the conversations generated by their applications.

But the dashboard is only one way to use Postique.

## 8. The Embeddable Inbox: Your application becomes the email workspace

One of Postique's most important product ideas is allowing developers to embed an email inbox directly into their own applications.

Instead of forcing developers or their customers to visit the Postique dashboard, Postique can provide the tools to display conversations inside an existing website or application.

Imagine a marketplace with an administration dashboard.

An administrator opens an order and sees a conversation panel containing:

- The original confirmation email.
- The customer's reply.
- Previous responses.
- The ability to send another reply.
- The conversation's status and history.

The administrator never needs to leave the marketplace.

Postique handles the email infrastructure behind that interface.

### Three ways to use Postique

**1. Postique Dashboard**

Developers can manage all their conversations directly from Postique's own dashboard.

**2. Embeddable Inbox**

Developers can integrate a ready-made inbox or conversation interface into their own websites and applications.

This allows them to provide email communication without building the entire interface and conversation infrastructure themselves.

**3. Custom API and SDK**

Developers who want complete control can build their own interfaces using Postique's API and SDK.

They decide how messages, conversations, customer information, and replies should appear.

### An important distinction

Postique does not automatically import every email from a developer's Gmail or Outlook account.

It manages conversations that are sent through Postique or deliberately routed into its infrastructure.

A developer can continue using Gmail or Outlook for unrelated personal and business correspondence.

Postique focuses on the email conversations connected to their applications.

## 9. Intelligent FAQ response automation

Postique is also designed to support AI-powered email automation.

However, the idea is not simply to let an AI model invent responses to customer emails.

Instead, developers can create a collection of approved FAQ responses and allow AI to identify which response should be used when an incoming message arrives.

For example, an online store might configure the following approved responses:

| FAQ | Customer's likely question |
|---|---|
| Delivery information | How long will delivery take? |
| Return policy | Can I return this product? |
| Payment methods | Which payment methods do you accept? |
| Order tracking | How can I track my order? |
| Business hours | When are you available? |

Each FAQ contains a developer-approved response.

When an email arrives:

1. Postique receives the message.
2. The message is analyzed to identify the customer's intent.
3. The system compares that intent against the developer's configured FAQs.
4. It selects the appropriate approved response.
5. If the automation rules are satisfied, Postique sends that exact response.
6. The action is recorded in the conversation history.

The AI's primary responsibility is classification and selection, not writing new customer-facing content.

### Multiple questions in one email

A customer might ask:

"How long does delivery take, and can I pay using M-Pesa?"

The automation system should be able to identify multiple relevant questions and, when explicitly configured, combine the corresponding approved responses into one reply.

Developers can decide whether multiple FAQ responses may be combined or whether a message should be sent for human review.

### Human review and safety

Not every email should be answered automatically.

If the message is unclear, contains a sensitive issue, or does not match an approved FAQ with sufficient confidence, Postique can leave it for a human to handle.

Developers should also be able to enable, pause, and configure automation.

This approach gives businesses the efficiency of AI without sacrificing control over what they tell their customers.

## 10. Cloud asset management for email templates

Email templates frequently need images, logos, banners, icons, and animated GIFs.

Developers often have to find another hosting service just to store these assets and obtain URLs that can be used inside their HTML emails.

Postique is intended to provide a cloud asset library for this purpose.

Developers can upload their email assets and obtain direct URLs that can be referenced from their templates.

For example:

```html
<img
  src="https://assets.postique.fyi/your-image"
  alt="Company banner"
/>
```

The asset library can support:

- Image uploads.
- Logos and banners.
- Icons and other visual assets.
- Animated GIFs.
- Direct asset URLs.
- Asset organization and management.
- Storage usage tracking.

The idea is to make email design and asset hosting part of the same workflow.

Public assets can be used in email templates, while private assets should remain protected.

Because email clients handle remote images differently, developers should still design their templates with appropriate fallbacks.

## 11. Delivery logs, analytics and monitoring

Sending an email is not the same as successfully delivering it.

Postique provides message-level records so developers can understand what happened to every email.

Each message can have a status such as:

- Queued.
- Sent.
- Delivered.
- Bounced.
- Complained.
- Replied.

Developers can search their logs and inspect message events.

Webhooks can notify their applications when important events occur, including successful delivery, bounces, and received replies.

This makes it possible to build application-specific workflows.

For example, a booking platform could update a booking record when its confirmation email is delivered or notify an administrator when a customer replies.

Postique also needs to maintain suppression lists and monitor bounce and complaint rates to protect email deliverability.

## 12. Security and reliability

Because Postique handles customer communications, security and reliability are fundamental parts of the platform.

Its architecture is designed around several principles:

- Separate workspaces for different customers.
- Database-level access control.
- Hashed API keys.
- Restricted public API keys.
- Origin allow-lists and rate limits.
- Message idempotency to prevent accidental duplicate sends.
- Secure webhook verification.
- Sending limits and abuse detection.
- Bounce and complaint monitoring.
- Safe rendering of incoming email HTML.
- Protection against exposing server-side credentials.

Public inbox and browser integrations must not be trusted simply because they originate from a customer's website.

Postique must enforce permissions on the server for every operation.

For inbound email, untrusted HTML should be isolated, scripts stripped, and remote content blocked by default.

Reliability also matters. Sending jobs are queued, processed by background workers, and retried where appropriate.

This means the application does not have to keep a browser session open or wait for an email provider to finish delivering a message.

## 13. How Postique works behind the scenes

Postique brings together several infrastructure components to provide the complete experience.

**Application and dashboard:** The web application and API provide the developer interface and integration endpoints.

**Database and authentication:** Supabase provides the initial PostgreSQL database, authentication, storage, and row-level security.

**Background processing:** An always-on VPS worker handles queued sending jobs, retries, inbound processing, and related background tasks.

**Email delivery:** Amazon Simple Email Service (Amazon SES) is the planned primary outbound email provider.

**Inbound email:** Cloudflare Email Routing and a Cloudflare Email Worker receive replies on the Postique reply domain and forward them into Postique's processing system.

**Hosting and DNS:** Vercel hosts the planned Next.js dashboard and API, while Cloudflare manages DNS and the inbound email routing layer.

The architecture is designed to keep Postique's own API independent of a single email delivery provider. This makes it possible to introduce additional sending providers in the future without rebuilding the entire application.

## 14. Who should use Postique?

Postique is primarily designed for developers and teams building software products that communicate with users through email.

Examples include:

**SaaS developers:** Send onboarding messages, account notifications, billing emails, and receive customer replies inside their applications.

**Marketplace developers:** Manage buyer and seller communication, order confirmations, delivery questions, and support conversations.

**E-commerce developers:** Send order updates, payment confirmations, shipping notifications, and handle customer inquiries.

**Booking and reservation platforms:** Send booking confirmations, changes, reminders, and manage customer responses.

**Agencies and freelancers:** Integrate professional email communication into websites and applications they build for clients.

**Small software teams:** Avoid building and maintaining their own email infrastructure while retaining control over their application experience.

## 15. Why choose Postique?

Postique is not trying to replace Gmail or Outlook as general-purpose email clients.

It is not simply another service that sends HTML emails.

Its value comes from bringing several important capabilities together around the developer's application.

### Design and send from one platform

Create reusable, responsive email templates and send them through your application without maintaining separate email-generation systems.

### Conversations instead of isolated messages

Send emails, receive replies, and maintain the relationship between messages through proper conversation threading.

### Keep communication inside your application

Use the Postique dashboard, embed an inbox, or build your own communication interface through the API.

### Automate without surrendering control

Use AI to recognize customer questions and select developer-approved responses rather than allowing unrestricted AI-generated answers.

### Manage email assets alongside templates

Store images and other assets in a central library and use their direct URLs in email designs.

### One integration, multiple capabilities

Instead of separately assembling email delivery, template management, inbound processing, conversation management, and response automation, developers can build around one communication platform.

## 16. The bigger vision

The long-term vision for Postique is to become the email communication layer that applications can rely on.

A developer should be able to build an application, connect Postique, design its email experience, and immediately gain the ability to send messages, receive replies, manage conversations, embed an inbox, and automate routine communication.

The developer decides where communication appears and how it fits into their product.

Postique provides the infrastructure that makes it work.

It does not need to become another Gmail. It needs to make every application capable of having its own email communication experience.

**Postique — Email infrastructure for applications.**

*Design it. Send it. Receive it. Manage it. Automate it. All through one platform.*