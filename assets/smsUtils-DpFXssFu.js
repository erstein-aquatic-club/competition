import{b as i}from"./index-DS_uiB1r.js";/**
 * @license lucide-react v0.545.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],u=i("smartphone",r),d=/iPhone|iPad|iPod/i,a=/iPhone|iPad|iPod|Android/i;function h(o,e){const s=e?encodeURIComponent(e):"";if(d.test(navigator.userAgent)){const t=o.join(",");return s?`sms:/open?addresses=${t}&body=${s}`:`sms:/open?addresses=${t}`}const n=o.join(",");return s?`sms:${n}?body=${s}`:`sms:${n}`}function p(){return a.test(navigator.userAgent)||/Macintosh|Mac OS/i.test(navigator.userAgent)}export{u as S,h as b,p as c};
