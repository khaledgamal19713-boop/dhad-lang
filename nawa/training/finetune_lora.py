#!/usr/bin/env python3
"""Expert-reviewed Arabic scholarly SFT with LoRA. Requires GPU-capable runtime and approved corpus."""
import argparse, hashlib, json, math, os, sys
from pathlib import Path

def read_jsonl(path):
    rows=[]
    with open(path,encoding="utf-8") as f:
        for line_no,line in enumerate(f,1):
            if line.strip():
                try: rows.append(json.loads(line))
                except json.JSONDecodeError as exc: raise ValueError(f"Invalid JSONL line {line_no}: {exc}") from exc
    return rows

def stable_bucket(value,seed):
    h=hashlib.sha256((seed+"\0"+value).encode()).hexdigest()
    return int(h[:8],16)/0xffffffff

def split_examples_by_source_works(examples,seed="nawa-sft-v1"):
    """Connected components prevent any shared source work crossing dataset splits."""
    parent={}
    def find(x):
        parent.setdefault(x,x)
        if parent[x]!=x: parent[x]=find(parent[x])
        return parent[x]
    def union(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: parent[rb]=ra
    for row in examples:
        works=row.get("sourceWorkIds") or []
        for w in works: find(w)
        for w in works[1:]: union(works[0],w)
    groups={}
    for row in examples:
        works=row.get("sourceWorkIds") or []
        if not works: raise ValueError("Every training example must cite at least one source work")
        groups.setdefault(find(works[0]),[]).append(row)
    out={"train":[],"validation":[],"test":[]}
    for root,rows in groups.items():
        value=stable_bucket(root,seed)
        key="train" if value<.8 else "validation" if value<.9 else "test"
        out[key].extend(rows)
    return out

def validate_inputs(corpus,examples):
    by_id={x.get("id"):x for x in corpus if x.get("id")}
    if not corpus: raise ValueError("Corpus is empty: book text must be ingested before training")
    if not examples: raise ValueError("No adjudicated training examples supplied")
    for row in corpus:
        work=row.get("work") or {}
        if work.get("licenseStatus") not in ("public-domain","licensed") or not work.get("licenseEvidence"):
            raise ValueError(f"Training blocked by unresolved rights for work: {work.get('id')}")
        if row.get("extraction",{}).get("method")=="ocr":
            conf=row["extraction"].get("ocrConfidence")
            if (not isinstance(conf,(int,float)) or conf<.85) and not row["extraction"].get("reviewed"):
                raise ValueError(f"Unreviewed low-confidence OCR chunk: {row.get('id')}")
    for row in examples:
        for key in ("id","task","domain","prompt","target","answerType"):
            if not str(row.get(key,"")).strip(): raise ValueError(f"Training example missing {key}: {row.get('id')}")
        if row.get("reviewStatus") not in ("adjudicated","expert-reviewed"):
            raise ValueError(f"Non-expert-reviewed target blocked: {row.get('id')}")
        if not row.get("evidenceRefs") or not row.get("sourceWorkIds"):
            raise ValueError(f"Training example lacks provenance: {row.get('id')}")
        for ref in row["evidenceRefs"]:
            if ref not in by_id: raise ValueError(f"Unknown evidence chunk {ref} in {row.get('id')}")
        if row["domain"]=="fiqh" and not row.get("madhhabScope"):
            raise ValueError(f"Fiqh example lacks madhhabScope: {row.get('id')}")
        if row["domain"]=="hadith" and not row.get("hadithMethodScope"):
            raise ValueError(f"Hadith example lacks hadithMethodScope: {row.get('id')}")
    return by_id

def format_example(row,by_id):
    passages=[]
    for ref in row["evidenceRefs"]:
        item=by_id[ref]; work=item["work"]; loc=item.get("locator") or {}
        locator="، ".join(str(loc[k]) for k in ("volume","pageStart","pageEnd","section") if loc.get(k))
        passages.append(f"[المصدر {ref}] {work.get('title')} — {work.get('author')} — {locator}\n{item['content']}")
    scope=[]
    if row.get("madhhabScope"): scope.append("النطاق المذهبي: "+str(row["madhhabScope"]))
    if row.get("hadithMethodScope"): scope.append("المنهج الحديثي: "+str(row["hadithMethodScope"]))
    scope.append("نوع المطلوب: "+str(row["answerType"]))
    prompt=("أنت مساعد بحث علمي متخصص. التزم بالمصادر المرفقة، وميّز النقل التاريخي من التخريج والاستنتاج والافتراض. "
            "لا تنسب قولًا إلى عالم بلا نص موثق، ولا تحوّل الظني إلى قطعي. إذا لم تكف الأدلة فصرّح بذلك.\n\n"
            +"المهمة: "+row["task"]+"\nالمجال: "+row["domain"]+"\n"+"\n".join(scope)
            +"\n\nالسؤال/المطلوب:\n"+row["prompt"]+"\n\nالمادة المصدرية:\n"+"\n\n".join(passages)+"\n\nالإجابة:")
    return {"prompt":prompt,"target":row["target"]}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--corpus",required=True);p.add_argument("--examples",required=True)
    p.add_argument("--base-model",required=True,help="Hugging Face model ID or local model directory")
    p.add_argument("--output-dir",required=True);p.add_argument("--seed",default="nawa-sft-v1")
    p.add_argument("--epochs",type=float,default=2);p.add_argument("--learning-rate",type=float,default=2e-4)
    p.add_argument("--batch-size",type=int,default=1);p.add_argument("--gradient-accumulation",type=int,default=8)
    p.add_argument("--max-length",type=int,default=2048);p.add_argument("--target-modules",default="q_proj,k_proj,v_proj,o_proj")
    p.add_argument("--max-test-loss-regression",type=float,default=.02)
    args=p.parse_args()
    corpus=read_jsonl(args.corpus);examples=read_jsonl(args.examples);by_id=validate_inputs(corpus,examples)
    splits=split_examples_by_source_works(examples,args.seed)
    if min(len(splits["train"]),len(splits["validation"]),len(splits["test"]))<1:
        raise ValueError("Need source-disjoint train, validation, and test examples; add more independently sourced reviewed examples")
    if len(splits["train"])<8: raise ValueError("At least 8 training examples required for this initial fine-tuning run")
    try:
        import torch
        from torch.utils.data import Dataset
        from transformers import AutoTokenizer,AutoModelForCausalLM,Trainer,TrainingArguments
        from peft import LoraConfig,get_peft_model,TaskType
    except ImportError as exc:
        raise RuntimeError("Install requirements from nawa/training/requirements.txt in a GPU training environment") from exc
    if not torch.cuda.is_available(): raise RuntimeError("No CUDA GPU detected; this training configuration is not permitted to silently fall back to CPU")
    formatted={k:[format_example(x,by_id) for x in v] for k,v in splits.items()}
    tokenizer=AutoTokenizer.from_pretrained(args.base_model,use_fast=True)
    if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
    class ScholarlyDataset(Dataset):
        def __init__(self,rows):
            self.rows=[]
            for row in rows:
                prefix=tokenizer(row["prompt"],add_special_tokens=True,truncation=True,max_length=args.max_length//2)
                target=tokenizer(row["target"]+tokenizer.eos_token,add_special_tokens=False,truncation=True,max_length=args.max_length//2)
                ids=prefix["input_ids"]+target["input_ids"]
                labels=[-100]*len(prefix["input_ids"])+target["input_ids"]
                self.rows.append((ids,labels))
        def __len__(self): return len(self.rows)
        def __getitem__(self,i):
            ids,labels=self.rows[i]
            return {"input_ids":torch.tensor(ids,dtype=torch.long),"attention_mask":torch.ones(len(ids),dtype=torch.long),"labels":torch.tensor(labels,dtype=torch.long)}
    class Collator:
        def __call__(self,features):
            width=max(len(x["input_ids"]) for x in features)
            return {"input_ids":torch.stack([torch.nn.functional.pad(x["input_ids"],(0,width-len(x["input_ids"])),value=tokenizer.pad_token_id) for x in features]),
                    "attention_mask":torch.stack([torch.nn.functional.pad(x["attention_mask"],(0,width-len(x["attention_mask"])),value=0) for x in features]),
                    "labels":torch.stack([torch.nn.functional.pad(x["labels"],(0,width-len(x["labels"])),value=-100) for x in features])}
    train_ds=ScholarlyDataset(formatted["train"]);val_ds=ScholarlyDataset(formatted["validation"]);test_ds=ScholarlyDataset(formatted["test"])
    model=AutoModelForCausalLM.from_pretrained(args.base_model,torch_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16)
    targets=[x.strip() for x in args.target_modules.split(",") if x.strip()]
    model=get_peft_model(model,LoraConfig(task_type=TaskType.CAUSAL_LM,r=16,lora_alpha=32,lora_dropout=.05,target_modules=targets))
    model.print_trainable_parameters()
    output=Path(args.output_dir);staging=output.with_name(output.name+".staging")
    if staging.exists():
        import shutil;shutil.rmtree(staging)
    training_args=TrainingArguments(output_dir=str(staging),num_train_epochs=args.epochs,learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,gradient_accumulation_steps=args.gradient_accumulation,
        logging_steps=5,save_strategy="no",report_to="none",remove_unused_columns=False,
        gradient_checkpointing=True,fp16=not torch.cuda.is_bf16_supported(),bf16=torch.cuda.is_bf16_supported())
    trainer=Trainer(model=model,args=training_args,train_dataset=train_ds,data_collator=Collator())
    before=trainer.evaluate(eval_dataset=test_ds,metric_key_prefix="test_before")
    trainer.train()
    after=trainer.evaluate(eval_dataset=test_ds,metric_key_prefix="test_after")
    before_loss=before.get("test_before_loss");after_loss=after.get("test_after_loss")
    if before_loss is None or after_loss is None or not math.isfinite(after_loss) or after_loss>before_loss+args.max_test_loss_regression:
        raise RuntimeError(f"Quality gate failed: held-out loss before={before_loss}, after={after_loss}; adapter not promoted")
    output.mkdir(parents=True,exist_ok=True);model.save_pretrained(output);tokenizer.save_pretrained(output)
    report={"baseModel":args.base_model,"trainExamples":len(train_ds),"validationExamples":len(val_ds),"testExamples":len(test_ds),
            "testLossBefore":before_loss,"testLossAfter":after_loss,"passedLossGate":True,
            "warning":"Held-out token loss is necessary but not sufficient. Run the domain benchmark and expert blind review before production use."}
    (output/"training-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    if staging.exists():
        import shutil;shutil.rmtree(staging)
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print(f"TRAINING BLOCKED/FAILED: {exc}",file=sys.stderr);sys.exit(1)
