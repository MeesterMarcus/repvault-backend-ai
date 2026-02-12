import { GenerationType } from "./types";

interface LogRequestSummaryParams {
  userId: string;
  generationType: GenerationType;
  statusCode: number;
  outputShape: "exercise_template_array" | "insights_object" | "error";
  schemaVersion?: number;
  sameTemplateLast3Count?: number;
  exerciseHistoryKeyCount?: number;
}

export function logRequestSummary(params: LogRequestSummaryParams): void {
  console.log(
    JSON.stringify({
      event: "generate_request",
      userId: params.userId,
      generationType: params.generationType,
      statusCode: params.statusCode,
      outputShape: params.outputShape,
      schemaVersion: params.schemaVersion,
      sameTemplateLast3Count: params.sameTemplateLast3Count,
      exerciseHistoryKeyCount: params.exerciseHistoryKeyCount,
    })
  );
}
