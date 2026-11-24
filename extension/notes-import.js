// Pure browser-side text extraction: no document is uploaded for indexing.
// Images and scanned PDF pages require OCR and are not supported here.
const NOTE_MAX_FILE_BYTES=50*1024*1024;
const NOTE_MAX_TEXT_CHARS=400000;
const NOTE_MAX_RECORDS=400;
const NOTE_BLOCK_CHARS=1450;

function noteDecodeEntities(value){
  return String(value).replace(/&(?:#(x[\da-f]+|\d+)|amp|lt|gt|quot|apos);/gi,(_match,numeric)=>{
    if(numeric){
      const n=numeric[0].toLowerCase()==="x"?parseInt(numeric.slice(1),16):parseInt(numeric,10);
      return Number.isFinite(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):"";
    }
    const named=_match.toLowerCase();
    return {"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"}[named]||_match;
  });
}

function noteClean(value){return String(value).replace(/\s+/g," ").trim();}
function noteTags(xml,tag){
  const re=new RegExp("<(?:[a-z]+:)?"+tag+"\\b[^>]*>([\\s\\S]*?)<\\/(?:[a-z]+:)?"+tag+">","g");
  return Array.from(xml.matchAll(re),match=>match[1]);
}
function noteTextTags(xml){
  return noteTags(xml,"t").map(value=>noteDecodeEntities(value.replace(/<[^>]+>/g,""))).join(" ");
}

function noteChunkRecords(title,section,text){
  const words=noteClean(text).split(/\s+/);
  const records=[];
  let chunk="",part=0;
  for(const word of words){
    if(chunk && chunk.length+word.length+1>NOTE_BLOCK_CHARS){
      records.push({title,section:section+(part?" · part "+(part+1):""),text:chunk});
      chunk="";part++;
    }
    chunk+=(chunk?" ":"")+word;
  }
  if(chunk.trim())records.push({title,section:section+(part?" · part "+(part+1):""),text:chunk});
  return records;
}

async function noteZipMembers(bytes,accept,progress=()=>{},options={}){
  const buf=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const view=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
  let end=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--){
    if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  }
  if(end<0)throw Error("Not a valid ZIP document.");
  const count=view.getUint16(end+10,true),centralOffset=view.getUint32(end+16,true);
  if(count>3000 || centralOffset>=buf.length)throw Error("Document archive is too large or unsupported.");
  const decoder=new TextDecoder();
  const accepted=[];
  const plainLimit=options.plainLimit||3*1024*1024;
  const maxEntries=options.maxEntries||3000;
  const totalLimit=options.totalLimit||plainLimit*maxEntries;
  let declaredTotal=0;
  let offset=centralOffset;
  for(let i=0;i<count;i++){
    if(offset+46>buf.length||view.getUint32(offset,true)!==0x02014b50)throw Error("Invalid Office archive directory.");
    const method=view.getUint16(offset+10,true),compressed=view.getUint32(offset+20,true);
    const plain=view.getUint32(offset+24,true),nameSize=view.getUint16(offset+28,true);
    const extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
    const localOffset=view.getUint32(offset+42,true);
    const name=decoder.decode(buf.subarray(offset+46,offset+46+nameSize));
    if(accept(name)){
      const oversized=plain>plainLimit || compressed>plainLimit;
      const overBudget=declaredTotal+plain>totalLimit || accepted.length>=maxEntries;
      if(oversized || overBudget){
        if(!options.skipTooLarge)throw Error(oversized?"A ZIP entry exceeds the safe size limit.":"ZIP contains too much data to import safely.");
        options.onSkip?.(name,oversized?"too large":"archive size limit reached");
      }else{
        declaredTotal+=plain;
        accepted.push({name,method,compressed,plain,localOffset});
      }
    }
    offset+=46+nameSize+extra+comment;
  }
  accepted.sort((a,b)=>{
    const num=name=>Number(name.match(/(\d+)\.xml$/)?.[1]||0);
    return num(a.name)-num(b.name)||a.name.localeCompare(b.name);
  });
  const output=[];
  for(let i=0;i<accepted.length;i++){
    const item=accepted[i],position=item.localOffset;
    if(position+30>buf.length||view.getUint32(position,true)!==0x04034b50)throw Error("Invalid Office archive entry.");
    const start=position+30+view.getUint16(position+26,true)+view.getUint16(position+28,true);
    if(start+item.compressed>buf.length)throw Error("Incomplete Office archive.");
    const compressed=buf.subarray(start,start+item.compressed);
    let data;
    if(item.method===0)data=compressed;
    else if(item.method===8){
      if(typeof DecompressionStream!=="function")throw Error("This Firefox version cannot open compressed Office files.");
      const decompressed=new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader=decompressed.getReader(),pieces=[];
      let length=0;
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        length+=value.byteLength;
        if(length>plainLimit){await reader.cancel();throw Error("Decompressed ZIP entry is too large.");}
        pieces.push(value);
      }
      data=new Uint8Array(length);
      let written=0;
      for(const piece of pieces){data.set(piece,written);written+=piece.length;}
    }else throw Error("Unsupported Office compression method.");
    if(data.byteLength>plainLimit)throw Error("A decompressed section is too large.");
    output.push(options.binary?{name:item.name,data}:{name:item.name,xml:decoder.decode(data)});
    progress((i+1)/Math.max(accepted.length,1));
  }
  return output;
}

