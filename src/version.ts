/**
 * Single source of truth for the server version.
 *
 * release-please rewrites the literal below on every release; the marker
 * comment on that line is what it looks for. Keep the marker off every other
 * line in this file — `versionSyncTest` scans for the literal marker string and
 * fails any line carrying it without a version.
 */
export const VERSION = '0.2.0'; // x-release-please-version
