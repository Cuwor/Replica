const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('./core.js');
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.listeners={};this.dataset={};this.attributes={};this.value='';this.textContent='';this.src='';this.currentTime=0;this.clientWidth=1200;this.clientHeight=900;this.height=20;this.style={removeProperty(key){delete this[key];}};const classes=new Set();this.classList={add(c){classes.add(c);},remove(c){classes.delete(c);},contains(c){return classes.has(c);},toggle(c){if(classes.has(c)){classes.delete(c);return false;}classes.add(c);return true;}};}
 append(...children){this.children.push(...children.flatMap(c=>c.tag==='fragment'?c.children:[c]));}
 replaceChildren(...children){this.children=[];this.append(...children);}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 fire(name,event={}){for(const fn of this.listeners[name]||[])fn({target:this,...event});}
 click(){this.fire('click');} setAttribute(k,v){this.attributes[k]=v;}
 removeAttribute(k){delete this.attributes[k];if(k==='src')this.src='';} pause(){} load(){} close(){} showModal(){}
 querySelectorAll(selector){return this.children.filter(c=>selector.startsWith('.')&&c.className===selector.slice(1));}
 querySelector(selector){return this.querySelectorAll(selector)[0];}
 focus(){} blur(){this.fire('blur');} scrollIntoView(){} remove(){}
 getBoundingClientRect(){return {width:this.clientWidth,height:this.height};}
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
 a.element('videoLink').value='https://drive.google.com/file/d/13U_RZh9cTNg8zdp99iLQLSnXNiN5L7GJ/view';a.element('useReplicaPlayer').checked=true;a.element('driveApiKey').value='test_key_Cuwor_12345678901234567890';a.element('openVideoLink').click();assert.equal(a.element('player').attributes.crossorigin,'anonymous');assert.equal(a.element('player').preload,'metadata');assert.equal(a.cues().length,1);a.element('videoFile').fire('change');assert.equal(a.element('player').attributes.crossorigin,undefined);
 a.element('useReplicaPlayer').checked=false;a.element('openVideoLink').click();assert.equal(a.element('drivePlayer').hidden,false);assert.equal(a.element('player').hidden,true);assert.equal(a.element('player').src,'');assert.equal(a.cues().length,1);a.element('cueList').children[0].fire('click',{target:{matches:()=>false}});assert.equal(new URL(a.element('drivePlayer').src).searchParams.get('t'),'12');a.element('videoFile').fire('change');assert.equal(a.element('drivePlayer').hidden,true);assert.equal(a.element('drivePlayer').src,'');assert.equal(a.element('player').hidden,false);
 const stage=a.element('videoDrop'),viewer=a.element('.viewer'),player=a.element('player');
 for(const [width,height] of [[1920,1080],[1440,1080],[1080,1920]]){
  player.videoWidth=width;player.videoHeight=height;a.element('wideVideo').click();
  const fittedWidth=parseFloat(stage.style.width),fittedHeight=parseFloat(stage.style.height);
  assert.ok(Math.abs(fittedWidth/fittedHeight-width/height)<1e-10);assert.ok(fittedWidth<=viewer.clientWidth);assert.ok(fittedHeight+100+200<=viewer.clientHeight);assert.equal(a.cues().length,1);
  a.element('wideVideo').click();assert.equal(stage.style.width,undefined);assert.equal(stage.style.height,undefined);
 }
 console.log('PASS new project without subtitles, start at zero or video position, editable actor/text, ASS export, reset and adding again');
})().catch(error=>{console.error(error);process.exitCode=1;});
