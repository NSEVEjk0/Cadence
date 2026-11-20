import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  createSessionCache,
  SessionCacheError,
} from "../../server/session-cache";

const fixtures: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), "cadence-cache-test-"));
  fixtures.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of fixtures.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("isolates simultaneous session caches in the configured writable directory", () => {
  const root = fixture();
  const first = createSessionCache([join(root, "sessions")]);
  const second = createSessionCache([join(root, "sessions")]);
  expect(first).not.toBe(second);
  expect(first.startsWith(join(root, "sessions", "cadence-session-"))).toBe(
    true,
  );
  expect(statSync(first).isDirectory()).toBe(true);
  if (process.platform !== "win32")
    expect(statSync(first).mode & 0o777).toBe(0o700);
});

test("falls back from unusable temporary storage without changing the existing file", () => {
  const root = fixture();
  const blocked = join(root, "unavailable");
  writeFileSync(blocked, "leave existing data alone");
  const cache = createSessionCache([blocked, join(root, "writable")]);
  expect(cache.startsWith(join(root, "writable", "cadence-session-"))).toBe(
    true,
  );
  expect(readFileSync(blocked, "utf8")).toBe("leave existing data alone");
});

test("reports unavailable storage without exposing private paths", () => {
  const root = fixture();
  const blocked = join(root, "private-account-cache");
  writeFileSync(blocked, "existing data");
  expect(() => createSessionCache([blocked])).toThrow(SessionCacheError);
  expect(() => createSessionCache([blocked])).toThrow(
    "Camera processing is temporarily unavailable.",
  );
  try {
    createSessionCache([blocked]);
  } catch (error) {
    expect((error as Error).message).not.toContain(root);
  }
});
