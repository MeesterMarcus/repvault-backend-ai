import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, makeResponse } from "./api";
import { MIGRATION_STATUS_TABLE_NAME, MIGRATION_STATUS_TTL_DAYS } from "./config";
import {
  GenerateRequestBody,
  MigrationStatsRequest,
  ReportMigrationStatusRequest,
} from "./types";

interface ClaimsRecord {
  [key: string]: unknown;
}

interface MigrationStatusItem {
  pk: string;
  installId: string;
  userId: string | null;
  platform: "ios" | "android";
  appVersion: string;
  schemaVersion: number;
  latestSchemaVersion: number;
  isGoodToGo: boolean;
  lastSeenAt: string;
}

function makeTelemetryError(
  statusCode: number,
  code: "VALIDATION_ERROR" | "FORBIDDEN" | "BAD_REQUEST" | "INTERNAL_ERROR",
  message: string,
  details: Record<string, unknown> = {}
): APIGatewayProxyResult {
  return makeResponse(statusCode, { ok: false, error: { code, message, details } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getClaimsFromEvent(event: APIGatewayProxyEvent): ClaimsRecord | undefined {
  const requestContext = event.requestContext as unknown as Record<string, unknown> | undefined;
  const authorizer = requestContext?.authorizer as
    | Record<string, unknown>
    | undefined;
  const jwt = authorizer?.jwt as Record<string, unknown> | undefined;
  const jwtClaims = jwt?.claims;
  if (isRecord(jwtClaims)) {
    return jwtClaims;
  }
  const legacyClaims = authorizer?.claims;
  if (isRecord(legacyClaims)) {
    return legacyClaims;
  }
  return undefined;
}

function getUserIdFromClaims(claims?: ClaimsRecord): string | undefined {
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

function isAdminFromClaims(claims?: ClaimsRecord): boolean {
  if (!claims) {
    return false;
  }

  const groupClaim = claims["cognito:groups"];
  if (typeof groupClaim === "string") {
    const groups = groupClaim
      .split(",")
      .map((group) => group.trim().toLowerCase())
      .filter((group) => group.length > 0);
    if (groups.includes("admin")) {
      return true;
    }
  }

  const adminCandidates = [claims["custom:role"], claims.role, claims.isAdmin, claims["custom:isAdmin"]];
  for (const candidate of adminCandidates) {
    if (typeof candidate === "boolean") {
      if (candidate) {
        return true;
      }
      continue;
    }

    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      if (["admin", "true", "1", "yes"].includes(normalized)) {
        return true;
      }
    }
  }

  return false;
}

function isCanonicalIsoUtc(value: string): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString() === value;
}

function validateNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateReportMigrationStatus(body: GenerateRequestBody): ReportMigrationStatusRequest {
  const validationDetails: Record<string, string> = {};

  if (!validateNonEmptyString(body.installId)) {
    validationDetails.installId = "installId must be a non-empty string.";
  }
  if (body.platform !== "ios" && body.platform !== "android") {
    validationDetails.platform = "platform must be ios or android.";
  }
  if (!validateNonEmptyString(body.appVersion)) {
    validationDetails.appVersion = "appVersion must be a non-empty string.";
  }
  if (typeof body.schemaVersion !== "number" || !Number.isFinite(body.schemaVersion)) {
    validationDetails.schemaVersion = "schemaVersion must be a number.";
  }
  if (typeof body.latestSchemaVersion !== "number" || !Number.isFinite(body.latestSchemaVersion)) {
    validationDetails.latestSchemaVersion = "latestSchemaVersion must be a number.";
  }
  if (!validateNonEmptyString(body.timestamp) || !isCanonicalIsoUtc(body.timestamp)) {
    validationDetails.timestamp = "timestamp must be a canonical ISO UTC string.";
  }

  if (Object.keys(validationDetails).length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", JSON.stringify(validationDetails));
  }

  const installId = body.installId as string;
  const platform = body.platform as "ios" | "android";
  const appVersion = body.appVersion as string;
  const schemaVersion = body.schemaVersion as number;
  const latestSchemaVersion = body.latestSchemaVersion as number;
  const timestamp = body.timestamp as string;

  return {
    action: "reportMigrationStatus",
    installId: installId.trim(),
    platform,
    appVersion: appVersion.trim(),
    schemaVersion,
    latestSchemaVersion,
    timestamp,
  };
}

function parseDays(rawDays: unknown): number {
  if (rawDays === undefined) {
    return 30;
  }
  if (typeof rawDays !== "number" || !Number.isFinite(rawDays) || rawDays <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", JSON.stringify({ days: "days must be a positive number." }));
  }
  return Math.floor(rawDays);
}

function getTtlEpochSeconds(timestamp: string): number | undefined {
  if (!MIGRATION_STATUS_TTL_DAYS || MIGRATION_STATUS_TTL_DAYS <= 0) {
    return undefined;
  }
  const eventTime = new Date(timestamp).getTime();
  return Math.floor((eventTime + MIGRATION_STATUS_TTL_DAYS * 24 * 60 * 60 * 1000) / 1000);
}

export async function handleReportMigrationStatus(
  event: APIGatewayProxyEvent,
  body: GenerateRequestBody,
  ddbDocClient: DynamoDBDocumentClient
): Promise<APIGatewayProxyResult> {
  const validated = validateReportMigrationStatus(body);
  const claims = getClaimsFromEvent(event);
  const userId = getUserIdFromClaims(claims) ?? null;
  const isGoodToGo = validated.schemaVersion >= validated.latestSchemaVersion;
  const ttl = getTtlEpochSeconds(validated.timestamp);

  try {
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: MIGRATION_STATUS_TABLE_NAME,
        Key: { pk: `INSTALL#${validated.installId}` },
        UpdateExpression:
          "SET installId = :installId, userId = :userId, platform = :platform, appVersion = :appVersion, schemaVersion = :schemaVersion, latestSchemaVersion = :latestSchemaVersion, isGoodToGo = :isGoodToGo, lastSeenAt = :lastSeenAt, #ttl = :ttl",
        ConditionExpression: "attribute_not_exists(lastSeenAt) OR :lastSeenAt > lastSeenAt",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":installId": validated.installId,
          ":userId": userId,
          ":platform": validated.platform,
          ":appVersion": validated.appVersion,
          ":schemaVersion": validated.schemaVersion,
          ":latestSchemaVersion": validated.latestSchemaVersion,
          ":isGoodToGo": isGoodToGo,
          ":lastSeenAt": validated.timestamp,
          ":ttl": ttl ?? null,
        },
      })
    );
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err?.name === "ConditionalCheckFailedException") {
      return makeResponse(200, { ok: true });
    }
    throw error;
  }

  return makeResponse(200, { ok: true });
}

