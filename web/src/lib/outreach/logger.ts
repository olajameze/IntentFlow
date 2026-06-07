type LogLevel = "info" | "warn" | "error";

type OutreachLogPayload = {
  level?: LogLevel;
  event: string;
  prospectId?: string;
  campaign?: string;
  attempt?: number;
  issues?: string[];
  [key: string]: unknown;
};

/** Structured JSON logging for outreach backend events. */
export function outreachLog(payload: OutreachLogPayload): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: payload.level ?? "info",
    ...payload,
  });
  if (payload.level === "error") {
    console.error(line);
  } else if (payload.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}
