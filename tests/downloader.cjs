const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../脚本下载器.js'), 'utf8');
async function run({action=0, custom='', name, cancelOverwrite=false, status=200, code='// fixture code\nScript.complete();', old, cloud=false}={}) {
  const files = {}; if (old !== undefined) files['/scripts/联通余量.js'] = old;
  const requests=[], messages=[], writes=[]; let count=0;
  class Alert {
    constructor() {this.fields=[];}
    addAction() {} addDestructiveAction() {} addCancelAction() {}
    addTextField(hint, value='') {this.fields.push(value);}
    textFieldValue(i) {return this.title==='GitHub raw 链接'?custom:this.title==='保存脚本'&&name!==undefined?name:this.fields[i];}
    async presentSheet() {return action;}
    async presentAlert() {messages.push(this.title); return this.title==='更新已有脚本？'&&cancelOverwrite?-1:0;}
  }
  const manager={isFileStoredIniCloud:()=>cloud,joinPath:(a,b)=>a+'/'+b,fileExists:p=>p in files,libraryDirectory:()=>'/library',createDirectory:p=>{files[p]='directory';},readString:p=>files[p],writeString:(p,v)=>{files[p]=v;writes.push(p);},downloadFileFromiCloud:async()=>{}};
  class Request {constructor(url) {requests.push(url);this.response={statusCode:status};} async loadString(){return code;}}
  await vm.runInNewContext('(async()=>{'+source+'})()', {config:{runsInWidget:false},Alert,Request,module:{filename:'/scripts/脚本下载器.js'},FileManager:{local:()=>manager,iCloud:()=>manager},Script:{complete(){count++;}}});
  assert.equal(count,1);return {files,requests,messages,writes};
}
(async()=>{
 const saved=await run();assert.equal(saved.files['/scripts/联通余量.js'],'// fixture code\nScript.complete();');
 const updated=await run({old:'old',cloud:true});assert.equal(updated.files['/library/Scriptable下载器备份/联通余量.js.bak'],'old');
 const cancelled=await run({old:'old',cancelOverwrite:true});assert.equal(cancelled.files['/scripts/联通余量.js'],'old');assert.equal(cancelled.writes.length,0);
 const other=await run({action:1,custom:'https://raw.githubusercontent.com/example/scripts/main/demo.js',name:'自定义名字'});assert(other.files['/scripts/自定义名字.js']);
 const bad=await run({action:1,custom:'https://github.com/example/repo/blob/main/demo.js'});assert.equal(bad.requests.length,0);assert.equal(bad.writes.length,0);
 const html=await run({code:'<!doctype html><html>error</html>'});assert.equal(html.writes.length,0);
 const traversal=await run({name:'../other'});assert.equal(traversal.writes.length,0);
 const failure=await run({status:404,old:'old'});assert.equal(failure.files['/scripts/联通余量.js'],'old');
 const cancel=await run({action:-1});assert.equal(cancel.requests.length,0);
 console.log('PASS: raw installation, local/iCloud saving, backup, cancelled overwrite, invalid links/content, path traversal and HTTP failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
