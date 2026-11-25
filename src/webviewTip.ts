import { TIP_KINDS_JS } from './webviewTipKinds';
import { TIP_ENGINE_JS } from './webviewPop';

export { TIP_CSS } from './webviewPop';

/** Webview script: one #tip element, delegated listeners, content built at show time (data-tip="k:kind" or plain text). */
const TIP_ENGINE = String.raw`
/* The config is a named object (not inlined into makeTip) so check_webview can build a second tooltip from the same config minus skip: a positive control proving the veto, not an empty html result, is what hides the tip. */
const tipCfg={bounds:()=>res.getBoundingClientRect(),
html:el=>{const k=el.dataset.tip;return k.slice(0,2)==='k:'?tipKind(k.slice(2),el):tipStatic(k);},
/* Bug fixed: the ring and dot inside the slot carry data-tip, so after the context popover opened the next mouseover re-showed their tooltip (z-index 30) over it. No tooltip for anything inside the open popover's own slot. */
skip:el=>{const s=ctxId&&el.closest('.rs[data-a=ctx]'),r=s&&s.closest('.r');return !!r&&r.dataset.id===ctxId;},
focusTarget:t=>t.classList.contains('r')?t.querySelector('.t[data-tip]'):null};
const tipper=makeTip(tipCfg);
function tipHide(){tipper.hide();}
function tipSync(){tipper.sync();}
`;

export const TIP_JS = TIP_ENGINE_JS + TIP_KINDS_JS + TIP_ENGINE;
