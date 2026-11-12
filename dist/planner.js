(function(root){
function layout(L,D,w,d){
 let best=[];
 // Enumerate horizontal strips of both upright orientations; feasible, reproducible layouts.
 for(let turn=0;turn<2;turn++){
  let a=turn?d:w,b=turn?w:d;
  for(let n=0;n<=Math.min(2000,Math.floor(D/b));n++){
   let m=Math.floor((D-n*b)/a), count=n*Math.floor(L/a)+m*Math.floor(L/b);
   if(count>best.length){let arr=[];
    for(let row=0;row<n;row++)for(let col=0;col<Math.floor(L/a);col++)arr.push({x:col*a,y:row*b,w:a,d:b,rotated:!!turn});
    for(let row=0;row<m;row++)for(let col=0;col<Math.floor(L/b);col++)arr.push({x:col*b,y:n*b+row*a,w:b,d:a,rotated:!turn});
    best=arr;
   }
  }
 }
 return best;
}
function plan(p,q,s){
 if(!Number.isSafeInteger(q)||q<1||q>100000)throw Error('Quantity must be a whole number from 1 to 100,000.');
 for(const k of ['L','D','height','maxWeight','tare','palletHeight','layers'])if(!Number.isFinite(s[k])||s[k]<(k==='tare'?0:1))throw Error('Enter valid positive pallet limits.');
 if(!Number.isInteger(s.layers)||s.layers>100)throw Error('Maximum layers must be a whole number from 1 to 100.');
 if(!p.dims||p.dims.length!==3||p.dims.some(v=>!Number.isFinite(v)||v<=0)||!Number.isFinite(p.weight)||p.weight<=0)throw Error('Packaged dimensions and gross weight are required. Update this model in the catalogue.');
 if(s.layers>1&&!s.stackConfirmed)throw Error('Confirm the manufacturer-approved stack limit before using multiple layers.');
 const [w,d,h]=p.dims, positions=layout(s.L,s.D,w,d),heightLayers=Math.floor((s.height-s.palletHeight)/h),layers=Math.min(s.layers,heightLayers),weightUnits=Math.floor((s.maxWeight-s.tare)/p.weight);
 if(!positions.length)throw Error('This carton does not fit the pallet upright without overhang. Choose a larger custom pallet.');
 const capacity=Math.min(positions.length*layers,weightUnits);
 if(capacity<1)throw Error('Height or gross weight limit is too low for one carton plus the pallet.');
 const count=Math.ceil(q/capacity);
 const pallets=Array.from({length:count},(_,i)=>{let units=Math.min(capacity,q-i*capacity);return {number:i+1,units,layers:Math.ceil(units/positions.length),height:s.palletHeight+Math.ceil(units/positions.length)*h,grossWeight:+(s.tare+units*p.weight).toFixed(2)};});
 return {model:p.model,quantity:q,settings:s,carton:p.dims,cartonWeight:p.weight,capacity,perLayer:positions.length,positions,pallets,totalGrossWeight:+(q*p.weight+count*s.tare).toFixed(2),method:'Feasible upright strip layout, 90° base rotation allowed; no overhang. Not guaranteed globally optimal. One model per pallet.'};
}
root.LoadPlanner={layout,plan};if(typeof module!=='undefined')module.exports=root.LoadPlanner;
})(typeof globalThis!=='undefined'?globalThis:window);
