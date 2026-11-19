const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('../backend/node_modules/express');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
let charges=0,runtimeReady=true,hold=false,started,finish,aborted,artifact,fetching=false,fetchStarted,finishFetch;
function stub(name,exports){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
stub('../backend/config/supabase',{from(table){return {filters:{},select(){return this;},eq(k,v){this.filters[k]=v;return this;},async maybeSingle(){if(table==='api_keys')return {data:['valid','other','banned'].includes(this.filters.key)?{user_id:this.filters.key}:null};return {data:{banned:this.filters.id==='banned'}};}};}});
stub('../backend/lib/billing',{ensureEntitlement:async()=>{}});
stub('../backend/lib/hd-runtime',{ready:()=>runtimeReady});
stub('../backend/lib/ssweb-runtime',{ready:()=>runtimeReady});
const {validateURL}=require('../backend/lib/ssweb-egress');
stub('../backend/lib/hd-image',{
 readInput(q){validateURL(q.url);if(!['2','4',undefined].includes(q.scale))throw Object.assign(new Error('scale'),{code:'INVALID_SCALE'});return {url:q.url,scale:Number(q.scale||4)};},
 async fetchImage(url,{signal}){if(fetching)return new Promise((resolve,reject)=>{fetchStarted();finishFetch=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});return Buffer.from(url);},
 async validateImage(bytes){if(bytes.toString().includes('not-image'))throw Object.assign(new Error('image'),{code:'INVALID_IMAGE'});return {width:32,height:24};}
});
stub('../backend/lib/hd',{async upscaleImage(upload,scale,{signal}){if(!hold)return {image:{width:128,height:96},buffer:Buffer.from('PNG')};return new Promise((resolve,reject)=>{finish=resolve;started?.();signal.addEventListener('abort',()=>{aborted?.();reject(signal.reason);},{once:true});});}});
stub('../backend/lib/hd-results',{preflight:async()=>{},save:async(owner,result)=>({...result,owner,buffer:undefined}),get:async(owner,id)=>owner==='valid'&&id==='own-result'?{file:artifact}:null});
test('HD authenticates result ownership, rejects invalid input before quota, serializes work and releases capacity after disconnect',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hd-route-'));artifact=path.join(dir,'out.png');await fs.writeFile(artifact,'PNG');
 const app=express(),router=express.Router();require('../backend/routes/hd')(router,(req,res,next)=>{charges++;next();});app.use('/api/tools',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/tools/hd`;
 const call=(query='url=https://example.com/input.png',key='valid',options={})=>fetch(base+'?'+query,{headers:key?{'x-api-key':key}:{},...options});
 try{
  assert.equal((await call(undefined,null)).status,401);assert.equal((await call(undefined,'revoked')).status,401);assert.equal((await call(undefined,'banned')).status,403);
  for(const query of ['url=file:///etc/passwd','url=https://example.com/a&scale=3','url=https://example.com/not-image'])assert.equal((await call(query)).status,400);
  runtimeReady=false;assert.equal((await call()).status,503);runtimeReady=true;assert.equal(charges,0);
  assert.equal((await call('result=own-result','other')).status,404);assert.equal(await(await call('result=own-result')).text(),'PNG');assert.equal(charges,0);
  hold=true;const waiting=new Promise(r=>started=r);const pending=call();await waiting;assert.equal((await call()).status,503);assert.equal(charges,1);finish({buffer:Buffer.from('PNG'),image:{}});assert.equal((await(await pending).json()).success,true);
  const controller=new AbortController(),waiting2=new Promise(r=>started=r),didAbort=new Promise(r=>aborted=r);const cancelled=call(undefined,undefined,{signal:controller.signal}).catch(()=>null);await waiting2;controller.abort();await didAbort;await cancelled;hold=false;
  assert.equal((await(await call()).json()).success,true);assert.equal(charges,3);
  fetching=true;const fetchingNow=new Promise(r=>fetchStarted=r);const controller2=new AbortController();const early=call(undefined,undefined,{signal:controller2.signal}).catch(()=>null);await fetchingNow;controller2.abort();await early;await new Promise(r=>setTimeout(r,30));fetching=false;
  assert.equal((await(await call()).json()).success,true);assert.equal(charges,4,'aborted image fetch does not charge or retain capacity');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
