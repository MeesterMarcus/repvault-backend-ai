export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
export const SECRET_ID = "prod/repvault-backend-ai/gemini-key";
export const USER_USAGE_TABLE_NAME = "UserUsageTable";

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid env ${name}=${raw}, using fallback ${fallback}`);
    return fallback;
  }

  return parsed;
}

export const RATE_LIMIT_WINDOW_MS = readPositiveIntEnv("RATE_LIMIT_WINDOW_MS", 8 * 60 * 60 * 1000);
export const FREE_USER_LIMIT = readPositiveIntEnv("FREE_USER_LIMIT", 2);
export const PREMIUM_USER_LIMIT = readPositiveIntEnv("PREMIUM_USER_LIMIT", 25);
