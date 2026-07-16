
/**
 * Determine whether to use mock (demo) OTP instead of real delivery.
 *
 * Mock mode is active when:
 *  - MOCK_OTP=true is explicitly set, OR
 *  - NODE_ENV is "development" (local dev), AND
 *  - MOCK_OTP is not explicitly set to "false"
 *
 * Vercel production deployments are detected via VERCEL_ENV=production
 * (auto-set by Vercel) so NODE_ENV does not need to be changed.
 */
export function isMockOtp() {
  if (process.env.MOCK_OTP === "false") return false;
  if (process.env.MOCK_OTP === "true") return true;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV !== "production";
}

export const DEMO_OTP = "123456";
