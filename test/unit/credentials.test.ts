import { describe, it, expect } from "vitest";
import { resolveCredential } from "../../src/credentials";

describe("resolveCredential", () => {
  it("relays an inbound X-API-Key header", () => {
    const credential = resolveCredential({ "x-api-key": "inbound-key" }, undefined);
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "inbound-key" });
  });

  it("relays an inbound Authorization header", () => {
    const credential = resolveCredential({ authorization: "Bearer inbound-token" }, undefined);
    expect(credential).toEqual({
      headerName: "Authorization",
      headerValue: "Bearer inbound-token",
    });
  });

  it("prefers X-API-Key over Authorization when both are present", () => {
    const credential = resolveCredential(
      { "x-api-key": "the-key", authorization: "Bearer the-token" },
      undefined,
    );
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "the-key" });
  });

  it("matches header names case-insensitively", () => {
    const credential = resolveCredential({ "X-Api-Key": "mixed-case" }, undefined);
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "mixed-case" });
  });

  it("uses the first value of an array-valued header", () => {
    const credential = resolveCredential({ "x-api-key": ["first", "second"] }, undefined);
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "first" });
  });

  it("falls back to the environment key when there are no inbound headers", () => {
    const credential = resolveCredential(undefined, "env-key");
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "env-key" });
  });

  it("falls back to the environment key when inbound headers carry no credential", () => {
    const credential = resolveCredential({ "content-type": "application/json" }, "env-key");
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "env-key" });
  });

  it("ignores blank inbound header values and falls back to the environment key", () => {
    const credential = resolveCredential({ "x-api-key": "   " }, "env-key");
    expect(credential).toEqual({ headerName: "X-API-Key", headerValue: "env-key" });
  });

  it("returns null when there is no credential anywhere", () => {
    expect(resolveCredential(undefined, undefined)).toBeNull();
    expect(resolveCredential({}, undefined)).toBeNull();
  });

  it("treats a blank environment key as absent", () => {
    expect(resolveCredential(undefined, "   ")).toBeNull();
  });
});
