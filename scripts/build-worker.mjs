import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['index.html','style.css','app.js','planner.js','chat-core.js','chat.js','vehicle-core.js','vehicle.js','manual-core.js','manual.js','products.json','import-report.json','product-details.json','missing-data.json'];
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const assets={};for(const file of files){const body=await readFile(path.join(root,'dist',file),'utf8');assets['/'+file]=['product-details.json','missing-data.json'].includes(file)?{type:types[path.extname(file)],body:gzipSync(body).toString('base64'),encoding:'gzip-base64'}:{type:types[path.extname(file)],body};}
let source=await readFile(path.join(root,'worker/index.mjs'),'utf8');source=source.replace('const ASSETS = __ASSETS__;',()=>`const ASSETS = ${JSON.stringify(assets)};`);
const core=await readFile(path.join(root,'dist/chat-core.js'),'utf8');
await mkdir(path.join(root,'dist/server'),{recursive:true});await writeFile(path.join(root,'dist/server/index.js'),core+'\n'+source);
console.log('Built Worker with '+files.length+' embedded assets.');
