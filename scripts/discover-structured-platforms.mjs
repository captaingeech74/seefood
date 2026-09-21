#!/usr/bin/env node
/** Lightweight public website inventory. No database or production writes. */
import fs from 'node:fs';
const directory='logs/structured-platforms-20260920';
const baseline=JSON.parse(fs.readFileSync(`${directory}/baseline.json`,'utf8'));
const file=`${directory}/discovery.json`;
const records=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')).records:[];
const completed=new Set(records.map(r=>r.url));
const routes=new Map();
for(const entity of baseline.entities)for(const website of entity.websites){
  const route=routes.get(website.url)??{url:website.url,entities:[],knownPlatforms:[]};
  route.entities.push(entity.entity_id);route.knownPlatforms=[...new Set([...route.knownPlatforms,...entity.platforms])];routes.set(website.url,route);
}
const signatures={
  popmenu:/popmenu(?:cloud)?\.com/i,toast:/toasttab\.com/i,spothopper:/spothopper(?:app)?\.com/i,
  owner:/cdn\.owner\.com|owner\.com|pluto-images\/funnel/i,bentobox:/getbento\.com|bentobox\.com/i,
  square:/square\.site|squareup\.com/i,chownow:/chownow\.com|chownow-order/i,
  clover:/clover\.com\/online-ordering|clover-ecomm/i,olo:/olo\.com/i,
  menufy:/menufy\.com|hungerrush\.com/i,slice:/slicelife\.com/i,flipdish:/flipdish(?:dev)?\.com/i,
  lightspeed:/lightspeedhq\.com|lightspeed\.app/i,gloriafood:/gloriafood\.com|globalfoodsoft\.com/i,
  wix_restaurants:/wixrestaurants|wix-restaurants|restaurants-menu|restaurants\.wixapps/i,
  spoton:/spoton\.com/i,zuppler:/zuppler\.com/i,touchbistro:/touchbistro\.com|tbdine\.com/i,
  menudrive:/menudrive\.com/i,singleplatform:/singleplatform\.com/i,imenupro:/imenupro\.com/i,
  musthavemenus:/musthavemenus\.com/i,foodamigos:/foodamigos\./i,
};
const pending=[...routes.values()].filter(r=>!completed.has(r.url));
let next=0;
function save(){fs.writeFileSync(file,JSON.stringify({updatedAt:new Date().toISOString(),total:routes.size,records},null,2));}
async function worker(){while(next<pending.length){const route=pending[next++];try{
  const response=await fetch(route.url,{signal:AbortSignal.timeout(10000),headers:{accept:'text/html'}});
  const type=response.headers.get('content-type')??'';
  let html='';if(type.includes('text/html')){const reader=response.body.getReader();let size=0;const pieces=[];while(size<1500000){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;pieces.push(Buffer.from(chunk.value));}await reader.cancel();html=Buffer.concat(pieces).toString('utf8');}
  const platforms=Object.entries(signatures).filter(([,re])=>re.test(html+' '+response.url)).map(([name])=>name);
  const links=[];for(const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)){try{const url=new URL(match[1].replaceAll('&amp;','&'),response.url);if(!['http:','https:'].includes(url.protocol)||url.href.length>1500)continue;if(/menu|order|toasttab|chownow|clover|square\.site|zuppler|tbdine|menufy|spoton|menudrive|popmenu/i.test(url.href))links.push(url.href);}catch{}}
  records.push({...route,status:response.status,finalUrl:response.url,platforms,links:[...new Set(links)].slice(0,30)});
}catch(error){records.push({...route,status:'failed',error:String(error).slice(0,160),platforms:[],links:[]});}
if(records.length%50===0){save();console.log(JSON.stringify({processed:records.length,total:routes.size}));}}
}
await Promise.all(Array.from({length:12},()=>worker()));save();
const counts={};for(const r of records)for(const p of r.platforms)counts[p]=(counts[p]??0)+1;
console.log(JSON.stringify({total:routes.size,processed:records.length,platformRoutes:counts},null,2));
