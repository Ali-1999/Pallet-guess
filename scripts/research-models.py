#!/usr/bin/env python3
"""Collect sourced LG product facts; keep overseas variants separate from Saudi planning data."""
import argparse,concurrent.futures,datetime,html,importlib.util,json,pathlib,re,subprocess,urllib.parse,xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('enrich',ROOT/'scripts/enrich-catalogue.py');enrich=importlib.util.module_from_spec(spec);spec.loader.exec_module(enrich)
TODAY=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
try:
    import httpx
    HTTP_CLIENT=httpx.Client(headers={'User-Agent':'curl/8.14.1','Accept-Encoding':'gzip'},timeout=20,follow_redirects=True,limits=httpx.Limits(max_connections=8,max_keepalive_connections=8))
except ImportError:
    HTTP_CLIENT=None

CATEGORIES={'tv-soundbars','washing-machines','monitors','care-accessories','refrigerators','speakers','rac-air-conditioners','tvs','built-in-appliances','wireless-earbuds','cooking-appliances','dishwashers','projectors','lifestyle-screens','dryers','vacuum-cleaners','air-purifiers','soundsuite','headphones','hi-fi-system','microwave-ovens','cac-air-conditioners','tv-accessories','computer-accessories','home-appliances-accessories'}
def models_in(markup):
    rows=[]
    for raw in re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',markup,re.S):
        try:
            p=json.loads(raw)
            if isinstance(p,dict) and p.get('@type')=='Product' and (p.get('mpn') or p.get('sku')):rows.append(p)
        except (ValueError,TypeError):pass
    return rows

def is_bundle(code,name):
    if re.search(r'\bbundle\b',name,re.I):return True
    pieces=re.split(r'\s\+\s',name,maxsplit=1)
    if len(pieces)<2:return False
    promotional_suffix='.' in code and not re.fullmatch(r'A[A-Z0-9]{2,7}',code.split('.')[1],re.I)
    return bool(promotional_suffix or re.search(r'\b(?:washer|washing|dryer|refrigerator|fridge|dishwasher|microwave|TV|television|monitor|speaker|soundbar|sound bar|xboom|neochef|projector)\b',pieces[1],re.I))

