const stripMarks=s=>String(s??"").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g,"");
export function normalizeArabic(s){return stripMarks(s).replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ؤ/g,"و").replace(/ئ/g,"ي").replace(/ـ/g,"").toLowerCase();}
export function tokenizeArabic(s){return normalizeArabic(s).match(/[\p{L}\p{N}]+/gu)||[];}
export class ScholarlyIndex{
 constructor({k1=1.2,b=.75,stopWords=[]}={}){this.k1=k1;this.b=b;this.stop=new Set(stopWords.map(normalizeArabic));this.docs=[];this.postings=new Map();this.avgLength=0;}
 add(records){for(const r of records){if(!r.id||!r.work?.id||!r.content)throw new TypeError("Indexed passages require chunk ID, work ID, and content");const terms=tokenizeArabic(r.content).filter(t=>!this.stop.has(t));const tf=new Map();for(const t of terms)tf.set(t,(tf.get(t)||0)+1);const doc={id:r.id,work:r.work,locator:r.locator||{},content:r.content,length:terms.length,tf};this.docs.push(doc);for(const [term,count]of tf){if(!this.postings.has(term))this.postings.set(term,[]);this.postings.get(term).push({docIndex:this.docs.length-1,count});}}
 this.avgLength=this.docs.length?this.docs.reduce((n,d)=>n+d.length,0)/this.docs.length:0;return this;}
 search(query,{limit=8,minScore=0}={}){const terms=[...new Set(tokenizeArabic(query).filter(t=>!this.stop.has(t)))];if(!terms.length||!this.docs.length)return [];const N=this.docs.length,results=[];
 for(let i=0;i<this.docs.length;i++){const d=this.docs[i];let score=0;for(const term of terms){const list=this.postings.get(term)||[],entry=list.find(x=>x.docIndex===i);if(!entry)continue;const df=list.length,idf=Math.log(1+(N-df+.5)/(df+.5));const norm=entry.count*(this.k1+1)/(entry.count+this.k1*(1-this.b+this.b*d.length/(this.avgLength||1)));score+=idf*norm;}if(score>minScore)results.push({chunkId:d.id,work:d.work,locator:d.locator,excerpt:d.content.slice(0,700),score:Number(score.toFixed(6)),matchedTerms:terms.filter(t=>d.tf.has(t))});}
 return results.sort((a,b)=>b.score-a.score).slice(0,limit);}
 stats(){return {documents:this.docs.length,terms:this.postings.size,averageDocumentLength:Number(this.avgLength.toFixed(2))};}
}