async function extractNoteRecords(fileName,bytes,progress=()=>{},depth=0){
  const name=String(fileName).replace(/\\/g,"/").replace(/(?:^|\/)\.\.(?=\/|$)/g,"").slice(0,220);
  const ext=name.toLowerCase().split(".").pop();
  const buf=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(buf.byteLength>NOTE_MAX_FILE_BYTES)throw Error("File is over the 50 MB import limit.");
  let records=[],warnings=[],processedFiles=1;
  if(["txt","md","csv","json","html","htm","xml","log"].includes(ext)){
    const decoded=new TextDecoder().decode(buf);
    if(ext==="json"){
      let backup;
      try{backup=JSON.parse(decoded);}catch{/* Treat ordinary JSON as notes text. */}
      if(backup?.format==="cncaS2-notes-v1" && Array.isArray(backup.userNotes)){
        if(backup.userNotes.length>50)throw Error("Backup exceeds the 50-file limit.");
        progress(1);
        return {restore:backup.userNotes,records:[],truncated:false};
      }
    }
    const text=["html","htm","xml"].includes(ext)?
      (noteTextTags(decoded)||noteDecodeEntities(decoded.replace(/<[^>]*>/g," "))):decoded;
    records=noteChunkRecords(name,"document",text.slice(0,NOTE_MAX_TEXT_CHARS));
    progress(1);
  }else if(ext==="zip"){
    if(depth>=2)throw Error("ZIP archives nested more than two levels are not supported.");
    const ignored=[];
    const readable=/\.(?:txt|md|csv|json|html|htm|xml|log|pptx|docx|xlsx|pdf|zip)$/i;
    const members=await noteZipMembers(buf,path=>{
      if(readable.test(path))return true;
      if(!path.endsWith("/")&&!path.startsWith("__MACOSX/")&&!path.endsWith(".DS_Store"))ignored.push(path);
      return false;
    },fraction=>progress(fraction*0.45),{
      binary:true,plainLimit:NOTE_MAX_FILE_BYTES,totalLimit:100*1024*1024,maxEntries:120,
      skipTooLarge:true,onSkip:(path,reason)=>ignored.push(path+" ("+reason+")")
    });
    if(!members.length)throw Error("ZIP has no supported text documents. "+(ignored.length?"Skipped: "+ignored.slice(0,3).join(", "):""));
    processedFiles=0;
    for(let i=0;i<members.length;i++){
      const member=members[i];
      try{
        const child=await extractNoteRecords(name+"/"+member.name,member.data,
          fraction=>progress(0.45+0.55*(i+fraction)/members.length),depth+1);
        if(child.restore){
          for(const item of child.restore){
            if(Array.isArray(item.records))records.push(...item.records.filter(row=>row&&typeof row.text==="string"));
          }
        }else records.push(...child.records);
        warnings.push(...(child.warnings||[]));
        processedFiles+=child.processedFiles||1;
      }catch(error){warnings.push(member.name+": "+error.message);}
      progress(0.45+0.55*(i+1)/members.length);
    }
    if(ignored.length)warnings.push("Skipped unsupported files: "+ignored.slice(0,5).join(", ")+(ignored.length>5?" (and "+(ignored.length-5)+" more)":""));
  }else if(ext==="pdf"){
    if(typeof extractPdfRecords!=="function")throw Error("PDF reader unavailable in this build.");
    records=await extractPdfRecords(name,buf,progress);
  }else if(ext==="pptx"){
    const members=await noteZipMembers(buf,path=>/^ppt\/slides\/slide\d+\.xml$/.test(path),progress);
    for(const {name:path,xml} of members){
      const slide=path.match(/slide(\d+)\.xml$/)[1];
      records.push(...noteChunkRecords(name,"slide "+slide,noteTextTags(xml)));
    }
  }else if(ext==="docx"){
    const members=await noteZipMembers(buf,path=>path==="word/document.xml",progress);
    for(const {xml} of members){
      const paragraphs=noteTags(xml,"p").map(noteTextTags).filter(Boolean);
      records.push(...noteChunkRecords(name,"document",paragraphs.join(". ")));
    }
  }else if(ext==="xlsx"){
    const members=await noteZipMembers(buf,path=>path==="xl/sharedStrings.xml"||/^xl\/worksheets\/sheet\d+\.xml$/.test(path),progress);
    const stringsXml=members.find(item=>item.name==="xl/sharedStrings.xml")?.xml||"";
    const strings=noteTags(stringsXml,"si").map(noteTextTags);
    for(const member of members.filter(item=>item.name.includes("/worksheets/"))){
      const rows=[];
      for(const row of noteTags(member.xml,"row")){
        const columns=[];
        for(const [,attributes,cell] of row.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
          const raw=noteTags(cell,"v")[0];
          const stringIndex=/\bt="s"/.test(attributes)?Number(raw):NaN;
          const value=Number.isInteger(stringIndex)?strings[stringIndex]:raw??noteTextTags(cell);
          if(value!==undefined && noteClean(value))columns.push(noteClean(noteDecodeEntities(value)));
        }
        if(columns.length)rows.push(columns.join(" | "));
      }
      const sheet=member.name.match(/sheet(\d+)\.xml$/)?.[1]||"?";
      records.push(...noteChunkRecords(name,"sheet "+sheet,rows.join("; ")));
    }
  }else throw Error("Supported: ZIP, TXT, MD, CSV, JSON, HTML, XML, PDF, PPTX, DOCX, XLSX. Scans and old PPT files need conversion first.");
  records=records.filter(row=>row.text.length>=15);
  let total=0,limited=false;
  const bounded=[];
  for(const row of records){
    if(bounded.length>=NOTE_MAX_RECORDS || total+row.text.length>NOTE_MAX_TEXT_CHARS){limited=true;break;}
    bounded.push(row);total+=row.text.length;
  }
  if(!bounded.length)throw Error("No readable text found. Image-only pages need OCR before importing. "+warnings.slice(0,2).join(" "));
  return {records:bounded,truncated:limited,chars:total,warnings,processedFiles};
}
