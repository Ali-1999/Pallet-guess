#!/usr/bin/env python3
"""Refresh exact-model LG Saudi shipping data. Requires Python 3 and curl.
Resume from a JSON cache; no guessed dimensions and no cross-market substitution.
"""
import argparse, concurrent.futures, datetime, html, json, pathlib, re, subprocess
ROOT = pathlib.Path(__file__).resolve().parents[1]

def clean(value):
    return html.unescape(re.sub(r'<[^>]+>', '', value)).strip()

def parse_page(markup, model):
    schemas=[]
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',markup,re.S):
        try:
            obj=json.loads(raw)
            if isinstance(obj,dict) and obj.get('@type')=='Product': schemas.append(obj)
        except (ValueError,TypeError): pass
    def matches(p):
        code=str(p.get('mpn') or p.get('sku') or '').upper(); expected=model.upper()
        return code==expected or ('.' not in expected and code.startswith(expected+'.') and bool(re.fullmatch(r'[A-Z0-9]{3,6}',code[len(expected)+1:])))
    matching=[p for p in schemas if matches(p)]
    if len(matching)!=1: return {'status':'model-unconfirmed','dimensionSpecs':[]}
    pairs=[(clean(a),clean(b)) for a,b in re.findall(r'c-compare-selling__spec-name[^>]{0,160}>(.{0,2000}?)</div>\s*<div[^>]{0,160}c-compare-selling__spec-desc[^>]{0,160}>(.{0,12000}?)</div>',markup,re.S)]
    specs=[]; dims=None; weight=None; dim_options=[]; weight_options=[]; multi_package=False
    for label,value in pairs:
        if not re.search(r'dimension|weight|depth|height|width|\bsize\b',label,re.I): continue
        row={'label':label,'value':value}
        if row not in specs: specs.append(row)
        packed=bool(re.search(r'box|pack(?:ing|age|ed|aging)?|ship(?:p)?ing|gross',label,re.I))
        if packed and re.search(r'indoor|outdoor|subwoofer|rear speaker',label,re.I): multi_package=True
        if packed and re.search(r'dimension|\bsize\b',label,re.I):
            order=re.search(r'([WHLD])\s*[x×]\s*([WHLD])\s*[x×]\s*([WHLD])',label,re.I)
            numbers=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|inches?|in\.)?\s*',value.replace(',','').replace(chr(34),'').replace('″',''),re.I)
            # Explicit source units are converted to mm; unlabelled TV values
            # follow LG Saudi metric convention. Raw specifications stay unchanged.
            if order and numbers:
                unit_text=(label+' '+value).lower()
                inches=bool(re.search(r'inch|in\.|["″]',unit_text))
                cm=bool(re.search(r'\bcm\b',unit_text))
                factor=25.4 if inches else 10 if cm else 1
                sizes={k.upper():round(float(v)*factor,3) for k,v in zip(order.groups(),numbers.groups())}
                if set(sizes)=={'W','H','D'} and min(sizes.values())>0 and (inches or cm or 'mm' in unit_text or min(sizes.values())>=10):
                    dim_options.append([sizes['W'],sizes['D'],sizes['H']])
        if packed and re.search(r'weight',label,re.I) and not re.search(r'without|excluding',label,re.I):
            number=re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(?:kg|lbs?|pounds?|g)?\s*',value,re.I)
            unit_text=(label+' '+value).lower()
            if number and float(number.group(1))>0:
                pounds=bool(re.search(r'\blbs?\b|pounds?',unit_text))
                if pounds or 'kg' in unit_text or re.search(r'Packaging Weight \(Overseas\)',label,re.I):
                    weight_options.append(round(float(number.group(1))*(0.45359237 if pounds else 1),4))
    unique_dims={tuple(v) for v in dim_options}; unique_weights=set(weight_options)
    dims=list(next(iter(unique_dims))) if len(unique_dims)==1 and not multi_package else None
    weight=next(iter(unique_weights)) if len(unique_weights)==1 and not multi_package else None
    return {'status':'verified','name':matching[0].get('name',model),'sourcePairs':[{'label':k,'value':v} for k,v in pairs],'dimensionSpecs':specs,'dims':dims,'weight':weight,'units':{'dims':'mm','weight':'kg'},'unitNote':'Planner units are mm and kg. Explicit inches/lb are converted (1 inch = 25.4 mm; 1 lb = 0.45359237 kg). Unlabelled LG Saudi TV packaging dimensions/overseas weight use the metric convention; original values are preserved below.'}

