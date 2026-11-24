// Compute properties of literal operands. The model still interprets the question.
function ipNumber(text) {
  const octets = text.split(".").map(Number);
  return octets.some(x => x > 255) ? null : octets.reduce((n, octet) => n * 256 + octet, 0);
}

function address(n) {
  return [24,16,8,0].map(shift => (n >>> shift) & 255).join(".");
}

export function calculationFacts(stem, choices) {
  const facts = [];
  const text = [stem,...choices].join("\n");
  const ips = [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])];
  for(const match of stem.matchAll(/\b((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})\b/g)){
    const value=ipNumber(match[1]), prefix=Number(match[2]);
    if(value===null || prefix>32)continue;
    const size=2**(32-prefix), first=Math.floor(value/size)*size, last=first+size-1;
    const contained=ips.filter(ip=>ipNumber(ip)!==null && ipNumber(ip)>=first && ipNumber(ip)<=last);
    facts.push({cidr:match[0],network:address(first),lastAddress:address(last),size,contains:contained,
      ...(prefix<=30?{broadcast:address(last),firstHost:address(first+1),lastHost:address(last-1),usable:size-2}:{})});
  }
  if(/RFC\s*1918|private\s+IPv4/i.test(stem)){
    for(const ip of ips){
      if(ipNumber(ip)===null)continue;
      const [a,b]=ip.split(".").map(Number);
      facts.push({ip,rfc1918:a===10 || (a===172 && b>=16 && b<=31) || (a===192 && b===168)});
    }
  }
  for(const m of stem.matchAll(/\b([01]{2,64})\s+(XOR|AND|OR)\s+([01]{2,64})\b/gi)){
    const a=BigInt("0b"+m[1]), b=BigInt("0b"+m[3]), op=m[2].toUpperCase();
    const value=op==="XOR"?a^b:op==="AND"?a&b:a|b;
    facts.push({expression:m[0],binary:value.toString(2).padStart(Math.max(m[1].length,m[3].length),"0")});
  }
  for(const bits of new Set(text.match(/\b[01]{4,64}\b/g)||[])){
    const unsigned=BigInt("0b"+bits);
    facts.push({bits,unsigned:unsigned.toString(),signedTwosComplement:BigInt.asIntN(bits.length,unsigned).toString(),setBits:bits.replaceAll("0","").length});
  }
  for(const m of stem.matchAll(/\b(\d{1,8})\s*KiB\b/gi))facts.push({quantity:m[0],bytes:Number(m[1])*1024,bits:Number(m[1])*8192});
  return facts;
}
