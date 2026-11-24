(async()=>{
  function enablePeek(controller, stem){
    let answer="", held=false, ready=false;
    let box,timer,lookup,explanation="",detail="";
    let usable=false;
    const hide=()=>{
      held=false;ready=false;
      clearTimeout(timer);
      box?.remove();
      box=null;
    };
    function show(){
      if(!held || !ready || !answer || controller.signal.aborted)return;
      if(!lookup && usable){
        lookup=browser.runtime.sendMessage({kind:"quizpilot-explain",stem,answer,reason:explanation}).then(result=>{
          detail=result.text;show();
        }).catch(()=>{detail="Explanation lookup unavailable.";show();});
      }
      if(!box){
        box=document.createElement("div");
        box.className="quizpilot-peek";
        box.style.cssText="position:fixed;bottom:12px;right:12px;z-index:2147483647;box-sizing:border-box;width:min(280px,90vw);height:min(72px,35vh);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;background:#182226;color:#f8fafb;border-radius:5px;padding:5px 8px;font:14px/1.4 system-ui;white-space:pre-wrap;overflow-wrap:anywhere";
        box.addEventListener("wheel",event=>{
          if(event.ctrlKey || !event.cancelable)return;
          const delta=Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX;
          if(!delta)return;
          event.preventDefault();
          event.stopPropagation();
          const scale=event.deltaMode===1?20:event.deltaMode===2?box.clientHeight:1;
          box.scrollBy({top:delta*scale,behavior:"instant"});
        },{passive:false});
        document.body.append(box);
      }
      const heading=document.createElement("strong");
      heading.style.cssText="display:block;font-weight:700;color:white;margin-bottom:2px";
      heading.textContent=answer;
      box.replaceChildren(heading,document.createTextNode(detail || explanation || "Checking sources…"));
    }
    const listen={capture:true,signal:controller.signal};
    window.addEventListener("keydown",event=>{
      if(box && ["ArrowDown","ArrowUp"].includes(event.key) && event.shiftKey){
        event.preventDefault();
        box.scrollTop+=event.key==="ArrowDown"?42:-42;
        return;
      }
      if(event.key!=="Shift"){hide();return;}
      if(event.target?.closest?.('input:not([type=radio]):not([type=checkbox]),textarea,[contenteditable=true]') || event.repeat || event.altKey || event.ctrlKey || event.metaKey)return;
      hide();
      held=true;
      timer=setTimeout(()=>{ready=true;show();},250);
    },listen);
    window.addEventListener("keyup",event=>{if(event.key==="Shift")hide();},listen);
    window.addEventListener("blur",hide,listen);
    document.addEventListener("visibilitychange",hide,listen);
    window.addEventListener("pagehide",()=>controller.abort(),listen);
    controller.signal.addEventListener("abort",hide,{once:true});
    return (text,reason="")=>{answer=text;explanation=reason;usable=true;show();};
  }
  const visible=Array.from(document.querySelectorAll(".que")).filter(block=>{
    const box=block.getBoundingClientRect();
    return box.height>0 && box.bottom>0 && box.top<innerHeight;
  });
  const block=document.querySelector(".que:hover") || document.activeElement?.closest(".que") || (visible.length===1 ? visible[0] : null);
  function note(parent,text){
    let node=parent.querySelector(":scope > .quizpilot-note");
    if(!node){node=document.createElement("small");node.className="quizpilot-note";node.setAttribute("role","status");parent.append(node);}
    node.textContent=text;return node;
  }
  if(!block){const msg=note(document.body,"cncaS2: point at a Moodle question first.");msg.style.cssText="position:fixed;bottom:1em;right:1em;background:white;color:#222;padding:.4em;z-index:99999";setTimeout(()=>msg.remove(),3000);return;}
  if(block.dataset.quizpilotBusy)return;
  const questionText=block.querySelector(".qtext");
  const answerArea=block.querySelector(".answer");
  const blanks=[];
  function readPrompt(area){
    if(!area)return "";
    const copy=area.cloneNode(true);
    copy.querySelectorAll("script,style,[hidden],.accesshide,.sr-only,.quizpilot-mark").forEach(el=>el.remove());
    for(const field of copy.querySelectorAll("select,input,textarea")){
      if(field.matches('input[type="hidden"]')){field.remove();continue;}
      const index=blanks.length+1;
      const options=[...field.querySelectorAll("option")].filter(o=>o.getAttribute("value")!=="" && !/^choose(?:\.{3}|…)?$/i.test(o.textContent.trim())).map(o=>o.textContent.trim()).filter(Boolean);
      blanks.push(options);
      field.replaceWith(document.createTextNode(" [blank "+index+"] "));
    }
    copy.querySelectorAll("br").forEach(el=>el.replaceWith(document.createTextNode("\n")));
    copy.querySelectorAll("p,tr,li,div").forEach(el=>el.append(document.createTextNode("\n")));
    return copy.textContent.trim();
  }
  const embedded=questionText?.querySelector("select,input:not([type=hidden]),textarea");
  const dropdown=answerArea?.querySelector("select");
  let stem=questionText?.innerText.trim();
  if(embedded || dropdown){
    stem=readPrompt(questionText);
    if(dropdown && !questionText?.contains(answerArea))stem+="\n"+readPrompt(answerArea);
    stem+="\nGive a numbered answer for each blank."+blanks.map((options,i)=>options.length?"\nBlank "+(i+1)+" options: "+options.join(" | "):"").join("");
  }
  const fields=[...block.querySelectorAll('.answer input[type="radio"],.answer input[type="checkbox"]')];
  const rows=fields.map(f=>f.closest(".r0,.r1") || f.labels?.[0] || f.parentElement);
  const choices=rows.map(row=>row.innerText.trim());
  block.querySelectorAll(".quizpilot-mark").forEach(node=>node.remove());
  block.querySelector(":scope > .quizpilot-note")?.remove();
  const diagram=questionText?.querySelector("img");
  if(diagram && questionText.querySelectorAll("img").length===1 && !block.querySelector(".answer img,.qtext svg,.qtext canvas,.qtext video,.qtext iframe")){
    if(block.querySelector(".quizpilot-diagram"))return;
    const send=document.createElement("button");
    send.type="button";send.className="quizpilot-diagram";send.textContent="Send this diagram and question to cncaS2";
    block.append(send);
    send.onclick=async()=>{
      send.disabled=true;
      try{
        const scale=Math.min(1,1200/Math.max(diagram.naturalWidth,diagram.naturalHeight));
        if(!diagram.naturalWidth)throw Error("Diagram has not loaded.");
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(diagram.naturalWidth*scale));
        canvas.height=Math.max(1,Math.round(diagram.naturalHeight*scale));
        const ctx=canvas.getContext("2d");
        ctx.fillStyle="white";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(diagram,0,0,canvas.width,canvas.height);
        const image=canvas.toDataURL("image/jpeg",0.8);
        const result=await browser.runtime.sendMessage({kind:"quizpilot-answer",stem:stem || "Describe the diagram.",choices,multiple:fields.some(f=>f.type==="checkbox"),image});
        globalThis.quizpilotPeek?.abort();
        const peek=new AbortController();
        globalThis.quizpilotPeek=peek;
        enablePeek(peek,stem || "Explain the diagram answer.")(result.answer);
        note(block,"Diagram answer is in the cncaS2 popup.");
      }catch(error){note(block,error.message);}
      finally{send.remove();}
    };
    return;
  }
  if(!stem || choices.some(c=>!c) || (!fields.length && !blanks.length && !block.matches(".shortanswer,.essay,.numerical,.calculated,.calculatedsimple")) || block.querySelector(".qtext img,.answer img,.qtext svg,.answer svg,.qtext math,.answer math,.qtext canvas,.qtext audio,.qtext video,.qtext iframe")){
    note(block,"cncaS2 needs a supported text question.");return;
  }
  globalThis.quizpilotPeek?.abort();
  const peek=new AbortController();
  globalThis.quizpilotPeek=peek;
  const setPeek=enablePeek(peek,stem);
  block.dataset.quizpilotBusy="1";
  try{
    const data=await browser.runtime.sendMessage({kind:"quizpilot-answer",stem,choices,multiple:fields.some(f=>f.type==="checkbox")});
    if(!fields.length){
      if(data.answer)setPeek(data.answer);
      return;
    }
    if(!Array.isArray(data.positions) || !data.positions.length || data.positions.some(i=>!Number.isInteger(i)||!rows[i-1]))throw Error("No clear choice returned.");
    if(!document.getElementById("quizpilot-hover-style")){
      const style=document.createElement("style");
      style.id="quizpilot-hover-style";
      style.textContent=".que .quizpilot-mark{display:none;position:absolute;width:3px;height:3px;background:#fff;box-shadow:0 0 0 1px #8886;margin-inline-start:3px;pointer-events:none}.que :hover > .quizpilot-mark{display:inline-block}";
      document.head.append(style);
    }
    setPeek(data.positions.map(i=>choices[i-1]).join("\n"),data.explanation);
    for(const i of data.positions){
      const mark=document.createElement("span");
      mark.className="quizpilot-mark";mark.setAttribute("role","img");mark.setAttribute("aria-label","cncaS2 suggested answer");
      rows[i-1].append(mark);
    }
  }catch(e){note(block,e.message);}finally{delete block.dataset.quizpilotBusy;}
})();
