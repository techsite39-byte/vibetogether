import nodemailer from 'nodemailer'

/**
 * Creates an SMTP-backed email sender without logging or simulating OTP delivery.
 */
export function createEmailService({
  host = '',
  port = 587,
  user = '',
  password = '',
  from = 'Vibe Together <no-reply@vibetogether.com>',
} = {}) {
  let transporter = null

  const isConfigured = Boolean(host && user && password)

  if (isConfigured) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(port) || 587,
      secure: Number(port) === 465,
      auth: {
        user,
        pass: password,
      },
    })
  }

  /**
   * Generates the branded HTML template for the 6-digit OTP email.
   */
  function generateOtpEmailHtml({ otp, email }) {
    const safeEmail = email.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character])
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Vibe Together Admin Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #08060e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f0e6ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #08060e; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 560px; background: linear-gradient(145deg, #130c22, #0d0718); border: 1px solid rgba(168, 43, 255, 0.35); border-radius: 20px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(119, 59, 255, 0.2); overflow: hidden;">
          <!-- Top Accent Banner -->
          <tr>
            <td style="height: 6px; background: linear-gradient(90deg, #d12aff, #773bff 50%, #00f2fe);"></td>
          </tr>
          <!-- Header -->
          <tr>
            <td style="padding: 36px 36px 12px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: #ffffff; text-shadow: 0 0 16px rgba(168, 43, 255, 0.5);">
                VIBE TOGETHER
              </h1>
              <p style="margin: 6px 0 0; font-size: 13px; color: #a996c5; letter-spacing: 0.06em; text-transform: uppercase;">
                Admin Security &middot; Password Reset
              </p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 16px 36px 28px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #e1d3f5;">
                Hello Administrator,
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #bfb0db;">
                A password reset request was received for your admin account (<strong style="color: #ffffff;">${safeEmail}</strong>). Use the verification code below to authorize this request:
              </p>
              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; padding: 18px 36px; background: rgba(168, 43, 255, 0.12); border: 2px solid #a82bff; border-radius: 14px; box-shadow: 0 0 25px rgba(168, 43, 255, 0.35);">
                      <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.3em; color: #ffffff; text-shadow: 0 0 12px rgba(209, 42, 255, 0.8);">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
              <!-- Expiry & Notice -->
              <p style="margin: 20px 0 12px; font-size: 13px; line-height: 1.6; color: #f59e0b; font-weight: 600; text-align: center;">
                &#9201; This code expires in 5 minutes and can only be used once.
              </p>
              <!-- Security Warning -->
              <div style="margin-top: 24px; padding: 14px 18px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; font-size: 12px; line-height: 1.5; color: #fca5a5;">
                <strong>Security Notice:</strong> Never share this verification code with anyone. Vibe Together administrators will never contact you asking for your OTP. If you did not make this request, please disregard this email and verify your account security.
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background-color: #0b0614; border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center; font-size: 11px; color: #7f7098;">
              &copy; ${new Date().getFullYear()} Vibe Together &middot; All rights reserved. &middot; Automated security transmission.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }

  /**
   * Sends the 6-digit OTP to the registered admin email address.
   */
  async function sendOtpEmail({ email, otp }) {
    if (!transporter) {
      throw Object.assign(
        new Error('SMTP is not configured for password reset email delivery.'),
        { status: 503 },
      )
    }

    const html = generateOtpEmailHtml({ otp, email })
    const subject = `[Vibe Together] Your Admin Password Reset Code: ${otp}`
    const text = `Vibe Together Admin Password Reset\n\nYour 6-digit verification code is: ${otp}\n\nThis code expires in 5 minutes and can only be used once.\nIf you did not request this code, please ignore this email.`

    try {
      const delivery = await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html,
      })
      if (!delivery.accepted?.length) {
        throw new Error('SMTP server did not accept the recipient.')
      }
      return { delivered: true, method: 'smtp' }
    } catch (err) {
      console.error('[EmailService] SMTP delivery failed:', err.message)
      throw Object.assign(
        new Error('Failed to deliver verification email. Please check your SMTP configuration.'),
        { status: 502, cause: err },
      )
    }
  }

  return {
    isConfigured,
    sendOtpEmail,
  }
}
