import { TIP_KINDS_JS } from './webviewTipKinds';
import { TIP_ENGINE_JS } from './webviewPop';

export { TIP_CSS } from './webviewPop';

/** Webview script: one #tip element, delegated listeners, content built at show time (data-tip="k:kind" or plain text). */
const TIP_ENGINE = String.raw`
const tipper=makeTip({bounds:()=>res.getBoundingClientRect(),
html:el=>{const k=el.dataset.tip;return k.slice(0,2)==='k:'?tipKind(k.slice(2),el):tipStatic(k);},
focusTarget:t=>t.classList.contains('r')?t.querySelector('.t[data-tip]'):null});
function tipHide(){tipper.hide();}
function tipSync(){tipper.sync();}
`;

export const TIP_JS = TIP_ENGINE_JS + TIP_KINDS_JS + TIP_ENGINE;
