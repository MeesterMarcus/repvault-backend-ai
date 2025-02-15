import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

// AWS SDK v3 client for Secrets Manager
const secretsClient = new SecretsManagerClient({ region: "us-east-1" });
const SECRET_ID = "prod/repvault-backend-ai/gemini-key";

// Gemini API configuration
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const prompt = body.prompt;
    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing prompt" }),
      };
    }

    // Retrieve API key from Secrets Manager
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: SECRET_ID })
    );
    if (!secretResponse.SecretString) {
      throw new Error("Failed to retrieve Gemini API key from Secrets Manager");
    }
    const apiKey = secretResponse.SecretString;

    // Construct the URL with the API key as a query parameter
    const url = `${GEMINI_BASE_URL}?key=${encodeURIComponent(apiKey)}`;

    // Invoke Gemini API
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
