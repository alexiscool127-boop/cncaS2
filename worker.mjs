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
        ? "First solve the question in one short sentence. Check any arithmetic. Then select the options consistent with that solution. Include the sentence in explanation. Return a JSON object with a positions array of 1-based option positions. Use an empty array only when the question cannot be answered. Respect select-all. Count positions from the supplied order, ignoring any printed option labels."
        : "Answer briefly. For choices, quote the selected text and briefly explain.";
      const options = mark ? choices.map((text,i)=>({position:i+1,text})) : choices;
      const result=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{
        ...(mark ? {response_format:{type:"json_schema",json_schema:{type:"object",properties:{explanation:{type:"string"},positions:{type:"array",items:{type:"integer",enum:choices.map((_,i)=>i+1)},maxItems:multiple?choices.length:1}},required:["explanation","positions"]}}} : {}),
        messages:[{role:"system",content:instruction},{role:"user",content:JSON.stringify({stem,choices:options,multiple})}],max_tokens:250
      });
      if(mark){
        let positions,explanation;
        for(const raw of [result?.response,result?.choices?.[0]?.message?.content]){
          let candidate=raw;
          if(typeof raw==="string"){
            try{candidate=JSON.parse(raw);}catch{continue;}
          }
          if(Array.isArray(candidate?.positions)){positions=candidate.positions;explanation=typeof candidate.explanation==="string"?candidate.explanation:"";break;}
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
