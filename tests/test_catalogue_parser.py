import importlib.util,json,pathlib,unittest
spec=importlib.util.spec_from_file_location('enrich',pathlib.Path(__file__).parents[1]/'scripts/enrich-catalogue.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def page(pairs,model='MODEL123'):
    return '<script type="application/ld+json">'+json.dumps({'@type':'Product','mpn':model,'name':'Example'})+'</script>'+''.join('<div class="c-compare-selling__spec-name">'+k+'</div><div class="c-compare-selling__spec-desc">'+v+'</div>' for k,v in pairs)
class ParserTests(unittest.TestCase):
    def test_carton_axes_and_product_specs(self):
        r=m.parse_page(page([('Box Dimensions (WxHxD mm)','710x1020x670'),('Weight include packing (kg)','83.0'),('Product Dimensions (WxHxD mm)','650x950x645')]),'MODEL123')
        self.assertEqual(r['dims'],[710,670,1020]);self.assertEqual(r['weight'],83);self.assertEqual(len(r['dimensionSpecs']),3)
    def test_unpacked_not_used_for_shipping(self):
        r=m.parse_page(page([('Product Dimensions (WxHxD mm)','650x950x645'),('Weight (kg)','77')]),'MODEL123');self.assertIsNone(r['dims']);self.assertIsNone(r['weight'])
    def test_lg_shipping_typo_and_asterisk_dimensions(self):
        r=m.parse_page(page([('Dimension in Shiping (W x H x D) [mm]','1206 * 534 * 201'),('Weight in Shipping [kg]','17.8')]),'MODEL123');self.assertEqual(r['dims'],[1206,201,534]);self.assertEqual(r['weight'],17.8)
    def test_exact_model(self):
        self.assertEqual(m.parse_page(page([],'OTHER123'),'MODEL123')['status'],'model-unconfirmed')
        self.assertEqual(m.parse_page(page([],'MODEL123.AMVG'),'MODEL123')['status'],'verified')
        self.assertEqual(m.parse_page(page([],'MODEL123.MICROWAVE123'),'MODEL123')['status'],'model-unconfirmed')
    def test_multiple_packages_not_silently_combined(self):
        r=m.parse_page(page([('Packing Dimensions Indoor (WxHxD mm)','1000x300x200'),('Packing Dimensions Outdoor (WxHxD mm)','800x600x400'),('Packing Weight (kg)','20')]),'MODEL123');self.assertIsNone(r['dims']);self.assertIsNone(r['weight'])
    def test_conflicting_cartons_not_selected(self):
        r=m.parse_page(page([('Box Dimensions (WxHxD mm)','710x1020x670'),('Packing Dimensions (WxHxD mm)','700x1000x600')]),'MODEL123');self.assertIsNone(r['dims'])
    def test_inch_dimensions_converted_to_mm(self):
        r=m.parse_page(page([('Packaging Dimensions WxHxD (inches)','40x30x10')]),'MODEL123');self.assertEqual(r['dims'],[1016,254,762])
    def test_imperial_value_and_weight_conversion(self):
        r=m.parse_page(page([('Packaging Dimensions (WxHxD)','49.8\" x 8.1\" x 22.8\"'),('Packaging Weight','50.7 lbs')]),'MODEL123');self.assertEqual(r['dims'],[1264.92,579.12,205.74]);self.assertAlmostEqual(r['weight'],22.9971,places=4)
if __name__=='__main__':unittest.main()
