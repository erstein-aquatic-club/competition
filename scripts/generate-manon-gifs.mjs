/**
 * Illustrations originales des 5 exercices de Manon sans GIF dans le catalogue.
 * Pictogrammes animés : aide visuelle, non démonstrations biomécaniques filmées.
 * Aucun média tiers. Génération au build pour précache PWA fiable et stable.
 *
 * Usage : node scripts/generate-manon-gifs.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GIFEncoder } from "gifenc";

const ROOT = fileURLToPath(new URL("../public/exercise-gifs/manon/", import.meta.url));
const W = 320;
const H = 220;
const FRAMES = 18;
const palette = [
  [247, 249, 252], // fond
  [26, 39, 59],    // corps / barres
  [227, 6, 19],    // accent EAC / trajectoire
  [138, 152, 172], // matériel
  [31, 162, 155],  // élastique
  [226, 233, 242], // sol / ombre
  [255, 255, 255], // détail
  [249, 193, 73],  // accent articulations
];
let px;
function reset() { px = new Uint8Array(W * H); }
function disc(x, y, r, color) {
  const cx = Math.round(x), cy = Math.round(y);
  if (!Number.isFinite(cx + cy + r) || r <= 0) return;
  for (let iy = Math.max(0, cy - Math.ceil(r)); iy <= Math.min(H - 1, cy + Math.ceil(r)); iy++) {
    const dy = iy - cy;
    const xx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    for (let ix = Math.max(0, cx - xx); ix <= Math.min(W - 1, cx + xx); ix++) {
      px[iy * W + ix] = color;
    }
  }
}
function line(ax, ay, bx, by, r, color) {
  const length = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(length * 1.65));
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    disc(ax + (bx - ax) * f, ay + (by - ay) * f, r, color);
  }
}
function path(points, r, color) {
  for (let i = 1; i < points.length; i++) {
    line(...points[i - 1], ...points[i], r, color);
  }
}
function head(x, y) {
  disc(x, y, 11, 1);
  disc(x + 4, y - 3, 2.3, 6);
}
function floor(y = 200) {
  line(30, y, 291, y, 1.7, 5);
}
function barbell(x1, x2, y) {
  line(x1, y, x2, y, 3.2, 3);
  for (const x of [x1 + 15, x2 - 15]) {
    disc(x, y, 12, 1);
    disc(x, y, 9, 2);
    disc(x, y, 2, 6);
  }
}
function arrow(x1, y1, x2, y2) {
  line(x1, y1, x2, y2, 2.5, 2);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const r = 9;
  line(x2, y2, x2 - r * Math.cos(a - .55), y2 - r * Math.sin(a - .55), 2.5, 2);
  line(x2, y2, x2 - r * Math.cos(a + .55), y2 - r * Math.sin(a + .55), 2.5, 2);
}
const ease = t => (1 - Math.cos(2 * Math.PI * t)) / 2;
const lerp = (a, b, t) => a + (b - a) * t;

function assistedPullup(t) {
  reset();
  const p = ease(t), up = p * 42;
  line(48, 31, 272, 31, 4, 3);
  disc(74, 31, 5, 3); disc(246, 31, 5, 3);
  // Band from bar to bent knee: visibly an assisted pull-up, not a strict pull-up.
  line(160, 35, 152, 161 - up, 3, 4);
  line(162, 35, 155, 161 - up, 1.1, 6);
  const shY = 93 - up;
  const hipY = 142 - up;
  // Legs.
  path([[155,hipY],[150,164-up],[139,183-up]], 5.2, 1);
  path([[166,hipY],[177,165-up],[184,181-up]], 5.2, 1);
  line(148, hipY, 172, hipY, 7.5, 2);
  // Arms: hands stay on the bar; elbows bend as shoulders rise.
  path([[146,shY],[117-p*5,71-p*13],[103,35]], 5.4, 1);
  path([[174,shY],[203+p*5,71-p*13],[217,35]], 5.4, 1);
  disc(103,35,5,1);disc(217,35,5,1);
  line(160, shY, 160, hipY, 11, 1);
  head(160, shY - 23);
  if (t > 0.08 && t < 0.47) arrow(266, 142, 266, 78);
}
function hangPowerClean(t) {
  reset(); floor(198);
  // Hinge → powerful extension → rack catch above parallel → controlled lower.
  const keys = [
    {s:[163,84],h:[147,129],k:[172,158],a:[172,192],bar:139,ex:192,ey:122},
    {s:[187,101],h:[149,132],k:[172,160],a:[172,192],bar:141,ex:185,ey:128},
    {s:[163,78],h:[151,125],k:[172,155],a:[172,192],bar:122,ex:182,ey:109},
    {s:[160,70],h:[154,120],k:[163,155],a:[172,192],bar:97,ex:190,ey:91},
    {s:[161,86],h:[151,130],k:[176,158],a:[172,192],bar:92,ex:209,ey:111},
    {s:[162,82],h:[151,126],k:[177,160],a:[172,192],bar:92,ex:207,ey:103},
    {s:[163,84],h:[147,129],k:[172,158],a:[172,192],bar:139,ex:192,ey:122},
  ];
  const stage = Math.min(keys.length - 2, Math.floor(t * (keys.length - 1)));
  const fraction = t * (keys.length - 1) - stage;
  const f = fraction * fraction * (3 - 2 * fraction);
  const v1 = keys[stage], v2 = keys[stage + 1];
  const p = key => [lerp(v1[key][0],v2[key][0],f),lerp(v1[key][1],v2[key][1],f)];
  const s=p("s"), hip=p("h"), knee=p("k"), ankle=p("a");
  const bY=lerp(v1.bar,v2.bar,f);
  const ex=lerp(v1.ex,v2.ex,f), ey=lerp(v1.ey,v2.ey,f);
  path([hip,knee,ankle],7,1);
  path([[hip[0]-9,hip[1]+3],[knee[0]-16,knee[1]],[ankle[0]-14,ankle[1]]],6,1);
  line(ankle[0]-17, ankle[1]+2, ankle[0]+14, ankle[1]+2,3.5,1);
  line(hip[0],hip[1],s[0],s[1],11,1);
  head(s[0]+15,s[1]-24);
  barbell(74,245,bY);
  path([s,[ex,ey],[190,bY]],5.4,1);
  disc(190,bY,4.5,1);
  // Front rack: elbows move forward rather than a high-pull with no catch.
  if (bY < 105) disc(ex,ey,4.3,7);
  if (t > 0.23 && t < 0.6) arrow(279,145,279,84);
}
function dynamicPushup(t) {
  reset(); floor(193);
  const p = ease(t);
  const sh=[105,110+46*p], foot=[258,190];
  const hip=[lerp(sh[0],foot[0],.48),lerp(sh[1],foot[1],.48)];
  const neck=[sh[0]-12,sh[1]-5];
  const elbow=[120+12*p,150+15*p];
  const wrist=[113,187];
  path([sh,hip,foot],10,1);
  line(hip[0]-6,hip[1],hip[0]+9,hip[1]+2,6.5,2);
  path([sh,elbow,wrist],5.6,1);
  head(neck[0]-13,neck[1]-7);
  // Rear arm / hands stays planted; hands leave the floor on neither variant.
  disc(wrist[0],wrist[1],4.5,1);
  line(250,188,271,188,4.1,1);
  if(t > .55 && t < .82) {
    arrow(64,154,65,104);
    line(87,152,81,141,2,2);
  }
}
function forearmPlank(t) {
  reset(); floor(195);
  const breath=Math.sin(t * Math.PI * 2) * 1.4;
  const sh=[113,117+breath], hip=[177,145+breath*.8], foot=[263,188];
  path([sh,hip,foot],10.2,1);
  path([sh,[119,158],[106,189]],5.8,1);
  line(105,190,142,190,5.2,1);
  head(91,109+breath);
  line(253,189,272,190,4,1);
  // Horizontal baseline makes alignment easy to check.
  line(113,113,177,140,1,3);
}
function activeMobility(t) {
  reset(); floor(201);
  const n = 16;
  const q = t*n;
  const mode = Math.floor(q / 5.5);
  const p = q%5.5 / 5.5;
  let cx=160, shouldersY=80;
  const shoulderL=[144,80],shoulderR=[176,80];
  let hip=[160,135], headY=52;
  if(mode===1) {
    const side=Math.sin(p*2*Math.PI)*8;
    cx=160+side;hip=[160+side*.3,135];headY=52+Math.abs(side)*.15;
  }
  head(cx,headY);
  line(cx,shouldersY,hip[0],hip[1],10,1);
  const leftLeg=[[155,hip[1]],[148,162],[138,195]];
  const rightLeg=[[165,hip[1]],[173,162],[184,195]];
  if(mode===2) {
    // Controlled leg swing (hip mobility).
    const offset=Math.sin(p*2*Math.PI)*29;
    rightLeg[1]=[178+offset*.5,161];
    rightLeg[2]=[185+offset,191-Math.abs(offset)*.42];
  }
  path(leftLeg,6.5,1);
  path(rightLeg,6.5,1);
  if (mode===0) {
    // Arm circles from the shoulder, in opposite directions.
    const angle=-Math.PI*.45 + p*Math.PI*1.7;
    const leftW=[144-45*Math.cos(angle),80+45*Math.sin(angle)];
    const rightW=[176+45*Math.cos(angle),80+45*Math.sin(angle)];
    path([shoulderL,[lerp(144,leftW[0],.5),lerp(80,leftW[1],.5)],leftW],5.7,1);
    path([shoulderR,[lerp(176,rightW[0],.5),lerp(80,rightW[1],.5)],rightW],5.7,1);
  } else {
    path([shoulderL,[135,110],[139,137]],5.6,1);
    path([shoulderR,[186,110],[182,136]],5.6,1);
    if(mode===1) arrow(257,115,271,111);
  }
  if (mode===2) arrow(246,164,259,145);
}
const animations=[
  ["117-tractions-assistees.gif",assistedPullup],
  ["118-hang-power-clean.gif",hangPowerClean],
  ["119-pompes-dynamiques.gif",dynamicPushup],
  ["120-gainage-frontal.gif",forearmPlank],
  ["115-mobilite-active.gif",activeMobility],
];
await mkdir(ROOT,{recursive:true});
for(const [filename,paint] of animations) {
  const encoder=GIFEncoder();
  for(let frame=0;frame<FRAMES;frame++) {
    paint(frame/FRAMES);
    encoder.writeFrame(px,W,H,{
      ...(frame===0?{palette,repeat:0}:{}),
      delay:110,
    });
  }
  encoder.finish();
  const bytes=encoder.bytes();
  if(bytes.length < 500 || bytes.length > 300000) {
    throw new Error(filename + ": taille GIF suspecte : "+bytes.length);
  }
  await writeFile(new URL(filename,new URL("../public/exercise-gifs/manon/",import.meta.url)),bytes);
  console.log(filename,bytes.length,"octets");
}
