let chatState={},chatHistory=[],chatBusy=false,chatMode='guided',chatLatestPlan=null,chatGeneration=0;
function chatMessage(role,text,actions=[],result=null){
 const row=document.createElement('div');row.className='chatmessage '+role;
 const label=document.createElement('small');label.textContent=role==='user'?'YOU':'PLANNER ASSISTANT';row.append(label);
 const body=document.createElement('div');body.className='chatbubble';body.textContent=text;row.append(body);
 if(actions.length){const group=document.createElement('div');group.className='chatactions';for(const action of actions){const b=document.createElement('button');b.className='secondary';b.textContent={dimensions:'All dimensions',edit:'Add shipping data',catalogue:'Open catalogue',planner:'Open planner',planModel:'Plan this model',viewPlan:'View pallet layout',exportPlan:'Export plan'}[action.type]||'Open';b.onclick=()=>chatAction(action,result);group.append(b);}row.append(group);}
 $('chatmessages').append(row);$('chatmessages').scrollTop=$('chatmessages').scrollHeight;
}
function chatAction(action,result){
 const p=products.find(p=>p.model===action.model);
 if(action.type==='dimensions'&&p)showDimensions(p);else if(action.type==='edit'&&p)edit(p);else if(action.type==='catalogue')tab('catalogue');else if(action.type==='planner')tab('planner');
 else if(action.type==='planModel'&&p)sendChat('Plan '+p.model);
 else if(action.type==='exportPlan'&&result?.plan)download(result.plan.model+'-pallet-plan.json',result.plan);
 else if(action.type==='viewPlan'&&result?.plan){const plan=result.plan;$('model').value=plan.model;$('quantity').value=plan.quantity;$('custom').checked=plan.settings.type==='custom';document.querySelector(`[name=pallet][value="${plan.settings.type==='euro'?'euro':'standard'}"]`).checked=true;palletChange();$('length').value=plan.settings.L;$('depth').value=plan.settings.D;applyLoadSettings(plan.settings);updateModel();lastPlan=plan;renderPlan(plan);tab('planner');}
}
function chatContext(){$('chatcontextmodel').textContent=chatState.model||'No model selected';$('chatcontextdetails').textContent=[chatState.quantity?chatState.quantity+' cartons':'Quantity needed',chatState.pallet?chatState.pallet==='custom'?`Custom ${chatState.L||'?'} × ${chatState.D||'?'} mm`:chatState.pallet==='euro'?'Euro · 1200 × 800 mm':'Standard · 1200 × 1000 mm':'Pallet choice needed'].join('\n');}
function chatSuggestions(values){$('chatsuggestions').replaceChildren();for(const text of values){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>sendChat(text);$('chatsuggestions').append(b);}}
function resetChat(){chatGeneration++;chatState={};chatHistory=[];chatLatestPlan=null;$('chatmessages').replaceChildren();chatMessage('assistant','Hi, I’m your pallet planning assistant. Tell me an LG model and carton quantity, and I’ll help you choose Standard or Euro. You can also ask for a model’s dimensions.');chatContext();chatSuggestions(['Plan 24 WFB0914XM on Euro','Dimensions of WFB0914XM','Find washing machines']);}
async function sendChat(text){
 if(chatBusy||!text.trim())return;if(!products.length){chatMessage('assistant','The catalogue is still loading. Please try again in a moment.');return;}
 text=text.trim().slice(0,2000);const generation=chatGeneration;chatBusy=true;$('chatsend').disabled=true;$('chatsend').textContent='Thinking…';chatMessage('user',text);$('chatinput').value='';let command=null;
 try{
  if(chatMode==='ai'){
   const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,state:chatState,history:chatHistory.slice(-8).map(m=>({...m,content:m.content.slice(0,1000)}))}),signal:AbortSignal.timeout(25000)});const body=await response.json();
   if(!response.ok)throw Error(body.error||'AI connection unavailable');command=body.command;PlannerChat.safeCommand(command);
  }
 }catch(error){command=null;if(generation===chatGeneration)chatMessage('assistant','The AI connection is unavailable for this message. I’ll try the guided planner instead.');}
 try{
  if(generation!==chatGeneration)return;
  const result=PlannerChat.handle(text,chatState,products,settings(),command);chatState=result.state;chatLatestPlan=result.plan||chatLatestPlan;chatMessage('assistant',result.reply,result.actions,result);chatContext();chatSuggestions(result.suggestions||[]);chatHistory.push({role:'user',content:text},{role:'assistant',content:result.reply});chatHistory=chatHistory.slice(-8);
 }catch(error){chatMessage('assistant','I couldn’t process this request. Please try an exact LG model, carton quantity, and Standard or Euro.');}
 finally{chatBusy=false;$('chatsend').disabled=false;$('chatsend').textContent='Send ↗';$('chatinput').focus();}
}
$('chatform').onsubmit=e=>{e.preventDefault();sendChat($('chatinput').value)};$('chatinput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatform').requestSubmit()}};$('resetchat').onclick=resetChat;$('chatopenplanner').onclick=()=>tab('planner');resetChat();
fetch('/api/chat/status').then(r=>r.ok?r.json():null).then(status=>{chatMode=status?.mode==='ai'?'ai':'guided';$('chatmode').textContent=chatMode==='ai'?'AI MODE':'GUIDED MODE · AI NOT CONNECTED';if(chatMode==='ai')$('chatprivacy').textContent='Messages are sent to OpenAI for interpretation. Facts and pallet counts come from the catalogue and calculator. Chat resets when this page is reloaded.';}).catch(()=>{$('chatmode').textContent='GUIDED MODE · AI NOT CONNECTED'});
