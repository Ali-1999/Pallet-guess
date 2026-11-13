(function(root){
const round=n=>+n.toFixed(3);
function validateStop(n=1){if(!Number.isInteger(n)||n<1||n>30)throw Error('Delivery stop must be a whole number from 1 to 30.');return n;}
function parts(p){
 const layout=p.layout,base=layout?.pallet;
 if(!layout?.boxes?.length||!base||!Number.isFinite(base.tare)||base.tare<0||layout.boxes.some(b=>!Number.isFinite(b.weight)||b.weight<=0))return [{x:p.x,y:p.y,w:p.w,d:p.d,z:0,h:p.H,weight:p.weight}];
 const heights=Array.from({length:p.layers},(_,i)=>Math.max(0,...layout.boxes.filter(b=>b.layer===i).map(b=>b.h))),local=layout.boxes.map(b=>({...b,z:base.height+heights.slice(0,b.layer).reduce((a,b)=>a+b,0)}));
 if(base.tare)local.push({x:0,y:0,w:base.L,d:base.D,z:0,h:base.height,weight:base.tare});
 const sum=local.reduce((n,b)=>n+b.weight,0);
 if(Math.abs(sum-p.weight)>Math.max(.02,p.weight*.001))return [{x:p.x,y:p.y,w:p.w,d:p.d,z:0,h:p.H,weight:p.weight}];
 return local.map(b=>{let x=b.x-layout.footprint.minX,y=b.y-layout.footprint.minY,w=b.w,d=b.d;if(p.rotated)[x,y,w,d]=[y,p.L-x-w,d,w];return {...b,x:p.x+x,y:p.y+y,w,d,weight:b.weight*p.weight/sum};});
}
function balance(placements,v){
 let weight=0,x=0,y=0,z=0,front=0,left=0;
 for(const p of placements)for(const b of parts(p)){weight+=b.weight;x+=(b.x+b.w/2)*b.weight;y+=(b.y+b.d/2)*b.weight;z+=(b.z+b.h/2)*b.weight;front+=Math.max(0,Math.min(b.x+b.w,v.L/2)-b.x)/b.w*b.weight;left+=Math.max(0,Math.min(b.y+b.d,v.W/2)-b.y)/b.d*b.weight;}
 return {weight:round(weight),centre:{x:weight?round(x/weight):null,y:weight?round(y/weight):null,z:weight?round(z/weight):null},frontKg:round(front),rearKg:round(weight-front),leftKg:round(left),rightKg:round(weight-left),leftPercent:weight?round(100*left/weight):0,frontPercent:weight?round(100*front/weight):0};
}
function blockers(placements){const result=[];for(const p of placements)for(const q of placements)if(p!==q&&(p.stop??1)<(q.stop??1)&&q.x>=p.x+p.w-1e-7&&q.y<p.y+p.d-1e-7&&q.y+q.d>p.y+1e-7)result.push({stop:p.stop??1,item:p.id,blockedBy:q.id,blockingStop:q.stop??1});return result;}
function analyse(trip,v,options={}){
 const placements=trip.placements,b=balance(placements,v),stops=[...new Set(placements.map(p=>validateStop(p.stop??1)))].sort((a,b)=>a-b),blocked=blockers(placements),notes=[];
 const goodsCube=placements.reduce((n,p)=>n+(p.layout?.boxes?.length?p.layout.boxes.reduce((s,b)=>s+b.w*b.d*b.h,0):p.w*p.d*p.H),0)/1e9,envelopeCube=placements.reduce((n,p)=>n+p.w*p.d*p.H,0)/1e9;
 if(b.weight&&Math.abs(b.leftPercent-50)>10)notes.push('More than 60% of cargo weight lies on one side of the body. Review lateral distribution.');
 if(b.weight&&(b.centre.x<v.L*.25||b.centre.x>v.L*.75))notes.push('Cargo weight centre is within the front or rear quarter of the body. Check actual axle reactions before dispatch.');
 if(blocked.length)notes.push('Later-stop cargo blocks '+new Set(blocked.map(x=>x.item)).size+' earlier-stop floor position(s) on a straight rear exit. Select rear-access stop zones or revise the load.');
 if(options.stopMode==='rear-access')notes.push('Rear-access mode reserves consecutive stop zones. Earlier deliveries are nearer the rear; this may require more trips.');
 const stages=stops.map(stop=>{const delivered=placements.filter(p=>(p.stop??1)===stop),remaining=placements.filter(p=>(p.stop??1)>stop);const after=balance(remaining,v),review=after.weight&&(Math.abs(after.leftPercent-50)>10||after.centre.x<v.L*.25||after.centre.x>v.L*.75);return {review:!!review,stop,destinations:[...new Set(delivered.map(p=>p.destination).filter(Boolean))],cartons:delivered.reduce((n,p)=>n+p.quantity,0),positions:delivered.length,remaining:after};});
 return {balance:b,stages,blockers:blocked,goodsCube:round(goodsCube),envelopeCube:round(envelopeCube),cubePercent:round(100*goodsCube/(v.L*v.W*v.H/1e9)),payloadRemaining:round(v.payload-trip.weight),heightClearance:round(Math.min(v.H,v.doorH)-trip.maxHeight),notes,method:'Distribution assumes uniform mass within each carton and pallet (or the floor-position envelope for legacy loads). Front/rear body halves are not axle loads. Rear-exit checks use straight rectangular paths; forklift turning, side-door access and restraints are not simulated.'};
}
function csv(plan){const rows=[['Trip','Load order','Unload order','Stop','Destination','Model / contents','Cartons','Layers','X mm','Y mm','Length mm','Width mm','Height mm','Gross kg']];for(const trip of plan.trips)for(const p of trip.placements)rows.push([trip.number,p.loadOrder,p.unloadOrder??'',p.stop??1,p.destination??'',p.contents?Object.entries(p.contents).map(([m,q])=>m+' x '+q).join('; '):p.model,p.quantity,p.layers,p.x,p.y,p.w,p.d,p.H,p.weight]);return rows.map(row=>row.map(v=>{let s=String(v);if(/^[=+\-@\t\r]/.test(s)||/^\s+[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');}
root.DispatchPlanner={validateStop,parts,balance,blockers,analyse,csv};if(typeof module!=='undefined')module.exports=root.DispatchPlanner;
})(typeof globalThis!=='undefined'?globalThis:window);
