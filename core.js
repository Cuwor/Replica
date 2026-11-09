(function (scope) {
'use strict';
const clockPattern = '(?:\\d{1,4}:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?';
function milliseconds(value) {
 const source=String(value).trim();
 if(!new RegExp('^'+clockPattern+'$').test(source))throw new Error('Неверное время: '+source);
 const parts=source.replace(',','.').split(':').map(Number);
 if(parts.at(-1)>=60 || (parts.length===3 && parts[1]>=60))throw new Error('Неверное время: '+source);
 return Math.round(parts.reduce((sum,part)=>sum*60+part,0)*1000);
}
function timestamp(ms,format='srt') {
 if(!Number.isFinite(ms)||ms<0)throw new Error('Неверное время');
 const ticks=format==='ass'?Math.round(ms/10)*10:Math.round(ms);
 const h=Math.floor(ticks/3600000),m=Math.floor(ticks/60000)%60,s=Math.floor(ticks/1000)%60;
 const pad=n=>String(n).padStart(2,'0');
 return (format==='ass'?h:pad(h))+':'+pad(m)+':'+pad(s)+(format==='ass'?'.'+pad(Math.floor(ticks%1000/10)):(format==='vtt'?'.':',')+String(ticks%1000).padStart(3,'0'));
}
function displayText(text) {return String(text).replace(/\{[^}]*\}/g,'').replace(/\\[Nn]/g,'\n').replace(/\\h/g,'\u00a0');}
function actors(name) {return String(name).split(/\s*[;,|/]\s*/).map(x=>x.trim()).filter(Boolean);}
const actorKey=name=>String(name).trim().replace(/^@/,'').toLocaleLowerCase('ru');
function containsActor(group,actor){return actors(group).some(name=>actorKey(name)===actorKey(actor));}
function actorIndex(cues) {
 const map=new Map();
 for(const cue of cues)for(const key of new Set(actors(cue.actor).map(actorKey))) {
  if(!map.has(key))map.set(key,{key,name:actors(cue.actor).find(x=>actorKey(x)===key),count:0});map.get(key).count++;
 }
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
}
function splitFields(value,length) {
 const result=[];let position=0;
 for(let i=0;i<length-1;i++){const comma=value.indexOf(',',position);if(comma<0)throw new Error('Недостаточно полей в Dialogue');result.push(value.slice(position,comma));position=comma+1;}
 result.push(value.slice(position));return result;
}
function parseAss(source,name='subtitles.ass') {
 const lines=String(source).split(/\r\n|\n|\r/);const eol=source.includes('\r\n')?'\r\n':'\n';
 let section='',format=null;const cues=[],warnings=[],dialogueLines=[];
 for(let i=0;i<lines.length;i++){
  const line=lines[i].replace(/^\uFEFF/,'');const heading=line.trim().match(/^\[([^\]]+)\]$/);
  if(heading){section=heading[1].toLowerCase();format=null;continue;}if(section!=='events')continue;
  const fields=line.match(/^\s*Format\s*:(.*)$/i);if(fields){format=fields[1].split(',').map(x=>x.trim().toLowerCase());continue;}
  const match=line.match(/^\s*Dialogue\s*:(.*)$/i);if(!match)continue;dialogueLines.push(i);
  try {
   const layout=format||['layer','start','end','style','name','marginl','marginr','marginv','effect','text'];
   if(layout.at(-1)!=='text')throw new Error('Поле Text должно быть последним');
   const values=splitFields(match[1],layout.length),get=key=>values[layout.indexOf(key)]?.trim()||'';
   const start=milliseconds(get('start')),end=milliseconds(get('end'));if(end<start)throw new Error('Конец раньше начала');
   const actor=get('name')||get('actor'),text=values.at(-1);
   cues.push({id:'l'+i,start,end,actor,text:displayText(text),rawText:text,line:i,sourceFields:values,timeColumns:{start:layout.indexOf('start'),end:layout.indexOf('end')},actorColumns:layout.map((key,index)=>key==='name'||key==='actor'?index:-1).filter(index=>index>=0)});
  }catch(error){warnings.push('Строка '+(i+1)+': '+error.message);}
 }
 if(!cues.length)throw new Error('В ASS/SSA не найдено читаемых реплик Dialogue.');
 // Ordinary file import never sorts, clips, or regenerates the original dialogue lines.
 return {kind:'ass',format:/\.ssa$/i.test(name)?'SSA':'ASS',name,cues,lines,eol,source,dialogueLines,warnings};
}
function parseTimed(source,name='subtitles.srt') {
 const lines=String(source).replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
 const range=new RegExp('^\\s*('+clockPattern+')\\s*-->\\s*('+clockPattern+')(?:(?:[ \\t]+)(.*))?$');const cues=[],warnings=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(range);if(!match)continue;
  let text=[];const line=i+1;const tail=(match[3]||'').trim();if(tail&&!/^(?:align|line|position|size|vertical):/.test(tail))text.push(tail);
  while(i+1<lines.length && lines[i+1].trim() && !range.test(lines[i+1]) && !(/^\d+$/.test(lines[i+1].trim())&&range.test(lines[i+2]||'')))text.push(lines[++i]);
  try {const start=milliseconds(match[1]),end=milliseconds(match[2]);if(end<start)throw new Error('Конец раньше начала');cues.push({id:'c'+cues.length,start,end,actor:'',text:text.join('\n')});}catch(error){warnings.push('Строка '+line+': '+error.message);}
 }
 if(!cues.length)throw new Error('В файле не найдены интервалы SRT/VTT.');
 return {kind:'timed',format:/^\uFEFF?WEBVTT/.test(source)?'VTT':'SRT',name,cues,warnings};
}
function readDocument(source,name='subtitles.ass') {
 return /\[Events\]/i.test(source)?parseAss(source,name):parseTimed(source,name);
}
function fromText(source,options={}) {
 const duration=Number(options.duration??4);if(!Number.isFinite(duration)||duration<=0)throw new Error('Длительность должна быть больше нуля.');
 const cues=[],warnings=[];let pending=null,metadata=false;
 const re=new RegExp('^\\s*(?:[-*•]\\s*)?(?:\\d+[.)]\\s+)?\\[?('+clockPattern+')\\]?(?:\\s*(?:--?>|→|—|–|-)\\s*('+clockPattern+'))?\\s*(?:[|:—–-]\\s*)?(.*)$');
 const lines=String(source).replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n');
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(!line.trim()){metadata=false;continue;}
  if(/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(line)){metadata=true;continue;}if(metadata)continue;
  if(/^\d+$/.test(line.trim())&&re.test(lines[i+1]||''))continue;
  const m=line.match(re);
  if(m){try {
   const start=milliseconds(m[1]),end=m[2]&&!options.forceDuration?milliseconds(m[2]):start+Math.round(duration*1000);
   if(end<=start)throw new Error('Конец должен быть позже начала');
   pending={id:'t'+i,start,end,actor:'',text:m[3].replace(/^(?:align|line|position|size|vertical):.*$/,'').trim()};cues.push(pending);
  }catch(error){warnings.push('Строка '+(i+1)+': '+error.message);pending=null;}}
  else if(/^\s*\[?\d[^\s]*:/.test(line)){warnings.push('Строка '+(i+1)+': не удалось прочитать время');pending=null;}
  else if(pending)pending.text+=(pending.text?'\n':'')+line.trim();
  else warnings.push('Строка '+(i+1)+': текст без времени');
 }
 const ordered=cues.filter(c=>{if(c.text)return true;warnings.push('Пустая реплика: '+timestamp(c.start));return false;}).sort((a,b)=>a.start-b.start);
 let clipped=0;
 for(let i=0;i+1<ordered.length;i++)if(ordered[i].end>ordered[i+1].start){ordered[i].end=ordered[i+1].start;clipped++;}
 const valid=ordered.filter(c=>{if(c.end>c.start)return true;warnings.push('Пропущена реплика с тем же началом: '+timestamp(c.start));return false;});
 if(options.speakers!==false)for(const c of valid){const m=c.text.match(/^([^:\n]{1,80}):[ \t]+([\s\S]+)$/);if(m&&/\p{L}/u.test(m[1])){c.actor=m[1].trim();c.text=m[2];}}
 if(!valid.length)throw new Error('Реплики не найдены. Формат: 00:12 Текст реплики.');
 return {kind:'text',name:'replicas.ass',cues:valid,warnings,clipped};
}
function openSource(source,name,options={}) {
 if(/\.csv$/i.test(name||''))return {...fromRegions(source),name};
 if(/\[Events\]/i.test(source))return parseAss(source,name);
 if(new RegExp('^\\s*'+clockPattern+'\\s*-->','m').test(source)&&!options.forceDuration)return parseTimed(source,name);
 return {...fromText(source,options),name:name||'replicas.ass'};
}
function applyAssignments(cues,assignments) {
 const find=key=>assignments instanceof Map?assignments.get(key):assignments[key];
 return cues.map(c=>{
  const parts=actors(c.actor),names=parts.length?parts:[''];let edited=false;const kept=[],targets=[];
  for(const name of names){const assignment=find(actorKey(name));if(assignment){edited=true;targets.push(...actors(assignment.actor));if(assignment.keepCharacter&&name)kept.push(name);}else targets.push(name);}
  if(!edited)return c;
  const uniqueTargets=[...new Map(targets.map(name=>[actorKey(name),name])).values()];const prefix=kept.length?'['+kept.join('; ')+'] ':'';
  return {...c,sourceActor:c.actor,actor:uniqueTargets.join('; '),text:prefix+c.text,assigned:true,assignedRawText:prefix+(c.rawText??c.text.replace(/\n/g,'\\N'))};
 });
}
function applyTimings(cues,edits){
 return cues.map(c=>{const edit=edits instanceof Map?edits.get(c.id):edits[c.id];if(!edit)return c;if(!Number.isFinite(edit.start)||!Number.isFinite(edit.end)||edit.start<0||edit.end<=edit.start)throw new Error('Конец должен быть позже начала.');return {...c,start:edit.start,end:edit.end,timingEdited:true};});
}
function applyCueEdits(cues,edits){
 return cues.map(c=>{const edit=edits instanceof Map?edits.get(c.id):edits[c.id];if(!edit)return c;const out={...c};if(Object.hasOwn(edit,'actor')){if(typeof edit.actor!=='string'||/[\r\n,]/.test(edit.actor))throw new Error('В имени актёра нельзя использовать запятую или перенос строки.');if(c.sourceFields&&!c.actorColumns.length&&edit.actor!==c.actor)throw new Error('В файле нет поля для имени актёра.');out.actor=edit.actor;out.actorEdited=true;}if(Object.hasOwn(edit,'text')){if(typeof edit.text!=='string')throw new Error('Реплика должна быть текстом.');out.text=edit.text;out.textEdited=true;const tags=(c.rawText||'').match(/^(?:\{[^}]*\})+/)?.[0]||'';out.editedRawText=tags+edit.text.replace(/\r?\n/g,'\\N');}return out;});
}
function srt(cues){return cues.map((c,i)=>`${i+1}\n${timestamp(c.start)} --> ${timestamp(c.end)}\n${c.text}`).join('\n\n')+'\n';}
function vtt(cues){return 'WEBVTT\n\n'+cues.map(c=>`${timestamp(c.start,'vtt')} --> ${timestamp(c.end,'vtt')}\n${c.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}`).join('\n\n')+'\n';}
function ass(document,cues=document.cues){
 if(document.kind==='ass'){
  if(cues.length===document.cues.length&&cues.every((c,i)=>c.id===document.cues[i].id&&!c.assigned&&!c.timingEdited&&!c.actorEdited&&!c.textEdited))return document.source;
  const template=document.cues[0];
  const encode=cue=>{const fresh=cue.line===undefined,base=fresh?template:cue;if(!fresh&&!cue.assigned&&!cue.timingEdited&&!cue.actorEdited&&!cue.textEdited)return document.lines[cue.line];const values=[...base.sourceFields];if(fresh||cue.assigned||cue.actorEdited)for(const column of base.actorColumns){const old=values[column];values[column]=(old.match(/^\s*/)?.[0]||'')+cue.actor+(old.match(/\s*$/)?.[0]||'');}if(cue.textEdited)values[values.length-1]=cue.editedRawText;else if(cue.assigned)values[values.length-1]=cue.assignedRawText;else if(fresh)values[values.length-1]=cue.text.replace(/\r?\n/g,'\\N');if(fresh||cue.timingEdited)for(const key of ['start','end']){const column=base.timeColumns[key],old=values[column];values[column]=(old.match(/^\s*/)?.[0]||'')+timestamp(cue[key],'ass')+(old.match(/\s*$/)?.[0]||'');}const original=document.lines[base.line];return original.slice(0,original.indexOf(':')+1)+values.join(',');};
  const chosen=new Map(cues.map(c=>[c.id,c])),originalOrder=document.cues.filter(c=>chosen.has(c.id)).map(c=>c.id),reflow=cues.some(c=>c.line===undefined)||cues.some((c,i)=>c.id!==originalOrder[i]);const byLine=new Map(document.cues.map(c=>[c.line,c.id])),dialogue=new Set(document.dialogueLines),last=Math.max(...document.dialogueLines);let next=0;
  return document.lines.flatMap((line,i)=>{if(!dialogue.has(i))return [line];if(!reflow){const cue=chosen.get(byLine.get(i));return cue?[encode(cue)]:[];}const result=next<cues.length?[encode(cues[next++])]:[];if(i===last)while(next<cues.length)result.push(encode(cues[next++]));return result;}).join(document.eol);
 }
 const header='[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
 return header+cues.map(c=>'Dialogue: 0,'+timestamp(c.start,'ass')+','+timestamp(c.end,'ass')+',Default,'+c.actor.replace(/,/g,';')+',0,0,0,,'+c.text.replace(/\r?\n/g,'\\N')).join('\n')+'\n';
}

