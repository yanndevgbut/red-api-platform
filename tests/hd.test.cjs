const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {EventEmitter}=require('node:events');
const {mkdtemp,rm,writeFile}=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {readInput,fetchImage,validateImage}=require('../backend/lib/hd-image');
const {sharp}=require('../backend/lib/hd-runtime');
const {createStore}=require('../backend/lib/hd-results');
const {upscaleImage}=require('../backend/lib/hd');

test('HD accepts only public HTTP images, unambiguous 2x/4x scales and no local files',()=>{
  assert.equal(readInput({url:'https://example.com/image.png'}).scale,4);
  assert.equal(readInput({url:'https://example.com/image.png',scale:'2'}).scale,2);
  for(const url of ['/etc/passwd','file:///etc/passwd','data:image/png;base64,a','http://127.0.0.1/x','https://169.254.169.254/a','https://user:pass@example.com/a','https://example.com:444/a'])assert.throws(()=>readInput({url}));
  for(const scale of [['2'],'0','3','4.0','__proto__'])assert.throws(()=>readInput({url:'https://example.com/a',scale}),{code:'INVALID_SCALE'});
});
test('HD image fetching pins the actual connection IP, checks redirect destinations and enforces streamed byte limits',async()=>{
  let calls=0;
  const mock=(options,accept)=>{
    assert.equal(options.hostname,'1.1.1.1');assert.equal(options.headers.Host,'example.com');
    const req=new EventEmitter();req.end=()=>{calls++;const response=Readable.from([Buffer.from('png')]);response.statusCode=302;response.headers={location:'http://127.0.0.1/private'};accept(response);};return req;
  };
  await assert.rejects(fetchImage('https://example.com/a',{resolve:async()=>({address:'1.1.1.1',family:4}),requestImpl:mock}),{code:'BLOCKED_TARGET'});
  assert.equal(calls,1);
  const big=(options,accept)=>{const req=new EventEmitter();req.end=()=>{const res=Readable.from([Buffer.alloc(6*1024*1024),Buffer.alloc(5*1024*1024)]);res.statusCode=200;res.headers={};accept(res);};return req;};
  await assert.rejects(fetchImage('https://example.com/a',{resolve:async()=>({address:'1.1.1.1',family:4}),requestImpl:big}),{code:'IMAGE_TOO_LARGE'});
  await assert.rejects(fetchImage('https://example.com/a',{resolve:async()=>{throw Object.assign(new Error('private DNS'),{code:'BLOCKED_TARGET'});},requestImpl:()=>assert.fail('must not connect')}),{code:'BLOCKED_TARGET'});
});
test('HD fully decodes images and rejects invalid files, oversized dimensions and animation',async()=>{
  const image=await sharp()({create:{width:32,height:24,channels:3,background:'#123456'}}).png().toBuffer();
  const info=await validateImage(image,4);assert.equal(info.width,32);assert.equal(info.height,24);
  const rotated=await sharp()(image).jpeg().withMetadata({orientation:6}).toBuffer();
  const rotatedInfo=await validateImage(rotated,4);assert.equal(rotatedInfo.width,24);assert.equal(rotatedInfo.height,32);
  const animated=await sharp()([image,await sharp()(image).negate().png().toBuffer()],{join:{animated:true}}).webp({loop:0,delay:[100,100]}).toBuffer();
  await assert.rejects(validateImage(animated,4),{code:'INVALID_IMAGE'});
  await assert.rejects(validateImage(Buffer.from('<svg><script>alert(1)</script></svg>'),4),{code:'INVALID_IMAGE'});
  await assert.rejects(validateImage(image.subarray(0,40),4),{code:'INVALID_IMAGE'});
  const big=await sharp()({create:{width:1025,height:1025,channels:3,background:'#123456'}}).png().toBuffer();
  await assert.rejects(validateImage(big,4),{code:'INVALID_IMAGE'});
  assert.equal((await validateImage(big,2)).width,1025);
});
test('HD protected artifacts are bound to the account, expire, and avoid large base64 gateway payloads',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'red-hd-'));const store=createStore(dir);
  try{
    await store.preflight();
    const result=await store.save('alice',{buffer:Buffer.from('PNG'),image:{size_bytes:3}});
    const id=new URL(result.image.url).searchParams.get('result');
    assert.equal(result.image.encoding,'base64');assert.ok(await store.get('alice',id));assert.equal(await store.get('bob',id),null);assert.equal(await store.get('alice','../../.env'),null);
    await writeFile(path.join(dir,id+'.json'),JSON.stringify({owner:'alice',expires:Date.now()-1,size:3}));
    assert.equal(await store.get('alice',id),null);
    const big=await store.save('alice',{buffer:Buffer.alloc(3*1024*1024+1),image:{size_bytes:3*1024*1024+1}});
    assert.equal(big.image.encoding,'url');assert.equal(big.image.base64,undefined);
    assert.ok(await store.get('alice',new URL(big.image.url).searchParams.get('result')));
  }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
test('HD cancellation closes a browser that finishes launching late before the caller releases capacity',async()=>{
  let releaseLaunch,launchStarted,closed=false,proxyClosed=false;
  const controller=new AbortController();const started=new Promise(r=>launchStarted=r);
  const pending=upscaleImage({},4,{signal:controller.signal,proxyFactory:async()=>({url:'http://127.0.0.1:1',close:async()=>{proxyClosed=true;}}),browserFactory:async()=>({launch:{args:[]},chromium:{launch:()=>{launchStarted();return new Promise(r=>releaseLaunch=r);}}})});
  await started;controller.abort();
  let returned=false;pending.catch(()=>{returned=true;});await new Promise(r=>setImmediate(r));assert.equal(returned,false);
  releaseLaunch({close:async()=>{closed=true;}});
  await assert.rejects(pending,{code:'CANCELLED'});assert.equal(closed,true);assert.equal(proxyClosed,true);
});
