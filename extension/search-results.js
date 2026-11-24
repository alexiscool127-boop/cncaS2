(()=>{
  if(location.origin!=="https://www.google.com" || location.pathname!=="/search")return [];
  const results=[];
  for(const heading of document.querySelectorAll("#search a h3, #rso a h3")){
    const link=heading.closest("a");
    const title=heading.textContent.trim().slice(0,100);
    if(!/^https?:$/.test(link.protocol) || /(^|\.)google\.com$/.test(link.hostname))continue;
    let group=link;
    while(group && !group.querySelector(".VwiC3b,.IsZvec,[data-sncf]")){
      group=group.parentElement;
      if(group?.querySelectorAll("h3").length>1){group=null;break;}
    }
    const snippet=group?.querySelector(".VwiC3b,.IsZvec,[data-sncf]")?.textContent.trim();
    if(snippet && !results.some(r=>r.host===link.hostname && r.title===title))
      results.push({host:link.hostname,title,snippet:snippet.slice(0,320)});
    if(results.length===3)break;
  }
  return results;
})()
