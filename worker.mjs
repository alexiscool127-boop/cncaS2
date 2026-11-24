import {calculationFacts} from "./calculations.mjs";
function needsNumericAnswer(stem, choices) {
  if (choices.length || /\b(?:explain|describe|justify)\b/i.test(stem)) return false;
  return /\b(?:how many|how much|calculate|compute|convert|decimal value|binary string|broadcast address|subnet mask)\b/i.test(stem)
    || /\b(?:return|give|enter|write|express|represent|encode|decode)\b[^.!?\n]{0,80}\b(?:number|integer|digits?|bits?|binary|decimal|hexadecimal|address)\b/i.test(stem);
}

export default {
  async fetch(request, env) {
    const fail = (status, error) => Response.json({error}, {status});
    const path=new URL(request.url).pathname;
    const isPublic=path.startsWith("/public/");
    const route=isPublic ? path.slice(7) : path;
    if (request.method !== "POST" || !["/answer","/diagram"].includes(route)) return fail(404,"Unknown route.");
    if (!isPublic && (!env.BETA_INVITE || request.headers.get("Authorization") !== "Bearer " + env.BETA_INVITE)) return fail(401,"Check your beta invite in QuizPilot.");
    if (!(await env.LIMIT.limit({key:"beta"})).success) return fail(429,"cncaS2 is busy. Try again in a minute.");
    let question;
    try {
      const reader=request.body.getReader(), parts=[];
      let size=0;
      for (;;) {
        const {done,value}=await reader.read();
        if(done) break;
        size+=value.byteLength;
        if(size>(route==="/diagram"?512000:8192)){await reader.cancel();return fail(413,"Question is too long.");}
        parts.push(value);
      }
      question=JSON.parse(await new Blob(parts).text());
    } catch {return fail(400,"Could not read the question.");}
    const {stem,choices,multiple}=question || {};
    if(typeof stem!=="string" || !stem.trim() || !Array.isArray(choices) || choices.length>64 || !choices.every(c=>typeof c==="string" && c.trim()) || typeof multiple!=="boolean")return fail(400,"Unsupported question.");
    try {
      if(route==="/diagram"){
        if(typeof question.image!=="string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(question.image))return fail(400,"Invalid diagram.");
        const result=await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct",{
          messages:[{role:"user",content:[
            {type:"text",text:"Use the diagram to answer briefly. Quote the selected option when applicable. "+JSON.stringify({stem,choices,multiple})},
            {type:"image_url",image_url:{url:question.image}}
          ]}],max_tokens:250
        });
        const answer=result?.choices?.[0]?.message?.content ?? result?.response;
        if(typeof answer!=="string" || !answer.trim())return fail(502,"No diagram answer returned.");
        return Response.json({answer:answer.trim()},{headers:{"Cache-Control":"no-store"}});
      }
      const mark = question.mark === true && choices.length > 0;
      const instruction = mark
        ? "Solve the question, using the computed operand facts when relevant. For sequences simulate events in order. Check exceptions and units. Give one short explanation, then copy the exact text of each correct option into selected. For a single-choice question select exactly one. Return an empty selection only if essential information is missing."
        : "Use the computed operand facts where relevant. Follow the requested answer format, including leading zeros. Answer briefly.";
      const facts=calculationFacts(stem,choices);
      const model = needsNumericAnswer(stem, choices) ? "@cf/openai/gpt-oss-120b" : "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
      const result=await env.AI.run(model,{
        ...(mark ? {response_format:{type:"json_schema",json_schema:{type:"object",properties:{explanation:{type:"string"},selected:{type:"array",items:{type:"string",enum:[...new Set(choices)]},maxItems:multiple?choices.length:1}},required:["explanation","selected"]}}} : {}),
        messages:[{role:"system",content:instruction},{role:"user",content:JSON.stringify({stem,choices,multiple,facts})}],max_tokens:250
      });
      if(mark){
        let positions,explanation;
        for(const raw of [result?.response,result?.choices?.[0]?.message?.content]){
          let candidate=raw;
          if(typeof raw==="string"){
            try{candidate=JSON.parse(raw);}catch{continue;}
          }
          if(Array.isArray(candidate?.selected)){positions=candidate.selected.map(text=>choices.indexOf(text)===choices.lastIndexOf(text)?choices.indexOf(text)+1:0);explanation=typeof candidate.explanation==="string"?candidate.explanation:"";break;}
        }
        if(!positions || positions.some(i=>!Number.isInteger(i)||i<1||i>choices.length) || (!multiple && positions.length>1))return fail(502,"The model returned an invalid selection.");
        if(!positions.length)return fail(422,"The model could not identify an answer from these choices.");
        return Response.json({positions:[...new Set(positions)],explanation},{headers:{"Cache-Control":"no-store"}});
      }
      const raw=result?.choices?.[0]?.message?.content ?? result?.response;
      const answer=typeof raw==="string" || typeof raw==="number" ? String(raw).trim() : "";
      if(!answer)return fail(502,"No answer returned.");
      return Response.json({answer},{headers:{"Cache-Control":"no-store"}});
    }catch{return fail(503,"Model unavailable or daily allowance reached.");}
  }
};
