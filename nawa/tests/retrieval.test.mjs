import test from "node:test";
import assert from "node:assert/strict";
import {ScholarlyIndex,normalizeArabic,tokenizeArabic} from "../retrieval.mjs";
test("Arabic normalization removes tashkeel and unifies common alef forms",()=>{assert.equal(normalizeArabic("إِنَّ الأُصُولَ"),"ان الاصول");});
test("tokenizer preserves Arabic terms",()=>{assert.deepEqual(tokenizeArabic("كتاب الحديث ١٢"),["كتاب","الحديث","١٢"]);});
test("retrieval ranks matching source passages and preserves citations",()=>{const idx=new ScholarlyIndex();idx.add([{id:"a",work:{id:"w1",title:"كتاب أ",author:"مؤلف"},locator:{pageStart:12},content:"العام والخاص من مباحث أصول الفقه ودلالات الألفاظ."},{id:"b",work:{id:"w2",title:"كتاب ب",author:"مؤلف آخر"},locator:{pageStart:90},content:"أحكام الطهارة وأبواب المياه."}]);const hits=idx.search("العام والخاص أصول الفقه");assert.equal(hits[0].chunkId,"a");assert.equal(hits[0].locator.pageStart,12);assert.equal(hits[0].work.title,"كتاب أ");});
test("empty queries and empty indexes return no invented evidence",()=>{assert.deepEqual(new ScholarlyIndex().search("أي شيء"),[]);});