export async function handleGetMigrationStats(
  event: APIGatewayProxyEvent,
  body: GenerateRequestBody,
  ddbDocClient: DynamoDBDocumentClient
): Promise<APIGatewayProxyResult> {
  const claims = getClaimsFromEvent(event);
  if (!isAdminFromClaims(claims)) {
    return makeTelemetryError(403, "FORBIDDEN", "Admin privileges are required.");
  }

  const request: MigrationStatsRequest = {
    action: "getMigrationStats",
    days: parseDays(body.days),
  };

  const nowMs = Date.now();
  const cutoffMs = nowMs - request.days * 24 * 60 * 60 * 1000;

  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const activeItems: MigrationStatusItem[] = [];

  do {
    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: MIGRATION_STATUS_TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    const items = (result.Items || []) as MigrationStatusItem[];
    for (const item of items) {
      const seenAtMs = Date.parse(item.lastSeenAt);
      if (!Number.isNaN(seenAtMs) && seenAtMs >= cutoffMs) {
        activeItems.push(item);
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  const activeInstalls = activeItems.length;
  const migratedInstalls = activeItems.filter((item) => item.isGoodToGo === true).length;
  const percentMigrated = activeInstalls === 0 ? 0 : Number(((migratedInstalls / activeInstalls) * 100).toFixed(2));
  const schemaDistribution: Record<string, number> = {};
  for (const item of activeItems) {
    const key = String(item.schemaVersion);
    schemaDistribution[key] = (schemaDistribution[key] || 0) + 1;
  }

  return makeResponse(200, {
    ok: true,
    activeInstalls,
    migratedInstalls,
    percentMigrated,
    schemaDistribution,
  });
}

export async function maybeHandleTelemetryAction(
  event: APIGatewayProxyEvent,
  body: GenerateRequestBody,
  ddbDocClient: DynamoDBDocumentClient
): Promise<APIGatewayProxyResult | null> {
  try {
    if (body.action === "reportMigrationStatus") {
      return await handleReportMigrationStatus(event, body, ddbDocClient);
    }
    if (body.action === "getMigrationStats") {
      return await handleGetMigrationStats(event, body, ddbDocClient);
    }
    return null;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      let details: Record<string, unknown> = {};
      if (error.code === "VALIDATION_ERROR") {
        try {
          details = JSON.parse(error.message) as Record<string, unknown>;
        } catch {
          details = {};
        }
      }
      const message =
        error.code === "VALIDATION_ERROR"
          ? "Request validation failed."
          : error.code === "FORBIDDEN"
            ? "Forbidden."
            : "Bad request.";
      return makeTelemetryError(error.statusCode, error.code as "VALIDATION_ERROR" | "FORBIDDEN" | "BAD_REQUEST", message, details);
    }

    console.error("Telemetry action failed:", error);
    return makeTelemetryError(500, "INTERNAL_ERROR", "An unexpected internal error occurred.");
  }
}

export const migrationTelemetryInternals = {
  getClaimsFromEvent,
  getUserIdFromClaims,
  isAdminFromClaims,
  isCanonicalIsoUtc,
  validateReportMigrationStatus,
  parseDays,
};
