import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';

const secretsManager = new AWS.SecretsManager();
const SECRET_ID = 'prod/repvault-backend-ai/gemini-key';

let cachedApiKey: string | null = null;

async function getGeminiApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey;
  const secretValue = await secretsManager.getSecretValue({ SecretId: SECRET_ID }).promise();
  if ('SecretString' in secretValue && secretValue.SecretString) {
    cachedApiKey = secretValue.SecretString;
    return cachedApiKey;
  }
  throw new Error('Unable to retrieve secret string from Secrets Manager.');
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { prompt } = body;
    if (!prompt) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing prompt' }),
      };
    }

    const apiKey = await getGeminiApiKey();
    const url = `${GEMINI_BASE_URL}?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      })
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
      body: JSON.stringify({ output: result }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
