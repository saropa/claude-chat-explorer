/** Data behind the title-bar Search tips and Sort commands, shared by the extension host and the webview script. */

/** Query prefixes parseQuery understands, one example each: [group heading, [[what it finds, example]]]. */
export const TIPS: [string, [string, string][]][] = [
  ['Find in files and git', [['Sessions that touched a file', 'file:app.ts'], ['Sessions that edited a file', 'edited:app.ts'], ['A command the agent ran', 'cmd:"npm test"'], ['A commit hash', 'sha:3028413'], ['A pull request number', 'pr:123'], ['A branch name', 'branch:main']]],
  ['Narrow the search', [['Sessions with a tag', 'tag:review'], ['Only the last N messages', 'last:25'], ['Who wrote it: you or the agent', 'from:agent']]],
  // digest: searches the stored session digests only (goal, decisions, files, references, left open).
  ['Session digests', [['Text in a session digest only', 'digest:pricing']]],
];

/** Sort choices: [key, label]. Keys must match SORTS in msgOpts. */
export const SORT_LIST: [string, string][] = [['score', 'Score'], ['time', 'Time'], ['title', 'Title'], ['length', 'Length'], ['cost', 'Cost'], ['context', 'Context']];
