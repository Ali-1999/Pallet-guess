(function(root){
function layout(L,D,w,d){
 let best=[];
 // Enumerate horizontal strips of both upright orientations; feasible, reproducible layouts.
 for(let turn=0;turn<2;turn++){
  let a=turn?d:w,b=turn?w:d;
  for(let n=0;n<=Math.min(2000,Math.floor(D/b));n++){
   let m=Math.floor((D-n*b)/a), count=n*Math.floor(L/a)+m*Math.floor(L/b);
   if(count>10000)throw Error('Too many cartons per layer. Check the carton dimensions and pallet size.');
   if(count>best.length){let arr=[];
    for(let row=0;row<n;row++)for(let col=0;col<Math.floor(L/a);col++)arr.push({x:col*a,y:row*b,w:a,d:b,rotated:!!turn});
    for(let row=0;row<m;row++)for(let col=0;col<Math.floor(L/b);col++)arr.push({x:col*b,y:n*b+row*a,w:b,d:a,rotated:!turn});
    best=arr;
   }
  }
 }
 return best;
}
function center(positions,L,D){
 if(!positions.length)return [];
 const minX=Math.min(...positions.map(p=>p.x)),minY=Math.min(...positions.map(p=>p.y)),maxX=Math.max(...positions.map(p=>p.x+p.w)),maxY=Math.max(...positions.map(p=>p.y+p.d));
 const dx=(L-(maxX-minX))/2-minX,dy=(D-(maxY-minY))/2-minY;
 return positions.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
}
function overhang(positions,L,D){return {left:Math.max(0,-Math.min(...positions.map(p=>p.x))),right:Math.max(0,Math.max(...positions.map(p=>p.x+p.w))-L),front:Math.max(0,-Math.min(...positions.map(p=>p.y))),back:Math.max(0,Math.max(...positions.map(p=>p.y+p.d))-D)};}
function stackHeight(cartonHeight,palletHeight,layers){return +(palletHeight+layers*cartonHeight).toFixed(3);}
function heightOptions(cartonHeight,palletHeight,heightLimit,selectedLayers=1){
 if(![cartonHeight,palletHeight,heightLimit,selectedLayers].every(Number.isFinite)||cartonHeight<=0||palletHeight<0||heightLimit<=0||!Number.isInteger(selectedLayers)||selectedLayers<1||selectedLayers>100)throw Error('Enter valid carton height, pallet height, height limit, and layer count.');
 const maxLayersByHeight=Math.max(0,Math.floor((heightLimit-palletHeight+1e-7)/cartonHeight));
 return {cartonHeight,palletHeight,heightLimit,selectedLayers,selectedHeight:stackHeight(cartonHeight,palletHeight,selectedLayers),maxLayersByHeight,selectedFitsHeight:selectedLayers<=maxLayersByHeight,choices:[1,2,3,4].map(layers=>({layers,height:stackHeight(cartonHeight,palletHeight,layers),fitsHeight:layers<=maxLayersByHeight}))};
}
function plan(p,q,input){
 if(p.bundle)throw Error('This is a multi-product bundle listing. Plan each component model and its own shipping cartons separately.');
 const s={...input,overhangMm:input.allowOverhang?(input.overhangMm??100):0,allowOverhang:!!input.allowOverhang,allowLongUnits:!!input.allowOverhang&&!!input.allowLongUnits,cartonsPerLayer:input.cartonsPerLayer??0};
 if(!Number.isSafeInteger(q)||q<1||q>100000)throw Error('Quantity must be a whole number from 1 to 100,000.');
 for(const k of ['L','D','height','maxWeight','tare','palletHeight','layers'])if(!Number.isFinite(s[k])||s[k]<(k==='tare'?0:1))throw Error('Enter valid positive pallet limits.');
 if(!Number.isInteger(s.layers)||s.layers>100)throw Error('Maximum layers must be a whole number from 1 to 100.');
 if(!Number.isFinite(s.overhangMm)||s.overhangMm<0||s.overhangMm>100)throw Error('Standard/width overhang must be between 0 and 100 mm per side.');
 if(![0,2,4].includes(s.cartonsPerLayer))throw Error('Choose Auto, 2, or 4 cartons per layer.');
 if(!p.dims||p.dims.length!==3||p.dims.some(v=>!Number.isFinite(v)||v<=0)||!Number.isFinite(p.weight)||p.weight<=0)throw Error('Packaged dimensions and gross weight are required. Update this model in the catalogue.');
 if(s.layers>1&&!s.stackConfirmed)throw Error('Confirm the manufacturer-approved stack limit before using multiple layers.');
 const [w,d,h]=p.dims,extra=s.overhangMm,extraLength=s.allowLongUnits?Math.max(extra,(Math.max(w,d)-s.L)/2):extra;
 s.lengthOverhangLimitMm=extraLength;
 let positions=layout(s.L+2*extraLength,s.D+2*extra,w,d);
 if(!positions.length)throw Error(`This carton does not fit upright within the selected footprint (length overhang ${extraLength} mm per end; width overhang ${extra} mm per side). Choose a larger pallet or enable long-unit layouts.`);
 if(s.cartonsPerLayer&&positions.length<s.cartonsPerLayer)throw Error(`${s.cartonsPerLayer} cartons cannot fit in one layer within the selected length/width overhang limits. Try Auto or 2 cartons per layer; use approved extra layers if required.`);
 if(s.cartonsPerLayer)positions=positions.slice(0,s.cartonsPerLayer);
 positions=center(positions,s.L,s.D);
 const supported=positions.filter(p=>Math.min(s.L,p.x+p.w)>Math.max(0,p.x)&&Math.min(s.D,p.y+p.d)>Math.max(0,p.y));
 if(s.cartonsPerLayer&&supported.length!==positions.length)throw Error('This layout leaves a carton without pallet contact. Choose a larger pallet or a smaller overhang.');
 positions=center(supported,s.L,s.D);
 if(!positions.length)throw Error('No cartons have pallet contact in this arrangement.');
 const heightLayers=Math.floor((s.height-s.palletHeight+1e-7)/h),layers=Math.min(s.layers,heightLayers),weightUnits=Math.floor((s.maxWeight-s.tare)/p.weight),capacity=Math.min(positions.length*layers,weightUnits);
 if(capacity<1)throw Error('Height or gross weight limit is too low for one carton plus the pallet.');
 const count=Math.ceil(q/capacity);
 const pallets=Array.from({length:count},(_,i)=>{const units=Math.min(capacity,q-i*capacity),basePositions=units<positions.length?center(positions.slice(0,units),s.L,s.D):positions,actual=overhang(basePositions,s.L,s.D);return {number:i+1,units,layers:Math.ceil(units/positions.length),height:stackHeight(h,s.palletHeight,Math.ceil(units/positions.length)),grossWeight:+(s.tare+units*p.weight).toFixed(2),positions:basePositions,overhang:actual,layerBreakdown:Array.from({length:Math.ceil(units/positions.length)},(_,layer)=>({layer:layer+1,cartons:Math.min(positions.length,units-layer*positions.length),topHeight:stackHeight(h,s.palletHeight,layer+1)})),loadedFootprint:{L:s.L+actual.left+actual.right,D:s.D+actual.front+actual.back}};});
 const actualOverhang=Object.fromEntries(['left','right','front','back'].map(k=>[k,Math.max(...pallets.map(p=>p.overhang[k]))]));
 return {model:p.model,quantity:q,settings:s,heightSummary:{...heightOptions(h,s.palletHeight,s.height,s.layers),capacityLayers:Math.ceil(capacity/positions.length),actualMaxLayers:Math.max(...pallets.map(p=>p.layers))},carton:p.dims,cartonWeight:p.weight,capacity,perLayer:positions.length,positions,pallets,overhang:actualOverhang,totalGrossWeight:+(q*p.weight+count*s.tare).toFixed(2),method:`Feasible upright strip layout, 90° base rotation allowed; centered loads with up to ${extraLength} mm length overhang per end and ${extra} mm width overhang per side.${s.allowLongUnits?' Length clearance is expanded only enough for one long carton.':''} Not guaranteed globally optimal. One model per pallet. Geometric fit does not certify carton strength, load stability, support, or restraint.`};
}
root.LoadPlanner={layout,plan,center,overhang,heightOptions};if(typeof module!=='undefined')module.exports=root.LoadPlanner;
})(typeof globalThis!=='undefined'?globalThis:window);
