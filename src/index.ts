import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { predefinedExercises } from "./constants";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Define types for exercise and sets.
export interface SetTemplate {
  id: string;
  reps: string;
  weight: string;
}

// Initialize DynamoDB DocumentClient.
const ddbClient = new DynamoDBClient({ region: "us-east-1" });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export interface ExerciseTemplate {
  id: string;
  name: string;
  sets: SetTemplate[];
  category: string;
  muscleGroup: string[];
  equipment: string;
  description?: string;
  imageUri?: string;
}

// Constants for validation.
export const VALID_CATEGORIES = ['Strength', 'Cardio', 'Flexibility', 'Mobility'];
export const VALID_MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const VALID_EQUIPMENT = ['Dumbbells', 'Barbell', 'Kettlebell', 'Bodyweight', 'Resistance Bands', 'Machines', 'Medicine Ball'];

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const SECRET_ID = "prod/repvault-backend-ai/gemini-key";
const USER_USAGE_TABLE_NAME = "UserUsageTable";
const RATE_LIMIT_WINDOW_MS = 8 * 60 * 60 * 1000;
const FREE_USER_LIMIT = 2;
const PREMIUM_USER_LIMIT = 10;

type GenerationType = "workout_template" | "workout_insights";
type SubscriptionTier = "free" | "premium";

// Define the expected structure for the extraction step.
interface ExtractionData {
  muscleGroups: string[];
  equipment: string;
  category: string;
}

// Define a type for the Gemini API response.
type GeminiResponse = any;

interface GenerateRequestBody {
  prompt?: string;
  userId?: string;
  generationType?: GenerationType;
  payload?: unknown;
}

interface UserUsageItem {
  userId: string;
  requestCount?: number;
  windowStartEpochMs?: number;
  subscriptionTier?: string;
}

interface BestSet {
  weight: number;
  reps: number;
}

interface CurrentWorkoutExercisePayload {
  name: string;
  completedSetCount: number;
  totalVolume: number;
  bestSet: BestSet;
}

interface CurrentWorkoutPayload {
  id: string;
  workoutTemplateId: string;
  name: string;
  date: string;
  durationSeconds: number;
  totalVolume: number;
  exercises: CurrentWorkoutExercisePayload[];
}

interface SameTemplateWorkoutPayload {
  id: string;
  name: string;
  date: string;
  durationSeconds: number;
  totalVolume: number;
}

interface ExerciseHistoryEntryPayload {
  workoutId: string;
  date: string;
  completedSetCount: number;
  totalVolume: number;
  bestSet: BestSet;
}

interface InsightsHistoryPayload {
  sameTemplateLast3: SameTemplateWorkoutPayload[];
  exerciseLast5: Record<string, ExerciseHistoryEntryPayload[]>;
}

interface InsightsPayload {
  schemaVersion: number;
  currentWorkout: CurrentWorkoutPayload;
  history: InsightsHistoryPayload;
}

class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Helper function to remove markdown formatting and extract JSON text.
 */
function extractJsonFromCandidate(candidateText: string): string {
  // Remove leading and trailing backticks and optional "json" hint.
  // E.g., candidateText might be "```json\n[ ... ]\n```"
  return candidateText.replace(/```(json)?/i, "").replace(/```/g, "").trim();
}

