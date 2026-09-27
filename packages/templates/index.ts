import type { TableTemplate, CardDefinition } from './types.js';
import type { Zone } from '../tabletop/types.js';
export type * from './types.js';

export const standardCards:CardDefinition[] = ['clubs','diamonds','hearts','spades'].flatMap(suit=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'].map(rank=>({id:`${rank}-${suit}`,rank,suit}))).concat([{id:'RJ',rank:'RJ',suit:'red'},{id:'BJ',rank:'BJ',suit:'black'}]);
const zone=(id:string,name:string,kind:Zone['kind'],visibility:Zone['visibility'],x:number,y:number,width:number,height:number,owner?:number):Zone=>({id,name,kind,visibility,x,y,width,height,...(owner===undefined?{}:{owner})});
const base:TableTemplate={schemaVersion:1,id:'blank',title:'Blank table',description:'A quiet surface for your own rules. Add pieces, import a deck, make it yours.',author:'Tabletop · original platform template',profile:'free',width:1400,height:850,seats:8,background:'#174b43',zones:[zone('table','Table','table','public',40,80,1320,620),...Array.from({length:8},(_,i)=>zone(`hand-${i}`,`Seat ${i+1} hand`,'hand','owner',80+i*160,740,150,100,i))],cards:[],decks:[],objects:[],setup:[],labels:[],seatLayout:Array.from({length:8},(_,seat)=>({seat,x:100+seat*160,y:800}))};
const standard:TableTemplate={...structuredClone(base),id:'standard-54',title:'The classic deck',description:'54 cards. Eight seats. Infinite house rules.',zones:[...base.zones,zone('deck','Draw pile','pile','hidden',90,280,100,145),zone('discard','Discard pile','pile','public',225,280,100,145)],cards:standardCards,decks:[{id:'standard',zone:'deck',cards:standardCards.map(c=>c.id)}],setup:[{op:'shuffle',zone:'deck'}]};
const lab:TableTemplate={...structuredClone(base),id:'counter-lab',title:'Counter & card studio',description:'An independently authored, reusable two-deck table with counters and a die. No game engine required.',author:'Tabletop · schema demonstration',seats:4,zones:[...base.zones.filter(z=>z.owner===undefined||z.owner<4),zone('deck','Supply','pile','hidden',100,250,110,160),zone('discard','Played cards','pile','public',260,250,110,160)],cards:[...standardCards,...standardCards.map(c=>({...c,id:`second-${c.id}`}))],decks:[{id:'double',zone:'deck',cards:[...standardCards.map(c=>c.id),...standardCards.map(c=>`second-${c.id}`)]}],objects:[{id:'round',kind:'counter',text:'Round',value:1,x:600,y:250,locked:false},{id:'die',kind:'dice',text:'D6',value:1,x:740,y:250,locked:false},{id:'note',kind:'note',text:'Write your house rules here.',value:0,x:600,y:420,locked:false}],setup:[{op:'shuffle',zone:'deck'}]};
function intrilex(core:boolean):TableTemplate {
 const zones:Zone[]=[zone('deck','Draw Pile · DP','pile','hidden',560,345,95,145),zone('graveyard','Graveyard · GY','pile','public',710,345,95,145),zone('table','Pending plays','table','public',880,330,380,150)];
 for(let p=0;p<2;p++) zones.push(zone(`hand-${p}`,`Player ${p+1} · Hand`,'hand','owner',240,p===0?740:10,930,100,p),zone(`pr-${p}`,`Player ${p+1} · Point Row`,'table','public',260,p===0?550:170,950,130,p),zone(`er-${p}`,`Player ${p+1} · Enduring Row`,'table','public',270,p===0?685:115,930,55,p));
 if(core) zones.push(zone('exile','Exile','pile','public',400,345,95,145),zone('swap','Swap Bar','table','public',65,320,285,160));
 return {...structuredClone(base),id:core?'intrilex-core':'intrilex-first-contact',title:core?'Intrilex · Core sandbox':'Intrilex · First Contact',description:core?'The full canonical layout, manually played. Core rules are references, not automated adjudication.':'A complete guided duel. Build 15 secured points and finish your turn.',author:'Intrilex rules supplied by Deffy · v4.3.1; platform layout original',profile:core?'intrilex-core':'intrilex-first-contact',seats:2,zones,cards:standardCards,decks:[{id:'intrilex',zone:'deck',cards:standardCards.map(c=>c.id)}],setup:[{op:'shuffle',zone:'deck'},{op:'deal',zone:'deck',target:'hand-0',count:5},{op:'deal',zone:'deck',target:'hand-1',count:6},...(core?[{op:'place' as const,zone:'deck',target:'swap',count:2,faceUp:false},{op:'place' as const,zone:'deck',target:'swap',count:1,faceUp:true}]:[])],objects:[0,1].flatMap(p=>[{id:`goal-${p}`,kind:'counter' as const,text:`Player ${p+1} Goal`,value:core?21:15,x:90,y:p===0?590:200,locked:false},...(core?[{id:`score-${p}`,kind:'counter' as const,text:`Player ${p+1} manual score`,value:0,x:90,y:p===0?650:260,locked:false}]:[])]),seatLayout:[{seat:0,x:700,y:810},{seat:1,x:700,y:40}],plugins:{intrilex:{rulesVersion:'4.3.1'}}};
}
export const builtInTemplates:TableTemplate[]=[intrilex(false),standard,intrilex(true),lab,base];
const fail=(message:string):never=>{throw new Error(`Template: ${message}`);};
const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:fail('expected an object');
const str=(v:unknown,max=160)=>typeof v==='string'&&v.length<=max?v:fail(`text must be at most ${max} characters`);
const num=(v:unknown,min=0,max=4000)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(`number must be between ${min} and ${max}`);
const arr=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max?v:fail(`list exceeds ${max} items or is missing`);
const id=(v:unknown)=>{const s=str(v,80);return /^[a-zA-Z0-9_-]+$/.test(s)?s:fail('IDs must contain only letters, digits, underscore or hyphen');};
function raster(v:unknown):string|undefined {
 if(v===undefined)return undefined;
 const s=str(v,1_400_000); const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);if(!m)fail('card faces must be embedded PNG, JPEG or WebP data');
 let b:string;try{b=atob(m![2]);}catch{ return fail('invalid image encoding'); }
 if(b.length>1_000_000||b.length<24)fail('image size is invalid');
 if(m![1]==='png' && !(b.slice(0,8)==='\x89PNG\r\n\x1a\n'&&b.slice(12,16)==='IHDR'))fail('invalid PNG contents');
 if(m![1]==='jpeg' && !(b.charCodeAt(0)===255&&b.charCodeAt(1)===216&&b.charCodeAt(b.length-2)===255&&b.charCodeAt(b.length-1)===217))fail('invalid JPEG contents');
 if(m![1]==='webp' && !(b.slice(0,4)==='RIFF'&&b.slice(8,12)==='WEBP'))fail('invalid WebP contents');
 if(m![1]==='png'){const n=(o:number)=>((b.charCodeAt(o)*16777216)+(b.charCodeAt(o+1)<<16)+(b.charCodeAt(o+2)<<8)+b.charCodeAt(o+3));if(n(16)<1||n(20)<1||n(16)>4096||n(20)>4096)fail('image dimensions exceed 4096 pixels');}
 return s;
}
export function validateTemplate(input:unknown):TableTemplate {
 if(JSON.stringify(input).length>5_000_000)fail('maximum file size is 5 MB');
 const v=record(input); if(v.schemaVersion!==1)fail('unsupported schemaVersion; expected 1');
 const seats=num(v.seats,2,8);if(!Number.isInteger(seats))fail('seat count must be an integer');
 const profile=v.profile;if(!['free','intrilex-core','intrilex-first-contact'].includes(String(profile)))fail('unknown rules profile');
 const zones=arr(v.zones,64).map(z=>{const o=record(z);if(!['table','hand','pile'].includes(String(o.kind))||!['public','owner','hidden'].includes(String(o.visibility)))fail('invalid zone kind or visibility');const owner=o.owner===undefined?undefined:num(o.owner,0,seats-1);if(owner!==undefined&&!Number.isInteger(owner))fail('invalid zone owner');if(o.visibility==='owner'&&owner===undefined)fail('private zone needs owner');return {id:id(o.id),name:str(o.name),kind:o.kind as Zone['kind'],visibility:o.visibility as Zone['visibility'],...(owner===undefined?{}:{owner}),x:num(o.x),y:num(o.y),width:num(o.width,30),height:num(o.height,30)};});
 const cards=arr(v.cards,216).map(c=>{const o=record(c);return{id:id(o.id),rank:str(o.rank,20),suit:str(o.suit,20),...(o.face?{face:raster(o.face)}:{})};});
 const unique=(xs:string[])=>{if(new Set(xs).size!==xs.length)fail('duplicate IDs');};unique(zones.map(z=>z.id));unique(cards.map(c=>c.id));
 const zoneIds=new Set(zones.map(z=>z.id)),cardIds=new Set(cards.map(c=>c.id));
 const decks=arr(v.decks,16).map(d=>{const o=record(d);const refs=arr(o.cards,216).map(id);if(!zoneIds.has(String(o.zone))||refs.some(c=>!cardIds.has(c)))fail('deck references missing cards or zones');return{id:id(o.id),zone:id(o.zone),cards:refs};});unique(decks.flatMap(d=>d.cards));if(decks.reduce((n,d)=>n+d.cards.length,0)!==cards.length)fail('every card must belong to exactly one starting deck');
 const objects=arr(v.objects,128).map(c=>{const o=record(c);if(!['counter','token','dice','note','label'].includes(String(o.kind)))fail('invalid component');return {id:id(o.id),kind:o.kind as TableTemplate['objects'][number]['kind'],text:str(o.text,2000),value:num(o.value,-999999,999999),x:num(o.x),y:num(o.y),locked:o.locked===true};});unique(objects.map(o=>o.id));
 const setup=arr(v.setup,128).map(c=>{const o=record(c);if(o.op==='initialize-counter'){if(!objects.some(c=>c.id===o.id))fail('counter not found');return{op:o.op,id:id(o.id),value:num(o.value,-999999,999999)};}
 if(!['shuffle','deal','place'].includes(String(o.op))||!zoneIds.has(String(o.zone)))fail('invalid setup operation or zone');if(o.op==='shuffle')return{op:o.op,zone:id(o.zone)};
 if(!zoneIds.has(String(o.target)))fail('setup target missing');const count=num(o.count,0,216);if(!Number.isInteger(count))fail('setup count must be integer');return {op:o.op as 'deal'|'place',zone:id(o.zone),target:id(o.target),count,...(o.op==='place'?{faceUp:o.faceUp===true}:{})};});
 const background=str(v.background??'#174b43',7);if(!/^#[\da-fA-F]{6}$/.test(background))fail('background must be a six-digit hex color');
 const result={schemaVersion:1,id:id(v.id),title:str(v.title),description:str(v.description,2000),author:str(v.author,500),profile,width:num(v.width,600,4000),height:num(v.height,400,4000),seats,zones,cards,decks,objects,setup,background,labels:arr(v.labels??[],64).map(l=>{const o=record(l);return{text:str(o.text),x:num(o.x),y:num(o.y)};}),seatLayout:arr(v.seatLayout??[],8).map(l=>{const o=record(l);return{seat:num(o.seat,0,seats-1),x:num(o.x),y:num(o.y)};})} as TableTemplate;
 if(profile!=='free'){if(seats!==2)fail('Intrilex requires two seats');result.plugins={intrilex:{rulesVersion:'4.3.1'}};}
 return result;
}
export function exportTemplate(template:TableTemplate):string{return JSON.stringify(validateTemplate(template),null,2);}
export function importTemplate(text:string):TableTemplate {if(text.length>5_000_000)fail('maximum file size is 5 MB');let v:unknown;try{v=JSON.parse(text);}catch{return fail('invalid JSON');}return {...validateTemplate(v),id:`custom-${crypto.randomUUID()}`};}