def collect(url,expected=None):
    if HTTP_CLIENT is not None:
        try:
            response=HTTP_CLIENT.get(url)
            if response.status_code!=200:return {'status':'fetch-failed','httpStatus':str(response.status_code),'url':url}
            text=response.text
        except Exception:return {'status':'fetch-failed','httpStatus':None,'url':url}
    else:
        r=subprocess.run(['curl','--compressed','-Ls','--max-time','20','-w','\n%{http_code}',url],capture_output=True)
        body,_,status=r.stdout.rpartition(b'\n')
        if r.returncode or status!=b'200':return {'status':'fetch-failed','httpStatus':status.decode(errors='replace'),'url':url}
        text=body.decode(errors='replace')
    schemas=models_in(text)
    if not schemas:return {'status':'no-product','url':url}
    if expected:
        matched=[p for p in schemas if str(p.get('mpn') or p.get('sku')).upper()==expected.upper() or str(p.get('mpn') or p.get('sku')).upper().startswith(expected.upper()+'.')]
        if len(matched)!=1:return {'status':'model-unconfirmed','url':url}
        schema=matched[0]
    elif len(schemas)==1:schema=schemas[0]
    else:return {'status':'multiple-products','url':url}
    code=str(schema.get('mpn') or schema.get('sku'));model=expected or code
    pairs=[{'label':enrich.clean(k),'value':enrich.clean(v)} for k,v in re.findall(r'c-compare-selling__spec-name[^>]{0,160}>(.{0,2000}?)</div>\s*<div[^>]{0,160}c-compare-selling__spec-desc[^>]{0,160}>(.{0,12000}?)</div>',text,re.S)]
    # Schema key specifications can remain available when the full specification panel is absent.
    for p in schema.get('additionalProperty',[]):
        if isinstance(p,dict) and p.get('name') and p.get('value') is not None:
            row={'label':enrich.clean(str(p['name'])),'value':enrich.clean(str(p['value']))}
            if row not in pairs:pairs.append(row)
    synthetic='<script type="application/ld+json">'+json.dumps({'@type':'Product','mpn':model,'name':schema.get('name',model)})+'</script>'+''.join('<div class="c-compare-selling__spec-name">'+html.escape(p['label'])+'</div><div class="c-compare-selling__spec-desc">'+html.escape(p['value'])+'</div>' for p in pairs)
    parsed=enrich.parse_page(synthetic,model)
    market=urllib.parse.urlparse(url).path.strip('/').split('/')[0]
    if market=='sa':market='sa_ar'
    links=[]
    for href in re.findall(r'(?:href|contentUrl)=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']',text,re.I):
        link=urllib.parse.urljoin(url,html.unescape(href))
        if urllib.parse.urlparse(link).hostname in ['www.lg.com','gscs-b2c.lge.com'] and link not in links:links.append(link)
    bundle=is_bundle(code,schema.get('name',''))
    return {'status':'verified','url':url,'market':market,'modelCode':code,'name':schema.get('name',model),'brand':schema.get('brand',{}).get('name','LG') if isinstance(schema.get('brand'),dict) else 'LG','image':schema.get('image'),'checked':TODAY,'fullSpecs':pairs,'dimensionSpecs':parsed.get('dimensionSpecs',[]),'dims':None if bundle else parsed.get('dims'),'weight':None if bundle else parsed.get('weight'),'unitNote':parsed.get('unitNote'),'documents':links[:12],'bundle':bundle,'multiPackage':any(re.search(r'(?:packing|package|shipping).*?(?:indoor|outdoor|subwoofer|rear speaker)',row['label'],re.I) for row in pairs)}

def save(path,obj):
    temp=path.with_suffix('.tmp');temp.write_text(json.dumps(obj,ensure_ascii=False));temp.replace(path)

