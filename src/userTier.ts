import { APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./api";
import { REQUIRE_COGNITO_AUTH, USER_PROFILE_TABLE_NAME } from "./config";
import { SubscriptionTier } from "./types";

interface UserProfileItem {
  userId: string;
  subscriptionTier?: string;
  plan?: string;
  isPremium?: boolean;
}

interface ResolvedUserContext {
  userId: string;
  tier: SubscriptionTier;
  tierSource: "claims" | "profile_table" | "fallback_free";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTierFromKnownValue(value: unknown): SubscriptionTier | undefined {
  if (typeof value === "boolean") {
    return value ? "premium" : "free";
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["premium", "pro", "plus", "paid", "gold"].includes(normalized)) {
    return "premium";
  }
  if (["free", "basic"].includes(normalized)) {
    return "free";
  }
  if (normalized === "true") {
    return "premium";
  }
  if (normalized === "false") {
    return "free";
  }
  return undefined;
}

function getClaimsFromEvent(event: APIGatewayProxyEvent): Record<string, unknown> | undefined {
  const authorizer = (event.requestContext as any)?.authorizer;
  const jwtClaims = authorizer?.jwt?.claims;
  if (isRecord(jwtClaims)) {
    return jwtClaims;
  }
  const legacyClaims = authorizer?.claims;
  if (isRecord(legacyClaims)) {
    return legacyClaims;
  }
  return undefined;
}

function getUserIdFromClaims(claims?: Record<string, unknown>): string | undefined {
  if (!claims) {
    return undefined;
  }

  const candidates = [claims.sub, claims["cognito:username"], claims.username, claims.user_id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function getTierFromClaims(claims?: Record<string, unknown>): SubscriptionTier | undefined {
  if (!claims) {
    return undefined;
  }

  const candidates = [
    claims["custom:tier"],
    claims.tier,
    claims.plan,
    claims["custom:plan"],
    claims.isPremium,
    claims["custom:isPremium"],
  ];
  for (const candidate of candidates) {
    const tier = toTierFromKnownValue(candidate);
    if (tier) {
      return tier;
    }
  }
  return undefined;
}

async function getTierFromProfileTable(
  ddbDocClient: DynamoDBDocumentClient,
  userId: string
): Promise<SubscriptionTier | undefined> {
  const { Item } = await ddbDocClient.send(
    new GetCommand({
      TableName: USER_PROFILE_TABLE_NAME,
      Key: { userId },
    })
  );

  const profile = Item as UserProfileItem | undefined;
  if (!profile) {
    return undefined;
  }

  if (profile.isPremium === true) {
    return "premium";
  }

  return toTierFromKnownValue(profile.subscriptionTier) ?? toTierFromKnownValue(profile.plan);
}

export async function resolveUserContext(
  event: APIGatewayProxyEvent,
  ddbDocClient: DynamoDBDocumentClient,
  bodyUserId?: string
): Promise<ResolvedUserContext> {
  const claims = getClaimsFromEvent(event);
  const authUserId = getUserIdFromClaims(claims);

  if (REQUIRE_COGNITO_AUTH && !authUserId) {
    throw new ApiError(401, "UNAUTHORIZED", "A valid Cognito token is required.");
  }

  if (authUserId && bodyUserId && authUserId !== bodyUserId) {
    throw new ApiError(403, "USER_MISMATCH", "Authenticated user does not match request userId.");
  }

  const userId = authUserId || bodyUserId;
  if (!userId || userId.trim().length === 0) {
    throw new ApiError(400, "INVALID_INPUT", "Missing required field: userId.");
  }

  const claimsTier = getTierFromClaims(claims);
  if (claimsTier) {
    return { userId, tier: claimsTier, tierSource: "claims" };
  }

  const profileTier = await getTierFromProfileTable(ddbDocClient, userId);
  if (profileTier) {
    return { userId, tier: profileTier, tierSource: "profile_table" };
  }

  return { userId, tier: "free", tierSource: "fallback_free" };
}
