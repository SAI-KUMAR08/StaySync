
export function isMockOtp() {
  if (process.env.MOCK_OTP === "false") return false;
  return process.env.MOCK_OTP === "true" || process.env.NODE_ENV !== "production";
}

export const DEMO_OTP = "123456";
