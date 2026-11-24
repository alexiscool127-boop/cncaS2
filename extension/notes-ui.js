const notesInput=document.querySelector("#notes-input");
const notesCount=document.querySelector("#notes-count");
const notesList=document.querySelector("#note-list");
const notesFeedback=document.querySelector("#notes-feedback");
const notesProgressWrap=document.querySelector("#notes-progress-wrap");
const notesProgress=document.querySelector("#notes-progress");
const notesPercent=document.querySelector("#notes-percent");
const notesStage=document.querySelector("#notes-stage");
const backupButton=document.querySelector("#backup-notes");
let importedNotes=[];
let notesBusy=false;
const NOTES_STORAGE_KEY="userNotes";
const NOTES_STORAGE_MAX_CHARS=1600000;
const NOTES_STORAGE_MAX_FILES=50;

function setNotesProgress(percent,label){
  const amount=Math.max(0,Math.min(100,Math.round(percent)));
  notesProgressWrap.hidden=false;
  notesProgress.value=amount;
  notesPercent.textContent=amount+"%";
  notesStage.textContent=label;
}

function renderImportedNotes(){
  const passages=importedNotes.reduce((sum,item)=>sum+item.records.length,0);
  notesCount.textContent=importedNotes.length+" file"+(importedNotes.length===1?"":"s")+" · "+passages+" sections";
  notesList.replaceChildren();
  for(const item of importedNotes){
    const row=document.createElement("li");row.className="note-row";
    const title=document.createElement("span");
    title.textContent=item.name+" ("+item.records.length+" sections"+(item.processedFiles>1?", "+item.processedFiles+" files":"")+")";
    title.title=item.name;
    const remove=document.createElement("button");remove.type="button";remove.textContent="Remove";
    remove.setAttribute("aria-label","Remove "+item.name);
    remove.disabled=notesBusy;
    remove.addEventListener("click",async()=>{
      importedNotes=importedNotes.filter(note=>note.id!==item.id);
      try{
        await browser.storage.local.set({[NOTES_STORAGE_KEY]:importedNotes});
        notesFeedback.textContent="Removed "+item.name+".";
      }catch(error){
        importedNotes.push(item);
        notesFeedback.textContent="Could not remove: "+error.message;
      }
      renderImportedNotes();
    });
    row.append(title,remove);notesList.append(row);
  }
}

function setNotesBusy(busy){
  notesBusy=busy;
  notesInput.disabled=busy;
  backupButton.disabled=busy;
  document.querySelector(".upload").style.pointerEvents=busy?"none":"";
  renderImportedNotes();
}

function readNotesFile(file,progress){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onprogress=event=>{if(event.lengthComputable)progress(event.loaded/event.total);};
    reader.onload=()=>resolve(new Uint8Array(reader.result));
    reader.onerror=()=>reject(reader.error||Error("Could not read this file."));
    reader.readAsArrayBuffer(file);
  });
}

function verifyBackupEntry(item){
  if(!item || typeof item.name!=="string" || !Array.isArray(item.records) || item.records.length>NOTE_MAX_RECORDS)return null;
  const records=[];
  for(const record of item.records){
    if(!record || typeof record.text!=="string" || record.text.length>NOTE_BLOCK_CHARS+100 || typeof record.section!=="string")return null;
    records.push({title:item.name.slice(0,180),section:record.section.slice(0,120),text:record.text});
  }
  return {id:crypto.randomUUID(),name:item.name.slice(0,180),records,importedAt:Date.now()};
}

function checkedNoteLibrary(candidate){
  if(candidate.length>NOTES_STORAGE_MAX_FILES)throw Error("Your notes library is full (50 files maximum).");
  const size=candidate.reduce((sum,item)=>sum+item.records.reduce((part,r)=>part+r.text.length,0),0);
  if(size>NOTES_STORAGE_MAX_CHARS)throw Error("Notes library is full. Remove an older file or shorten this one.");
  return candidate;
}

notesInput.addEventListener("change",async()=>{
  if(notesBusy || !notesInput.files?.length)return;
  await initialNotesReady;
  const files=[...notesInput.files];
  setNotesBusy(true);
  let success=0;const errors=[];
  try{
    for(let index=0;index<files.length;index++){
      const file=files[index];
      const overall=fraction=>100*(index+fraction)/files.length;
      try{
        if(file.size>NOTE_MAX_FILE_BYTES)throw Error("Larger than 50 MB.");
        setNotesProgress(overall(0),"Reading "+file.name);
        const bytes=await readNotesFile(file,fraction=>setNotesProgress(overall(fraction*0.35),"Reading "+file.name));
        setNotesProgress(overall(0.35),"Extracting "+file.name);
        const extracted=await extractNoteRecords(file.name,bytes,fraction=>
          setNotesProgress(overall(0.35+fraction*0.55),"Indexing "+file.name));
        let next=[...importedNotes];
        if(extracted.restore){
          const restored=extracted.restore.map(verifyBackupEntry);
          if(restored.some(entry=>!entry))throw Error("Backup contains invalid notes.");
          for(const item of restored){next=next.filter(old=>old.name!==item.name);next.push(item);}
        }else{
          const item={id:crypto.randomUUID(),name:file.name.slice(0,180),records:extracted.records,processedFiles:extracted.processedFiles,importedAt:Date.now()};
          next=next.filter(old=>old.name!==item.name);
          next.push(item);
          if(extracted.truncated)errors.push(file.name+": indexed first "+NOTE_MAX_TEXT_CHARS.toLocaleString()+" characters only.");
          if(extracted.warnings?.length)errors.push(file.name+": "+extracted.warnings.slice(0,3).join("; ")+(extracted.warnings.length>3?" (more skipped)":""));
        }
        checkedNoteLibrary(next);
        setNotesProgress(overall(0.95),"Saving "+file.name);
        await browser.storage.local.set({[NOTES_STORAGE_KEY]:next});
        importedNotes=next;
        success++;
        renderImportedNotes();
        setNotesProgress(overall(1),"Saved "+file.name);
      }catch(error){errors.push(file.name+": "+error.message);setNotesProgress(overall(1),"Skipped "+file.name);}
    }
    notesFeedback.textContent=success+" file"+(success===1?"":"s")+" processed. "+(errors.length?errors.join(" "):"Ready for the next question.");
    if(success)setNotesProgress(100,"Notes ready");
  }finally{notesInput.value="";setNotesBusy(false);}
});

backupButton.addEventListener("click",()=>{
  if(!importedNotes.length){notesFeedback.textContent="Import some notes before making a backup.";return;}
  const blob=new Blob([JSON.stringify({format:"cncaS2-notes-v1",userNotes:importedNotes})],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download="cncaS2-notes-backup.json";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notesFeedback.textContent="Backup prepared. Re-import this JSON file after reinstalling.";
});

const initialNotesReady=(async()=>{
  try{
    const saved=await browser.storage.local.get(NOTES_STORAGE_KEY);
    importedNotes=Array.isArray(saved[NOTES_STORAGE_KEY])?saved[NOTES_STORAGE_KEY]:[];
    renderImportedNotes();
  }catch(error){notesFeedback.textContent="Cannot load saved notes: "+error.message;}
})();
