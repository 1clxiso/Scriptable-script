const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../脚本下载器.js'), 'utf8');
async function run({action=0, custom='', name, cancelOverwrite=false, status=200, code='// fixture code\nScript.complete();', old, cloud=false, initial={}, sheets=[], cancelConfirm=false, failWrite=false}={}) {
  const files = {...initial}; if (old !== undefined) files['/scripts/联通余量.js'] = old;
  const requests=[], messages=[], writes=[], exports=[], previews=[]; let count=0;
  class Alert {
    constructor() {this.fields=[];}
    addAction() {} addDestructiveAction() {} addCancelAction() {}
    addTextField(hint, value='') {this.fields.push(value);}
    textFieldValue(i) {return this.title==='GitHub raw 链接'?custom:this.title==='保存脚本'&&name!==undefined?name:this.fields[i];}
    async presentSheet() {return this.title==='脚本下载器'?action:(sheets.length?sheets.shift():-1);}
    async presentAlert() {messages.push(this.title); return ((this.title==='更新已有脚本？'&&cancelOverwrite)||(cancelConfirm&&this.title!=='保存脚本'))?-1:0;}
  }
  const manager={isFileStoredIniCloud:()=>cloud,joinPath:(a,b)=>a+'/'+b,fileExists:p=>p in files||Object.keys(files).some(k=>k.startsWith(p+'/')),libraryDirectory:()=>'/library',createDirectory:p=>{files[p]='directory';},readString:p=>files[p],writeString:(p,v)=>{if(failWrite&&p==='/scripts/联通余量.js'&&v!==old)throw Error('disk');files[p]=v;writes.push(p);},listContents:p=>Object.keys(files).filter(k=>k.startsWith(p+'/')).map(k=>k.slice(p.length+1)),modificationDate:()=>new Date('2026-11-01T08:00:00Z'),fileSize:p=>Buffer.byteLength(files[p]),remove:p=>{delete files[p];},temporaryDirectory:()=>'/tmp',downloadFileFromiCloud:async()=>{}};
  class Request {constructor(url) {requests.push(url);this.response={statusCode:status};} async loadString(){return code;}}
  await vm.runInNewContext('(async()=>{'+source+'})()', {config:{runsInWidget:false},Alert,Request,QuickLook:{present:async v=>previews.push(v)},ShareSheet:{present:async v=>exports.push(v)},module:{filename:'/scripts/脚本下载器.js'},FileManager:{local:()=>manager,iCloud:()=>manager},Script:{complete(){count++;}}});
  assert.equal(count,1);return {files,requests,messages,writes,exports,previews};
}
(async()=>{
 const saved=await run();assert.equal(saved.files['/scripts/联通余量.js'],'// fixture code\nScript.complete();');
 const updated=await run({old:'old',cloud:true});assert(Object.entries(updated.files).some(([p,v])=>p.endsWith('.js.bak')&&v==='old'));
 const cancelled=await run({old:'old',cancelOverwrite:true});assert.equal(cancelled.files['/scripts/联通余量.js'],'old');assert.equal(cancelled.writes.length,0);
 const other=await run({action:1,custom:'https://raw.githubusercontent.com/example/scripts/main/demo.js',name:'自定义名字'});assert(other.files['/scripts/自定义名字.js']);
 const bad=await run({action:1,custom:'https://github.com/example/repo/blob/main/demo.js'});assert.equal(bad.requests.length,0);assert.equal(bad.writes.length,0);
 const html=await run({code:'<!doctype html><html>error</html>'});assert.equal(html.writes.length,0);
 const traversal=await run({name:'../other'});assert.equal(traversal.writes.length,0);
 const failure=await run({status:404,old:'old'});assert.equal(failure.files['/scripts/联通余量.js'],'old');
 const cancel=await run({action:-1});assert.equal(cancel.requests.length,0);
 const legacy='/library/Scriptable下载器备份/联通余量.js.bak';
 const preview=await run({action:2,initial:{[legacy]:'backup'},sheets:[0,0,-1]});assert.deepEqual(preview.previews,['backup']);assert.equal(preview.requests.length,0);
 const exported=await run({action:2,initial:{[legacy]:'backup'},sheets:[0,1,-1]});assert.equal(exported.files['/tmp/联通余量.js'],'backup');assert.equal(exported.exports.length,1);
 const restored=await run({action:2,old:'current',cloud:true,initial:{[legacy]:'backup'},sheets:[0,2,-1]});assert.equal(restored.files['/scripts/联通余量.js'],'backup');assert(Object.entries(restored.files).some(([p,v])=>p.endsWith('.bak')&&v==='current'));
 const failedRestore=await run({action:2,old:'current',failWrite:true,initial:{[legacy]:'backup'},sheets:[0,2]});assert.equal(failedRestore.files['/scripts/联通余量.js'],'current');assert(failedRestore.messages.includes('操作未完成'));
 const cancelledRestore=await run({action:2,old:'current',cancelConfirm:true,initial:{[legacy]:'backup'},sheets:[0,2,-1]});assert.equal(cancelledRestore.writes.length,0);
 const deleted=await run({action:2,initial:{[legacy]:'backup'},sheets:[0,3]});assert.equal(deleted.files[legacy],undefined);
 const cleared=await run({action:2,initial:{[legacy]:'backup','/library/Scriptable下载器备份/other.txt':'keep'},sheets:[1]});assert.equal(cleared.files[legacy],undefined);assert.equal(cleared.files['/library/Scriptable下载器备份/other.txt'],'keep');
 const cancelDelete=await run({action:2,cancelConfirm:true,initial:{[legacy]:'backup'},sheets:[0,3,-1]});assert.equal(cancelDelete.files[legacy],'backup');
 const initial={};for(let i=0;i<7;i++)initial['/library/Scriptable下载器备份/联通余量__2026010100000000'+i+'.js.bak']='v'+i;
 const retained=await run({old:'current',initial});assert.equal(Object.keys(retained.files).filter(p=>p.endsWith('.js.bak')).length,5);assert(Object.keys(retained.files).some(p=>p.includes('20260101000000006')));assert(!Object.keys(retained.files).some(p=>p.includes('20260101000000000')));
 console.log('PASS: install, validation, backup retention, legacy preview/export, local/iCloud restore, restore failure rollback, cancellation and deletion');
})().catch(e=>{console.error(e);process.exitCode=1;});
