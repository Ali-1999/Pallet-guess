(function(root){
const pallets={standard:{L:1200,D:1000},euro:{L:1200,D:800}};
const defaults={height:1800,heightMode:'auto',maxWeight:1000,tare:25,palletHeight:150,layers:1,stackConfirmed:false,allowOverhang:true,allowLongUnits:true,overhangMm:100,cartonsPerLayer:0};
function safeCommand(c){
 if(!c||typeof c!=='object'||!['plan','dimensions','search','help','clarify','vehicle'].includes(c.intent))throw Error('Invalid chat action.');
 if(c.model!=null&&(typeof c.model!=='string'||c.model.length>80))throw Error('Invalid model.');
 if(c.quantity!=null&&(!Number.isSafeInteger(c.quantity)||c.quantity<1||c.quantity>100000))throw Error('Quantity must be a whole number from 1 to 100,000.');
 if(c.pallet!=null&&!['standard','euro','custom'].includes(c.pallet))throw Error('Choose Standard, Euro, or Custom.');
 for(const k of ['lengthMm','widthMm'])if(c[k]!=null&&(!Number.isFinite(c[k])||c[k]<1||c[k]>10000))throw Error('Custom pallet dimensions must be 1 to 10,000 mm.');
 if(c.search!=null&&(typeof c.search!=='string'||c.search.length>160))throw Error('Search is too long.');
 if(c.vehicle!=null&&!['dyna','lorry','trailer','best'].includes(c.vehicle))throw Error('Invalid vehicle profile.');
 if(c.loadingMode!=null&&!['pallets','cartons'].includes(c.loadingMode))throw Error('Invalid loading mode.');
 if(c.items!=null){if(!Array.isArray(c.items)||c.items.length>30)throw Error('Maximum 30 shipment lines.');for(const l of c.items)if(typeof l.model!=='string'||l.model.length>80||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>100000)throw Error('Invalid shipment model or quantity.');}
 return c;
}
function interpret(text,previous,catalogue){
 const upper=text.toUpperCase(), tokens=upper.match(/[A-Z0-9][A-Z0-9.-]*/g)||[],matched=catalogue.filter(p=>tokens.includes(p.model.toUpperCase())||tokens.includes(p.model.toUpperCase()+'.'));
 if(matched.length>1)return {intent:'clarify',ambiguous:matched.map(p=>p.model)};
 let c={intent:null,model:matched[0]?.model??null,quantity:null,pallet:null,lengthMm:null,widthMm:null,search:null};
 const unknown=tokens.find(t=>t.length>=5&&/[A-Z]/.test(t)&&/\d/.test(t)&&!/^\d+(?:X\d+(?:\.\d+)?|MM|CM|KG)$/.test(t));
 if(!c.model&&unknown)c.model=unknown.replace(/\.$/,'');
 let cleaned=text;for(const p of matched)cleaned=cleaned.replaceAll(p.model,'').replaceAll(p.model.toLowerCase(),'');
 const footprint=cleaned.match(/(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in)?\b/i);
 if(footprint){const factor={mm:1,cm:10,m:1000,inch:25.4,inches:25.4,in:25.4}[(footprint[3]||'mm').toLowerCase()];c.pallet='custom';c.lengthMm=Number(footprint[1])*factor;c.widthMm=Number(footprint[2])*factor;cleaned=cleaned.replace(footprint[0],'');}
 else if(/\b(euro|eur|epal)\b/i.test(text))c.pallet='euro';else if(/\bstandard\b/i.test(text))c.pallet='standard';else if(/\bcustom\b/i.test(text))c.pallet='custom';
 const count=cleaned.match(/\b(?:quantity|qty|cartons?|units?|pieces?|pcs)\s*[:=]?\s*(\d+(?:\.\d+)?)/i)||cleaned.match(/\b(\d+(?:\.\d+)?)\s*(?:cartons?|units?|pieces?|pcs)\b/i)||cleaned.match(/^\s*(?:plan|load|palletize|palletise|make)?\s*(\d+(?:\.\d+)?)\b/i);
 if(count)c.quantity=Number(count[1]);
 if(/\b(?:dimensions?|specs?|specifications?|weight|details?|features?|capacity)\b/i.test(text)&&!(/\b(?:plan|load|calculate|cartons?|qty|quantity)\b/i.test(text)))c.intent='dimensions';
 else if(/\b(?:find|search|show|list)\b/i.test(text)&&!c.model){c.intent='search';c.search=text.replace(/\b(?:find|search|show|list|me|lg|models?|products?|please)\b/gi,'').trim();}
 else if(previous.intent==='dimensions'&&c.model&&c.quantity==null&&!c.pallet&&!/\b(?:plan|load|calculate)\b/i.test(text))c.intent='dimensions';
 else if(c.model||c.quantity!=null||c.pallet||previous.intent==='plan'||/\b(?:plan|load|palletize|palletise|calculate)\b/i.test(text))c.intent='plan';
 else c.intent='help';
 if(/\b(?:difference|compare pallets|what is a pallet|how does|help)\b/i.test(text))c.intent='help';
 return c;
}
function loadOptions(text){
 const patch={};let cleaned=text;
 const remove=(pattern,fn)=>{cleaned=cleaned.replace(pattern,(...args)=>{fn(...args);return ' ';});};
 remove(/\b(?:max(?:imum)?\s+|total\s+)?height(?: limit)?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/gi,(_,value,unit)=>{patch.height=Number(value)*({mm:1,cm:10,m:1000}[unit.toLowerCase()]);});
 remove(/\b(?:disable|no)\s+long[- ]unit(?: mode| layouts?)?\b/gi,()=>{patch.allowLongUnits=false;});
 remove(/\b(?:enable|allow)\s+long[- ]unit(?: mode| layouts?)?\b/gi,()=>{patch.allowLongUnits=true;patch.allowOverhang=true;});
 remove(/\b(?:no|disable|without|zero)\s+overhang\b/gi,()=>{patch.allowOverhang=false;patch.overhangMm=0;});
 remove(/\boverhang\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm)\b/gi,(_,value,unit)=>{patch.allowOverhang=true;patch.overhangMm=Number(value)*(unit.toLowerCase()==='cm'?10:1);});
 remove(/\b(\d+(?:\.\d+)?)\s*(mm|cm)\s*(?:per side\s*)?overhang\b/gi,(_,value,unit)=>{patch.allowOverhang=true;patch.overhangMm=Number(value)*(unit.toLowerCase()==='cm'?10:1);});
 remove(/\b(2|4)\s*(?:cartons?\s*)?(?:per|in (?:each|one))\s*layer\b/gi,(_,value)=>{patch.cartonsPerLayer=Number(value);});
 remove(/\b(\d{1,3})\s*layers?\b/gi,(_,value)=>{patch.layers=Number(value);if(patch.layers>1)patch.stackConfirmed=false;});
 return {text:cleaned.trim(),patch};
}
function handle(text,previous,catalogue,limits={},command=null,planner=root.LoadPlanner){
 const state={...previous},answer=(reply,extra={})=>({state,reply,actions:[],...extra});
 if(/^\s*(?:reset|start over|new plan)\s*[.!]?\s*$/i.test(text))return {state:{},reply:'Let’s start a new plan. Which LG model and how many cartons?',actions:[]};
 const options=loadOptions(text);state.loadOptions={...(state.loadOptions||{}),...options.patch};
 let c;try{c=safeCommand(command||interpret(options.text,state,catalogue));}catch(e){return answer(e.message);}
 if(Object.keys(options.patch).length&&state.model&&c.intent==='help')c.intent='plan';
 if(c.ambiguous)return answer('Please choose one exact model for this plan: '+c.ambiguous.join(', '));
 if(c.model){const p=catalogue.find(p=>p.model.toUpperCase()===c.model.toUpperCase());if(!p)return answer(`I couldn’t find the exact model ${c.model} in the saved Saudi catalogue. Check the code or add it with verified shipping data.`,{actions:[{type:'catalogue'}]});state.model=p.model;}
 if(c.quantity!=null)state.quantity=c.quantity;if(c.pallet)state.pallet=c.pallet;
 if(c.lengthMm!=null)state.L=c.lengthMm;if(c.widthMm!=null)state.D=c.widthMm;
 if(c.intent==='help')return answer('I can look up LG specifications and prepare one-model pallet plans. Standard is 1200 × 1000 mm; Euro is 1200 × 800 mm. Try “Plan 24 WFB0914XM on Euro” or “Dimensions of WFB0914XM”. For custom pallets, include the size and units. Standard/width overhang is allowed up to 100 mm per side by default. Long-unit mode can extend beyond that at the length ends to fit a carton longer than the pallet. Choose 2 or 4 cartons per layer and set verified layers in the planner form. Load limits come from that form. Stacking stays at one layer unless you verify and set a higher limit there.');
 if(c.intent==='search'){
  const aliases={'washers':'washing','washer':'washing','fridges':'refrigerator','fridge':'refrigerator','tvs':'tv','washing machines':'washing'};let q=(c.search||'').toLowerCase();q=aliases[q]||q;
  const words=q.split(/\s+/).filter(Boolean),matches=catalogue.filter(p=>words.every(w=>(p.model+' '+p.name+' '+p.category).toLowerCase().includes(w)));
  return answer(matches.length?`Found ${matches.length} matching models. ${matches.length>6?'Here are the first six:':''}\n`+matches.slice(0,6).map(p=>`${p.model} — ${p.dims&&p.weight?'shipping data available':'shipping data incomplete'}`).join('\n'):'No matching models found. Try an exact model code or a category such as washing or refrigerators.',{actions:[{type:'catalogue'}]});
 }
 if(c.intent==='clarify')return answer('Please provide an exact LG model, carton quantity, and Standard or Euro pallet. I can also look up a model’s dimensions.');
 const product=catalogue.find(p=>p.model===state.model);
 if(c.intent==='dimensions'){
  state.intent='dimensions';
  if(!product)return answer('Which exact LG model would you like dimensions for?');
  const rows=[];if(product.dims)rows.push(`Packaged W × D × H: ${product.dims.join(' × ')} mm`);if(product.weight)rows.push(`Gross carton weight: ${product.weight} kg`);
  rows.push(...(product.dimensionSpecs||[]).slice(0,12).map(r=>r.label+': '+r.value));
  return answer(product.model+'\n'+(rows.length?rows.join('\n'):'Published dimensions are not available in this catalogue. Please enter verified shipping data before planning.')+(product.userSupplied?'\nPlanner shipping data is user supplied.':''),{actions:[{type:'details',model:product.model},{type:'dimensions',model:product.model},{type:'planModel',model:product.model}]});
 }
 state.intent='plan';
 if(!product)return answer('Which exact LG model are you loading? You can include the quantity, for example “24 WFB0914XM”.');
 if(!state.quantity)return answer(`How many cartons of ${product.model} are you loading?`);
 if(!state.pallet)return answer('Which pallet should I use: Standard (1200 × 1000 mm) or Euro (1200 × 800 mm)?',{suggestions:['Standard','Euro']});
 if(state.pallet==='custom'&&(!state.L||!state.D))return answer('What is the custom pallet’s length × width? Please include units, for example “140 × 100 cm”.');
 if(product.bundle)return answer('This is a multi-product bundle listing. Please plan each component model separately using its own shipping carton dimensions.',{actions:[{type:'catalogue'}]});
 if(!product.dims||!product.weight)return answer(`${product.model} is missing packaged dimensions or gross weight. I can’t calculate a load until verified shipping data is added. Unpacked product dimensions won’t be used as carton sizes.`,{actions:[{type:'edit',model:product.model},{type:'dimensions',model:product.model}]});
 const footprint=state.pallet==='custom'?{L:state.L,D:state.D}:pallets[state.pallet];
 try{
  const s={...defaults,...limits,...state.loadOptions,...footprint,type:state.pallet};if((limits.height!=null&&limits.heightMode==null)||state.loadOptions?.height!=null)s.heightMode='limit';if(state.loadOptions?.layers>1)s.stackConfirmed=!!limits.stackConfirmed&&limits.layers===state.loadOptions.layers;if(s.L>10000||s.D>10000)throw Error('Pallet dimensions must be 10,000 mm or less.');
  const plan=planner.plan(product,state.quantity,s);plan.source={url:product.url,checked:product.checked,userSupplied:!!product.userSupplied,note:product.note};
  const partial=plan.pallets.at(-1),count=plan.pallets.length;
  return answer(`${product.model} · ${state.quantity} cartons\n${count} pallet${count===1?'':'s'} required on ${s.L} × ${s.D} mm pallets.\n${plan.capacity} cartons per full pallet; last pallet: ${partial.units}.\nTotal gross weight: ${plan.totalGrossWeight} kg, including ${s.tare} kg tare per pallet.\nHeight: selected ${s.layers} layer(s) need ${plan.heightSummary.selectedHeight} mm; ${plan.settings.heightMode==='auto'?'auto-calculated height':'transport height limit'} ${plan.settings.height} mm allows ${plan.heightSummary.maxLayersByHeight} layer(s); this plan uses up to ${plan.heightSummary.actualMaxLayers}. Gross limit: ${s.maxWeight} kg. Upright cartons; ${plan.settings.lengthOverhangLimitMm} mm length clearance per end and ${plan.settings.overhangMm} mm width overhang per side; ${plan.perLayer} cartons per full layer; maximum ${s.layers} layer(s). Actual overhang L/R/F/B: ${Object.values(plan.overhang).join('/')} mm.${product.userSupplied?'\nBased on user-supplied shipping data.':''}`,{plan,actions:[{type:'viewPlan'},{type:'exportPlan'}]});
 }catch(e){return answer(e.message+' You can adjust dimensions or load limits in the planner.',{actions:[{type:'planner'}]});}
}
root.PlannerChat={interpret,handle,safeCommand};if(typeof module!=='undefined')module.exports=root.PlannerChat;
})(typeof globalThis!=='undefined'?globalThis:window);
