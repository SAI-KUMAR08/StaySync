import { Resend } from "resend";
import { env } from "../config/env.js";
import { AppError } from "../middleware/error.middleware.js";

/**
 * Email delivery abstraction.
 *
 * Resend (official SDK) is the ONLY provider. When RESEND_API_KEY is not
 * configured, sending fails with a clear configuration error — there is no
 * development fallback, no OTP logging, and no OTP echoing. OTP values are
 * never logged and never surfaced in API responses in any environment.
 */

/** Resend's documented test sender — dev/test fallback when RESEND_FROM_EMAIL is unset. */
const DEV_SENDER_FALLBACK = "Sri Rama Hostel <onboarding@resend.dev>";

/**
 * Create an email service bound to a delivery configuration.
 *
 * @param {Object} opts
 * @param {string} [opts.resendKey]       - Resend API key (RESEND_API_KEY)
 * @param {string} [opts.fromEmail]       - Resend sender address (RESEND_FROM_EMAIL)
 * @param {string} [opts.nodeEnv]         - "development" | "test" | "production"
 * @param {Function} [opts.ResendClient]  - Resend SDK class (injectable for tests)
 * @param {Console} [opts.log]            - Logger (defaults to console; injectable for tests)
 */
export function createEmailService({
  resendKey,
  fromEmail,
  nodeEnv = "development",
  ResendClient = Resend,
  log = console,
}) {
  const resend = resendKey ? new ResendClient(resendKey) : null;

  /** Is the Resend provider configured? */
  function isResendConfigured() {
    return Boolean(resend);
  }

  /** Resolve the sender address Resend must use. */
  function resolveFrom() {
    if (fromEmail) return fromEmail;
    if (nodeEnv === "production") {
      throw new Error(
        "RESEND_FROM_EMAIL is not configured. A sender address is required to deliver email in production."
      );
    }
    return DEV_SENDER_FALLBACK;
  }

  async function sendViaResend({ to, subject, html }) {
    const { data, error } = await resend.emails.send({
      from: resolveFrom(),
      to,
      subject,
      html,
    });

    if (error) {
      log.error(`[EMAIL] Resend delivery failed for "${to}" <${subject}>: ${error.message}`);
      throw new AppError(
        `Unable to send the verification email: ${error.message || "Provider error"}`,
        502
      );
    }

    log.log(`[EMAIL] Sent to ${to} | Subject: ${subject} | id: ${data?.id ?? "—"}`);
    return { sent: true };
  }

  /**
   * Send an email through Resend. Without a configured provider this fails
   * loudly in every environment — there is no logging fallback and no delivery
   * is ever claimed when the email could not be sent.
   */
  async function sendEmail({ to, subject, html }) {
    if (!resend) {
      throw new Error(
        "Email provider is not configured (RESEND_API_KEY is unset). Set RESEND_API_KEY to deliver OTP emails."
      );
    }
    return sendViaResend({ to, subject, html });
  }

  /**
   * Send an OTP verification email with the existing branded template.
   *
   * @param {Object} options
   * @param {string} options.to       - Recipient email
   * @param {string} options.otp      - 6-digit OTP code
   * @param {string} options.purpose  - "Owner Login" | "Owner Registration" | "Password Reset"
   * @param {string} [options.name]   - Recipient name (optional)
   */
  function sendOtpEmail({ to, otp, purpose, name }) {
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

  return { isResendConfigured, sendEmail, sendOtpEmail };
}

/**
 * Singleton bound to the current environment — the default export used by the
 * rest of the application.
 */
const emailService = createEmailService({
  resendKey: env.RESEND_API_KEY,
  fromEmail: env.RESEND_FROM_EMAIL,
  nodeEnv: env.NODE_ENV,
});

export const isResendConfigured = emailService.isResendConfigured;
export const sendOtpEmail = emailService.sendOtpEmail;
export const sendEmail = emailService.sendEmail;

export default emailService;
