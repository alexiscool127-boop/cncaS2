import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {deflateRawSync} from "node:zlib";
import {createContext,runInContext} from "node:vm";

const context=createContext({Uint8Array,DataView,TextDecoder,Blob,DecompressionStream,Response});
runInContext(readFileSync("extension/notes-import.js","utf8"),context);
const extract=runInContext("extractNoteRecords",context);

function zipXml(entries){
  const local=[],central=[];
  let position=0;
  for(const [path,xml] of Object.entries(entries)){
    const name=Buffer.from(path),data=Buffer.from(xml),compressed=deflateRawSync(data);
    const header=Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50,0);
    header.writeUInt16LE(8,8);
    header.writeUInt32LE(compressed.length,18);
    header.writeUInt32LE(data.length,22);
    header.writeUInt16LE(name.length,26);
    local.push(header,name,compressed);
    const directory=Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50,0);
    directory.writeUInt16LE(8,10);
    directory.writeUInt32LE(compressed.length,20);
    directory.writeUInt32LE(data.length,24);
    directory.writeUInt16LE(name.length,28);
    directory.writeUInt32LE(position,42);
    central.push(directory,name);
    position+=header.length+name.length+compressed.length;
  }
  const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(Object.keys(entries).length,8);
  end.writeUInt16LE(Object.keys(entries).length,10);
  end.writeUInt32LE(centralBytes.length,12);
  end.writeUInt32LE(position,16);
  return Buffer.concat([...local,centralBytes,end]);
}

test("imports ordinary study text and supports a private JSON backup",async()=>{
  const text=await extract("notes.txt",Buffer.from("Normalisation reduces redundancy and prevents update anomalies."));
  assert.equal(text.records.length,1);
  assert.match(text.records[0].text,/redundancy/);
  const backup=await extract("cncaS2-notes-backup.json",Buffer.from(JSON.stringify({format:"cncaS2-notes-v1",userNotes:[{name:"test",records:[]}]})));
  assert.equal(backup.restore[0].name,"test");
});

test("parses text from zipped PowerPoint slides",async()=>{
  const zip=zipXml({
    "ppt/slides/slide2.xml":"<p:sld><a:t>Entity relationship diagrams</a:t><a:t>show data relationships.</a:t></p:sld>",
    "ppt/slides/slide1.xml":"<p:sld><a:t>Normalization removes redundant records.</a:t></p:sld>"
  });
  const progress=[];
  const index=await extract("slides.pptx",zip,value=>progress.push(value));
  assert.equal(index.records.length,2);
  assert.match(index.records[0].text,/Normalization/);
  assert.equal(progress.at(-1),1);
});

test("extracts Word paragraph text and Excel shared strings",async()=>{
  const doc=zipXml({"word/document.xml":"<w:document><w:p><w:t>Relational databases have primary keys.</w:t></w:p><w:p><w:t>Indexes improve lookup speed.</w:t></w:p></w:document>"});
  const word=await extract("lecture.docx",doc);
  assert.match(word.records[0].text,/primary keys/);
  assert.match(word.records[0].text,/Indexes/);

  const sheet=zipXml({
    "xl/sharedStrings.xml":"<sst><si><t>Database marks</t></si></sst>",
    "xl/worksheets/sheet1.xml":"<worksheet><row><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\"><v>35</v></c></row></worksheet>"
  });
  const workbook=await extract("marks.xlsx",sheet);
  assert.match(workbook.records[0].text,/Database marks \| 35/);
});

test("rejects malformed Office archives instead of inventing notes",async()=>{
  await assert.rejects(extract("slides.pptx",Buffer.from("not a zip")),/ZIP document/);
  await assert.rejects(extract("unsupported.rtf",Buffer.from("RTF")),/Supported/);
});

test("handles PDF text extraction through the bundled reader interface",async()=>{
  context.extractPdfRecords=async(title,_bytes,progress)=>{
    progress(1);
    return [{title,section:"page 1",text:"Normalisation reduces duplicate data in relational tables."}];
  };
  const result=await extract("lecture.pdf",Buffer.from("PDF data"));
  assert.equal(result.records[0].section,"page 1");
  assert.match(result.records[0].text,/relational tables/);
  delete context.extractPdfRecords;
});

test("opens a ZIP containing PowerPoint and text documents and reports unsupported files",async()=>{
  const presentation=zipXml({
    "ppt/slides/slide1.xml":"<p:sld><a:t>Database normalisation reduces redundant data and update anomalies.</a:t></p:sld>"
  });
  const archive=zipXml({
    "Course/Lecture.pptx":presentation,
    "Course/Revision.txt":"Primary keys uniquely identify individual database records.",
    "Course/Scanned.pdf":"%PDF-1.7 fake scan"
  });
  const progress=[];
  const result=await extract("Study-pack.zip",archive,value=>progress.push(value));
  assert.equal(result.processedFiles,2);
  assert.match(result.records.map(r=>r.text).join(" "),/normalisation.*Primary keys/);
  assert.match(result.records[0].title,/Study-pack\.zip\/Course\/Lecture\.pptx/);
  assert.match(result.warnings.join(" "),/Scanned\.pdf/);
  assert.equal(progress.at(-1),1);
});

test("handles nested ZIPs and refuses archives with no readable documents",async()=>{
  const inner=zipXml({"summary.md":"Referential integrity keeps foreign key references valid."});
  const outer=zipXml({"module.zip":inner});
  const result=await extract("notes.zip",outer);
  assert.match(result.records[0].text,/foreign key/);
  await assert.rejects(extract("scans.zip",zipXml({"only.pdf":"%PDF"})),/No readable text found/i);
});
