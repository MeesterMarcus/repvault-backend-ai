import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { predefinedExercises } from "./constants";

const BASE_PROMPT = `
Below is a predefined list of exercises:
${JSON.stringify(predefinedExercises, null, 2)}

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
`;

const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const SECRET_ID = "prod/repvault-backend-ai/gemini-key";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const prompt = `${BASE_PROMPT}${body.prompt}`;

    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing prompt!" }),
      };
    }

    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );

    if (!secretResponse.SecretString) {
      throw new Error("Failed to retrieve Gemini API key from Secrets Manager");
    }

    const secretObject = JSON.parse(secretResponse.SecretString);
    const apiKey = secretObject.GeminiApiKeySecret;
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
    console.log("Gemini response status:", response.status);
    const rawResponseText = await response.text();
    console.log("Raw Gemini response text:", rawResponseText);
    // Parse the response text after logging it
    let result;
    try {
      result = JSON.parse(rawResponseText);
    } catch (parseError) {
      console.error("Error parsing Gemini response JSON:", parseError);
      throw parseError;
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: rawResponseText }),
      };
    }

    console.log("Parsed Gemini result:", result);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ output: result }),
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
