// Runs the production sync/storage functions with deterministic clocks and fault injection. No real account is used.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const { test } = require('node:test');
const html=fs.readFileSync(process.env.SYNC_SOURCE || __dirname+'/../index.html','utf8');
const part=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start);return html.slice(start,end)};
function env(){
 const c=vm.createContext({console,setTimeout:()=>1,clearTimeout(){},Date});
 vm.runInContext(`
  const window={addEventListener(){}}, document={addEventListener(){},getElementById(){return null}}, navigator={onLine:true};
  const localStorage={getItem(){return null},setItem(){},removeItem(){}};
  let STORE_UID='user1',LEAVING=false,flushing=null;
  const S={profiles:[{id:'prof1',prem:{body:{shots:[]}}}],activeId:'prof1',logs:{},mode:'browser'}, UI={},CRY={};
  const SB_CACHE='cache',SB_URL='',SB_KEY='',dirty=new Set(),ID_RE=/^[a-z0-9]{4,32}$/i;
  const monthOf=d=>d.slice(0,7), num=(v,lo,hi)=>typeof v==='number'&&v>=lo&&v<=hi?v:null;
  function cleanLog(x){return {meals:[],workouts:[],weights:[],snacks:[],drinks:[],vitals:{},...x}}
  function logFor(p,m){return (S.logs[p]||={})[m]||=(cleanLog({}))}
  function toast(){} function logIdxDrop(){} function render(){} function schedule(){} function markLog(){} function markRoot(){} function markAll(){} function sbPaint(){}
  async function flush(){return true} async function sbShrink(){return {}}
 `,c);
 vm.runInContext(part('const SB = {','function sbStatusText(){'),c);
 vm.runInContext(`sbShrink=async()=>({}); SB.user={id:'user1'};SB.started=SB.kstarted=true;SB.people.set('prof1','person1');`,c);
 return {c,run:s=>vm.runInContext(s,c)};
}
function fixture(h,photo=false){h.run(`
 const entry={id:'entry1',date:'2026-10-12',type:'strength',minutes:88,cal:120,note:'test',photo:${photo?"'local-new-photo'":"null"},pv:${photo?"'oldver'":"undefined"},pt:${photo?"sbHash('old-photo')":"undefined"}};
 logFor('prof1','2026-10').workouts=[entry];sbKindsBaseline();
 SB.kp.workouts.pend.entry1='up'; SB.kp.workouts.t.entry1=100;
 const row={...SB_KINDS.workouts.row({...entry,minutes:30},'person1'),updated_at:new Date(200).toISOString(),photo_path:${photo?"'user1/person1/workouts/entry1.jpg#remote-new-version'":"null"}};
 const pulled={full:true,max:row.updated_at,list:[{pid:'prof1',row}]};
 `)}
