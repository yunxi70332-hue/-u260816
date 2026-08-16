import { AppError } from "./errors.js";

const CHINA_MOBILE_PATTERN = /^1[3-9]\d{9}$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizePhoneNumber(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (CHINA_MOBILE_PATTERN.test(compact)) return `+86${compact}`;
  if (/^86(1[3-9]\d{9})$/.test(compact)) return `+${compact}`;
  if (E164_PATTERN.test(compact)) return compact;
  throw new AppError(422, "VALIDATION_ERROR", "请输入有效的登录手机号");
}

export function isNormalizedPhoneNumber(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function isSystemLoginEmail(value: string): boolean {
  return value.endsWith("@phone-login.invalid");
}

export function loginPlaceholderEmail(phoneNumber: string): string {
  return `phone.${phoneNumber.replace(/\D/g, "")}@phone-login.invalid`;
}
