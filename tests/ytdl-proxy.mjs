// Run Next with API_BACKEND_URL=http://127.0.0.1:3031, then set TEST_BASE_URL.
import http from 'node:http';
import assert from 'node:assert/strict';
const server=http.createServer((req,res)=>{
 if (/^\/api\/(?:download\/(ytdl|igdl|pindl)|tools\/hd)/.test(req.url)) assert.equal(req.headers['x-api-key'],'test-only-key');
 if(/^\/api\/(?:download\/(ytdl|igdl)|tools\/hd)/.test(req.url)){
  res.setHeader('Content-Type','application/json');res.write(' \n');
  const heartbeat=setInterval(()=>res.write(' \n'),1000);
  const finish=setTimeout(()=>res.end(JSON.stringify({success:true,data:{fixture:true}})),24000);
  res.on('close',()=>{clearInterval(heartbeat);clearTimeout(finish);});
 }else {res.setHeader('Content-Type','application/json');res.end('{"status":true}');}
});
await new Promise(resolve=>server.listen(3031,'127.0.0.1',resolve));
try{
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3030';const start=Date.now();
 await Promise.all(['download/ytdl','download/igdl','tools/hd'].map(async endpoint=>{const response=await fetch(base+'/api/proxy/api/'+endpoint+'?url=fixture',{headers:{'x-api-key':'test-only-key'},signal:AbortSignal.timeout(40000)});assert.equal(response.status,200);assert.equal((await response.json()).data.fixture,true);assert.ok(Date.now()-start>=23000);assert.match(response.headers.get('cache-control'),/no-transform/);}));
 assert.equal((await(await fetch(base+'/api/proxy/api/download/pindl?url=https://pin.it/fixture',{headers:{'x-api-key':'test-only-key'}})).json()).status,true);
 console.log('PASS Next proxy preserves ytdl/igdl/hd streamed JSON beyond 22 seconds, API key forwarding and normal endpoint responses');
}finally{await new Promise(resolve=>server.close(resolve));}