// Helper function to call Gemini API with a given prompt.
async function callGemini(prompt: string, apiKey: string): Promise<GeminiResponse> {
  const url = `${GEMINI_BASE_URL}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });
  const rawResponseText = await response.text();
  if (!response.ok) {
    throw new ApiError(500, "PROVIDER_ERROR", `Gemini API error: ${rawResponseText}`);
  }
  try {
    return JSON.parse(rawResponseText);
  } catch (error) {
    throw new ApiError(500, "PROVIDER_ERROR", "Error parsing Gemini response JSON");
  }
}

/**
 * Parse Gemini extraction result.
 */
function parseExtractionResult(result: GeminiResponse): ExtractionData {
  let extractionData: ExtractionData = { muscleGroups: [], equipment: "", category: "" };
  if (result?.candidates && result.candidates.length > 0) {
    const candidateText = result.candidates[0]?.content?.parts[0]?.text;
    if (candidateText) {
      const cleanedText = extractJsonFromCandidate(candidateText);
      try {
        extractionData = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Error parsing candidate text as JSON:", e);
      }
    }
  } else if (typeof result === "object" && "output" in result) {
    extractionData = result.output;
  } else {
    try {
      extractionData = JSON.parse(String(result));
    } catch (e) {
      console.error("Error parsing result directly as JSON:", e);
    }
  }
  return extractionData;
}

/**
 * Parse Gemini workout result.
 * We expect an array of exercise objects.
 */
function parseWorkoutResult(result: GeminiResponse): any[] {
  let workoutArray: any[] = [];
  if (result?.candidates && result.candidates.length > 0) {
    const candidateText = result.candidates[0]?.content?.parts[0]?.text;
    if (candidateText) {
      const cleanedText = extractJsonFromCandidate(candidateText);
      try {
        workoutArray = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Error parsing workout candidate text as JSON:", e);
      }
    }
  } else if (Array.isArray(result)) {
    workoutArray = result;
  } else {
    try {
      workoutArray = JSON.parse(String(result));
    } catch (e) {
      console.error("Error parsing workout result directly as JSON:", e);
    }
  }
  return workoutArray;
}

function parseInsightsResult(result: GeminiResponse): string[] {
  let parsedInsights: unknown;

  if (result?.candidates && result.candidates.length > 0) {
    const candidateText = result.candidates[0]?.content?.parts[0]?.text;
    if (candidateText) {
      const cleanedText = extractJsonFromCandidate(candidateText);
      try {
        parsedInsights = JSON.parse(cleanedText);
      } catch (e) {
        console.error("Error parsing insights candidate text as JSON:", e);
      }
    }
  } else {
    parsedInsights = result;
  }

  if (Array.isArray(parsedInsights)) {
    return parsedInsights.filter((item): item is string => typeof item === "string");
  }

  if (
    parsedInsights &&
    typeof parsedInsights === "object" &&
    Array.isArray((parsedInsights as { insights?: unknown }).insights)
  ) {
    return (parsedInsights as { insights: unknown[] }).insights.filter(
      (item): item is string => typeof item === "string"
    );
  }

  return [];
}

function sanitizeInsightLine(line: string): string {
  return line
    .replace(/[*_`#>\-\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeInsights(insights: string[]): string[] {
  return insights.map((line) => sanitizeInsightLine(line)).filter((line) => line.length > 0).slice(0, 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function getCandidateText(result: GeminiResponse): string {
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : "";
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r?\n/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((line) => sanitizeInsightLine(line))
    .filter((line) => line.length > 0);
}

function tryParseJsonFromText(text: string): unknown {
  const cleaned = extractJsonFromCandidate(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function normalizeInsightsFromText(rawText: string): string[] {
  const parsed = tryParseJsonFromText(rawText);
  if (Array.isArray(parsed)) {
    const normalizedArray = normalizeInsights(parsed.filter((item): item is string => typeof item === "string"));
    if (normalizedArray.length >= 3) {
      return normalizedArray.slice(0, 3);
    }
  }

  if (isRecord(parsed) && Array.isArray(parsed.insights)) {
    const normalizedObject = normalizeInsights(
      parsed.insights.filter((item): item is string => typeof item === "string")
    );
    if (normalizedObject.length >= 3) {
      return normalizedObject.slice(0, 3);
    }
  }

  const sentenceFallback = splitIntoSentences(rawText);
  if (sentenceFallback.length >= 3) {
    return sentenceFallback.slice(0, 3);
  }

  return [];
}

function validateInsightsPayload(payload: unknown): InsightsPayload {
  if (!isRecord(payload)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload must be an object.");
  }

  const schemaVersion = payload.schemaVersion;
  const currentWorkout = payload.currentWorkout;
  const history = payload.history;

  if (typeof schemaVersion !== "number") {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.schemaVersion must be a number.");
  }
  if (!isRecord(currentWorkout)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout must be an object.");
  }
  if (!isRecord(history)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.history must be an object.");
  }

  if (typeof currentWorkout.id !== "string" || currentWorkout.id.trim().length === 0) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.id must be a non-empty string.");
  }
  if (typeof currentWorkout.workoutTemplateId !== "string" || currentWorkout.workoutTemplateId.trim().length === 0) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.workoutTemplateId must be a non-empty string.");
  }
  if (typeof currentWorkout.name !== "string" || currentWorkout.name.trim().length === 0) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.name must be a non-empty string.");
  }
  if (!isValidIsoDate(currentWorkout.date)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.date must be a valid ISO date string.");
  }
  if (typeof currentWorkout.durationSeconds !== "number") {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.durationSeconds must be a number.");
  }
  if (typeof currentWorkout.totalVolume !== "number") {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.totalVolume must be a number.");
  }
  if (!Array.isArray(currentWorkout.exercises)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.exercises must be an array.");
  }

  const hasInvalidCurrentExercise = currentWorkout.exercises.some((exercise) => {
    if (!isRecord(exercise)) {
      return true;
    }
    if (typeof exercise.name !== "string" || typeof exercise.completedSetCount !== "number" || typeof exercise.totalVolume !== "number") {
      return true;
    }
    if (!isRecord(exercise.bestSet)) {
      return true;
    }
    return typeof exercise.bestSet.weight !== "number" || typeof exercise.bestSet.reps !== "number";
  });

  if (hasInvalidCurrentExercise) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.currentWorkout.exercises contains invalid entries.");
  }

  if (!Array.isArray(history.sameTemplateLast3)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.history.sameTemplateLast3 must be an array.");
  }

  const hasInvalidTemplateHistoryEntry = history.sameTemplateLast3.some((entry) => {
    if (!isRecord(entry)) {
      return true;
    }
    return (
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      !isValidIsoDate(entry.date) ||
      typeof entry.durationSeconds !== "number" ||
      typeof entry.totalVolume !== "number"
    );
  });

  if (hasInvalidTemplateHistoryEntry) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.history.sameTemplateLast3 contains invalid entries.");
  }

  if (!isRecord(history.exerciseLast5)) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.history.exerciseLast5 must be an object.");
  }

  const exerciseHistoryEntries = Object.values(history.exerciseLast5);
  const hasInvalidExerciseHistory = exerciseHistoryEntries.some((entries) => {
    if (!Array.isArray(entries)) {
      return true;
    }
    return entries.some((entry) => {
      if (!isRecord(entry) || !isRecord(entry.bestSet)) {
        return true;
      }
      return (
        typeof entry.workoutId !== "string" ||
        !isValidIsoDate(entry.date) ||
        typeof entry.completedSetCount !== "number" ||
        typeof entry.totalVolume !== "number" ||
        typeof entry.bestSet.weight !== "number" ||
        typeof entry.bestSet.reps !== "number"
      );
    });
  });

  if (hasInvalidExerciseHistory) {
    throw new ApiError(400, "INVALID_PAYLOAD", "payload.history.exerciseLast5 contains invalid entries.");
  }

  return {
    schemaVersion,
    currentWorkout: {
      id: currentWorkout.id as string,
      workoutTemplateId: currentWorkout.workoutTemplateId as string,
      name: currentWorkout.name as string,
      date: currentWorkout.date as string,
      durationSeconds: currentWorkout.durationSeconds as number,
      totalVolume: currentWorkout.totalVolume as number,
      exercises: currentWorkout.exercises as CurrentWorkoutExercisePayload[],
    },
    history: {
      sameTemplateLast3: history.sameTemplateLast3 as SameTemplateWorkoutPayload[],
      exerciseLast5: history.exerciseLast5 as Record<string, ExerciseHistoryEntryPayload[]>,
    },
  };
}

