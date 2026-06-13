import { beforeEach, describe, expect, test } from "bun:test";
import { clientIp, rateLimit, resetRateLimiter } from "../rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimiter());

  test("allows up to the limit, then rejects with a retry hint", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000).ok).toBe(true);
    }
    const result = rateLimit("k", 5, 60_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  test("keys are independent", () => {
    expect(rateLimit("a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000).ok).toBe(true);
  });

  test("window expiry resets the count", () => {
    expect(rateLimit("k", 1, -1).ok).toBe(true);
    expect(rateLimit("k", 1, -1).ok).toBe(true);
  });
});

describe("clientIp", () => {
  test("prefers the first x-forwarded-for hop", () => {
    const req = {
      headers: { get: (n: string) => (n === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null) },
    };
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip then unknown", () => {
    expect(
      clientIp({ headers: { get: (n: string) => (n === "x-real-ip" ? "9.9.9.9" : null) } })
    ).toBe("9.9.9.9");
    expect(clientIp({ headers: { get: () => null } })).toBe("unknown");
  });
});
