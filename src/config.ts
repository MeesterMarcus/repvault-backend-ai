export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
export const SECRET_ID = "prod/repvault-backend-ai/gemini-key";
export const USER_USAGE_TABLE_NAME = "UserUsageTable";
export const USER_PROFILE_TABLE_NAME = process.env.USER_PROFILE_TABLE_NAME || "UserProfileTable";

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

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  return raw.trim().toLowerCase() === "true";
}

export const RATE_LIMIT_WINDOW_MS = readPositiveIntEnv("RATE_LIMIT_WINDOW_MS", 8 * 60 * 60 * 1000);
export const FREE_USER_LIMIT = readPositiveIntEnv("FREE_USER_LIMIT", 2);
export const PREMIUM_USER_LIMIT = readPositiveIntEnv("PREMIUM_USER_LIMIT", 25);
export const REQUIRE_COGNITO_AUTH = readBooleanEnv("REQUIRE_COGNITO_AUTH", false);
