const status=document.querySelector("#status");
function sizeForAnswer(){
  document.body.classList.remove("roomy");
  const overflow=["#written","#reason"].some(selector=>{
    const area=document.querySelector(selector);
    return area.clientHeight>0 && area.scrollHeight>area.clientHeight+1;
  });
  document.body.classList.toggle("roomy",overflow);
}
document.querySelector("#netacad").onclick=async()=>{
  await browser.tabs.create({url:"https://www.netacad.com/"});
  window.close();
};
(async()=>{
  const [tab]=await browser.tabs.query({active:true,currentWindow:true});
  if(!tab)return;
  const port=browser.runtime.connect({name:"written-answer"});
  port.onMessage.addListener(state=>{
    document.querySelector("#reason").textContent=state.explanation || "";
    document.querySelector("#reason").hidden=true;
    document.querySelector("#explain").hidden=!state.explanation;
    document.querySelector("#result").hidden=!state.answer;
    document.querySelector("#subject").textContent=state.question || "";
    document.querySelector("#written").textContent=state.answer || "";
    status.textContent=state.answer ? "" : "Hover over a question and press Alt+Z first.";
    sizeForAnswer();
  });
  port.postMessage({tabId:tab.id});
})();

const explain=document.querySelector("#explain");
explain.onclick=()=>{const reason=document.querySelector("#reason");reason.hidden=!reason.hidden;sizeForAnswer();};
document.addEventListener("keydown",event=>{
  if(event.key.toLowerCase()==="e" && !event.repeat && !explain.hidden && event.target.tagName!=="INPUT")explain.click();
});
