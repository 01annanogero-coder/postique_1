function emailShell({
  preview,
  eyebrow,
  heading,
  intro,
  content = '',
  ctaLabel,
  ctaUrl,
  footnote = 'Questions? Just reply to this email — a real person will help.',
  accent = '#C6F26B',
}) {
  return `<mjml>
  <mj-head>
    <mj-title>${heading}</mj-title>
    <mj-preview>${preview}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Helvetica Neue, Helvetica, Arial, sans-serif" />
      <mj-text color="#171B17" font-size="15px" line-height="1.7" />
      <mj-button border-radius="10px" font-weight="700" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="#EFEBE1" width="600px">
    <mj-section background-color="#131713" padding="22px 36px">
      <mj-column>
        <mj-text color="#F7F4EB" font-size="20px" font-weight="800" letter-spacing="-0.4px">
          ACME<span style="color:${accent}">.</span>
        </mj-text>
      </mj-column>
      <mj-column>
        <mj-text align="right" color="#A7AC9F" font-size="11px" letter-spacing="1.4px">
          NAIROBI · KENYA
        </mj-text>
      </mj-column>
    </mj-section>

    <mj-section background-color="#FFFFFF" padding="48px 40px 10px">
      <mj-column>
        <mj-text color="#6D7467" font-size="11px" font-weight="700" letter-spacing="2px" text-transform="uppercase" padding-bottom="18px">
          ${eyebrow}
        </mj-text>
        <mj-text font-size="36px" line-height="1.1" font-weight="800" letter-spacing="-1.2px" padding-bottom="16px">
          ${heading}
        </mj-text>
        <mj-text font-size="16px" line-height="1.75" color="#52594E" padding-bottom="8px">
          ${intro}
        </mj-text>
      </mj-column>
    </mj-section>

    ${content}

    ${
      ctaLabel
        ? `<mj-section background-color="#FFFFFF" padding="12px 40px 36px">
      <mj-column>
        <mj-button href="${ctaUrl}" background-color="#131713" color="#F7F4EB" inner-padding="15px 26px" font-size="14px">
          ${ctaLabel}
        </mj-button>
      </mj-column>
    </mj-section>`
        : ''
    }

    <mj-section background-color="#F7F4EB" padding="28px 40px">
      <mj-column>
        <mj-text font-size="13px" color="#6D7467" line-height="1.7">
          ${footnote}
        </mj-text>
        <mj-text font-size="12px" color="#91978C" padding-top="16px">
          Acme Commerce · 14 Riverside Drive, Nairobi · Kenya<br />
          You received this email because you placed an order with us.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
}

const welcome = emailShell({
  preview: 'A warm welcome — and everything you need to get started.',
  eyebrow: 'Welcome to Acme',
  heading: 'A little more room<br />for good things.',
  intro: `Hi {{name}},<br /><br />
    We're glad you're here. Acme makes considered objects for everyday living — designed in Nairobi, made to last.<br /><br />
    Your account is ready. Use the link below to finish setting up your profile and save your delivery details.`,
  content: `<mj-section background-color="#FFFFFF" padding="10px 40px 0">
      <mj-column>
        <mj-text background-color="#F3F7EA" padding="20px 22px" font-size="14px" color="#3E4A36">
          <strong>Your account</strong><br />
          {{email}}<br /><br />
          <span style="color:#7C8575">Member since ${new Date().getFullYear()} · Free delivery on your first order</span>
        </mj-text>
      </mj-column>
    </mj-section>`,
  ctaLabel: 'Explore the collection',
  ctaUrl: '{{cta_url}}',
})

const orderConfirmation = emailShell({
  preview: 'Order #{{order_id}} is confirmed. We are getting it ready.',
  eyebrow: 'Order confirmed',
  heading: 'Thank you, {{name}}.<br />Your order is in.',
  intro: `We've received order <strong>#{{order_id}}</strong> and our studio is already preparing it. We'll send another note the moment it ships.`,
  content: `<mj-section background-color="#FFFFFF" padding="14px 40px 0">
      <mj-column>
        <mj-table cellpadding="0" cellspacing="0" width="100%" font-size="14px" color="#171B17">
          <tr>
            <td style="padding:18px 0;border-top:1px solid #E9E5DB;border-bottom:1px solid #E9E5DB;width:72px;">
              <div style="width:52px;height:52px;border-radius:8px;background:#E7E2D4;text-align:center;line-height:52px;font-size:24px;">◒</div>
            </td>
            <td style="padding:18px 0 18px 14px;border-top:1px solid #E9E5DB;border-bottom:1px solid #E9E5DB;">
              <strong>The Everyday Set</strong><br />
              <span style="color:#82897C;font-size:13px;">Sand · Set of 4</span>
            </td>
            <td align="right" style="padding:18px 0;border-top:1px solid #E9E5DB;border-bottom:1px solid #E9E5DB;">
              <strong>KSh 8,400</strong>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 0;"></td>
            <td style="padding:16px 0;color:#6D7467;">Delivery</td>
            <td align="right" style="padding:16px 0;color:#6D7467;">Free</td>
          </tr>
          <tr>
            <td></td>
            <td style="padding:4px 0 20px;font-size:16px;"><strong>Total</strong></td>
            <td align="right" style="padding:4px 0 20px;font-size:16px;"><strong>{{total}}</strong></td>
          </tr>
        </mj-table>
        <mj-text font-size="13px" color="#6D7467" padding-top="12px">
          Delivering to <strong style="color:#171B17;">{{address}}</strong><br />
          Estimated arrival: 2–4 business days.
        </mj-text>
      </mj-column>
    </mj-section>`,
  ctaLabel: 'Track your order',
  ctaUrl: '{{cta_url}}',
})

const deliveryUpdate = emailShell({
  preview: 'Your order is on the way. Here is what happens next.',
  eyebrow: 'On the way',
  heading: 'Your order just<br />left the studio.',
  intro: `Hi {{name}}, order <strong>#{{order_id}}</strong> is with our courier and heading your way. We'll let you know as soon as it arrives.`,
  content: `<mj-section background-color="#FFFFFF" padding="10px 40px 0">
      <mj-column>
        <mj-text background-color="#131713" color="#F7F4EB" padding="24px">
          <span style="font-size:11px;letter-spacing:1.8px;color:#C6F26B;">TRACKING NUMBER</span><br /><br />
          <strong style="font-size:17px;letter-spacing:1px;">{{tracking_id}}</strong><br /><br />
          <span style="color:#A7AC9F;font-size:13px;">Courier: Acme Express · Estimated arrival {{arrival}}</span>
        </mj-text>
      </mj-column>
    </mj-section>`,
  ctaLabel: 'Follow the delivery',
  ctaUrl: '{{cta_url}}',
})

