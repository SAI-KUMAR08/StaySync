import nodemailer from "nodemailer";
import { env } from "../config/env.js";

/**
 * Create a Nodemailer transporter from SMTP env vars.
 * Returns null if SMTP is not configured.
 */
function createTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

const transporter = createTransporter();

/**
 * Send an email via SMTP.
 * Falls back to console.log when SMTP is not configured.
 * Never throws — failures are logged and swallowed.
 */
export async function sendEmail({ to, subject, html }) {
  if (!transporter || !env.SEND_REAL_EMAIL) {
    console.log(`[EMAIL][mock] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL][mock] Body:\n${html.replace(/<[^>]*>/g, "").trim().slice(0, 200)}...`);
    return { sent: false, mock: true };
  }

  try {
    await transporter.sendMail({
      from: env.EMAIL_FROM || `"Sri Rama Hostel" <${env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent to ${to} | Subject: ${subject}`);
    return { sent: true };
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error.message);
    return { sent: false, error: error.message };
  }
}

/**
 * Send an OTP verification email with a branded template.
 *
 * @param {Object} options
 * @param {string} options.to       - Recipient email
 * @param {string} options.otp      - 6-digit OTP code
 * @param {string} options.purpose  - "Owner Login" | "Owner Registration" | "Password Reset"
 * @param {string} [options.name]   - Recipient name (optional)
 */
export async function sendOtpEmail({ to, otp, purpose, name }) {
  const subject = `Your OTP for ${purpose} — Sri Rama Hostel`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f3f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3f0;padding:24px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background:#5C3D2E;padding:32px 24px 20px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
                Sri Rama Hostel
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 4px;color:#1a1410;font-size:15px;font-weight:600;">
                ${name ? `Hi ${name},` : "Hello,"}
              </p>
              <p style="margin:12px 0 0;color:#5c4f48;font-size:14px;line-height:1.5;">
                Use the following verification code to complete your <strong>${purpose}</strong> request.
                This code expires in <strong>10 minutes</strong>.
              </p>

              <!-- OTP Tile -->
              <div style="background:#faf8f6;border:1px solid #e8e2dc;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
                <p style="margin:0 0 8px;color:#8c7a6e;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">
                  Verification Code
                </p>
                <p style="margin:0;font-size:32px;font-weight:800;letter-spacing:8px;color:#1a1410;font-family:monospace;">
                  ${otp}
                </p>
              </div>

              <p style="margin:0;color:#8c7a6e;font-size:12px;line-height:1.5;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#faf8f6;padding:16px 24px;border-top:1px solid #e8e2dc;">
              <p style="margin:0;color:#8c7a6e;font-size:11px;text-align:center;">
                Sri Rama Hostel Management System
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({ to, subject, html });
}
