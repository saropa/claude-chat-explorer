/** Detects a stale configuration registry. No vscode import, so the node check script can drive it. */

/** The slice of a manifest property this check reads: only whether the manifest declares a default. */
export interface ManifestProp { default?: unknown }

/** Looks one setting up in the live registry and returns its registered default (undefined when the window does not know the setting). */
export type InspectDefault = (key: string) => unknown;

/**
 * Flattens the manifest's contributes.configuration (one object, or an array of objects when the settings are split into
 * sections) into a single key -> property map. Without the array case, a manifest that uses sections would look empty and
 * the stale check would silently pass.
 */
export function manifestProperties(configuration: unknown): Record<string, ManifestProp> {
  const sections = Array.isArray(configuration) ? configuration : [configuration];
  const out: Record<string, ManifestProp> = {};
  for (const s of sections) {
    const props = (s as { properties?: Record<string, ManifestProp> } | undefined)?.properties;
    // A section without properties (or a missing configuration) contributes nothing.
    if (props && typeof props === 'object') { Object.assign(out, props); }
  }
  return out;
}

/**
 * Returns the manifest keys the window's registry does not know. Cause: the window started on an old build and the extension
 * host restarted on a newer one without a window reload, so the new code runs but the registry still holds the OLD manifest.
 * A setting only the new build declares then has no registered default, and writing it fails with "... is not a registered
 * configuration". Only keys that declare a default in the manifest are tested: a key with no default has nothing to compare, so
 * flagging it would be a false positive.
 */
export function staleKeys(props: Record<string, ManifestProp>, defaultOf: InspectDefault): string[] {
  return Object.keys(props).filter((k) => props[k]?.default !== undefined && defaultOf(k) === undefined);
}

/**
 * True when a settings write was rejected because the window's registry does not know the setting (VS Code's "... is not a
 * registered configuration"). Any other rejection (disk error, invalid value, ...) is a different fault and must not be
 * blamed on a stale registry, so callers prompt for a reload only on a match.
 */
export function isUnregisteredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('not a registered configuration');
}
