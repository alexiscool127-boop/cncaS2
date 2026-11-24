const cache=new Map();
const latest=new Map();
const viewers=new Map();
function update(tabId,state){
  latest.set(tabId,state);
  try{viewers.get(tabId)?.postMessage(state);}catch{viewers.delete(tabId);}
}
browser.tabs.onRemoved.addListener(id=>{latest.delete(id);cache.delete(id);});
browser.tabs.onUpdated.addListener((id,change)=>{
  if(change.status==="loading"){cache.delete(id);latest.delete(id);viewers.get(id)?.postMessage({});}
});
browser.runtime.onConnect.addListener(port=>{
  if(port.sender.url!==browser.runtime.getURL("panel.html"))return;
  port.onMessage.addListener(({tabId})=>{
    viewers.set(tabId,port);
    port.postMessage(latest.get(tabId)||{});
    port.onDisconnect.addListener(()=>{if(viewers.get(tabId)===port)viewers.delete(tabId);});
  });
});
browser.runtime.onMessage.addListener((q,sender)=>{
  if(!sender.tab || sender.id!==browser.runtime.id || q?.kind!=="quizpilot-answer")return;
  return (async()=>{
    const tabId=sender.tab.id;
    const pending={question:q.stem.split("\n")[0],answer:"Answering…"};
    const payload={stem:q.stem,choices:q.choices,multiple:q.multiple,mark:true,image:q.image};
    const key=JSON.stringify(payload);
    if(!cache.has(tabId))cache.set(tabId,new Map());
    const entries=cache.get(tabId);
    function display(data){
      const answer=data.answer || data.positions.map(i=>q.choices[i-1]).join("\n");
      update(tabId,{question:pending.question,answer,explanation:data.explanation});
    }
    if(entries.has(key)){
      const data=entries.get(key);display(data);return data;
    }
    update(tabId,pending);
    try{
    const response=await fetch(QUIZPILOT_ORIGIN+"/public"+(q.image?"/diagram":"/answer"),{method:"POST",credentials:"omit",redirect:"error",
      headers:{"Content-Type":"application/json"},
      body:key,signal:AbortSignal.timeout(60000)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error || "Request failed.");
    if(entries.size>=24)entries.delete(entries.keys().next().value);
    entries.set(key,data);
    if(latest.get(tabId)===pending)display(data);
    return data;
    }catch(error){
      if(latest.get(tabId)===pending)update(tabId,{...pending,answer:error.message});
      throw error;
    }
  })();
});

browser.commands.onCommand.addListener(async command=>{
  if(command!=="ask-question")return;
  const [tab]=await browser.tabs.query({active:true,currentWindow:true});
  if(!tab)return;
  try{await browser.tabs.executeScript(tab.id,{file:"inline.js"});}
  catch{await browser.browserAction.setBadgeText({tabId:tab.id,text:"!"});}
});

async function searchExcerpts(stem){
  const url=new URL("https://www.google.com/search");
  url.searchParams.set("q",stem.split("\nGive a numbered answer")[0].slice(0,280));
  const tab=await browser.tabs.create({url:url.href,active:false});
  try{
    for(let i=0;i<12;i++){
      await new Promise(resolve=>setTimeout(resolve,500));
      try{
        const [sources]=await browser.tabs.executeScript(tab.id,{file:"search-results.js"});
        if(sources?.length)return sources;
      }catch{/* The results page may still be navigating. */}
    }
    return [];
  }finally{
    const current=await browser.tabs.get(tab.id).catch(()=>null);
    if(current && !current.active)await browser.tabs.remove(tab.id).catch(()=>{});
  }
}
browser.runtime.onMessage.addListener((q,sender)=>{
  if(!sender.tab || sender.id!==browser.runtime.id || q?.kind!=="quizpilot-explain")return;
  return (async()=>{
    const sources=await searchExcerpts(q.stem).catch(()=>[]);
    const labels=sources.map((s,i)=>"["+ (i+1) +"] "+s.host+" — "+s.title);
    const status=sources.length?labels.join("\n"):"Google returned no usable sources.";
    try{
      const response=await fetch(QUIZPILOT_ORIGIN+"/public/explain",{
        method:"POST",credentials:"omit",redirect:"error",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({stem:q.stem.slice(0,1800),answer:q.answer.slice(0,600),sources:sources.map((s,i)=>labels[i]+": "+s.snippet)}),
        signal:AbortSignal.timeout(25000)
      });
      if(!response.ok)throw Error();
      const data=await response.json();
      return {text:data.text+"\n\n"+status};
    }catch{return {text:[q.reason || "Explanation unavailable.",status].join("\n\n")};}
  })();
});
