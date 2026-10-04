/** Webview script part: history by arrow keys, the hint under the box, and when a search is remembered. Shares top-level scope with webviewJs. */
export const HIST_JS = String.raw`
let histIdx=-1,histSnap=null,histTimer,wantHist=false,lastRec='';
const ah=document.getElementById('ah');
function ahSync(){ah.hidden=!(document.activeElement===q&&!q.value&&history.length>0);}
function applyState(it){q.value=it.query;all.checked=!!it.all;subs.checked=it.subs!==false;setFlag('cs',it.cs);setFlag('ww',it.ww);setFlag('any',it.any);setFlag('re',it.re);
when.value=it.when||'any';msgSel.value=String(it.last||0);q.setSelectionRange(q.value.length,q.value.length);go();}
function histNav(up){
if(up){if(!history.length)return false;if(histIdx<0)histSnap=cur();
const n=Math.min(histIdx+1,history.length-1);if(n!==histIdx){histIdx=n;applyState(history[n]);}return true;}
if(histIdx<0)return false;histIdx--;applyState(histIdx<0?histSnap:history[histIdx]);return true;}
function histEsc(){if(histIdx<0)return false;histIdx=-1;applyState(histSnap);return true;}
function recordHist(force){clearTimeout(histTimer);const c=cur();
if(!c.query||!hasResults||busy||stale||c.query!==lastQ||(histIdx>=0&&!force))return;
const k=JSON.stringify([c.query,c.all,c.cs,c.ww,c.re,c.any,c.when,c.last,c.subs]);if(k===lastRec)return;
lastRec=k;vs.postMessage(Object.assign({type:'histAdd'},c));}
function histAfter(){if(wantHist){wantHist=false;recordHist(true);return;}
clearTimeout(histTimer);histTimer=setTimeout(recordHist,2000);}
`;
