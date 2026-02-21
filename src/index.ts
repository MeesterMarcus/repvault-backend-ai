import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ApiError, makeErrorResponse, makeResponse } from "./api";
import { getGeminiApiKey } from "./gemini";
import { generateWorkoutInsights, validateInsightsPayload } from "./insights";
import { logRequestSummary } from "./logging";
import { maybeHandleTelemetryAction } from "./migrationTelemetry";
import { enforceRateLimit } from "./rateLimit";
import { resolveUserContext } from "./userTier";
import { generateWorkoutTemplate } from "./workoutTemplate";
import { GenerateRequestBody, GenerationType, InsightsPayload } from "./types";

const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

function getGenerationType(body: GenerateRequestBody): GenerationType {
  if (body.generationType === undefined) {
    return "workout_template";
  }
  if (body.generationType === "workout_template" || body.generationType === "workout_insights") {
    return body.generationType;
  }
  throw new ApiError(400, "INVALID_GENERATION_TYPE", "generationType must be workout_template or workout_insights.");
}

function parseRequestBody(event: APIGatewayProxyEvent): GenerateRequestBody {
  if (event.body === null || event.body === undefined) {
    return {};
  }

  if (typeof event.body !== "string") {
    if (typeof event.body === "object" && event.body !== null) {
      return event.body as unknown as GenerateRequestBody;
    }
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf-8") : event.body;
  return JSON.parse(rawBody) as GenerateRequestBody;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  let userIdForLogging = "unknown";
  let generationTypeForLogging: GenerationType = "workout_template";
  let schemaVersionForLogging: number | undefined;
  let sameTemplateLast3CountForLogging: number | undefined;
  let exerciseHistoryKeyCountForLogging: number | undefined;

  try {
    let body: GenerateRequestBody = {};
    try {
      body = parseRequestBody(event);
    } catch {
      throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    console.log(
      JSON.stringify({
        event: "request_routing_debug",
        rawBody: event.body,
        isBase64Encoded: event.isBase64Encoded,
        parsedBody: body,
        parsedAction: body?.action ?? null,
      })
    );

    const telemetryResponse = await maybeHandleTelemetryAction(event, body, ddbDocClient);
    if (telemetryResponse) {
      console.log(
        JSON.stringify({
          event: "request_routed_to_telemetry",
          action: body.action,
        })
      );
      return telemetryResponse;
    }

    const humanPrompt = body.prompt;
    const bodyUserId = body.userId;
    const generationType = getGenerationType(body);

    generationTypeForLogging = generationType;

    if (!humanPrompt || typeof humanPrompt !== "string" || humanPrompt.trim().length === 0) {
      throw new ApiError(400, "INVALID_INPUT", "Missing required field: prompt.");
    }

    const userContext = await resolveUserContext(event, ddbDocClient, bodyUserId);
    const userId = userContext.userId;
    console.log(
      JSON.stringify({
        event: "user_context_resolved",
        userId,
        tier: userContext.tier,
        tierSource: userContext.tierSource,
      })
    );

    let insightsPayload: InsightsPayload | undefined;
    if (generationType === "workout_insights") {
      insightsPayload = validateInsightsPayload(body.payload);
      schemaVersionForLogging = insightsPayload.schemaVersion;
      sameTemplateLast3CountForLogging = insightsPayload.history.sameTemplateLast3.length;
      exerciseHistoryKeyCountForLogging = Object.keys(insightsPayload.history.exerciseLast5).length;
    }

    userIdForLogging = userId;

    await enforceRateLimit(ddbDocClient, userId, userContext.tier);
    const apiKey = await getGeminiApiKey();

    if (generationType === "workout_insights") {
      if (!insightsPayload) {
        throw new ApiError(400, "INVALID_PAYLOAD", "payload is required for workout_insights.");
      }
      const insights = await generateWorkoutInsights(humanPrompt, insightsPayload, apiKey);
      logRequestSummary({
        userId,
        generationType,
        statusCode: 200,
        outputShape: "insights_object",
        schemaVersion: schemaVersionForLogging,
        sameTemplateLast3Count: sameTemplateLast3CountForLogging,
        exerciseHistoryKeyCount: exerciseHistoryKeyCountForLogging,
      });
      return makeResponse(200, { output: { insights } });
    }

    const outputArray = await generateWorkoutTemplate(humanPrompt, apiKey);
    logRequestSummary({
      userId,
      generationType,
      statusCode: 200,
      outputShape: "exercise_template_array",
    });
    return makeResponse(200, { output: outputArray });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      logRequestSummary({
        userId: userIdForLogging,
        generationType: generationTypeForLogging,
        statusCode: error.statusCode,
        outputShape: "error",
        schemaVersion: schemaVersionForLogging,
        sameTemplateLast3Count: sameTemplateLast3CountForLogging,
        exerciseHistoryKeyCount: exerciseHistoryKeyCountForLogging,
      });
      return makeErrorResponse(error.statusCode, error.code, error.message);
    }

    console.error("Unhandled error:", error);
    logRequestSummary({
      userId: userIdForLogging,
      generationType: generationTypeForLogging,
      statusCode: 500,
      outputShape: "error",
      schemaVersion: schemaVersionForLogging,
      sameTemplateLast3Count: sameTemplateLast3CountForLogging,
      exerciseHistoryKeyCount: exerciseHistoryKeyCountForLogging,
    });
    return makeErrorResponse(500, "INTERNAL_ERROR", "An unexpected internal error occurred.");
  }
};