def fetch(product):
    result=subprocess.run(['curl','--compressed','-Ls','--max-time','22','-w','\n%{http_code}',product['url']],capture_output=True)
    if result.returncode: return {'status':'fetch-failed','httpStatus':None}
    body,_,code=result.stdout.rpartition(b'\n')
    if code!=b'200': return {'status':'fetch-failed','httpStatus':code.decode(errors='replace')}
    return parse_page(body.decode(errors='replace'),product['model'])

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--cache',default=str(ROOT/'work/catalogue-cache.json'));ap.add_argument('--workers',type=int,default=3);ap.add_argument('--retry-failed',action='store_true');args=ap.parse_args()
    cache_path=pathlib.Path(args.cache);cache_path.parent.mkdir(parents=True,exist_ok=True)
    cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
    products=json.loads((ROOT/'dist/products.json').read_text());now=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    pending=[p for p in products if p['model'] not in cache or args.retry_failed and cache[p['model']]['status']!='verified']
    print(f'Checking {len(pending)} models; {len(cache)} cached.',flush=True)
    def work(p): return p['model'],fetch(p)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(6,args.workers))) as pool:
        for i,(model,data) in enumerate(pool.map(work,pending),1):
            cache[model]={**data,'checked':now}
            if i%20==0:
                cache_path.write_text(json.dumps(cache));print(f'{i}/{len(pending)} checked; {sum(r["status"]=="verified" for r in cache.values())} exact-model pages verified.',flush=True)
    # Reprocess cached raw specification rows when extraction rules improve.
    for model,entry in list(cache.items()):
        if entry.get('status')!='verified':continue
        markup='<script type="application/ld+json">'+json.dumps({'@type':'Product','mpn':model,'name':entry.get('name',model)})+'</script>'
        markup+=''.join('<div class="c-compare-selling__spec-name">'+html.escape(r['label'])+'</div><div class="c-compare-selling__spec-desc">'+html.escape(r['value'])+'</div>' for r in entry.get('sourcePairs',entry.get('dimensionSpecs',[])))
        cache[model]={**parse_page(markup,model),'checked':entry['checked']}
    cache_path.write_text(json.dumps(cache))
    for p in products:
        entry=cache.get(p['model'],{})
        p['specFetchStatus']=entry.get('status','not-checked')
        if entry.get('status')!='verified':continue
        p['name']=entry['name'];p['dimensionSpecs']=entry['dimensionSpecs'];p['discoveryOnly']=False;p['checked']=entry['checked'];p['unitNote']=entry['unitNote']
        for field in ['dims','weight']:
            p[field]=entry.get(field)
    (ROOT/'dist/products.json').write_text(json.dumps(products,ensure_ascii=False,indent=2)+'\n')
    report=json.loads((ROOT/'dist/import-report.json').read_text())
    report.update(checked=now,models=len(products),ready=sum(bool(p.get('dims') and p.get('weight')) for p in products),withDimensions=sum(bool(p.get('dims')) for p in products),withDimensionSpecs=sum(bool(p.get('dimensionSpecs')) for p in products),verifiedPages=sum(p.get('specFetchStatus')=='verified' for p in products),attemptedModels=len(cache),errors=[{'model':p['model'],'url':p['url'],'status':p.get('specFetchStatus')} for p in products if p.get('specFetchStatus')!='verified'],bulkBlocked=any(v.get('httpStatus')=='403' for v in cache.values()),scope='All saved Saudi sitemap model listings were checked against their linked LG pages. Exact-model published dimensions and weights are retained where available. Missing fields are never inferred from similar models. Listings may be discontinued; catalogue completeness and availability are not guaranteed.')
    (ROOT/'dist/import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='errors'},indent=2),flush=True)
if __name__=='__main__':main()
