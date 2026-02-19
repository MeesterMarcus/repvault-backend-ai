import { ApiError } from "./api";
import { callGemini, extractJsonFromCandidate, getCandidateText } from "./gemini";
import {
  CurrentWorkoutExercisePayload,
  ExerciseHistoryEntryPayload,
  InsightsHistoryPayload,
  InsightsPayload,
  SameTemplateWorkoutPayload,
} from "./types";

function parseInsightsResult(result: any): string[] {
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

export function validateInsightsPayload(payload: unknown): InsightsPayload {
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
    if (
      typeof exercise.name !== "string" ||
      typeof exercise.completedSetCount !== "number" ||
      typeof exercise.totalVolume !== "number"
    ) {
      return true;
    }
    if (exercise.bestSet !== null) {
      if (!isRecord(exercise.bestSet)) {
        return true;
      }
      if (typeof exercise.bestSet.weight !== "number" || typeof exercise.bestSet.reps !== "number") {
        return true;
      }
    }
    return false;
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
      if (!isRecord(entry)) {
        return true;
      }
      if (
        typeof entry.workoutId !== "string" ||
        !isValidIsoDate(entry.date) ||
        typeof entry.completedSetCount !== "number" ||
        typeof entry.totalVolume !== "number"
      ) {
        return true;
      }
      if (entry.bestSet === null) {
        return false;
      }
      if (!isRecord(entry.bestSet)) {
        return true;
      }
      return typeof entry.bestSet.weight !== "number" || typeof entry.bestSet.reps !== "number";
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

export async function generateWorkoutInsights(
  humanPrompt: string,
  payload: InsightsPayload,
  apiKey: string
): Promise<string[]> {
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
- Ignore workout duration data entirely.
- Do not give any advice about workout length, session time, minutes, or speed.
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
