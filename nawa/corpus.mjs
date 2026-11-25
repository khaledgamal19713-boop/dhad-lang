import { createHash } from "node:crypto";
import fs from "node:fs";
const sha = value => createHash("sha256").update(String(value)).digest("hex");
const clean = s => String(s ?? "").replace(/\r\n?/g,"\n").normalize("NFC");
const required = (o,k) => typeof o?.[k] === "string" && o[k].trim().length > 0;\nconst RIGHTS = new Set(["public-domain","licensed","permission-required","unknown"]);

export function chunkText(text,{maxChars=2400,overlap=240}={}) {
 const source=clean(text).trim(); if(!source)return [];
 if(!Number.isInteger(maxChars)||maxChars<200||!Number.isInteger(overlap)||overlap<0||overlap>=maxChars)throw new RangeError("Invalid chunk configuration");
 const paras=source.split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean),chunks=[];let buffer="";
 const push=()=>{if(buffer.trim())chunks.push(buffer.trim());buffer="";};
 for(const para of paras){
  if(para.length>maxChars){push();let start=0;while(start<para.length){let end=Math.min(start+maxChars,para.length);if(end<para.length){const boundary=para.lastIndexOf(" ",end);if(boundary>start+Math.floor(maxChars*.6))end=boundary;}chunks.push(para.slice(start,end).trim());if(end>=para.length)break;start=Math.max(start+1,end-overlap);}continue;}
  if(buffer&&buffer.length+para.length+2>maxChars){const previous=buffer;push();buffer=(overlap?previous.slice(-overlap)+"\n\n":"")+para;}else buffer+=(buffer?"\n\n":"")+para;
 }push();return chunks;
}
export function ingestText({text,work,locator={},extraction={},chunk={}}){
 if(!required(work,"id")||!required(work,"title")||!required(work,"author"))throw new TypeError("Bibliographic identity requires work.id, work.title, and work.author");
 if(!required(work,"licenseStatus"))throw new TypeError("work.licenseStatus is required");
 const body=clean(text);if(!body.trim())throw new TypeError("Source text is empty");
 return chunkText(body,chunk).map((content,index)=>({id:sha(work.id+"\0"+index+"\0"+content).slice(0,24),
 work:{id:work.id,title:work.title,author:work.author,editor:work.editor??null,edition:work.edition??null,publisher:work.publisher??null,publicationYear:work.publicationYear??null,licenseStatus:work.licenseStatus,licenseEvidence:work.licenseEvidence??null},
 locator:{volume:locator.volume??null,pageStart:locator.pageStart??null,pageEnd:locator.pageEnd??null,section:locator.section??null,sourceFile:locator.sourceFile??null},
 extraction:{method:extraction.method??"text",ocrConfidence:extraction.ocrConfidence??null,reviewed:extraction.reviewed===true},
 content,contentHash:sha(content),sequence:index}));
}
export function validateCorpus(records,{minChars=80,minOcrConfidence=.85}={}){
 const errors=[],warnings=[],seenIds=new Set(),seenContent=new Map(),workIds=new Set();
 records.forEach((r,i)=>{const at="record["+i+"]";
 for(const k of ["id","content","contentHash"])if(!required(r,k))errors.push({at,code:"missing_"+k});
 if(!r.work||!required(r.work.id)||!required(r.work.title)||!required(r.work.author))errors.push({at,code:"missing_bibliography"});
 if(!required(r.work?.licenseStatus))errors.push({at,code:"missing_license_status"});
 if(["unknown","permission-required"].includes(r.work?.licenseStatus))warnings.push({at,code:"rights_review_required",workId:r.work.id});
 if(typeof r.content==="string"&&r.content.trim().length<minChars)warnings.push({at,code:"short_chunk",chars:r.content.trim().length});
 if(r.extraction?.method==="ocr"&&(typeof r.extraction.ocrConfidence!=="number"||r.extraction.ocrConfidence<minOcrConfidence)&&!r.extraction.reviewed)errors.push({at,code:"ocr_below_threshold_without_human_review"});
 if(r.id&&seenIds.has(r.id))errors.push({at,code:"duplicate_id"});else if(r.id)seenIds.add(r.id);
 if(r.content){const h=sha(clean(r.content));if(seenContent.has(h))warnings.push({at,code:"duplicate_content",duplicateOf:seenContent.get(h)});else seenContent.set(h,i);}
 if(r.work?.id)workIds.add(r.work.id);
 });
 const rightsCleared=records.every(r=>["public-domain","licensed"].includes(r.work?.licenseStatus)&&required(r.work,"licenseEvidence"));\n return {passed:errors.length===0,trainingEligible:errors.length===0&&rightsCleared,rightsCleared,records:records.length,works:workIds.size,errors,warnings};
}
export function splitByWork(records,{train=.8,validation=.1,test=.1,seed="nawa-v1"}={}){
 if(Math.abs(train+validation+test-1)>1e-9||[train,validation,test].some(x=>x<0))throw new RangeError("Split ratios must sum to 1");
 const buckets={train:[],validation:[],test:[]};
 for(const record of records){const n=parseInt(sha(seed+"\0"+record.work.id).slice(0,8),16)/0xffffffff;const key=n<train?"train":n<train+validation?"validation":"test";buckets[key].push(record);}
 return buckets;
}
export function validateTrainingExamples(rows,corpusIds){
 const errors=[],seen=new Set();
 rows.forEach((r,i)=>{const at="example["+i+"]";
 for(const k of ["id","task","domain","prompt","target","answerType"])if(!required(r,k))errors.push({at,code:"missing_"+k});
 if(!Array.isArray(r.evidenceRefs)||!r.evidenceRefs.length)errors.push({at,code:"missing_evidence_refs"});else for(const id of r.evidenceRefs)if(!corpusIds.has(id))errors.push({at,code:"unknown_evidence_ref",id});
 if(!Array.isArray(r.sourceWorkIds)||!r.sourceWorkIds.length)errors.push({at,code:"missing_source_work_ids"});
 if(!["adjudicated","expert-reviewed"].includes(r.reviewStatus))errors.push({at,code:"not_reviewed"});
 if(seen.has(r.id))errors.push({at,code:"duplicate_example_id"});else if(r.id)seen.add(r.id);
 if(r.domain==="fiqh"&&!required(r,"madhhabScope"))errors.push({at,code:"fiqh_requires_madhhab_scope"});
 if(r.domain==="hadith"&&!required(r,"hadithMethodScope"))errors.push({at,code:"hadith_requires_method_scope"});
 });
 return {passed:errors.length===0,examples:rows.length,errors};
}
export function readJsonl(file){return fs.readFileSync(file,"utf8").split(/\r?\n/).filter(x=>x.trim()).map((line,i)=>{try{return JSON.parse(line);}catch(e){throw new Error("Invalid JSONL line "+(i+1)+": "+e.message);}});}
