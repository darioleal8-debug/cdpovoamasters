// SHA-1("password123") = CBFDAC6008F9CAB4083784CBD1874F76618D2A97
// prefix = CBFDA  |  suffix = C6008F9CAB4083784CBD1874F76618D2A97

import { describe, it, expect, vi, afterEach } from "vitest";
import { checkPwnedPassword, PWNED_ERROR_MESSAGE } from "./pwned-password";

const PASSWORD_PWNED = "password123";
const PREFIX_PWNED   = "CBFDA";
const SUFFIX_PWNED   = "C6008F9CAB4083784CBD1874F76618D2A97";

function stubFetch(body: string, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, text: async () => body }),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("checkPwnedPassword", () => {
  it("returns pwned=true for a known-compromised password", async () => {
    stubFetch(
      `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\n${SUFFIX_PWNED}:42738\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0`,
    );
    const r = await checkPwnedPassword(PASSWORD_PWNED);
    expect(r.pwned).toBe(true);
    expect(r.count).toBe(42738);
    expect(r.checked).toBe(true);
  });

  it("returns pwned=false when suffix is not present in response", async () => {
    stubFetch("0000000000000000000000000000000000001:9\n1111111111111111111111111111111111111:3");
    const r = await checkPwnedPassword("xK#m9p!QrV2sN_not_in_db");
    expect(r.pwned).toBe(false);
    expect(r.count).toBe(0);
    expect(r.checked).toBe(true);
  });

  it("ignores padding lines (count=0) even when suffix matches", async () => {
    // Same suffix as password123 but count=0 → should NOT be considered pwned
    stubFetch(
      `${SUFFIX_PWNED}:0\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0`,
    );
    const r = await checkPwnedPassword(PASSWORD_PWNED);
    expect(r.pwned).toBe(false);
    expect(r.checked).toBe(true);
  });

  it("is fail-open on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const r = await checkPwnedPassword("any");
    expect(r.checked).toBe(false);
    expect(r.pwned).toBe(false);
  });

  it("is fail-open on AbortError (timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    const r = await checkPwnedPassword("any");
    expect(r.checked).toBe(false);
    expect(r.pwned).toBe(false);
  });

  it("is fail-open on non-OK HTTP response", async () => {
    stubFetch("", false);
    const r = await checkPwnedPassword("any");
    expect(r.checked).toBe(false);
    expect(r.pwned).toBe(false);
  });

  it("sends only the 5-char prefix in the request URL (k-anonymity)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    await checkPwnedPassword(PASSWORD_PWNED);
    const url = fetchMock.mock.calls[0][0] as string;
    // URL must include the 5-char prefix for password123
    expect(url).toContain(`/range/${PREFIX_PWNED}`);
    // The suffix (remaining 35 chars) must never appear in the URL
    expect(url).not.toContain(SUFFIX_PWNED);
  });

  it("exports PWNED_ERROR_MESSAGE in Portuguese (pt-PT)", () => {
    expect(PWNED_ERROR_MESSAGE).toContain("fugas de dados conhecidas");
    expect(PWNED_ERROR_MESSAGE).toContain("Escolhe outra password");
  });
});
