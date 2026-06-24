/** Normalize to last 10 digits (India mobile) for consistent lookup */
export function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 10) return digits;
  return digits.slice(-10);
}