function driveVideoLink(value){
 let url;try{url=new URL(value);}catch{throw new Error('Вставьте ссылку на видео в Google Drive.');}
 if(url.protocol!=='https:'||url.hostname!=='drive.google.com'||url.username||url.password||url.port)throw new Error('Нужна ссылка https://drive.google.com/file/d/…');
 const id=url.pathname.match(/^\/file\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/)?.[1]||(/^\/(?:open|uc)$/.test(url.pathname)?url.searchParams.get('id'):null);
 if(!id||!/^[-\w]{10,200}$/.test(id))throw new Error('Не удалось найти файл в ссылке Google Drive.');
 return {id,key:url.searchParams.get('resourcekey')};
}
function drivePreviewUrl(value,seconds,autoplay=false){const {id,key}=driveVideoLink(value);const out=new URL('https://drive.google.com/file/d/'+id+'/preview');if(key&&/^[-\w]{1,200}$/.test(key))out.searchParams.set('resourcekey',key);if(seconds!==undefined){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Неверное время видео.');out.searchParams.set('t',String(Math.floor(seconds)));}if(autoplay)out.searchParams.set('autoplay','1');return out.href;}
function driveVideoUrl(value,apiKey){
 const {id,key}=driveVideoLink(value);
 if(!apiKey||!/^[-\w]{20,200}$/.test(apiKey.trim()))throw new Error('Введите ключ Google Drive API для подключения видео.');
 const out=new URL('https://www.googleapis.com/drive/v3/files/'+id);out.searchParams.set('alt','media');out.searchParams.set('key',apiKey.trim());
 if(key&&/^[-\w]{1,200}$/.test(key))out.searchParams.set('resourcekey',key);
 return out.href;
}
function googleUrl(value){
 let url;try{url=new URL(value);}catch{throw new Error('Вставьте полную ссылку на Google Docs.');}
 if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.username||url.password||url.port)throw new Error('Поддерживаются ссылки https://docs.google.com/document/d/…');
 const m=url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/|$)/);if(!m)throw new Error('Не удалось найти ID документа.');
 const out=new URL('https://docs.google.com/document/d/'+m[1]+'/export');out.searchParams.set('format','txt');const tab=url.searchParams.get('tab')||new URLSearchParams(url.hash.slice(1)).get('tab');if(tab&&/^t\.[\w-]+$/.test(tab))out.searchParams.set('tab',tab);return out.href;
}
const csvCell=value=>'"'+String(value).replace(/"/g,'""')+'"';
function regions(cues){return '#,Name,Start,End,Length,Color\r\n'+cues.map((c,i)=>['R'+(i+1),csvCell(c.text.replace(/\n/g,' ')),timestamp(c.start,'vtt'),timestamp(c.end,'vtt'),timestamp(c.end-c.start,'vtt'),''].join(',')).join('\r\n')+'\r\n';}
function csv(cues,getColor=()=> ''){return '#,Name,Start,End,Length,Color,Actor\r\n'+cues.map((c,i)=>['R'+(i+1),csvCell(c.text),timestamp(c.start,'vtt'),timestamp(c.end,'vtt'),timestamp(c.end-c.start,'vtt'),String(getColor(c.actor)||c.color||'').replace(/^#/,''),csvCell(c.actor)].join(',')).join('\r\n')+'\r\n';}
function csvRows(text){
 const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(quoted)throw new Error('Незакрытая кавычка в CSV');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
function fromRegions(source,mode='time',duration=4){
 const rows=csvRows(source.replace(/^\uFEFF/,'')),header=rows.shift()?.map(x=>x.trim().toLowerCase())||[];const startCol=header.indexOf('start'),endCol=header.indexOf('end'),nameCol=header.indexOf('name'),textCol=header.indexOf('text'),actorCol=header.indexOf('actor'),colorCol=header.indexOf('color');
 if(startCol<0||(nameCol<0&&textCol<0))throw new Error('CSV должен содержать Start и Name или Text.');
 const parseValue=value=>{const s=String(value).trim();if(mode==='beats'){const m=s.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);if(!m)throw new Error('Ожидается такт.доля.сотые при 120 BPM');return Math.round(((Number(m[1])-1)*4+(Number(m[2])-1)+Number('0.'+(m[3]||'0')))*500);}return s.includes(':')?milliseconds(s):Math.round(Number(s)*1000);};
 const cues=[],warnings=[];rows.forEach((r,i)=>{try{const start=parseValue(r[startCol]),end=endCol>=0&&r[endCol]?.trim()?parseValue(r[endCol]):start+duration*1000;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start)throw new Error('Неверный интервал');cues.push({id:'r'+i,start,end,actor:actorCol>=0?r[actorCol]||'':'',text:r[textCol>=0?textCol:nameCol]||'',color:colorCol>=0&&/^#?[0-9a-f]{6}$/i.test(r[colorCol]?.trim())?'#'+r[colorCol].trim().replace(/^#/,''):''});}catch(e){warnings.push('Строка '+(i+2)+': '+e.message);}});
 if(!cues.length)throw new Error('В CSV нет подходящих регионов.');return {kind:'regions',format:'CSV',name:'regions.csv',cues,warnings};
}
const api={milliseconds,timestamp,actors,actorKey,containsActor,actorIndex,parseAss,parseTimed,readDocument,openSource,fromText,applyAssignments,applyTimings,applyCueEdits,srt,vtt,ass,googleUrl,driveVideoUrl,drivePreviewUrl,regions,csv,fromRegions,displayText};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else scope.ReplicaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
