import { SORT_LIST } from './headerData';

/** Sort state for the sidebar script. The picker lives in the view title bar (see headerCommands); the host posts setSort. */
export const SORT_CSS = String.raw`
.srow{display:flex;align-items:center;gap:4px}
.srow .box{flex:1 1 auto;min-width:0}
`;

export const SORT_JS = 'const SORTS=' + JSON.stringify(SORT_LIST) + ';\n' + String.raw`
function sortSet(v){sort.value=SORTS.some(o=>o[0]===v)?v:'score';try{advSync();}catch(e){}}
`;
