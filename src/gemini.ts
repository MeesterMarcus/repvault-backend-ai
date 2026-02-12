import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { ApiError } from "./api";
import { GEMINI_BASE_URL, SECRET_ID } from "./config";
import { GeminiResponse } from "./types";

export function extractJsonFromCandidate(candidateText: string): string {
  return candidateText.replace(/```(json)?/i, "").replace(/```/g, "").trim();
}

export function getCandidateText(result: GeminiResponse): string {
  const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : "";
}

export async function callGemini(prompt: string, apiKey: string): Promise<GeminiResponse> {
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
  } catch {
    throw new ApiError(500, "PROVIDER_ERROR", "Error parsing Gemini response JSON");
  }
}

export async function getGeminiApiKey(): Promise<string> {
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
