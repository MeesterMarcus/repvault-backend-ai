import test from "node:test";
import assert from "node:assert/strict";
import { APIGatewayProxyEvent } from "aws-lambda";
import { maybeHandleTelemetryAction } from "./migrationTelemetry";

function makeEvent(claims?: Record<string, unknown>): APIGatewayProxyEvent {
  return {
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "/generate",
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: "/generate",
    requestContext: claims
      ? ({ authorizer: { jwt: { claims } } } as unknown as APIGatewayProxyEvent["requestContext"])
      : ({} as unknown as APIGatewayProxyEvent["requestContext"]),
  };
}

test("validation failures return VALIDATION_ERROR", async () => {
  const ddb = { send: async () => ({}) };
  const response = await maybeHandleTelemetryAction(
    makeEvent(),
    {
      action: "reportMigrationStatus",
      installId: "",
      platform: "ios",
      appVersion: "1.0.0",
      schemaVersion: 2,
      latestSchemaVersion: 2,
      timestamp: "2026-02-21T18:20:00Z",
    },
    ddb as any
  );

  assert.ok(response);
  const payload = JSON.parse(response!.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
});

test("unauthenticated reportMigrationStatus is accepted", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  const ddb = {
    send: async (command: { input: Record<string, unknown> }) => {
      capturedInput = command.input;
      return {};
    },
  };
  const response = await maybeHandleTelemetryAction(
    makeEvent(),
    {
      action: "reportMigrationStatus",
      installId: "install-1",
      platform: "ios",
      appVersion: "1.6.23",
      schemaVersion: 1,
      latestSchemaVersion: 2,
      timestamp: "2026-02-21T18:20:00.000Z",
      isGoodToGo: true as unknown as never,
    } as any,
    ddb as any
  );

  assert.ok(response);
  const payload = JSON.parse(response!.body);
  assert.equal(payload.ok, true);
  assert.ok(capturedInput);
  assert.equal((capturedInput!.ExpressionAttributeValues as Record<string, unknown>)[":userId"], null);
  assert.equal((capturedInput!.ExpressionAttributeValues as Record<string, unknown>)[":isGoodToGo"], false);
});

test("authenticated reportMigrationStatus attaches userId from claims", async () => {
  let capturedInput: Record<string, unknown> | undefined;
  const ddb = {
    send: async (command: { input: Record<string, unknown> }) => {
      capturedInput = command.input;
      return {};
    },
  };

  const response = await maybeHandleTelemetryAction(
    makeEvent({ sub: "user-123" }),
    {
      action: "reportMigrationStatus",
      installId: "install-2",
      platform: "android",
      appVersion: "1.6.23",
      schemaVersion: 2,
      latestSchemaVersion: 2,
      timestamp: "2026-02-21T18:20:00.000Z",
    },
    ddb as any
  );

  assert.ok(response);
  const payload = JSON.parse(response!.body);
  assert.equal(payload.ok, true);
  assert.equal((capturedInput!.ExpressionAttributeValues as Record<string, unknown>)[":userId"], "user-123");
});

test("idempotency: equal or older timestamp returns ok true", async () => {
  const ddb = {
    send: async () => {
      const error = new Error("Condition failed") as Error & { name: string };
      error.name = "ConditionalCheckFailedException";
      throw error;
    },
  };
  const response = await maybeHandleTelemetryAction(
    makeEvent(),
    {
      action: "reportMigrationStatus",
      installId: "install-3",
      platform: "ios",
      appVersion: "1.6.23",
      schemaVersion: 2,
      latestSchemaVersion: 2,
      timestamp: "2026-02-21T18:20:00.000Z",
    },
    ddb as any
  );

  assert.ok(response);
  const payload = JSON.parse(response!.body);
  assert.equal(payload.ok, true);
});

test("getMigrationStats is admin-only", async () => {
  const ddb = { send: async () => ({ Items: [] }) };
  const response = await maybeHandleTelemetryAction(
    makeEvent(),
    { action: "getMigrationStats", days: 30 },
    ddb as any
  );

  assert.ok(response);
  const payload = JSON.parse(response!.body);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "FORBIDDEN");
});

test("getMigrationStats returns aggregate values for admins", async () => {
  const now = new Date("2026-02-21T18:20:00.000Z").getTime();
  const realNow = Date.now;
  Date.now = () => now;

  try {
    const ddb = {
      send: async () => ({
        Items: [
          { lastSeenAt: "2026-02-21T18:10:00.000Z", isGoodToGo: true, schemaVersion: 2 },
          { lastSeenAt: "2026-02-20T18:10:00.000Z", isGoodToGo: false, schemaVersion: 1 },
          { lastSeenAt: "2025-12-01T00:00:00.000Z", isGoodToGo: true, schemaVersion: 2 },
        ],
      }),
    };
    const response = await maybeHandleTelemetryAction(
      makeEvent({ role: "admin" }),
      { action: "getMigrationStats", days: 30 },
      ddb as any
    );

    assert.ok(response);
    const payload = JSON.parse(response!.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.activeInstalls, 2);
    assert.equal(payload.migratedInstalls, 1);
    assert.equal(payload.percentMigrated, 50);
    assert.deepEqual(payload.schemaDistribution, { "1": 1, "2": 1 });
  } finally {
    Date.now = realNow;
  }
});