test('an acknowledged older upload cannot overwrite a newer pending edit after queue restore',()=>{
 const h=env();fixture(h);
 h.run(`sbOwn(SB.kp.workouts.own,'entry1',row);S.kpSaved=sbKindsClean(JSON.parse(JSON.stringify(sbKindsSave())));sbKindsRestore();sbApplyKind('workouts',pulled)`);
 assert.equal(h.run(`logFor('prof1','2026-10').workouts[0].minutes`),88);
 assert.equal(h.run(`SB.kp.workouts.pend.entry1`),'up');
 // A genuinely later foreign write still wins.
 h.run(`row.updated_at=new Date(300).toISOString();sbApplyKind('workouts',pulled)`);
 assert.equal(h.run(`logFor('prof1','2026-10').workouts[0].minutes`),30);
 assert.equal(h.run(`SB.kp.workouts.pend.entry1`),undefined);
});
test('meal and profile own-write timestamps survive both cache and encrypted queue restoration',()=>{
 for(const locked of [false,true]){
  const h=env();h.run(`CRY.lock=${locked?'{}':'null'};SB.pend.meal1='up';SB.pt.meal1=100;SB.ppend.prof1='up';SB.ppt.prof1=100;sbOwn(SB.mown,'meal1',{updated_at:new Date(200).toISOString()});sbOwn(SB.pown,'prof1',{updated_at:new Date(200).toISOString()});`);
  if(!locked)h.run(`let cache;localStorage.setItem=(k,v)=>{cache=JSON.parse(v)};SB.cacheDirty=true;sbCacheSave();SB.mown.clear();SB.pown.clear();sbLoadCache(cache);`);
  h.run(`S.kpSaved=sbKindsClean(JSON.parse(JSON.stringify(sbKindsSave())));sbKindsRestore();`);
  assert.equal(h.run(`sbForeign(SB.mown,'meal1',200)`),false);
  assert.equal(h.run(`sbForeign(SB.pown,'prof1',200)`),false);
 }
});
test('session expiry preserves encrypted meal deletion and profile edit, with their original timestamps',()=>{
 const h=env();h.run(`CRY.lock={};CRY.key={};SB.pend.meal1='del';SB.pt.meal1=100;SB.ppend.prof1='up';SB.ppt.prof1=101;SB.user=null;sbSessionLost();S.kpSaved=sbKindsClean(JSON.parse(JSON.stringify(sbKindsSave())));SB.user={id:'user1'};sbKindsRestore();`);
 assert.equal(h.run(`SB.pend.meal1`),'del');assert.equal(h.run(`SB.pt.meal1`),100);
 assert.equal(h.run(`SB.ppend.prof1`),'up');assert.equal(h.run(`SB.ppt.prof1`),101);
});
test('a winning account row replaces a rejected local photo and queues its download',()=>{
 const h=env();fixture(h,true);h.run(`sbApplyKind('workouts',pulled)`);
 assert.equal(h.run(`SB.kp.workouts.pend.entry1`),undefined);
 assert.equal(h.run(`logFor('prof1','2026-10').workouts[0].photo`),null);
 assert.equal(h.run(`SB.kp.workouts.need.has('entry1')`),true);
});
test('four failed photo uploads remain pending and warn before sign-out; recovery clears the queue',async()=>{
 const h=env();fixture(h,true);
 h.run(`let failUpload=true;SB.client={from(){let payload,op='select';const q={select(){return q},in(){return q},upsert(p){payload=p;op='upsert';return q},then(resolve){return Promise.resolve({error:null,data:op==='select'?[]:payload.map(x=>({...x,updated_at:new Date(200).toISOString()}))}).then(resolve)}};return q},storage:{from(){return{upload:async()=>({error:failUpload?{statusCode:'500'}:null})}}}};`);
 for(let i=0;i<4;i++)await h.run(`sbPushKinds()`);
 assert.equal(h.run(`SB.kp.workouts.pend.entry1`),'up');
 assert.ok(h.run(`sbLocalOnly().length`)>0);
 h.run(`failUpload=false`);await h.run(`sbPushKinds()`);
 assert.equal(h.run(`SB.kp.workouts.pend.entry1`),undefined);
 assert.equal(h.run(`sbLocalOnly().length`),0);
});
test('storage failure keeps dirty work and stops uploads until a durable retry succeeds',async()=>{
 const h=env();h.run(`function lsGet(){return null}let writeCount=0,blocked=true;function lsSet(){writeCount++;return !blocked}async function pack(x){return x}function paintSaveState(){}sbSweep=()=>0;sbCacheSave=()=>true;`);
 vm.runInContext(part('function flush(){','// =================== ACCOUNT + MEAL SYNC'),h.c);
 h.run(`dirty.add('root')`);await h.run(`flush()`);
 assert.equal(h.run(`S.saveState`),'error');assert.equal(h.run(`dirty.has('root')`),true);
 h.run(`blocked=false`);await h.run(`flush()`);
 assert.equal(h.run(`writeCount`),2);assert.equal(h.run(`dirty.size`),0);
});
test('encryption failure neither writes a partial snapshot nor discards dirty work',async()=>{
 const h=env();h.run(`function lsGet(){return null}let writeCount=0;function lsSet(){writeCount++;return true}async function pack(){throw new Error('encrypt failed')}function paintSaveState(){}sbSweep=()=>0;sbCacheSave=()=>true;`);
 vm.runInContext(part('function flush(){','// =================== ACCOUNT + MEAL SYNC'),h.c);
 h.run(`dirty.add('root')`);await assert.rejects(h.run(`sbPersistNow()`),/could not be saved/);
 assert.equal(h.run(`writeCount`),0);assert.equal(h.run(`dirty.has('root')`),true);
});
test('a failed meal-cache write stops the upload barrier even when the root save succeeds',async()=>{
 const h=env();h.run(`sbCacheSave=()=>false`);
 await assert.rejects(h.run(`sbPersistNow()`),/could not be saved/);
});
