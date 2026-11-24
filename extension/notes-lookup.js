// Optional course-note excerpts used as lower-priority evidence, never as an
// authoritative answer key. Bundled notes require --notes; imports stay local.
const NOTE_STOPWORDS = new Set((
  "a an and are as at be by can do does for from has have how i in into is it its of on or our " +
  "that the their there these this to was were what when where which who why will with you your " +
  "answer correct following choose select option options statement statements one two three true false " +
  "data essentials lecture slide example examples question questions").split(" "));

function noteTokens(value){
  return new Set((String(value).toLowerCase().replace(/normalisation/g,"normalization").match(/[a-z][a-z0-9]{2,}/g)||[])
    .filter(word=>!NOTE_STOPWORDS.has(word)));
}

function lookupStudyNotes(stem,extraRecords=[]){
  const bundled=globalThis.QUIZPILOT_STUDY_NOTES;
  const records=[...(Array.isArray(extraRecords)?extraRecords:[]),...(Array.isArray(bundled)?bundled:[])];
  if(!records.length)return null;
  const query=noteTokens(stem);
  if(!query.size)return null;
  let best=null, bestScore=0;
  for(const record of records){
    if(!record || typeof record.text!=="string")continue;
    const terms=noteTokens(record.text+" "+record.title);
    const overlap=[...query].filter(term=>terms.has(term));
    if(!overlap.length)continue;
    const specificity=overlap.filter(term=>term.length>=6);
    if(overlap.length<2 && !(specificity.length && query.size<=3))continue;
    const score=overlap.reduce((sum,term)=>sum+(term.length>=7?2:1),0) / Math.sqrt(query.size);
    if(score>bestScore){best=record;bestScore=score;}
  }
  if(!best)return null;
  const words=best.text.split(/\s+/);
  const keywords=[...query];
  const first=words.findIndex(word=>keywords.some(term=>word.toLowerCase().replace(/[^a-z0-9]/g,"").includes(term)));
  const start=Math.max(0,first-12);
  let excerpt=words.slice(start).join(" ").slice(0,550);
  if(start)excerpt="…"+excerpt;
  if(start+Math.ceil(excerpt.split(/\s+/).length)<words.length)excerpt+="…";
  return {host:"Course notes (secondary cross-check)",title:best.title+" — "+best.section,
    snippet:"Course notes are supplemental and may be incomplete or wrong. "+excerpt};
}
