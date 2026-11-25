// Parse a fetched search-results page in the extension background context.
// The extension never needs to navigate a browser tab to collect snippets.
function parseGoogleSearchResults(html){
  const document=new DOMParser().parseFromString(html,"text/html");
  const results=[];
  for(const heading of document.querySelectorAll("#search a h3, #rso a h3")){
    const link=heading.closest("a");
    if(!link)continue;
    const title=heading.textContent.trim().slice(0,100);
    let target;
    try{
      target=new URL(link.getAttribute("href"),"https://www.google.com");
      if(target.hostname==="www.google.com" && target.pathname==="/url"){
        target=new URL(target.searchParams.get("q")||target.searchParams.get("url"));
      }
    }catch{continue;}
    if(!/^https?:$/.test(target.protocol) || /(^|\.)google\.com$/.test(target.hostname))continue;
    let group=link;
    while(group && !group.querySelector(".VwiC3b,.IsZvec,[data-sncf]")){
      group=group.parentElement;
      if(group?.querySelectorAll("h3").length>1){group=null;break;}
    }
    const snippet=group?.querySelector(".VwiC3b,.IsZvec,[data-sncf]")?.textContent?.trim();
    if(snippet && !results.some(r=>r.host===target.hostname && r.title===title))
      results.push({host:target.hostname,title,snippet:snippet.slice(0,320)});
    if(results.length===3)break;
  }
  return results;
}

function parseDuckDuckGoSearchResults(html){
  const document=new DOMParser().parseFromString(html,"text/html");
  const results=[];
  for(const row of document.querySelectorAll(".result")){
    const link=row.querySelector("a.result__a");
    const snippet=row.querySelector(".result__snippet")?.textContent?.trim();
    if(!link || !snippet)continue;
    let target;
    try{
      target=new URL(link.getAttribute("href"),"https://html.duckduckgo.com");
      if(/(^|\.)duckduckgo\.com$/.test(target.hostname) && target.pathname.startsWith("/l/")){
        target=new URL(target.searchParams.get("uddg"));
      }
    }catch{continue;}
    if(!/^https?:$/.test(target.protocol) || /(^|\.)duckduckgo\.com$/.test(target.hostname))continue;
    const title=link.textContent?.trim().slice(0,100);
    if(title && !results.some(r=>r.host===target.hostname && r.title===title))
      results.push({host:target.hostname,title,snippet:snippet.slice(0,320)});
    if(results.length===3)break;
  }
  return results;
}