function getSubscriptionTier(item?: UserUsageItem): SubscriptionTier {
  return item?.subscriptionTier === "premium" ? "premium" : "free";
}

function getRequestLimitForTier(tier: SubscriptionTier): number {
  return tier === "premium" ? PREMIUM_USER_LIMIT : FREE_USER_LIMIT;
}

function getGenerationType(body: GenerateRequestBody): GenerationType {
  if (body.generationType === undefined) {
    return "workout_template";
  }
  if (body.generationType === "workout_template" || body.generationType === "workout_insights") {
    return body.generationType;
  }
  throw new ApiError(400, "INVALID_GENERATION_TYPE", "generationType must be workout_template or workout_insights.");
}

function makeResponse(statusCode: number, payload: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function makeErrorResponse(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return makeResponse(statusCode, { error: { code, message } });
}

function logRequestSummary(params: {
  userId: string;
  generationType: GenerationType;
  statusCode: number;
  outputShape: "exercise_template_array" | "insights_object" | "error";
  schemaVersion?: number;
  sameTemplateLast3Count?: number;
  exerciseHistoryKeyCount?: number;
}): void {
  console.log(
    JSON.stringify({
      event: "generate_request",
      userId: params.userId,
      generationType: params.generationType,
      statusCode: params.statusCode,
      outputShape: params.outputShape,
      schemaVersion: params.schemaVersion,
      sameTemplateLast3Count: params.sameTemplateLast3Count,
      exerciseHistoryKeyCount: params.exerciseHistoryKeyCount,
    })
  );
}

async function getGeminiApiKey(): Promise<string> {
  const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
  const secretResponse = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SECRET_ID })
  );
  if (!secretResponse.SecretString) {
    throw new ApiError(500, "INTERNAL_ERROR", "Failed to retrieve Gemini API key from Secrets Manager.");
  }
  const secretObject = JSON.parse(secretResponse.SecretString);
  if (!secretObject.GeminiApiKeySecret || typeof secretObject.GeminiApiKeySecret !== "string") {
    throw new ApiError(500, "INTERNAL_ERROR", "Gemini API key is not configured correctly.");
  }
  return secretObject.GeminiApiKeySecret;
}

