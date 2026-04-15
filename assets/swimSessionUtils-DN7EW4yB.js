const s=e=>{const t=Number(e);return Number.isFinite(t)?t:0},a=(e=[])=>e.reduce((t,i)=>{const o=i.raw_payload??{},n=s(o.block_repetitions),c=s(o.exercise_repetitions),r=s(i.distance);return t+n*c*r},0),l=e=>e?e.split(`
`).map(t=>t.trim()).filter(Boolean):[];export{a as c,l as s};
