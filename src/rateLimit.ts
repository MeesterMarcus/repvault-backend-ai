import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError } from "./api";
import {
  FREE_USER_LIMIT,
  PREMIUM_USER_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  USER_USAGE_TABLE_NAME,
} from "./config";
import { SubscriptionTier, UserUsageItem } from "./types";

function getRequestLimitForTier(tier: SubscriptionTier): number {
  return tier === "premium" ? PREMIUM_USER_LIMIT : FREE_USER_LIMIT;
}

export async function enforceRateLimit(
  ddbDocClient: DynamoDBDocumentClient,
  userId: string,
  tier: SubscriptionTier
): Promise<void> {
  const now = Date.now();
  const getCommand = new GetCommand({
    TableName: USER_USAGE_TABLE_NAME,
    Key: { userId },
  });

  const { Item } = await ddbDocClient.send(getCommand);
  const usageItem = Item as UserUsageItem | undefined;
  const limit = getRequestLimitForTier(tier);
  const currentCount = usageItem?.requestCount ?? 0;
  const windowStart = usageItem?.windowStartEpochMs ?? 0;
  const isWindowExpired = now - windowStart >= RATE_LIMIT_WINDOW_MS;

  if (isWindowExpired || windowStart === 0) {
    const resetCommand = new UpdateCommand({
      TableName: USER_USAGE_TABLE_NAME,
      Key: { userId },
      UpdateExpression:
        "SET requestCount = :count, windowStartEpochMs = :windowStart, subscriptionTier = :tier",
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
    console.log(
      JSON.stringify({
        event: "rate_limit_exceeded",
        userId,
        tier,
        limit,
        currentCount,
        windowStartEpochMs: windowStart,
        nowEpochMs: now,
        windowMs: RATE_LIMIT_WINDOW_MS,
      })
    );
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
