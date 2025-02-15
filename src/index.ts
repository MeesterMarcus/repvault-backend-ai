import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { predefinedExercises } from "./constants";


const BASE_PROMPT = `Prior to generating your output, please ensure that you return back data that only exists within this set:\n
${JSON.stringify(predefinedExercises)} \n
\n
For each exercise, please include 3 default sets. The default set should be an object with "reps" set to "10" and "weight" set to "0".\n
Now based on the following prompt, construct back an array of exercises that fits my needs: \n
`;

const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const SECRET_ID = "prod/repvault-backend-ai/gemini-key";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorText }),
      };
    }

    const result = await response.json();
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
