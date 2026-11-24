// Summaries of published standards used when a question matches their subject.
const studyReferences = [
  [/\b(?:bytes?|octets?)\b/i, "RFC 4949", "https://www.rfc-editor.org/rfc/rfc4949", "An octet has eight bits. In modern systems a byte conventionally has eight bits; historical architectures differed."],
  [/\b(?:unicode|utf[- ]?(?:8|16|32))\b/i, "Unicode Consortium encoding FAQ", "https://www.unicode.org/faq/utf_bom.html", "Unicode has multiple encoding forms. A scalar value occupies one to four bytes in UTF-8, one or two 16-bit code units in UTF-16, or one 32-bit code unit in UTF-32. A question asking for a fixed character width without naming an encoding is ambiguous."],
  [/\bjson\b/i, "RFC 8259", "https://www.rfc-editor.org/rfc/rfc8259", "JSON values can be objects, arrays, numbers, strings, true, false or null. Strings use double quotes. Leading zeros on integers, NaN and trailing array commas are outside the grammar."],
  [/\b(?:rfc\s*1918|private\s+(?:ipv4|ip|address|network))\b/i, "RFC 1918", "https://www.rfc-editor.org/rfc/rfc1918", "Private IPv4 space comprises 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16."]
];

function referencesFor(stem){
  return studyReferences.filter(([pattern])=>pattern.test(stem)).map(([,title,url,snippet])=>({title,url,snippet}));
}

function byteCalculation(stem){
  const match=/^\s*how many bits (?:are (?:there )?in|in) (\d{1,12}) (?:bytes?|octets?)\s*\?(?:\s*(?:return|give|enter) (?:only (?:the )?(?:integer|number)|(?:the )?(?:integer|number) only)\.?)?\s*$/i.exec(stem);
  if(!match)return null;
  const count=Number(match[1]);
  return {answer:String(count*8),explanation:count+" × 8 = "+count*8+" bits."};
}
