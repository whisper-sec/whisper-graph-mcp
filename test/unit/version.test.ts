import { describe, it, expect } from "vitest";
import { VERSION, SERVER_NAME, SERVER_TITLE } from "../../src/version";

describe("version", () => {
  it("exposes a valid semver version from package.json", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("exposes the server identity", () => {
    expect(SERVER_NAME).toBe("whisper-graph");
    expect(SERVER_TITLE).toBe("WhisperGraph");
  });
});
