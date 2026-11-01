const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../联通余量.js'),'utf8');
async function run({remote=code.replace(/const SCRIPT_VERSION = '[0-9]{12}';/,"const SCRIPT_VERSION = '209901010000';"),status=200,cancel=false,cloud=false,failWrite=false}={}) {
 const target='/scripts/自定义联通名字.js', files={[target]:code}, alerts=[], requests=[], writes=[];let done=0,failed=false;
 class Alert {addAction(){}addDestructiveAction(){}addCancelAction(){}async presentSheet(){return 3;}async presentAlert(){alerts.push(this.title);return this.title==='发现新版本'&&cancel?-1:0;}}
 class Request {constructor(url){this.url=url;this.response={statusCode:status};requests.push(this);}async loadString(){return remote;}}
 const manager={isFileStoredIniCloud:()=>cloud,downloadFileFromiCloud:async()=>{},readString:p=>files[p],fileName:p=>path.basename(p),joinPath:(a,b)=>a+'/'+b,libraryDirectory:()=>'/library',fileExists:p=>p in files,createDirectory:p=>{files[p]='dir';},writeString:(p,s)=>{writes.push(p);if(failWrite&&p===target&&!failed){failed=true;throw Error('write failed');}files[p]=s;}};
 await vm.runInNewContext('(async()=>{'+code+'})()', {args:{queryParameters:{}},config:{runsInWidget:false},Alert,Request,module:{filename:target},FileManager:{local:()=>manager,iCloud:()=>manager},Keychain:{contains:()=>false,set:()=>{throw Error('updater must not touch Keychain');}},Script:{complete(){done++;}}});
 assert.equal(done,1);assert.equal(requests.length,1);assert(!requests[0].headers,'no Cookie or account headers sent to public GitHub');assert.equal(requests[0].onRedirect({}),null);
 return {files,alerts,writes,target};
}
(async()=>{
 const updated=await run();assert(updated.files[updated.target].includes("SCRIPT_VERSION = '209901010000'"));assert.equal(updated.files['/library/联通余量更新备份/自定义联通名字.js.bak'],code);assert(updated.alerts.includes('更新完成'));
 const cloud=await run({cloud:true});assert(cloud.alerts.includes('更新完成'));
 const same=await run({remote:code});assert(same.alerts.includes('已是最新版本'));assert.equal(same.writes.length,0);
 const cancelled=await run({cancel:true});assert.equal(cancelled.files[cancelled.target],code);assert.equal(cancelled.writes.length,0);
 for(const options of [{status:404},{remote:'<html>not a script</html>'},{remote:'// wrong script'}]){const result=await run(options);assert.equal(result.files[result.target],code);assert.equal(result.writes.length,0);assert(result.alerts.includes('检查或更新未完成'));}
 const restored=await run({failWrite:true});assert.equal(restored.files[restored.target],code);assert(restored.alerts.includes('检查或更新未完成'));
 console.log('PASS: newer/same version, backup, renamed script, local/iCloud, cancelled update, invalid download, write rollback and no credentials sent');
})().catch(e=>{console.error(e);process.exitCode=1;});
