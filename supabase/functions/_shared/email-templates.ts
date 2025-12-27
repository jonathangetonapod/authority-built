/**
 * Email templates for client portal
 */

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

/**
 * Portal invitation email template
 */
export function getPortalInvitationEmail(clientName: string, portalUrl: string): EmailTemplate {
  const subject = 'Welcome to Your Get On A Pod Client Portal'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Get On A Pod</h1>
  </div>

  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">Hi ${clientName},</h2>

    <p style="color: #4b5563; font-size: 16px;">
      You've been invited to access your <strong>Get On A Pod client portal</strong> where you can view all your podcast bookings and episodes in one place.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Access Your Portal
      </a>
    </div>

    <div style="background: #f9fafb; border-left: 4px solid #667eea; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; color: #4b5563; font-size: 14px;"><strong>Your portal gives you real-time access to:</strong></p>
      <ul style="color: #6b7280; font-size: 14px; margin: 8px 0 0 0; padding-left: 20px;">
        <li>All your podcast bookings</li>
        <li>Recording and publish dates</li>
        <li>Episode links once they're live</li>
        <li>Status updates on each placement</li>
      </ul>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      If you have any questions, feel free to reach out!
    </p>

    <p style="color: #4b5563; margin-bottom: 0;">
      Best,<br>
      <strong>The Get On A Pod Team</strong>
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">This link will remain active. Bookmark it for easy access!</p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${clientName},

You've been invited to access your Get On A Pod client portal where you can view all your podcast bookings and episodes in one place.

Access your portal here: ${portalUrl}

Your portal gives you real-time access to:
- All your podcast bookings
- Recording and publish dates
- Episode links once they're live
- Status updates on each placement

If you have any questions, feel free to reach out!

Best,
The Get On A Pod Team

---
This link will remain active. Bookmark it for easy access!
  `.trim()

  return { subject, html, text }
}

/**
 * Magic link authentication email template
 */
export function getMagicLinkEmail(clientName: string, magicLink: string): EmailTemplate {
  const subject = 'Your Get On A Pod Portal Login Link'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Get On A Pod</h1>
  </div>

  <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="color: #1f2937; margin-top: 0;">Hi ${clientName},</h2>

    <p style="color: #4b5563; font-size: 16px;">
      Click the button below to access your client portal:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Sign In to Portal
      </a>
    </div>

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; color: #92400e; font-size: 13px;">
        <strong>⏱️ This link expires in 15 minutes</strong> for your security.
      </p>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0;">Get On A Pod - Your Podcast Booking Portal</p>
  </div>
</body>
</html>
  `.trim()

  const text = `
Hi ${clientName},

Click the link below to access your client portal:

${magicLink}

⏱️ This link expires in 15 minutes for your security.

If you didn't request this, you can safely ignore this email.

---
Get On A Pod - Your Podcast Booking Portal
  `.trim()

  return { subject, html, text }
}