const passwordReset = emailShell({
  preview: 'Use this secure link to reset your Acme password.',
  eyebrow: 'Account security',
  heading: 'Let’s get you<br />back in.',
  intro: `Hi {{name}},<br /><br />
    We received a request to reset the password for your Acme account. This link is valid for 30 minutes and can only be used once.`,
  content: `<mj-section background-color="#FFFFFF" padding="14px 40px 0">
      <mj-column>
        <mj-text background-color="#F7F4EB" padding="18px 20px" font-size="13px" color="#6D7467">
          If you didn't request this, you can safely ignore this email. Your password will not change.
        </mj-text>
      </mj-column>
    </mj-section>`,
  ctaLabel: 'Reset password',
  ctaUrl: '{{reset_url}}',
  footnote: 'For security, this link expires in 30 minutes. Need help? Reply to this email.',
})

const abandonedCart = emailShell({
  preview: 'Your picks are still waiting — and we saved them for you.',
  eyebrow: 'Still thinking?',
  heading: 'Good things<br />worth coming back to.',
  intro: `Hi {{name}},<br /><br />
    We saved the pieces in your bag, but we can't hold them forever. Here's a quick look at what's waiting.`,
  content: `<mj-section background-color="#FFFFFF" padding="10px 40px 0">
      <mj-column>
        <mj-text background-color="#F7F4EB" padding="22px">
          <strong style="font-size:16px;">{{item_name}}</strong><br />
          <span style="color:#6D7467;font-size:13px;">{{item_variant}} · Reserved for 24 hours</span><br /><br />
          <span style="font-size:22px;font-weight:800;">{{item_price}}</span>
        </mj-text>
      </mj-column>
    </mj-section>`,
  ctaLabel: 'Return to your bag',
  ctaUrl: '{{cta_url}}',
})

