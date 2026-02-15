import { predefinedExercises } from "./constants";
import { callGemini, extractJsonFromCandidate } from "./gemini";
import {
  ExerciseTemplate,
  ExtractionData,
  GeminiResponse,
  VALID_CATEGORIES,
  VALID_EQUIPMENT,
  VALID_MUSCLE_GROUPS,
} from "./types";

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

export async function generateWorkoutTemplate(humanPrompt: string, apiKey: string): Promise<ExerciseTemplate[]> {
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
  const extractionData = parseExtractionResult(extractionResultRaw);

  extractionData.muscleGroups = Array.isArray(extractionData.muscleGroups)
    ? extractionData.muscleGroups.filter((mg) => VALID_MUSCLE_GROUPS.includes(mg))
    : [];

  const normalizedEquipment = extractionData.equipment.trim().toLowerCase();
  extractionData.equipment =
    VALID_EQUIPMENT.find((eq) => eq.toLowerCase() === normalizedEquipment) || "";

  const normalizedCategory = extractionData.category.trim().toLowerCase();
  extractionData.category =
    VALID_CATEGORIES.find((cat) => cat.toLowerCase() === normalizedCategory) || "";

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
    setTrackingType?: "duration";
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

  const workoutResultRaw = await callGemini(basePrompt, apiKey);
  const workoutResult = parseWorkoutResult(workoutResultRaw);

  const exerciseMap: Record<string, ExerciseTemplate> = predefinedExercises.reduce((acc, exercise) => {
    acc[exercise.id] = exercise;
    return acc;
  }, {} as Record<string, ExerciseTemplate>);

  return Array.isArray(workoutResult)
    ? workoutResult.map((ex: any) => ({
      ...exerciseMap[ex.id],
      sets: ex.sets,
    }))
    : [];
}