async function enforceRateLimit(userId: string): Promise<void> {
  const now = Date.now();
  const getCommand = new GetCommand({
    TableName: USER_USAGE_TABLE_NAME,
    Key: { userId },
  });

  const { Item } = await ddbDocClient.send(getCommand);
  const usageItem = Item as UserUsageItem | undefined;
  const tier = getSubscriptionTier(usageItem);
  const limit = getRequestLimitForTier(tier);
  const currentCount = usageItem?.requestCount ?? 0;
  const windowStart = usageItem?.windowStartEpochMs ?? 0;
  const isWindowExpired = now - windowStart >= RATE_LIMIT_WINDOW_MS;

  if (isWindowExpired || windowStart === 0) {
    const resetCommand = new UpdateCommand({
      TableName: USER_USAGE_TABLE_NAME,
      Key: { userId },
      UpdateExpression: "SET requestCount = :count, windowStartEpochMs = :windowStart, subscriptionTier = if_not_exists(subscriptionTier, :tier)",
      ExpressionAttributeValues: {
        ":count": 1,
        ":windowStart": now,
        ":tier": tier,
      },
    });
    await ddbDocClient.send(resetCommand);
    return;
  }

  if (currentCount >= limit) {
    throw new ApiError(429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded for this 8-hour window.");
  }

  const incrementCommand = new UpdateCommand({
    TableName: USER_USAGE_TABLE_NAME,
    Key: { userId },
    UpdateExpression: "SET requestCount = if_not_exists(requestCount, :start) + :inc",
    ExpressionAttributeValues: {
      ":start": 0,
      ":inc": 1,
    },
  });
  await ddbDocClient.send(incrementCommand);
}

async function generateWorkoutTemplate(humanPrompt: string, apiKey: string): Promise<ExerciseTemplate[]> {
  // STEP 1: Extract muscle groups, equipment, and category preference.
  const extractionPrompt = `
Extract the main muscle groups, equipment preference, and category preference from the following prompt.
Return a JSON object with exactly three keys: "muscleGroups", "equipment", and "category".
  - "muscleGroups": Return an array of strings. Each string MUST be one of the following exactly: ${JSON.stringify(VALID_MUSCLE_GROUPS)}.
  - "equipment": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_EQUIPMENT)}. If none apply, return an empty string.
  - "category": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_CATEGORIES)}. If none apply, return an empty string.
Do not include any additional keys or text. Strictly adhere to this schema.
Prompt: "${humanPrompt}"
`;
  const extractionResultRaw = await callGemini(extractionPrompt, apiKey);
  let extractionData = parseExtractionResult(extractionResultRaw);

  // Validate extracted muscle groups.
  extractionData.muscleGroups = Array.isArray(extractionData.muscleGroups)
    ? extractionData.muscleGroups.filter((mg) => VALID_MUSCLE_GROUPS.includes(mg))
    : [];
  // Normalize and validate equipment.
  const normalizedEquipment = extractionData.equipment.trim().toLowerCase();
  extractionData.equipment =
    VALID_EQUIPMENT.find((eq) => eq.toLowerCase() === normalizedEquipment) || "";
  // Normalize and validate category.
  const normalizedCategory = extractionData.category.trim().toLowerCase();
  extractionData.category =
    VALID_CATEGORIES.find((cat) => cat.toLowerCase() === normalizedCategory) || "";

  // STEP 2: Filter predefinedExercises based on extracted muscle groups, equipment, and category.
  let filteredExercises: ExerciseTemplate[] = predefinedExercises;
  if (extractionData.muscleGroups.length > 0) {
    filteredExercises = filteredExercises.filter((exercise) =>
      extractionData.muscleGroups.some((mg) =>
        exercise.muscleGroup.map((g) => g.toLowerCase()).includes(mg.toLowerCase())
      )
    );
  }
  if (extractionData.equipment && extractionData.equipment.trim() !== "") {
    filteredExercises = filteredExercises.filter((exercise) =>
      exercise.equipment.toLowerCase().includes(extractionData.equipment.toLowerCase())
    );
  }
  if (extractionData.category && extractionData.category.trim() !== "") {
    filteredExercises = filteredExercises.filter((exercise) =>
      exercise.category.toLowerCase() === extractionData.category.toLowerCase()
    );
  }

  // STEP 3: Construct a new prompt with the filtered exercises.
  const basePrompt = `
Below is a predefined list of exercises:
${JSON.stringify(filteredExercises, null, 2)}

Using only the data provided above, generate an array of exercises that meets the following requirements:
1. Return exactly 5 exercise objects unless your instructions explicitly specify a different number.
2. Each exercise object must be one of the predefined exercises; do not invent new exercise data.
3. For each exercise, include exactly 3 set objects. Each set object must have:
   - "id": a unique UUID (you may use a UUID generator),
   - "reps": a string representing an integer, set to a recommended beginner's reps,
   - "weight": a string representing an integer, set to a recommended beginner's weight.
4. The output must be valid JSON and strictly conform to the following TypeScript interfaces:

export interface SetTemplate {
    id: string;
    reps: string;
    weight: string;
}

export interface ExerciseTemplate {
    id: string;
    name: string;
    sets: SetTemplate[];
    category: string;
    muscleGroup: string[];
    equipment: string;
    description?: string;
    imageUri?: string;
}

Do not include any additional text or explanation in your output.
Now, based on the prompt below, construct and return an array of exercise objects that fits the requirements:
${humanPrompt}
`;

  // STEP 4: Call Gemini to generate the workout routine.
  const workoutResultRaw = await callGemini(basePrompt, apiKey);
  const workoutResult = parseWorkoutResult(workoutResultRaw);

  // STEP 5: Map AI-generated exercise IDs back to the full exercise objects.
  const exerciseMap: Record<string, ExerciseTemplate> = predefinedExercises.reduce((acc, exercise) => {
    acc[exercise.id] = exercise;
    return acc;
  }, {} as Record<string, ExerciseTemplate>);

  const outputArray: ExerciseTemplate[] = Array.isArray(workoutResult)
    ? workoutResult.map((ex: any) => ({
      ...exerciseMap[ex.id],
      sets: ex.sets,
    }))
    : [];

  return outputArray;
}

async function generateWorkoutInsights(humanPrompt: string, payload: InsightsPayload, apiKey: string): Promise<string[]> {
  const insightsPrompt = `
You are a workout analysis assistant.
Use both the user prompt and workout payload below.
Output must be strict JSON with this exact shape and no extra keys:
{"insights":["...", "...", "..."]}
Rules:
- Exactly 3 insights.
- One sentence each.
- Practical and non-judgmental.
- Include at least one recommendation for the next workout.
- No markdown.
- No preamble or explanation text.

User prompt:
"${humanPrompt}"

Workout payload JSON:
${JSON.stringify(payload)}

Return only JSON.
`;

  const insightsRaw = await callGemini(insightsPrompt, apiKey);
  const parsedInsights = parseInsightsResult(insightsRaw);
  const normalizedInsights = normalizeInsights(parsedInsights);

  if (normalizedInsights.length === 3) {
    return normalizedInsights;
  }

  const candidateText = getCandidateText(insightsRaw);
  const fallbackNormalized = normalizeInsightsFromText(candidateText);

  if (fallbackNormalized.length === 3) {
    return fallbackNormalized;
  }

  throw new ApiError(500, "PROVIDER_ERROR", "Provider returned invalid insights output.");
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
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
      }
    }

    const humanPrompt = body.prompt;
    const userId = body.userId;
    const generationType = getGenerationType(body);

    generationTypeForLogging = generationType;

    if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
      throw new ApiError(400, "INVALID_INPUT", "Missing required field: userId.");
    }
    if (!humanPrompt || typeof humanPrompt !== "string" || humanPrompt.trim().length === 0) {
      throw new ApiError(400, "INVALID_INPUT", "Missing required field: prompt.");
    }

    let insightsPayload: InsightsPayload | undefined;
    if (generationType === "workout_insights") {
      insightsPayload = validateInsightsPayload(body.payload);
      schemaVersionForLogging = insightsPayload.schemaVersion;
      sameTemplateLast3CountForLogging = insightsPayload.history.sameTemplateLast3.length;
      exerciseHistoryKeyCountForLogging = Object.keys(insightsPayload.history.exerciseLast5).length;
    }

    userIdForLogging = userId;

    await enforceRateLimit(userId);
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
  } catch (error: any) {
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
