import { sendServiceEmail } from './service-mail.js'

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function authHtml({ purpose, link, code, workspaceName }) {
  const title =
    purpose === 'recovery'
      ? 'Reset your password'
      : purpose === 'invite'
        ? 'You have been invited'
        : 'Sign in to your account'
  const intro =
    purpose === 'recovery'
      ? `Use the button below to sign in to ${escapeHtml(workspaceName)} and choose a new password.`
      : `Use the button below to sign in to ${escapeHtml(workspaceName)}.`
  return `<div style="margin:0;padding:0;background:#f3f0e8;font-family:Arial,Helvetica,sans-serif;color:#20251f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e8;padding:36px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fffefa;border:1px solid #e2ddd1;border-radius:14px;overflow:hidden">
        <tr><td style="padding:30px 32px 8px">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8e9588">Postique authentication</div>
          <h1 style="margin:14px 0 10px;font-size:27px;line-height:1.15;color:#171b17">${title}</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#5f675a">${intro}</p>
          <a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 20px;border-radius:7px;background:#171b17;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Continue</a>
          <p style="margin:22px 0 6px;font-size:12px;line-height:1.6;color:#8e9588">Or enter this one-time code:</p>
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:25px;letter-spacing:.2em;color:#20251f">${escapeHtml(code)}</div>
          <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9aa095">This link and code expire shortly. If you did not request this email, you can ignore it.</p>
        </td></tr>
        <tr><td style="padding:18px 32px 26px;border-top:1px solid #ece8dd;font-size:11px;color:#9aa095">Sent by ${escapeHtml(workspaceName)} · self-hosted Postique</td></tr>
      </table>
    </td></tr>
  </table>
</div>`
}

export async function sendAuthEmail({ workspaceId, workspaceName, to, purpose = 'magiclink', link, code }) {
  const subject =
    purpose === 'recovery'
      ? `Reset your password for ${workspaceName}`
      : purpose === 'invite'
        ? `You are invited to ${workspaceName}`
        : `Sign in to ${workspaceName}`
  const result = await sendServiceEmail({
    workspaceId,
    to,
    subject,
    html: authHtml({ purpose, link, code, workspaceName }),
    text: `${subject}\n\n${link}\n\nOne-time code: ${code}\n\nIf you did not request this message, ignore it.`,
    headers: {
      'X-Postique-Auth': purpose,
      'Auto-Submitted': 'auto-generated',
    },
  })
  return {
    sent: true,
    transport: result.transport,
    messageId: result.messageId,
  }
}
