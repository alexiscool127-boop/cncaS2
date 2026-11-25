import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

function resultLink(href,title,snippet){
  const group={querySelector:()=>snippet?{textContent:snippet}:null,querySelectorAll:()=>[heading]};
  const link={getAttribute:()=>href,querySelector:()=>null,parentElement:group};
  const heading={textContent:title,closest:()=>link};
  return heading;
}

test("parses snippets from fetched search HTML without creating tabs",()=>{
  const headings=[
    resultLink("https://www.google.com/search?q=foo","Google result","Ignore this"),
    resultLink("https://example.org/guide","Database guide","An authoritative database guide."),
    resultLink("/url?q=https%3A%2F%2Fdocs.example.com%2Fmanual","Manual","A useful technical manual."),
    resultLink("https://example.org/guide","Database guide","Duplicate guide."),
    resultLink("javascript:alert(1)","Unsafe link","Ignore this"),
    resultLink("https://empty.example.com/","No snippet","")
  ];
  const fakeDOMParser=class{
    parseFromString(html,type){
      assert.equal(html,"<html>Google results</html>");
      assert.equal(type,"text/html");
      return {querySelectorAll:selector=>{
        assert.equal(selector,"#search a h3, #rso a h3");
        return headings;
      }};
    }
  };
  const ctx={DOMParser:fakeDOMParser,URL};
  runInNewContext(readFileSync("extension/search-results.js","utf8"),ctx);
  const found=runInNewContext('parseGoogleSearchResults("<html>Google results</html>")',ctx);
  assert.deepEqual(Array.from(found,x=>({host:x.host,title:x.title,snippet:x.snippet})),[
    {host:"example.org",title:"Database guide",snippet:"An authoritative database guide."},
    {host:"docs.example.com",title:"Manual",snippet:"A useful technical manual."}
  ]);
});

test("parses direct and redirected DuckDuckGo result links",()=>{
  function row(href,title,snippet){
    return {querySelector:selector=>selector==="a.result__a"
      ? {getAttribute:()=>href,textContent:title}
      : selector===".result__snippet" && snippet?{textContent:snippet}:null};
  }
  const ctx={DOMParser:class{
    parseFromString(_html,type){
      assert.equal(type,"text/html");
      return {querySelectorAll:selector=>{
        assert.equal(selector,".result");
        return [
          row("//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.net%2Fhowto","Reference guide","A useful source."),
          row("https://docs.example.org/standard","Technical standard","A reference standard."),
          row("https://duckduckgo.com/about","Internal page","Ignore this")
        ];
      }};
    }
  },URL};
  runInNewContext(readFileSync("extension/search-results.js","utf8"),ctx);
  const found=runInNewContext('parseDuckDuckGoSearchResults("<html></html>")',ctx);
  assert.deepEqual(Array.from(found,x=>({host:x.host,title:x.title,snippet:x.snippet})),[
    {host:"example.net",title:"Reference guide",snippet:"A useful source."},
    {host:"docs.example.org",title:"Technical standard",snippet:"A reference standard."}
  ]);
});
