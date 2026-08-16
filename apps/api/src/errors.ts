import type { ErrorCodeSchema } from "@usm/contracts";
import type { z } from "zod";

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class VersionConflictError extends AppError {
  constructor(readonly currentRevision: number) {
    super(409, "VERSION_CONFLICT", "The resource changed since it was loaded", { currentRevision });
  }
}

export function parseIfMatch(value: string | undefined): number {
  if (!value) {
    throw new AppError(428, "PRECONDITION_REQUIRED", "If-Match is required");
  }
  const normalized = value.trim().replace(/^W\//, "").replace(/^\"|\"$/g, "");
  const revision = Number(normalized);
  if (!Number.isInteger(revision) || revision < 1) {
    throw new AppError(400, "BAD_REQUEST", "If-Match must contain a positive revision");
  }
  return revision;
}

export function revisionEtag(revision: number): string {
  return `W/\"${revision}\"`;
}
