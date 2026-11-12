import contextlib,importlib.util,io,json,pathlib,tempfile,unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('research',pathlib.Path(__file__).parents[1]/'scripts/research-models.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class Response:
 status_code=200
 def __init__(self,text):self.text=text
class Client:
 def __init__(self,text):self.text=text
 def get(self,url):return Response(self.text)
def markup(code,name='LG washer'):
 return '<script type="application/ld+json">'+json.dumps({'@type':'Product','mpn':code,'name':name,'additionalProperty':[{'name':'CAPACITY - Wash (kg)','value':'9'}]})+'</script><div class="c-compare-selling__spec-name">Box Dimensions (WxHxD mm)</div><div class="c-compare-selling__spec-desc">655 x 885 x 655</div><div class="c-compare-selling__spec-name">Weight include packing (kg)</div><div class="c-compare-selling__spec-desc">64.5</div>'
class ResearchTests(unittest.TestCase):
 def test_full_facts_include_schema_properties_and_shipping(self):
  with patch.object(r,'HTTP_CLIENT',Client(markup('WASH123.AMVE'))):data=r.collect('https://www.lg.com/ae/washing/wash123/','WASH123')
  self.assertEqual(data['status'],'verified');self.assertEqual(data['modelCode'],'WASH123.AMVE');self.assertEqual(data['market'],'ae');self.assertEqual(data['dims'],[655,655,885]);self.assertTrue(any(x['label']=='CAPACITY - Wash (kg)' for x in data['fullSpecs']))
 def test_different_model_is_not_accepted(self):
  with patch.object(r,'HTTP_CLIENT',Client(markup('OTHER123'))):data=r.collect('https://www.lg.com/ae/washing/wash123/','WASH123')
  self.assertEqual(data['status'],'model-unconfirmed')
 def test_bundle_facts_never_become_a_single_shipping_carton(self):
  with patch.object(r,'HTTP_CLIENT',Client(markup('WASH123.MICRO001','LG washer + microwave'))):data=r.collect('https://www.lg.com/sa_en/bundle/wash123-micro001/')
  self.assertTrue(data['bundle']);self.assertIsNone(data['dims']);self.assertIsNone(data['weight']);self.assertTrue(data['fullSpecs'])
 def test_feature_plus_sign_is_not_a_bundle(self):
  self.assertFalse(r.is_bundle('LREN6323ZE','LG Electric Range, EasyClean + Self Clean, Black LREN6323ZE'))
  self.assertFalse(r.is_bundle('LRE3193BD','LG Oven, baking + grill with thermal distribution'))
  self.assertTrue(r.is_bundle('WASH123','LG washer + microwave'))
 def test_overseas_shipping_is_reference_only(self):
  with tempfile.TemporaryDirectory() as directory:
   root=pathlib.Path(directory);(root/'dist').mkdir();work=root/'work';work.mkdir()
   product={'model':'WASH123','name':'Washer','category':'washing-machines','url':'https://www.lg.com/sa_en/washing/wash123/','dims':None,'weight':None}
   (root/'dist/products.json').write_text(json.dumps([product]));(root/'dist/import-report.json').write_text('{}');(work/'regional-urls.json').write_text('{}')
   (work/'primary.json').write_text(json.dumps({'WASH123':{'status':'fetch-failed'}}))
   source={'status':'verified','market':'uk','url':'https://www.lg.com/uk/washing/wash123/','modelCode':'WASH123.AEK','name':'Washer','bundle':False,'dims':[655,655,885],'weight':64.5,'fullSpecs':[{'label':'Capacity','value':'9 kg'}]}
   (work/'regional.json').write_text(json.dumps({'uk:wash123':source}))
   with patch.object(r,'ROOT',root),patch('sys.argv',['research','--phase','merge','--work',str(work)]),contextlib.redirect_stdout(io.StringIO()):r.main()
   result=json.loads((root/'dist/products.json').read_text())[0];details=json.loads((root/'dist/product-details.json').read_text())
   self.assertIsNone(result['dims']);self.assertIsNone(result['weight']);self.assertEqual(result['regionalReferenceCount'],1);self.assertEqual(details['WASH123']['sources'][0]['modelCode'],'WASH123.AEK')
if __name__=='__main__':unittest.main()