export const seedTemplates = [
  {
    id: 'tpl_welcome',
    name: 'Welcome to Acme',
    slug: 'welcome',
    description: 'The first email a new customer receives.',
    subject: 'Welcome to Acme, {{name}}',
    status: 'published',
    version: 4,
    publishedVersion: 4,
    updated: '2 days ago',
    variables: [
      { key: 'name', sample: 'Wanjiru' },
      { key: 'email', sample: 'wanjiru@example.com' },
      { key: 'cta_url', sample: 'https://acme.co.ke/collections/new' },
    ],
    mjml: welcome,
  },
  {
    id: 'tpl_order',
    name: 'Order confirmation',
    slug: 'order-confirmation',
    description: 'Sent automatically after a successful checkout.',
    subject: 'Your Acme order #{{order_id}} is confirmed',
    status: 'published',
    version: 7,
    publishedVersion: 7,
    updated: '5 hours ago',
    variables: [
      { key: 'name', sample: 'Amara' },
      { key: 'order_id', sample: 'AC-4821' },
      { key: 'total', sample: 'KSh 8,400' },
      { key: 'address', sample: 'Westlands, Nairobi' },
      { key: 'cta_url', sample: 'https://acme.co.ke/orders/AC-4821' },
    ],
    mjml: orderConfirmation,
  },
  {
    id: 'tpl_delivery',
    name: 'Delivery update',
    slug: 'delivery-update',
    description: 'A friendly note when an order leaves the studio.',
    subject: 'Order #{{order_id}} is on the way',
    status: 'draft',
    version: 3,
    publishedVersion: 2,
    updated: 'Yesterday',
    variables: [
      { key: 'name', sample: 'Amara' },
      { key: 'order_id', sample: 'AC-4821' },
      { key: 'tracking_id', sample: 'ACX-8842-021' },
      { key: 'arrival', sample: 'Thursday, 6 Nov' },
      { key: 'cta_url', sample: 'https://acme.co.ke/track/ACX-8842-021' },
    ],
    mjml: deliveryUpdate,
  },
  {
    id: 'tpl_password',
    name: 'Password reset',
    slug: 'password-reset',
    description: 'Transactional reset link with a clear expiry notice.',
    subject: 'Reset your Acme password',
    status: 'published',
    version: 2,
    publishedVersion: 2,
    updated: '8 days ago',
    variables: [
      { key: 'name', sample: 'Fatima' },
      { key: 'reset_url', sample: 'https://acme.co.ke/reset/tok_82j1' },
    ],
    mjml: passwordReset,
  },
  {
    id: 'tpl_cart',
    name: 'Abandoned bag',
    slug: 'abandoned-bag',
    description: 'A low-pressure nudge for a saved cart.',
    subject: 'Still thinking it over, {{name}}?',
    status: 'draft',
    version: 1,
    publishedVersion: null,
    updated: '13 days ago',
    variables: [
      { key: 'name', sample: 'Wanjiru' },
      { key: 'item_name', sample: 'The Everyday Set' },
      { key: 'item_variant', sample: 'Sand' },
      { key: 'item_price', sample: 'KSh 8,400' },
      { key: 'cta_url', sample: 'https://acme.co.ke/cart' },
    ],
    mjml: abandonedCart,
  },
]
