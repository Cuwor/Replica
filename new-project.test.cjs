const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('./core.js');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.dataset={};this.attributes={};this.value='';this.textContent='';this.src='';this.currentTime=0;this.classList={add(){},remove(){},toggle(){}};}
 append(...children){this.children.push(...children.flatMap(c=>c.tag==='fragment'?c.children:[c]));}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 fire(name,event={}){for(const fn of this.listeners[name]||[])fn({target:this,...event});}
 click(){this.fire('click');} setAttribute(k,v){this.attributes[k]=v;}
 querySelectorAll(selector){return this.children.filter(c=>selector.startsWith('.')&&c.className===selector.slice(1));}
 querySelector(selector){return this.querySelectorAll(selector)[0];}
 focus(){} blur(){this.fire('blur');} scrollIntoView(){} remove(){}
 play(){return Promise.resolve();}
 addTextTrack(){return {cues:[],activeCues:[],addEventListener(){},addCue(c){this.cues.push(c);},removeCue(c){this.cues.splice(this.cues.indexOf(c),1);}};}
}
function app(){
 const ids=new Map(),element=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);},blobs=[];
 const downloads=['downloadAss','downloadSrt','downloadCsv'].map(element);downloads.forEach(b=>b.disabled=true);
 const document={getElementById:element,createElement:tag=>new Element(tag),createDocumentFragment:()=>new Element('fragment'),body:new Element(),querySelector:element,querySelectorAll:s=>s==='.downloads button'?downloads:[]};
 const context={Map,Set,ReplicaCore:C,document,window:{addEventListener(){}},Option:function(text,value){this.textContent=text;this.value=value;},VTTCue:function(start,end,text){Object.assign(this,{startTime:start,endTime:end,text});},Blob,URL:{createObjectURL(blob){blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},console};
 vm.runInNewContext(fs.readFileSync(require.resolve('./app.js'),'utf8'),context);
 return {element,blobs,cues:()=>JSON.parse(element('jsonView').textContent)};
}
(async()=>{
 let a=app();a.element('viewEdit').click();a.element('addCue').click();assert.deepEqual(a.cues(),[{start:'00:00:00,000',end:'00:00:04,000',actor:'',text:''}]);assert.equal(a.element('downloadAss').disabled,false);
 let row=a.element('cueList').children[0];let actor=row.querySelector('.actor-input'),text=row.querySelector('.phrase-input');actor.value='Cuwor';actor.fire('input');text.value='Первая реплика';text.fire('input');a.element('downloadAss').click();let parsed=C.parseAss(await a.blobs.at(-1).text());assert.equal(parsed.cues[0].text,'Первая реплика');assert.equal(parsed.cues[0].actor,'Cuwor');assert.equal(parsed.cues[0].start,0);
 a.element('addCue').click();assert.equal(a.cues()[1].start,'00:00:04,000');
 a.element('resetTimings').click();assert.equal(a.cues().length,0);a.element('addCue').click();assert.equal(a.cues()[0].start,'00:00:00,000');
 a=app();a.element('videoFile').files=[{name:'Серия.mp4'}];a.element('videoFile').fire('change');assert.equal(a.element('editActions').hidden,false);a.element('player').currentTime=12.345;a.element('addCue').click();assert.equal(a.element('filename').textContent,'Серия.ass');assert.deepEqual(a.cues(),[{start:'00:00:12,345',end:'00:00:16,345',actor:'',text:''}]);
 console.log('PASS new project without subtitles, start at zero or video position, editable actor/text, ASS export, reset and adding again');
})().catch(error=>{console.error(error);process.exitCode=1;});
