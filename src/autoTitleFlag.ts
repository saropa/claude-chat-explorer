// Whether auto-titling is on. No vscode import so scripts/check_autotitle_flag.js can test it.
// The setting wins when the user set it; otherwise the extension's own stored flag decides.
export const AUTO_KEY = 'saropaChatExplorer.autoTitle.enabled';
export const AUTO_FALLBACK_KEY = `${AUTO_KEY}.fallback`;

/** `explicit` is the value the user set in settings (undefined when unset or the setting is not registered). */
export function autoTitleOn(explicit: unknown, fallback: unknown): boolean {
  return typeof explicit === 'boolean' ? explicit : fallback === true;
}

/** Try the settings write; if it throws for any reason keep the choice in the fallback store. Returns true when settings took it. */
export async function setAutoTitle(on: boolean, write: (on: boolean) => PromiseLike<void>, store: (on: boolean | undefined) => PromiseLike<void>, log: (e: unknown) => void): Promise<boolean> {
  try {
    await write(on);
  } catch (e) {
    log(e);
    await store(on);
    return false;
  }
  await store(undefined);
  return true;
}