def run_jobs(jobs,cache_path,workers):
    cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
    pending=[(key,url,model) for key,url,model in jobs if key not in cache]
    print('Pending pages:',len(pending),'cached:',len(cache),flush=True)
    def work(job):key,url,model=job;return key,collect(url,model)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for i,(key,data) in enumerate(pool.map(work,pending),1):
            cache[key]=data
            if i%25==0:save(cache_path,cache);print(i,'/',len(pending),'pages checked;',sum(v['status']=='verified' for v in cache.values()),'product sources verified',flush=True)
    save(cache_path,cache);return cache

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--phase',choices=['index','primary','discover','regional','all','merge'],required=True);ap.add_argument('--work',required=True);ap.add_argument('--workers',type=int,default=6);args=ap.parse_args();work=pathlib.Path(args.work);work.mkdir(parents=True,exist_ok=True)
    products=json.loads((ROOT/'dist/products.json').read_text());index=json.loads((work/'regional-urls.json').read_text()) if (work/'regional-urls.json').exists() else {}
    if args.phase=='index':
        regions=['sa_en','sa_ar','ae','levant_en','eg_en','uk','au','africa']
        def get_index(region):
            url='https://www.lg.com/'+region+'/sitemap.xml'
            try:
                if HTTP_CLIENT is not None:
                    response=HTTP_CLIENT.get(url);response.raise_for_status();body=response.content
                else:
                    result=subprocess.run(['curl','--compressed','-fLs','--max-time','35',url],capture_output=True,check=True);body=result.stdout
                urls=[n.text for n in ET.fromstring(body).findall('.//{*}loc') if n.text]
                return region,urls
            except Exception:return region,[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:index=dict(pool.map(get_index,regions))
        save(work/'regional-urls.json',index);print(json.dumps({k:len(v) for k,v in index.items()},indent=2),flush=True);return
    if args.phase!='merge':
        phases=['primary','discover','regional'] if args.phase=='all' else [args.phase]
        caches={phase:json.loads((work/(phase if phase!='discover' else 'discovery')).with_suffix('.json').read_text()) if (work/(phase if phase!='discover' else 'discovery')).with_suffix('.json').exists() else {} for phase in phases}
        all_jobs=[]
        for phase in phases:
            jobs=[]
            if phase=='primary':jobs=[(p['model'],p['url'],p['model']) for p in products]
            if phase=='discover':
                known={p['url'] for p in products}
                for u in index.get('sa_en',[]):
                    parts=urllib.parse.urlparse(u).path.strip('/').split('/');slug=parts[-1]
                    if len(parts)>=3 and parts[1] in CATEGORIES and u not in known and re.search(r'[0-9]',slug) and re.search(r'[A-Za-z]',slug) and not any(part in ['buying-guide','support','how-to','2021','2022','2023','2024'] for part in parts):jobs.append((u,u,None))
            if phase=='regional':
                models={p['model'].lower():p for p in products}
                for region,urls in index.items():
                    if region=='sa_en':continue
                    found={}
                    for u in urls:
                        parts=urllib.parse.urlparse(u).path.strip('/').split('/');slug=parts[-1].lower();slug=slug[3:] if slug.startswith('lg-') else slug
                        if slug in models and not any(x in parts for x in ['support','partners','small-medium-business']):found.setdefault(slug,u)
                    for slug,u in found.items():jobs.append((region+':'+slug,u,models[slug]['model']))
                for model,u in [('27LX6TDGA','https://www.lg.com/uk/lifestyle-screens/stanbyme/27lx6tdga/'),('27LX6TDGA','https://www.lg.com/au/lifestyle-screens/stanbyme/27lx6tdga/'),('DFB512FP','https://www.lg.com/in/dishwasher/dfb512fp/'),('DFB512FP','https://www.lg.com/za/dishwashers/dfb512fp/')]:jobs.append((u,u,model))
            all_jobs.extend((phase,key,url,model) for key,url,model in dict((key,(key,url,model)) for key,url,model in jobs).values() if key not in caches[phase])
        def checkpoint():
            for phase,data in caches.items():save(work/((phase if phase!='discover' else 'discovery')+'.json'),data)
        print('Pending across phases:',len(all_jobs),'cached:',{k:len(v) for k,v in caches.items()},flush=True)
        def do(job):phase,key,url,model=job;return phase,key,collect(url,model)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(8,args.workers))) as pool:
            for i,(phase,key,data) in enumerate(pool.map(do,all_jobs),1):
                caches[phase][key]=data
                if i%50==0:checkpoint();print(i,'/',len(all_jobs),'new pages; verified sources:',{k:sum(r['status']=='verified' for r in c.values()) for k,c in caches.items()},flush=True)
        checkpoint()
        if args.phase!='all':return
    primary=json.loads((work/'primary.json').read_text());discovery=json.loads((work/'discovery.json').read_text()) if (work/'discovery.json').exists() else {};regional=json.loads((work/'regional.json').read_text()) if (work/'regional.json').exists() else {}
    for group in [primary,discovery,regional]:
        for source in group.values():
            if source.get('market')=='sa':source['market']='sa_ar'
            if source.get('status')=='verified':
                model=source['modelCode'];source['bundle']=is_bundle(model,source['name']);markup='<script type="application/ld+json">'+json.dumps({'@type':'Product','mpn':model,'name':source['name']})+'</script>'
                markup+=''.join('<div class="c-compare-selling__spec-name">'+html.escape(row['label'])+'</div><div class="c-compare-selling__spec-desc">'+html.escape(row['value'])+'</div>' for row in source.get('fullSpecs',[]))
                derived=enrich.parse_page(markup,model)
                source['dimensionSpecs']=derived['dimensionSpecs']
                source['dims']=None if source.get('bundle') else derived['dims']
                source['weight']=None if source.get('bundle') else derived['weight']

    details={};by_model={p['model'].upper():p for p in products}
    for model,source in primary.items():
        p=by_model[model.upper()]
        p['specFetchStatus']=source['status']
        details[p['model']]={'primary':source if source['status']=='verified' else None,'sources':[],'status':source['status']}
        if source['status']=='verified':
            p.update(name=source['name'],checked=TODAY,unitNote=source.get('unitNote'),dimensionSpecs=source['dimensionSpecs'],specFetchStatus='verified',discoveryOnly=False)
            for field in ['dims','weight']:
                if source.get(field) is not None:p[field]=source[field]
            p['bundle']=source['bundle'];p['multiPackage']=source.get('multiPackage',any(re.search(r'(?:packing|package|shipping).*?(?:indoor|outdoor|subwoofer|rear speaker)',row['label'],re.I) for row in source.get('fullSpecs',[])));p['fullSpecCount']=len(source['fullSpecs'])
            if source['bundle']:p['dims']=None;p['weight']=None
    added=0
    for source in discovery.values():
        if source['status']!='verified':continue
        model=source['modelCode'].upper()
        if '.' in model and re.fullmatch(r'A[A-Z0-9]{2,7}',model.split('.')[1]):model=model.split('.')[0]
        # Product identifiers with regional suffixes belong to their existing base model when present.
        if model not in by_model and model.split('.')[0] in by_model:model=model.split('.')[0]
        if model in by_model:
            if model in details:details[model]['sources'].append(source)
            if not source['bundle']:
                p=by_model[model]
                for field in ['dims','weight']:
                    if not p.get(field) and source.get(field):p[field]=source[field];p.setdefault('shippingSources',{})[field]=source['url']
            if model not in details:details[model]={'primary':source,'sources':[],'status':'verified'}
            continue
        parts=urllib.parse.urlparse(source['url']).path.strip('/').split('/')
        p={'model':model,'name':source['name'],'category':parts[1],'url':source['url'],'dims':source['dims'],'weight':source['weight'],'dimensionSpecs':source['dimensionSpecs'],'checked':TODAY,'market':'Saudi Arabia','discoveryOnly':False,'specFetchStatus':'verified','bundle':source['bundle'],'multiPackage':source.get('multiPackage',any(re.search(r'(?:packing|package|shipping).*?(?:indoor|outdoor|subwoofer|rear speaker)',row['label'],re.I) for row in source.get('fullSpecs',[]))),'fullSpecCount':len(source['fullSpecs']),'unitNote':source.get('unitNote')};by_model[model]=p;details[model]={'primary':source,'sources':[],'status':'verified'};added+=1
    for key,source in regional.items():
        if source['status']!='verified':continue
        model=key.split(':',1)[-1].upper() if not key.startswith('https') else next((p['model'] for p in products if p['model'].upper()==source['modelCode'].upper().split('.')[0]),None)
        if model not in by_model:continue
        details.setdefault(model,{'primary':None,'sources':[],'status':'unavailable'})['sources'].append(source)
        # Saudi Arabic pages are same-market alternatives; other markets are reference only.
        if source['market']=='sa_ar' and not source['bundle']:
            p=by_model[model]
            for field in ['dims','weight']:
                if not p.get(field) and source.get(field):p[field]=source[field];p['shippingSourceUrl']=source['url']
    reviewed_path=ROOT/'data/reviewed-sources.json'
    reviewed=json.loads(reviewed_path.read_text()) if reviewed_path.exists() else {}
    for model,sources in reviewed.items():
        if model not in by_model:continue
        details.setdefault(model,{'primary':None,'sources':[],'status':'unavailable'})['sources'].extend(sources)
        for source in sources:
            if source.get('market')!='sa_en' or source.get('bundle'):continue
            for field in ['dims','weight']:
                if not by_model[model].get(field) and source.get(field):by_model[model][field]=source[field];by_model[model].setdefault('shippingSources',{})[field]=source['url']
    support_path=work/'support-documents.json'
    if not support_path.exists():support_path=ROOT/'data/reviewed-documents.json'
    if support_path.exists():
        for model,refs in json.loads(support_path.read_text()).items():
            if not refs or model not in details:continue
            primary_source=details[model].get('primary')
            if primary_source:
                primary_source['documents']=list(dict.fromkeys(primary_source.get('documents',[])+refs.get('documents',[])))
                primary_source['supportUrl']=refs['supportUrl']
    for model,p in by_model.items():
        if model not in details:
            fallback=primary.get(model) or discovery.get(p.get('url',''))
            details[model]={'primary':fallback if fallback and fallback.get('status')=='verified' else None,'sources':[],'status':fallback.get('status','unavailable') if fallback else 'unavailable'}
        d=details[model]
        seen={d['primary']['url']} if d.get('primary') else set()
        unique=[]
        for source in d.get('sources',[]):
            if source['url'] not in seen:unique.append(source);seen.add(source['url'])
        d['sources']=unique
        source_list=([d['primary']] if d.get('primary') else [])+d.get('sources',[])
        d['hasDifferences']=len({tuple(s['dims']) for s in source_list if s.get('dims')})>1 or len({s['weight'] for s in source_list if s.get('weight')})>1
        p['sourceDifferences']=d['hasDifferences']
        p['detailSources']=len(d.get('sources',[]))+(1 if d.get('primary') else 0);p['fullSpecCount']=max([len(s.get('fullSpecs',[])) for s in ([d['primary']] if d.get('primary') else [])+d.get('sources',[])] or [0]);p['regionalReferenceCount']=sum(s.get('market') not in ['sa_en','sa_ar'] for s in d.get('sources',[]))
    result=sorted(by_model.values(),key=lambda p:p['model']);(ROOT/'dist/products.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');save(ROOT/'dist/product-details.json',details)
    report=json.loads((ROOT/'dist/import-report.json').read_text());report.update(checked=TODAY,models=len(result),ready=sum(bool(p.get('dims') and p.get('weight')) for p in result),withDimensions=sum(bool(p.get('dims')) for p in result),withDimensionSpecs=sum(bool(p.get('dimensionSpecs')) for p in result),withFullSpecs=sum(bool(p.get('fullSpecCount')) for p in result),withoutPublishedDetails=sum(not p.get('fullSpecCount') for p in result),withRegionalReferences=sum(bool(p.get('regionalReferenceCount')) for p in result),addedModels=len(result)-report.get('baselineModels',len(products)),verifiedPages=sum(p.get('specFetchStatus')=='verified' for p in result),attemptedModels=len(result),errors=[{'model':p['model'],'url':p['url'],'status':p.get('specFetchStatus')} for p in result if p.get('specFetchStatus')!='verified'],researchedPages=len({v['url'] for group in [primary,discovery,regional] for v in group.values() if v.get('url')}),researchedRequests=len(primary)+len(discovery)+len(regional),researchedMarkets=sorted(set(index)|{s.get('market') for group in [primary,discovery,regional] for s in group.values() if s.get('status')=='verified' and s.get('market')}),source='https://www.lg.com/sa_en/sitemap.xml',scope='Saudi model catalogue researched against official regional LG pages and sitemap product discovery. Overseas sources are reference only and do not automatically supply Saudi shipping dimensions. Full published technical facts and source model codes are retained. Completeness and availability are not guaranteed.');(ROOT/'dist/import-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    missing=[{'model':p['model'],'name':p['name'],'category':p['category'],'missing':[k for k in ['dims','weight'] if not p.get(k)]+([] if p.get('fullSpecCount') else ['technicalSpecifications']),'source':p['url'],'referenceSources':p.get('regionalReferenceCount',0),'reason':'plan-components-separately' if p.get('bundle') else 'multiple-shipping-packages-require-separate-records' if p.get('multiPackage') else 'shipping-data-unavailable-or-unverified'} for p in result if not p.get('dims') or not p.get('weight') or not p.get('fullSpecCount')];save(ROOT/'dist/missing-data.json',missing)
    print(json.dumps({k:v for k,v in report.items() if k!='errors'},indent=2),flush=True)
if __name__=='__main__':main()
