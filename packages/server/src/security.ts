import { timingSafeEqual } from "node:crypto";

export function isAuthorizedRequest(request: Request, password: string): boolean {
  const requestUrl = new URL(request.url);
  const token =
    extractBearerToken(request.headers.get("authorization")) ??
    toText(requestUrl.searchParams.get("token"));
  if (!token) return false;
  return constantTimeMatch(password, token);
}

export function isLoopbackAddress(address: string): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function constantTimeMatch(expectedToken: string, actualToken: string): boolean {
  const expected = Buffer.from(expectedToken, "utf8");
  const actual = Buffer.from(actualToken, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function extractBearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match?.[1]?.trim() ?? null;
}

function toText(value: string | null): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
