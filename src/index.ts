import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { predefinedExercises } from "./constants";

// Define types for exercise and sets (if not already defined in your project)
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

// Constants for validation.
export const VALID_CATEGORIES = ['Strength', 'Cardio', 'Flexibility', 'Mobility'];
export const VALID_MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
export const VALID_EQUIPMENT = ['Dumbbells', 'Barbell', 'Kettlebell', 'Bodyweight', 'Resistance Bands', 'Machines', 'Medicine Ball'];

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const SECRET_ID = "prod/repvault-backend-ai/gemini-key";

// Define the expected structure for the extraction step.
interface ExtractionData {
  muscleGroups: string[];
  equipment: string;
  category: string;
}

// Define a type for the Gemini API response.
type GeminiResponse = unknown;

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
    throw new Error(`Gemini API error: ${rawResponseText}`);
  }
  try {
    return JSON.parse(rawResponseText);
  } catch (error) {
    throw new Error("Error parsing Gemini response JSON: " + error);
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const humanPrompt: string = body.prompt;
    if (!humanPrompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing prompt!" }),
      };
    }
    const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );
    if (!secretResponse.SecretString) {
      throw new Error("Failed to retrieve Gemini API key from Secrets Manager");
    }
    const secretObject = JSON.parse(secretResponse.SecretString);
    const apiKey: string = secretObject.GeminiApiKeySecret;

    // STEP 1: Extract muscle groups, equipment, and category preference.
    // The prompt now includes strict rules: only return valid values (from the provided arrays) in the JSON.
    const extractionPrompt = `
Extract the main muscle groups, equipment preference, and category preference from the following prompt.
Return a JSON object with exactly three keys: "muscleGroups", "equipment", and "category".
  - "muscleGroups": Return an array of strings. Each string MUST be one of the following exactly: ${JSON.stringify(VALID_MUSCLE_GROUPS)}.
  - "equipment": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_EQUIPMENT)}. If none apply, return an empty string.
  - "category": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_CATEGORIES)}. If none apply, return an empty string.
Do not include any additional keys or text. Strictly adhere to this schema.
Prompt: "${humanPrompt}"
`;
    const extractionResult = await callGemini(extractionPrompt, apiKey);
    let extractionData: ExtractionData = { muscleGroups: [], equipment: "", category: "" };

    // Handle the extraction result based on its structure.
    if (typeof extractionResult === "object" && extractionResult && "output" in extractionResult) {
      extractionData = (extractionResult as { output: ExtractionData }).output;
    } else {
      try {
        extractionData = JSON.parse(String(extractionResult));
      } catch (e) {
        extractionData = { muscleGroups: [], equipment: "", category: "" };
      }
    }
    // Validate extracted muscle groups.
    extractionData.muscleGroups = Array.isArray(extractionData.muscleGroups)
      ? extractionData.muscleGroups.filter(mg => VALID_MUSCLE_GROUPS.includes(mg))
      : [];

    // Normalize and validate equipment.
    const normalizedEquipment = extractionData.equipment.trim().toLowerCase();
    extractionData.equipment =
      VALID_EQUIPMENT.find(eq => eq.toLowerCase() === normalizedEquipment) || "";

    // Normalize and validate category.
    const normalizedCategory = extractionData.category.trim().toLowerCase();
    extractionData.category =
      VALID_CATEGORIES.find(cat => cat.toLowerCase() === normalizedCategory) || "";

    console.log("Extraction data:", extractionData);

    // STEP 2: Filter predefinedExercises based on extracted muscle groups, equipment, and category.
    let filteredExercises: ExerciseTemplate[] = predefinedExercises;
    if (extractionData.muscleGroups.length > 0) {
      filteredExercises = filteredExercises.filter(exercise =>
        extractionData.muscleGroups.some(mg =>
          exercise.muscleGroup.map(g => g.toLowerCase()).includes(mg.toLowerCase())
        )
      );
    }
    if (extractionData.equipment && extractionData.equipment.trim() !== "") {
      filteredExercises = filteredExercises.filter(exercise =>
        exercise.equipment.toLowerCase().includes(extractionData.equipment.toLowerCase())
      );
    }
    if (extractionData.category && extractionData.category.trim() !== "") {
      filteredExercises = filteredExercises.filter(exercise =>
        exercise.category.toLowerCase() === extractionData.category.toLowerCase()
      );
    }
    console.log("Filtered exercises count:", filteredExercises.length);

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
    const workoutResult = await callGemini(basePrompt, apiKey);

    // STEP 5: Map AI-generated exercise IDs back to the full exercise objects.
    const exerciseMap: Record<string, ExerciseTemplate> = predefinedExercises.reduce((acc, exercise) => {
      acc[exercise.id] = exercise;
      return acc;
    }, {} as Record<string, ExerciseTemplate>);

    // Assuming the AI returns an array of objects with "id" and "sets" fields.
    const outputArray: ExerciseTemplate[] = Array.isArray(workoutResult)
      ? workoutResult.map((ex: any) => ({
          ...exerciseMap[ex.id],
          sets: ex.sets,
        }))
      : [];

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ output: outputArray }),
    };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
      }),
    };
  }
};
