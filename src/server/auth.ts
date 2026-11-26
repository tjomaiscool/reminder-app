import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PASSWORD_MIN_BYTES = 32;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_COOKIE_NAME = "cadence_session";
const SESSION_KEY_SALT = "cadence-session-signing-v1";

export function getConfiguredPassword(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const password = environment.APP_PASSWORD;
  if (!password && environment.NODE_ENV === "production") {
    throw new Error("APP_PASSWORD is required in production.");
  }
  if (password && Buffer.byteLength(password, "utf8") < PASSWORD_MIN_BYTES) {
    throw new Error(`APP_PASSWORD must be at least ${PASSWORD_MIN_BYTES} bytes.`);
  }
  return password;
}

export function verifyPassword(candidate: unknown, password: string): boolean {
  if (typeof candidate !== "string" || Buffer.byteLength(candidate, "utf8") > 1024) return false;
  const candidateHash = createHash("sha256").update(candidate, "utf8").digest();
  const passwordHash = createHash("sha256").update(password, "utf8").digest();
  return timingSafeEqual(candidateHash, passwordHash);
}

export function hasValidSession(cookieHeader: string | undefined, password: string, now = Date.now()): boolean {
  const token = getSessionToken(cookieHeader);
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [issuedAtText, nonce, signature] = parts;
  if (!/^\d+$/.test(issuedAtText) || !/^[A-Za-z0-9_-]{22}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return false;
  }

  const issuedAt = Number(issuedAtText);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowSeconds + 60 || nowSeconds - issuedAt > SESSION_MAX_AGE_SECONDS) {
    return false;
  }

  const payload = `${issuedAtText}.${nonce}`;
  const expectedSignature = createHmac("sha256", getSessionKey(password)).update(payload).digest();
  const actualSignature = Buffer.from(signature, "base64url");
  return actualSignature.length === expectedSignature.length && timingSafeEqual(actualSignature, expectedSignature);
}

export function createSessionCookie(password: string, secure: boolean, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${issuedAt}.${nonce}`;
  const signature = createHmac("sha256", getSessionKey(password)).update(payload).digest("base64url");
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureAttribute}`;
}

export function clearSessionCookie(secure: boolean): string {
  const secureAttribute = secure ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute}`;
}

function getSessionToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  let token: string | undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    if (token !== undefined) return undefined;
    token = part.slice(separator + 1).trim();
  }

  return token;
}

function getSessionKey(password: string): Buffer {
  return createHmac("sha256", password).update(SESSION_KEY_SALT).digest();
}
