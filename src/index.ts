import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { predefinedExercises } from "./constants";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb"; // Add GetCommand
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

// Define types for exercise and sets.
export interface SetTemplate {
  id: string;
  reps: string;
  weight: string;
}

// Initialize DynamoDB DocumentClient
const ddbClient = new DynamoDBClient({ region: "us-east-1" }); // Use your desired region
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
const USER_USAGE_TABLE_NAME = "UserUsageTable"; // Add this constant
const MAX_REQUESTS_PER_USER = 10; // Define a simple limit

// Define the expected structure for the extraction step.
interface ExtractionData {
  muscleGroups: string[];
  equipment: string;
  category: string;
}

// Define a type for the Gemini API response.
type GeminiResponse = any;

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
  console.log("Raw Gemini response text:", rawResponseText);
  if (!response.ok) {
    throw new Error(`Gemini API error: ${rawResponseText}`);
  }
  try {
    return JSON.parse(rawResponseText);
  } catch (error) {
    throw new Error("Error parsing Gemini response JSON: " + error);
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

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const humanPrompt: string = body.prompt;
    const userId: string | undefined = body.userId;

    // Check for userId and enforce usage limits
    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Missing userId in request body." }),
      };
    }

    try {
      // Get current usage for the user
      const getCommand = new GetCommand({
        TableName: USER_USAGE_TABLE_NAME,
        Key: { userId: userId },
      });
      const { Item } = await ddbDocClient.send(getCommand);
      const currentUsage = Item ? Item.requestCount : 0;

      if (currentUsage >= MAX_REQUESTS_PER_USER) {
        console.log(`User ${userId} exceeded usage limit.`);
        return {
          statusCode: 429, // Too Many Requests
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "Usage limit exceeded." }),
        };
      }

      // Increment usage count
      const updateCommand = new UpdateCommand({
        TableName: USER_USAGE_TABLE_NAME,
        Key: { userId: userId },
        UpdateExpression: "SET requestCount = if_not_exists(requestCount, :start) + :inc",
        ExpressionAttributeValues: {
          ":start": 0,
          ":inc": 1,
        },
        ReturnValues: "UPDATED_NEW",
      });
      await ddbDocClient.send(updateCommand);
      console.log(`User ${userId} usage incremented. Current count: ${currentUsage + 1}`);

    } catch (dbError: any) {
      console.error("DynamoDB error:", dbError);
      // Continue processing the request even if DB update fails, but log the error
      // Depending on requirements, you might want to return a 500 here
    }

    if (!humanPrompt) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
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
    const extractionPrompt = `
Extract the main muscle groups, equipment preference, and category preference from the following prompt.
Return a JSON object with exactly three keys: "muscleGroups", "equipment", and "category".
  - "muscleGroups": Return an array of strings. Each string MUST be one of the following exactly: ${JSON.stringify(VALID_MUSCLE_GROUPS)}.
  - "equipment": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_EQUIPMENT)}. If none apply, return an empty string.
  - "category": Return a string that MUST be exactly one of the following: ${JSON.stringify(VALID_CATEGORIES)}. If none apply, return an empty string.
Do not include any additional keys or text. Strictly adhere to this schema.
Prompt: "${humanPrompt}"
`;
    console.log("Extraction prompt:", extractionPrompt);
    const extractionResultRaw = await callGemini(extractionPrompt, apiKey);
    console.log("Extraction raw result:", extractionResultRaw);
    let extractionData = parseExtractionResult(extractionResultRaw);
    console.log("Parsed extraction data before validation:", extractionData);

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

    console.log("Validated extraction data:", extractionData);

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
    console.log("Base prompt:", basePrompt);
    // STEP 4: Call Gemini to generate the workout routine.
    const workoutResultRaw = await callGemini(basePrompt, apiKey);
    console.log("Workout raw result:", workoutResultRaw);
    const workoutResult = parseWorkoutResult(workoutResultRaw);
    console.log("Parsed workout result:", workoutResult);

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
