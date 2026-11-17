import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearSessionCookie,
  createSessionCookie,
  getConfiguredPassword,
  hasValidSession,
  verifyPassword,
} from "./auth.js";

const password = "0123456789abcdef0123456789abcdef0123456789abcdef";

describe("password authentication", () => {
  it("requires a configured, high-entropy password in production", () => {
    assert.throws(() => getConfiguredPassword({ NODE_ENV: "production" }), /APP_PASSWORD is required/);
    assert.throws(() => getConfiguredPassword({ APP_PASSWORD: "too short" }), /at least 32 bytes/);
    assert.equal(getConfiguredPassword({ APP_PASSWORD: password }), password);
    assert.equal(getConfiguredPassword({}), undefined);
  });

  it("compares passwords without accepting invalid or oversized values", () => {
    assert.equal(verifyPassword(password, password), true);
    assert.equal(verifyPassword("incorrect", password), false);
    assert.equal(verifyPassword(undefined, password), false);
    assert.equal(verifyPassword("x".repeat(1025), password), false);
  });

  it("accepts only untampered, unexpired session cookies", () => {
    const now = Date.UTC(2026, 0, 1);
    const cookie = createSessionCookie(password, true, now);
    const cookiePair = cookie.split(";", 1)[0];
    assert.equal(hasValidSession(cookiePair, password, now), true);
    assert.equal(hasValidSession(cookiePair, "another password with enough length", now), false);
    assert.equal(hasValidSession(`${cookiePair}tampered`, password, now), false);
    assert.equal(hasValidSession(`${cookiePair}; ${cookiePair}`, password, now), false);
    assert.equal(hasValidSession(cookiePair, password, now + 31 * 24 * 60 * 60 * 1000), false);
    assert.equal(hasValidSession(undefined, password, now), false);
  });

  it("sets restrictive cookie attributes and clears the session on logout", () => {
    const secureCookie = createSessionCookie(password, true);
    assert.match(secureCookie, /HttpOnly/);
    assert.match(secureCookie, /SameSite=Strict/);
    assert.match(secureCookie, /Secure/);
    assert.match(clearSessionCookie(true), /Max-Age=0/);
    assert.doesNotMatch(createSessionCookie(password, false), /; Secure/);
  });
});
