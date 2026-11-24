import assert from "node:assert/strict";
import {test} from "node:test";
import {calculationFacts} from "./calculations.mjs";

test("CIDR bounds exclude an adjacent destination",()=>{
  const [facts]=calculationFacts("Route 10.18.32.0/19, target 10.18.65.9",[]);
  assert.equal(facts.lastAddress,"10.18.63.255");
  assert.deepEqual(facts.contains,["10.18.32.0"]);
});
test("IPv4 arithmetic supports both ends of the address space",()=>{
  const [all,host]=calculationFacts("0.0.0.0/0 and 255.255.255.255/32",[]);
  assert.equal(all.size,2**32);
  assert.equal(host.lastAddress,"255.255.255.255");
  assert.equal(host.usable,undefined);
  assert.deepEqual(calculationFacts("999.2.3.4/12",[]),[]);
});
test("binary calculations preserve width and signed interpretation",()=>{
  assert.equal(calculationFacts("1001 XOR 1101",[])[0].binary,"0100");
  assert.equal(calculationFacts("11101100",[])[0].signedTwosComplement,"-20");
});
test("address classifications and binary units",()=>{
  assert.deepEqual(calculationFacts("RFC 1918",["169.254.0.1","172.16.1.1"]).map(f=>f.rfc1918),[false,true]);
  assert.deepEqual(calculationFacts("4 KiB",[])[0],{quantity:"4 KiB",bytes:4096,bits:32768});
});
