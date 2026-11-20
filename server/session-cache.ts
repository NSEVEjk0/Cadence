import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export class SessionCacheError extends Error {
  constructor() {
    super(
      "Camera processing is temporarily unavailable. Please try again shortly.",
    );
    this.name = "SessionCacheError";
  }
}

export function createSessionCache(
  directories: readonly string[] = [
    process.env.CADENCE_CACHE_DIR ?? "",
    tmpdir(),
    ...(process.platform === "win32" ? [] : ["/tmp"]),
  ],
): string {
  for (const directory of new Set(
    directories.filter(Boolean).map((value) => resolve(value)),
  )) {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      return mkdtempSync(join(directory, "cadence-session-"));
    } catch {
      // A service may have a read-only home or an invalid TMPDIR. Try the next
      // writable location without returning private filesystem paths to visitors.
    }
  }
  throw new SessionCacheError();
}
