/** The exact argument lists of the one `gh pr list` call (wipGit's allow-list compares against these). */
const PR_FIELDS = 'number,title,headRefName,isDraft,reviewDecision,url';
export const PR_ARGS = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PR_FIELDS + ',headRefOid,isCrossRepository,headRepositoryOwner'];
/** Same list without the two newer fields, for a gh that does not know them. */
export const PR_ARGS_OLD = ['pr', 'list', '--state', 'open', '--limit', '100', '--json', PR_FIELDS];
