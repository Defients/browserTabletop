import type { Rank,Suit,GameCard,GameAction,StackItem,Choice,GameState,GameView } from './types.js';
export type * from './types.js';
export const ranks:Rank[]=['A','2','3','4','5','6','7','8','9','10','J','Q','K','RJ','BJ'];
const suits:Suit[]=['♣','♦','♥','♠'];
const refs={turn:'§4 / §27.15.3–6',score:'§8 / §27.15.3',scuttle:'§19',stack:'§6–7',guard:'§13',exhausted:'§22',profile:'§27.15.7'};
const act=(type:string,label:string,ruleRef:string,extra:Partial<GameAction>={}):GameAction=>({type,label,ruleRef,...extra});
export const cardName=(c:GameCard)=>c.rank==='RJ'?'Red Joker':c.rank==='BJ'?'Black Joker':`${c.rank}${c.suit}`;
export const pointValue=(c:GameCard)=>({A:4,J:3,Q:2,K:8,RJ:5,BJ:11}[c.rank]??Number(c.rank));
const opp=(p:number)=>1-p;
const clone=<T>(s:T):T=>structuredClone(s);
function secureRandom(){const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0]!/4294967296;}
function shuffle<T>(a:T[],random:()=>number){for(let i=a.length-1;i>0;i--){const j=Math.min(i,Math.floor(random()*(i+1)));[a[i],a[j]]=[a[j]!,a[i]!];}}
export function createGame(options:{random?:()=>number;firstPlayer?:number}={}):GameState{
 const random=options.random??secureRandom;const first=options.firstPlayer??(random()<.5?0:1);if(first!==0&&first!==1)throw Error('First player must be 0 or 1.');
 const deck:GameCard[]=ranks.flatMap(rank=>rank==='RJ'||rank==='BJ'?[{id:`c-${rank}`,rank,suit:'joker' as Suit,owner:-1}]:suits.map(suit=>({id:`c-${rank}-${suit}`,rank,suit,owner:-1})));
 shuffle(deck,random);const players=[0,1].map(()=>({hand:[] as GameCard[],pr:[] as GameCard[],er:[] as GameCard[],goal:15,quick2:false,disrupted:[] as string[]}));
 for(const p of [first,opp(first)])for(let n=0;n<(p===first?5:6);n++){const c=deck.shift()!;c.owner=p;players[p]!.hand.push(c);}
 return {version:1,profile:'intrilex-first-contact',players,deck,graveyard:[],activePlayer:first,phase:'action',miniTurns:1,turn:1,stack:[],priority:first,declines:0,choice:null,boardLock:null,exhausted:null,winner:null,history:['First Contact: 54 cards, hands 5/6, Goal 15. No Swap Bar or Exile.'],sequence:0,events:[]};
}
const all=(s:GameState)=>s.players.flatMap((p,player)=>[...p.pr.map(card=>({card,player,row:'pr' as const})),...p.er.map(card=>({card,player,row:'er' as const}))]);
const locate=(s:GameState,id:string|undefined)=>all(s).find(v=>v.card.id===id);
export function score(s:GameState,p:number){return s.players[p]!.pr.reduce((n,c)=>n+(c.tapped?0:pointValue(c)+(s.players[p]!.er.some(j=>j.hostId===c.id&&!j.tapped)?1:0)),0);}
function guarded(s:GameState,p:number,c?:GameCard){return s.players[p]!.er.some(q=>q.rank==='Q'&&!q.tapped&&q.id!==c?.id);}
function targetable(s:GameState,p:number,id:string|undefined){const v=locate(s,id);if(!v)return false;if(v.row==='pr'&&!v.card.tapped&&['4','8'].includes(v.card.rank))return false;return v.player===p||!guarded(s,v.player,v.card);}
function canScuttle(s:GameState,p:number,c:GameCard,t:GameCard){if(s.players[p]!.pr.some(x=>x.id===t.id))return false;if(!t.tapped&&['A','5','RJ','BJ'].includes(t.rank))return false;return ranks.indexOf(c.rank)>ranks.indexOf(t.rank)||(c.rank===t.rank&&suits.indexOf(c.suit)>suits.indexOf(t.suit));}
function moveHand(s:GameState,p:number,c:GameCard){delete c.tapped;delete c.hostId;if(c.owner<0)c.owner=p;s.players[p]!.hand.push(c);}
function draw(s:GameState,p:number,n:number){for(let i=0;i<n&&s.deck.length;i++)moveHand(s,p,s.deck.shift()!);}
function scrap(s:GameState,c:GameCard){delete c.tapped;delete c.hostId;s.graveyard.push(c);}
function removeBoard(s:GameState,id:string){const v=locate(s,id);if(!v)return null;s.players[v.player]![v.row]=s.players[v.player]![v.row].filter(c=>c.id!==id);return v.card;}
function attachments(s:GameState){for(const v of [...all(s)])if(v.card.hostId){const host=locate(s,v.card.hostId);if(!host||host.row!=='pr'||host.player!==v.player){const j=removeBoard(s,v.card.id);if(j)scrap(s,j);if(host&&host.card.owner>=0&&host.player!==host.card.owner){removeBoard(s,host.card.id);s.players[host.card.owner]!.pr.push(host.card);}}}}
function removeTo(s:GameState,id:string,destination:'graveyard'|'top'|'bottom'|'hand',p?:number){const v=locate(s,id);if(!v)return;const c=removeBoard(s,id)!;if(c.hostId){const host=locate(s,c.hostId);if(host){removeBoard(s,host.card.id);s.players[host.card.owner]!.pr.push(host.card);}}delete c.tapped;delete c.hostId;if(destination==='graveyard')scrap(s,c);else if(destination==='hand')moveHand(s,p??v.player,c);else if(destination==='top')s.deck.unshift(c);else s.deck.push(c);attachments(s);}
function choice(s:GameState,p:number,kind:string,prompt:string,cards:GameCard[],count=1,data:Record<string,unknown>={},pub=false){s.choice={player:p,kind,prompt,cards,selected:[],count:Math.min(count,cards.length),data,public:pub};}
function push(s:GameState,p:number,a:GameAction,c:GameCard|undefined,cl:StackItem['class'],actionType?:string){const item:StackItem={id:`play-${++s.sequence}`,player:p,action:a,class:cl,...(c?{card:c}:{}),...(a.targetId?{target:a.targetId}:{}),...(actionType?{actionType}:{})};s.stack.push(item);s.priority=opp(p);s.declines=0;return item;}
function scoreCard(s:GameState,p:number,c:GameCard){delete c.tapped;delete c.hostId;if(c.owner<0)c.owner=p;s.players[p]!.pr.push(c);s.events.push(`score:${p}:${c.rank}`);if(c.rank==='7')push(s,p,act('trigger','Seven scoring: reveal two, take one', '§26 ⦗7⦘ Scoring Trigger'),undefined,'trigger');}
function effectActions(s:GameState,p:number,c:GameCard,context:'action'|'response'|'child'|'quick'):GameAction[]{
 const result:GameAction[]=[];const r=c.rank;const add=(mode:string,label:string,targetId?:string)=>result.push(act('effect',`${cardName(c)} · ${label}`,`§26 ⦗${r}⦘ / §27.15.7`,{cardId:c.id,mode,...(targetId?{targetId}:{})}));
 if(s.boardLock)return result;const ordinary=context==='action'||context==='child';const quick=(context==='quick'||context==='response')&&s.activePlayer===p;
 if(ordinary){
  if(r==='A'){add('anchor','Anchor Counter');for(const v of all(s))if(v.player!==p&&v.row==='er'&&!v.card.hostId&&targetable(s,p,v.card.id))add('purge','Purge: bounce enemy Anchor',v.card.id);}
  if(r==='3'){add('raid','Raid: opponent presents up to 3; take 1');add('discard2','Opponent discards up to 2');for(const v of all(s))if(targetable(s,p,v.card.id))add('bounce-top','Bounce to top of Draw Pile',v.card.id);}
  if(r==='4'){add('clear-pr','Clear enemy Point Row');add('clear-er','Clear enemy Anchors');}
  if(r==='5')add('recycle','Mill 2, rummage 1, then draw oldest Graveyard card');
  if(r==='6')add('dig','Draw 3, choose return or discard');
  if(r==='7')add('seven','Reveal 2: take one, play the other');
  if(r==='9')add('anchor','Anchor: reveal enemy hand and discard 1');
  if(r==='J')for(const t of s.players[opp(p)]!.pr)if((t.tapped||!['A','RJ','BJ'].includes(t.rank))&&targetable(s,p,t.id))add('attach','Jack enemy Point card',t.id);
  if(r==='Q'||r==='K')add('anchor',r==='Q'?'Anchor: establish Guard':'Anchor: establish King');
  if(r==='RJ'){add('hand-swap','Exchange both hands');add('self-reset','Discard hand, draw that many +3');add('attack','Opponent discards hand, redraws two fewer');add('shuffle-reset','Shuffle Draw Pile + Graveyard, draw 2');}
 }
 if(quick&&r==='2'&&!s.players[p]!.quick2&&!s.stack.some(i=>i.player===p&&i.action.mode==='quick2'))add('quick2','Quick: score 2, opponent discards 1');
 if(quick&&r==='4')add('natural','Quick: inspect and reorder top 4; optionally draw');
 if(quick&&r==='BJ'&&!s.stack.length)add('board-lock','Quick: Board Lock for two subsequent Full Turns');
 if(context==='response'){
  if(r==='3')for(const v of all(s))if(targetable(s,p,v.card.id)){add('bounce-top','Instant: bounce to top of Draw Pile',v.card.id);add('bounce-bottom','Instant: bounce to bottom of Draw Pile',v.card.id);}
  if(r==='9'){for(const t of s.players[opp(p)]!.pr)if(targetable(s,p,t.id))add('tap','Instant: tap enemy Points',t.id);add('goal3','Instant: increase opponent Goal by 3');add('goal5','Instant: increase opponent Goal by 5, discard 1');}
  if(r==='J')for(const item of s.stack)if(item.player!==p&&item.actionType)add('disrupt','Disrupt pending Mini-Turn Action',item.id);
 }
 return result;
}
function counterActions(s:GameState,p:number):GameAction[]{const actions:GameAction[]=[];for(const c of [...s.players[p]!.hand,...s.players[p]!.er.filter(c=>c.rank==='A'&&!c.tapped&&!c.hostId)])for(const item of s.stack){let ok=false;const anchor=s.players[p]!.er.includes(c);if(c.rank==='A')ok=['effect','counter'].includes(item.class)&&!['board-lock','shuffle-reset'].includes(item.action.mode??'')&&(!anchor||item.player!==p);if(c.rank==='K'&&!anchor)ok=item.class==='anchor'||item.class==='goal';if(c.rank==='8'&&!anchor)ok=item.class==='scuttle';if(ok)actions.push(act('counter',`${cardName(c)} · ${anchor?'Sacrifice Anchor to counter and capture':'Counter'} ${item.action.label}`,`§26 ⦗${c.rank}⦘ / §36.16.1`,{cardId:c.id,targetId:item.id,mode:anchor?'anchor-counter':'counter'}));}return actions;}
function responseActions(s:GameState,p:number){return [...counterActions(s,p),...s.players[p]!.hand.flatMap(c=>effectActions(s,p,c,'response'))];}
function choiceActions(s:GameState,p:number){const q=s.choice!;if(q.player!==p)return [];const a:GameAction[]=[];const add=(mode:string,label:string,cardId?:string)=>a.push(act('choose',label,`§26 / ${q.kind}`,{mode,...(cardId?{cardId}:{})}));
 if(q.kind==='generated'){const c=q.cards[0]!;add('generated-score',`Score ${cardName(c)} for ${pointValue(c)} Points`,c.id);a.push(...effectActions(s,p,c,'child').filter(x=>!(c.rank!=='7'&&x.mode==='seven')).map(x=>({...x,type:'generated-effect'})));}
 else if(q.kind==='dig-mode'){for(const c of q.cards){add('dig-top',`Return drawn ${cardName(c)} to top`,c.id);add('dig-bottom',`Return drawn ${cardName(c)} to bottom`,c.id);}for(const c of s.players[p]!.hand)add('dig-discard',`Keep drawn cards; discard ${cardName(c)}`,c.id);}
 else if(q.kind==='natural-draw'){add('draw','Draw the new top card');add('leave','Leave reordered cards in Draw Pile');}
 else if(q.kind==='seven-single'){add('take',`Take ${cardName(q.cards[0]!)}`);add('play',`Play ${cardName(q.cards[0]!)}`);}
 else if(q.kind==='eight-reward'){if(s.graveyard.length){add('top',`Draw newest Graveyard card: ${cardName(s.graveyard.at(-1)!)}`);add('bottom',`Draw oldest Graveyard card: ${cardName(s.graveyard[0]!)}`);}}
 else for(const c of q.cards)add('select',`${q.kind==='order'?'Place next on top':q.kind==='discard'?'Discard':q.kind==='present'?'Present':q.kind==='recycle'?'Rummage':'Choose'} ${cardName(c)}`,c.id);
 return a;
}
export function availableActions(s:GameState,p:number):GameAction[]{
 if((p!==0&&p!==1)||s.winner!==null)return [];if(s.choice)return choiceActions(s,p);if(s.stack.length){if(s.priority!==p)return [];const a=responseActions(s,p);return a.length?[...a,act('decline','Decline response (no Action spent)',refs.stack)]:[];}
 if(p!==s.activePlayer)return [];let a=s.players[p]!.hand.flatMap(c=>effectActions(s,p,c,'quick'));
 if(s.miniTurns>0){const ordinary:GameAction[]=[];if(s.deck.length)ordinary.push(act('draw',s.players[p]!.hand.length?'Draw 1':'Empty hand: draw 2',refs.turn));for(const c of s.players[p]!.hand){ordinary.push(act('score',`Score ${cardName(c)} · ${pointValue(c)} Points`,refs.score,{cardId:c.id}));ordinary.push(...effectActions(s,p,c,'action'));if(!s.boardLock)for(const t of s.players[opp(p)]!.pr)if(canScuttle(s,p,c,t))ordinary.push(act('scuttle',`Scuttle ${cardName(t)} with ${cardName(c)}`,refs.scuttle,{cardId:c.id,targetId:t.id}));}const category=(x:GameAction)=>x.type==='effect'?'effect':x.type;const disrupted=s.players[p]!.disrupted;const filtered=ordinary.filter(x=>!disrupted.includes(category(x)));a.push(...(filtered.length?filtered:ordinary));if(!ordinary.length&&s.exhausted!==null&&!s.deck.length)a.push(act('exhausted-pass','Forced Exhausted Pass',refs.exhausted));}
 else a.push(act('end','Complete Full Turn · check victory',refs.turn));return a;
}
function takeHand(s:GameState,p:number,id:string){const i=s.players[p]!.hand.findIndex(c=>c.id===id);if(i<0)throw Error('Card is not in your hand.');return s.players[p]!.hand.splice(i,1)[0]!;}
function startNext(s:GameState){s.activePlayer=opp(s.activePlayer);s.turn++;s.phase='action';s.miniTurns=1;s.priority=s.activePlayer;s.players[s.activePlayer]!.quick2=false;s.players[s.activePlayer]!.disrupted=[];for(const c of [...s.players[s.activePlayer]!.pr,...s.players[s.activePlayer]!.er])delete c.tapped;if(!s.deck.length&&s.exhausted===null)s.exhausted=3;}
function endTurn(s:GameState){const p=s.activePlayer;if(score(s,p)>=s.players[p]!.goal){s.winner=p;s.phase='finished';s.history.push(`Player ${p+1} wins at End Phase with ${score(s,p)} secured Points.`);return;}if(s.boardLock&&s.boardLock.activationTurn!==s.turn){s.boardLock.remaining--;if(!s.boardLock.remaining)s.boardLock=null;}if(s.exhausted!==null&&--s.exhausted===0){const anchors=(p:number)=>s.players[p]!.er.filter(c=>!c.tapped&&!c.hostId).length;const delta=anchors(0)-anchors(1)||score(s,0)-score(s,1);s.winner=delta>0?0:delta<0?1:'draw';s.phase='finished';s.history.push(`Exhausted tiebreak: ${s.winner==='draw'?'draw':`Player ${s.winner+1} wins`}.`);return;}startNext(s);}
function finishSource(s:GameState,item:StackItem){if(item.card)scrap(s,item.card);}
function afterChoice(s:GameState,q:Choice){const p=q.player;if(q.kind==='present'){choice(s,Number(q.data.caster),'raid-take','Take one of the presented cards',q.selected,1,{victim:p},true);}
 else if(q.kind==='discard'){if(q.data.after==='quick2')s.players[Number(q.data.caster)]!.quick2=true;}
 else if(q.kind==='order'){s.deck.unshift(...q.selected);choice(s,p,'natural-draw','Draw the reordered top card?',[],0);}
}
function resolveChoice(s:GameState,a:GameAction){const q=s.choice!;const p=q.player;s.choice=null;
 if(q.kind==='generated'){const c=q.cards[0]!;if(a.mode==='generated-score')scoreCard(s,p,c);else declareEffect(s,p,{...a,type:'effect'},c,false);return;}
 if(q.kind==='natural-draw'){if(a.mode==='draw')draw(s,p,1);return;}
 if(q.kind==='seven-single'){const c=q.cards[0]!;if(a.mode==='take')moveHand(s,p,c);else choice(s,p,'generated','Declare the revealed card: score or a legal generic effect',[c],1,{},true);return;}
 if(q.kind==='eight-reward'){const c=a.mode==='top'?s.graveyard.pop():s.graveyard.shift();if(c)moveHand(s,p,c);return;}
 if(q.kind==='dig-mode'){if(a.mode==='dig-discard'){scrap(s,takeHand(s,p,a.cardId!));}else{const c=takeHand(s,p,a.cardId!);if(a.mode==='dig-top')s.deck.unshift(c);else s.deck.push(c);}return;}
 const c=q.cards.find(c=>c.id===a.cardId)!;
 if(q.kind==='discard'){scrap(s,takeHand(s,p,c.id));}
 else if(q.kind==='raid-take'){moveHand(s,p,takeHand(s,Number(q.data.victim),c.id));return;}
 else if(q.kind==='recycle'){s.graveyard=s.graveyard.filter(x=>x.id!==c.id);moveHand(s,p,c);const oldest=s.graveyard.shift();if(oldest)moveHand(s,p,oldest);return;}
 else if(q.kind==='seven-hand'){moveHand(s,p,c);const other=q.cards.find(x=>x.id!==c.id);if(other)choice(s,p,'generated','Play the other revealed card for Points or effect',[other],1,{},true);return;}
 else if(q.kind==='seven-score'){moveHand(s,p,c);s.deck.unshift(...q.cards.filter(x=>x.id!==c.id));return;}
 q.cards=q.cards.filter(x=>x.id!==c.id);q.selected.push(c);q.count--;if(q.count>0)s.choice=q;else afterChoice(s,q);
}
function declareEffect(s:GameState,p:number,a:GameAction,c:GameCard,mini:boolean){const mode=a.mode!;const cl:StackItem['class']=mode==='anchor'?'anchor':mode==='goal3'||mode==='goal5'?'goal':'effect';push(s,p,a,c,cl,mini?'effect':undefined);}
function resolveItem(s:GameState,item:StackItem,random:()=>number){const p=item.player;const enemy=opp(p);const c=item.card;const a=item.action;const m=a.mode;
 if(item.class==='counter'){const i=s.stack.findIndex(x=>x.id===item.target);if(i>=0){const negated=s.stack.splice(i,1)[0]!;if(negated.card){if(m==='anchor-counter')moveHand(s,p,negated.card);else scrap(s,negated.card);}s.history.push(`Counter resolved: ${negated.action.label}.`);}finishSource(s,item);return;}
 if(item.class==='action'){if(a.type==='draw')draw(s,p,s.players[p]!.hand.length?1:2);if(a.type==='score'&&c)scoreCard(s,p,c);return;}
 if(item.class==='trigger'){const revealed=s.deck.splice(0,2);if(revealed.length)choice(s,p,'seven-score','Seven scoring trigger: take one; return the other to top',revealed,1,{},true);return;}
 if(item.class==='scuttle'){const v=locate(s,item.target);const success=c&&v&&v.player===enemy&&v.row==='pr'&&canScuttle(s,p,c,v.card);if(success)removeTo(s,v.card.id,'graveyard');finishSource(s,item);if(success&&c.rank==='8'&&s.graveyard.length)choice(s,p,'eight-reward','Eight Scuttle bonus: take newest or oldest Graveyard card',[],0);return;}
 if(m==='bounce-top'||m==='bounce-bottom'||m==='tap'||m==='attach'||m==='purge'){const v=locate(s,item.target);let valid=targetable(s,p,item.target);if(m==='purge')valid=valid&&!!v&&v.player===enemy&&v.row==='er'&&!v.card.hostId;if(m==='tap'||m==='attach')valid=valid&&!!v&&v.player===enemy&&v.row==='pr';if(m==='attach'&&v&&!v.card.tapped&&['A','RJ','BJ'].includes(v.card.rank))valid=false;if(!valid){s.history.push(`Fizzle: ${a.label}; target is no longer legal.`);finishSource(s,item);return;}
  if(m==='bounce-top'||m==='bounce-bottom')removeTo(s,item.target!,m==='bounce-top'?'top':'bottom');if(m==='purge')removeTo(s,item.target!,'hand',v!.card.owner>=0?v!.card.owner:v!.player);if(m==='tap')v!.card.tapped=true;if(m==='attach'){const host=removeBoard(s,item.target!)!;s.players[p]!.pr.push(host);c!.hostId=host.id;s.players[p]!.er.push(c!);attachments(s);return;}finishSource(s,item);return;
 }
 if(m==='anchor'){if(c!.rank==='9'){for(const n of [...s.players[p]!.er])if(n.rank==='9'&&!n.tapped&&!n.hostId)removeTo(s,n.id,'graveyard');}s.players[p]!.er.push(c!);if(c!.rank==='9'&&s.players[enemy]!.hand.length)choice(s,enemy,'discard','Nine Anchor reveals your hand: choose one to discard',s.players[enemy]!.hand.slice(),1,{},true);return;}
 if(m==='quick2'){scoreCard(s,p,c!);s.players[p]!.quick2=true;if(s.players[enemy]!.hand.length)choice(s,enemy,'discard','Two Quick: choose one card to discard',s.players[enemy]!.hand.slice());return;}
 if(m==='raid'){const cards=s.players[enemy]!.hand.slice();if(cards.length)choice(s,enemy,'present','Present up to three cards; opponent chooses one',cards,3,{caster:p});}
 if(m==='discard2'&&s.players[enemy]!.hand.length)choice(s,enemy,'discard','Choose up to two cards to discard',s.players[enemy]!.hand.slice(),2);
 if(m==='clear-pr'||m==='clear-er'){const row=m==='clear-pr'?'pr':'er';for(const t of [...s.players[enemy]![row]])if(row==='pr'||!t.hostId)removeTo(s,t.id,'graveyard');}
 if(m==='recycle'){for(const x of s.deck.splice(0,2))scrap(s,x);if(s.graveyard.length)choice(s,p,'recycle','Rummage one Graveyard card, then draw the oldest remaining',s.graveyard.slice());}
 if(m==='dig'){const drawn=s.deck.splice(0,3);for(const x of drawn)moveHand(s,p,x);if(drawn.length&&s.players[p]!.hand.length)choice(s,p,'dig-mode','Keep the drawn cards and discard, or return one drawn card',drawn);}
 if(m==='seven'){const cards=s.deck.splice(0,2);if(cards.length===1)choice(s,p,'seven-single','One revealed card: take it or play it',cards,1,{},true);else if(cards.length===2)choice(s,p,'seven-hand','Take one revealed card; then play the other',cards,1,{},true);}
 if(m==='natural'){const cards=s.deck.splice(0,4);if(cards.length)choice(s,p,'order','Choose the top cards in order (first choice is top)',cards,cards.length);}
 if(m==='goal3'||m==='goal5'){s.players[enemy]!.goal+=m==='goal3'?3:5;if(m==='goal5'&&s.players[p]!.hand.length)choice(s,p,'discard','Goal +5: discard one card',s.players[p]!.hand.slice());}
 if(m==='disrupt'){const target=s.stack.find(x=>x.id===item.target);if(target?.actionType){s.players[target.player]!.disrupted.push(target.actionType);draw(s,p,1);}}
 if(m==='hand-swap'){[s.players[p]!.hand,s.players[enemy]!.hand]=[s.players[enemy]!.hand,s.players[p]!.hand];}
 if(m==='self-reset'||m==='attack'){const who=m==='self-reset'?p:enemy;const hand=s.players[who]!.hand;s.players[who]!.hand=[];const n=hand.length+(m==='self-reset'?3:-2);for(const x of hand)scrap(s,x);draw(s,who,Math.max(0,n));}
 if(m==='shuffle-reset'){s.deck.push(...s.graveyard);s.graveyard=[];shuffle(s.deck,random);draw(s,p,2);}
 if(m==='board-lock')s.boardLock={remaining:2,activationTurn:s.turn};finishSource(s,item);
}
function normalize(s:GameState,random:()=>number){let safety=0;while(!s.choice&&s.stack.length&&s.winner===null){if(++safety>1000)throw Error('Resolution safety bound exceeded.');if(s.declines>=2){const item=s.stack.pop()!;resolveItem(s,item,random);s.history.push(`Resolved: ${item.action.label}`);s.events.push(`resolve:${item.player}:${item.action.mode??item.action.type}`);s.priority=opp(item.player);s.declines=0;attachments(s);if(s.deck.length&&s.exhausted!==null)s.exhausted=null;continue;}if(responseActions(s,s.priority).length)break;s.priority=opp(s.priority);s.declines++;}if(!s.stack.length&&!s.choice){s.priority=s.activePlayer;if(!s.miniTurns)s.phase='end';}if(s.deck.length&&s.exhausted!==null)s.exhausted=null;s.history=s.history.slice(-100);s.events=s.events.slice(-200);}
const key=(a:GameAction)=>JSON.stringify([a.type,a.cardId??null,a.targetId??null,a.mode??null]);
export function applyGame(state:GameState,p:number,input:GameAction,random:()=>number=secureRandom):GameState{
 if(!input||typeof input!=='object')throw Error('A legal action is required.');const a=availableActions(state,p).find(a=>key(a)===key(input));if(!a)throw Error('That action is unavailable: check timing, targets, Guard, or First Contact restrictions.');const s=clone(state);
 if(a.type==='choose'||a.type==='generated-effect')resolveChoice(s,a);
 else if(a.type==='decline'){s.priority=opp(s.priority);s.declines++;}
 else if(a.type==='end')endTurn(s);
 else if(a.type==='exhausted-pass'){s.miniTurns=0;s.events.push(`pass:${p}`);}
 else if(a.type==='counter'){let c:GameCard;if(a.mode==='anchor-counter')c=removeBoard(s,a.cardId!)!;else c=takeHand(s,p,a.cardId!);push(s,p,a,c,'counter');}
 else {const c=a.cardId?takeHand(s,p,a.cardId):undefined;const ordinary=a.type!=='effect'||(!state.stack.length&&a.mode!=='quick2'&&a.mode!=='natural'&&a.mode!=='board-lock');if(ordinary)s.miniTurns--;if(a.type==='effect')declareEffect(s,p,a,c!,ordinary);else push(s,p,a,c,a.type==='scuttle'?'scuttle':'action',a.type);s.history.push(`Player ${p+1}: ${a.label}`);s.events.push(`declare:${p}:${a.type}`);}
 normalize(s,random);return s;
}
export function projectGame(s:GameState,p:number|null):GameView{const q=s.choice;return {profile:s.profile,players:s.players.map((v,i)=>({hand:i===p?clone(v.hand):[],handCount:v.hand.length,pr:clone(v.pr),er:clone(v.er),goal:v.goal,score:score(s,i),guard:guarded(s,i)})),hand:p===0||p===1?clone(s.players[p]!.hand):[],deckCount:s.deck.length,graveyard:clone(s.graveyard),activePlayer:s.activePlayer,phase:s.phase,miniTurns:s.miniTurns,turn:s.turn,pending:s.stack.map(i=>({id:i.id,player:i.player,label:i.action.label,ruleRef:i.action.ruleRef,...(i.card?{card:clone(i.card)}:{})})),priority:s.priority,choice:q?{player:q.player,prompt:q.prompt,cards:q.public||p===q.player?clone(q.cards):[]}:null,boardLock:clone(s.boardLock),exhausted:s.exhausted,winner:s.winner,legalActions:p===0||p===1?availableActions(s,p):[],history:clone(s.history)};}
export function explainAction(a:GameAction){return `${a.label}. Legal under ${a.ruleRef}. Targets and timing are validated again by the authoritative rules engine; responses resolve last in, first out.`;}
export function chooseBotAction(s:GameState,p:number):GameAction|null{const actions=availableActions(s,p);if(!actions.length)return null;const scoring=actions.filter(a=>a.type==='score').sort((a,b)=>pointValue(s.players[p]!.hand.find(c=>c.id===b.cardId)!)-pointValue(s.players[p]!.hand.find(c=>c.id===a.cardId)!));return actions.find(a=>a.type==='counter')??actions.find(a=>a.type==='decline')??scoring[0]??actions.find(a=>a.mode==='generated-score')??actions.find(a=>a.type==='draw')??actions.find(a=>a.type==='end')??actions[0]!;}
export {lessons,createLesson,lessonComplete,lessonHint,saveLesson,resumeLesson} from './lessons.js';
