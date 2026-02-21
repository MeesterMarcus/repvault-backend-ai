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

export const VALID_CATEGORIES = ["Strength", "Cardio", "Flexibility", "Mobility"];
export const VALID_MUSCLE_GROUPS = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"];
export const VALID_EQUIPMENT = ["Dumbbells", "Barbell", "Kettlebell", "Bodyweight", "Resistance Bands", "Machines", "Medicine Ball", "Other"];

export type GenerationType = "workout_template" | "workout_insights";
export type RequestAction = "reportMigrationStatus" | "getMigrationStats";
export type SubscriptionTier = "free" | "premium";

export interface GenerateRequestBody {
  action?: RequestAction;
  prompt?: string;
  userId?: string;
  generationType?: GenerationType;
  payload?: unknown;
  installId?: string;
  platform?: "ios" | "android";
  appVersion?: string;
  schemaVersion?: number;
  latestSchemaVersion?: number;
  timestamp?: string;
  days?: number;
}

export interface ReportMigrationStatusRequest {
  action: "reportMigrationStatus";
  installId: string;
  platform: "ios" | "android";
  appVersion: string;
  schemaVersion: number;
  latestSchemaVersion: number;
  timestamp: string;
}

export interface MigrationStatsRequest {
  action: "getMigrationStats";
  days: number;
}

export interface UserUsageItem {
  userId: string;
  requestCount?: number;
  windowStartEpochMs?: number;
}

export interface BestSet {
  weight: number;
  reps: number;
}

export interface CurrentWorkoutExercisePayload {
  name: string;
  completedSetCount: number;
  totalVolume: number;
  bestSet: BestSet | null;
}

export interface CurrentWorkoutPayload {
  id: string;
  workoutTemplateId: string;
  name: string;
  date: string;
  durationSeconds: number;
  totalVolume: number;
  exercises: CurrentWorkoutExercisePayload[];
}

export interface SameTemplateWorkoutPayload {
  id: string;
  name: string;
  date: string;
  durationSeconds: number;
  totalVolume: number;
}

export interface ExerciseHistoryEntryPayload {
  workoutId: string;
  date: string;
  completedSetCount: number;
  totalVolume: number;
  bestSet: BestSet | null;
}

export interface InsightsHistoryPayload {
  sameTemplateLast3: SameTemplateWorkoutPayload[];
  exerciseLast5: Record<string, ExerciseHistoryEntryPayload[]>;
}

export interface InsightsPayload {
  schemaVersion: number;
  currentWorkout: CurrentWorkoutPayload;
  history: InsightsHistoryPayload;
}

export interface ExtractionData {
  muscleGroups: string[];
  equipment: string;
  category: string;
}

export type GeminiResponse = any;
