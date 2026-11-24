import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const sampleNotes=[
  {title:"Normalisation",section:"slide 2",text:"Database normalisation reduces redundancy and prevents insertion, deletion and update anomalies."},
  {title:"Lifecycle",section:"slide 4",text:"Feasibility studies estimate staff, time, materials and return on investment."}
];

function makeNotesContext(records){
  const context=createContext({QUIZPILOT_STUDY_NOTES:records});
  runInContext(readFileSync("extension/notes-lookup.js","utf8"),context);
  return context;
}

test("notes lookup cites relevant source and ignores an unrelated question",()=>{
  const ctx=makeNotesContext(sampleNotes);
  const found=runInContext('lookupStudyNotes("Why does database normalisation prevent anomalies?")',ctx);
  assert.match(found.title,/Normalisation.*slide 2/);
  assert.match(found.snippet,/redundancy/i);
  assert.equal(runInContext('lookupStudyNotes("What is the speed of light?")',ctx),null);
});

test("notes are optional and do not become a primary answer source",()=>{
  const ctx=makeNotesContext(undefined);
  assert.equal(runInContext('lookupStudyNotes("database normalisation")',ctx),null);
});

test("a freshly imported note can be used alongside bundled notes",()=>{
  const ctx=makeNotesContext(sampleNotes);
  const imported=[{title:"My custom notes",section:"document",text:"Referential integrity ensures that foreign key values match referenced primary key records."}];
  ctx.imported=imported;
  const found=runInContext('lookupStudyNotes("Why does referential integrity constrain foreign key values?", imported)',ctx);
  assert.match(found.title,/My custom notes/);
  assert.match(found.snippet,/foreign key values/);
});

test("Google and standards references precede relevant course notes",async()=>{
  const context=makeNotesContext(sampleNotes);
  let captured;
  const listeners=[];
  const addListener=()=>{};
  context.browser={
    runtime:{id:"test-extension",getURL:()=>"moz-extension://test/panel.html",
      onConnect:{addListener},onMessage:{addListener:fn=>listeners.push(fn)}},
    tabs:{onRemoved:{addListener},onUpdated:{addListener},
      create:async()=>({id:42}),executeScript:async()=>[[{host:"example.org",title:"External database guide",snippet:"Verified external definition."}]],
      get:async()=>({active:false}),remove:async()=>{}},
    commands:{onCommand:{addListener}}
  };
  Object.assign(context,{
    fetch:async(_url,options)=>{captured=JSON.parse(options.body);return Response.json({text:"Corroborated explanation."});},
    referencesFor:()=>[{title:"Official standards",url:"https://example.edu/standard",snippet:"Independent reference."}],
    byteCalculation:()=>null,QUIZPILOT_ORIGIN:"https://test.example",AbortSignal,URL,Response,
    setTimeout:(cb)=>cb()
  });
  runInContext(readFileSync("extension/background.js","utf8"),context);
  const explain=listeners.map(fn=>fn({kind:"quizpilot-explain",stem:"Why does database normalisation prevent anomalies?",answer:"Reduces redundancy"},{tab:{id:1},id:"test-extension"})).find(Boolean);
  const result=await explain;
  assert.equal(captured.sources.length,3);
  assert.match(captured.sources[0],/Official standards/);
  assert.match(captured.sources[1],/example\.org/);
  assert.match(captured.sources[2],/Course notes \(secondary cross-check\)/);
  assert.match(result.text,/Corroborated explanation/);
});

test("search and notes are gathered before the first AI answer request",async()=>{
  const context=makeNotesContext(sampleNotes);
  const events=[];
  const listeners=[];
  const addListener=()=>{};
  let submitted;
  context.browser={
    runtime:{id:"test-extension",getURL:()=>"moz-extension://test/panel.html",
      onConnect:{addListener},onMessage:{addListener:fn=>listeners.push(fn)}},
    tabs:{onRemoved:{addListener},onUpdated:{addListener},
      create:async()=>{events.push("google-search");return {id:42};},
      executeScript:async()=>[[{host:"example.org",title:"External database guide",snippet:"Normalization prevents redundant records."}]],
      get:async()=>({active:false}),remove:async()=>{}},
    commands:{onCommand:{addListener}}
  };
  Object.assign(context,{
    fetch:async(_url,options)=>{
      events.push("ai-answer");submitted=JSON.parse(options.body);
      return Response.json({positions:[1],explanation:"Normalization reduces duplicate data."});
    },
    referencesFor:()=>[{title:"Official standards",url:"https://example.edu/standard",snippet:"Independent database reference."}],
    byteCalculation:()=>null,QUIZPILOT_ORIGIN:"https://test.example",AbortSignal,URL,Response,
    setTimeout:cb=>cb()
  });
  runInContext(readFileSync("extension/background.js","utf8"),context);
  const send=listeners.map(fn=>fn({kind:"quizpilot-answer",stem:"Why does database normalisation prevent anomalies?",
    choices:["Reduces duplication","Creates more copies"],multiple:false},{tab:{id:1},id:"test-extension"})).find(Boolean);
  const result=await send;
  assert.deepEqual(events,["google-search","ai-answer"]);
  assert.match(submitted.stem,/Official standards/);
  assert.match(submitted.stem,/example\.org/);
  assert.match(submitted.stem,/Course notes \(secondary cross-check\)/);
  assert.ok(submitted.stem.indexOf("Official standards")<submitted.stem.indexOf("Course notes"));
  assert.deepEqual(result.positions,[1]);
});

test("new local notes reach the answer model and invalidate an older cached answer",async()=>{
  const context=makeNotesContext([]);
  const listeners=[];const changes=[];const addListener=()=>{};
  const makeFile=(name,text)=>[{name,records:[{title:name,section:"document",text}]}];
  const note1=makeFile("first.txt","Referential integrity ensures foreign key values reference existing primary key records.");
  const note2=makeFile("updated.txt","Referential integrity constrains foreign key references to valid primary key records.");
  let requests=0;const stems=[];
  context.browser={
    runtime:{id:"test-extension",getURL:()=>"moz-extension://test/panel.html",
      onConnect:{addListener},onMessage:{addListener:fn=>listeners.push(fn)}},
    tabs:{onRemoved:{addListener},onUpdated:{addListener},create:async()=>{throw Error("Google offline");}},
    commands:{onCommand:{addListener}},
    storage:{local:{get:async()=>({userNotes:note1})},onChanged:{addListener:fn=>changes.push(fn)}}
  };
  Object.assign(context,{
    fetch:async(_url,options)=>{requests++;stems.push(JSON.parse(options.body).stem);return Response.json({positions:[1]});},
    referencesFor:()=>[],byteCalculation:()=>null,QUIZPILOT_ORIGIN:"https://test.example",AbortSignal,URL,Response,setTimeout
  });
  runInContext(readFileSync("extension/background.js","utf8"),context);
  const message={kind:"quizpilot-answer",stem:"Why does referential integrity constrain foreign key values?",choices:["They must reference valid primary keys","They must be random"],multiple:false};
  const send=()=>listeners.map(fn=>fn(message,{tab:{id:1},id:"test-extension"})).find(Boolean);
  await send();await send();
  assert.equal(requests,1);
  assert.match(stems[0],/first\.txt/);
  changes[0]({userNotes:{newValue:note2}},"local");
  await send();
  assert.equal(requests,2);
  assert.match(stems[1],/updated\.txt/);
});
