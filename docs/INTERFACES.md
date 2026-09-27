# Shared interface v1

Imports use relative paths with `.js` extensions (bundler/tsx resolves TS). Each package exports from index.ts. Root npm package and single tsconfig, React/Vite client, Node HTTP + ws + SQLite service. Lead supplies dependencies. All JSON state serializable.

## Tabletop (lead)
`createTable(template: TableTemplate, random?:()=>number): TableState`
`applyTable(state, actor: {seat:number|null;host:boolean}, command:TableCommand, random?:()=>number): TableState` throws safe error; never mutates input.
`projectTable(state, seat:number|null): TableView` hidden piles contain count and NO card instances/IDs; opponent hands count only. Visible table backs may have opaque ID (rotate IDs on shuffle). Own hand face data included.
TableState: `{cards:Record<string,Card>, zones:Zone[], objects:Component[], seats:number, width:number,height:number, history:string[]}`. Card: `{id,rank,suit,face?,zone,x,y,rotation,faceUp,locked,attachedTo?:string,revealedTo?:number[]}`. Zone: `{id,name,kind:'table'|'hand'|'pile',visibility:'public'|'owner'|'hidden',owner?:number,x,y,width,height}`. Component: `{id,kind:'counter'|'token'|'dice'|'note'|'label',text,value,x,y,locked}`. TableView same visible fields but cards array and zones include count.
TableCommand broad discriminated command `{type:string,ids?:string[],zone?:string,x?:number,y?:number,count?:number,value?:number,text?:string,targets?:number[],...}`; concrete types published shortly.

## Templates (lead)
`builtInTemplates: TableTemplate[]`; `validateTemplate(input:unknown):TableTemplate`; `exportTemplate(template):string`; `importTemplate(text):TableTemplate` new ID. Template `{schemaVersion:1,id,title,description,author,profile:'free'|'intrilex-core'|'intrilex-first-contact',width,height,seats,zones,cards:CardDefinition[],decks:...,objects,setup:...,plugins?:{intrilex?:...}}`. UI can start with builtins and JSON editor, progressively add forms. Server validates imports.

## Intrilex (Rules Shard)
Own types independent of platform. Expose `createGame(options?:{random?:()=>number;firstPlayer?:number}):GameState`, `availableActions(state,player):GameAction[]`, `applyGame(state,player,action,random?:()=>number):GameState`, `projectGame(state,player:number|null):GameView`, `explainAction(action):string`, `chooseBotAction(state,player):GameAction|null`. Actions returned carry human `label` and `ruleRef`, all required targets already chosen OR a documented typed choice mechanism. Projection includes own hand, public rows, deck count, graveyard, scores/goals, active player, phase, pending, legalActions; NEVER hidden card IDs/faces or RNG. Publish precise types and field names to UI/server as early as possible. Full First Contact profile mandatory; Core manual template owned by lead.
Lessons in same package: `lessons`, `createLesson(id)`, completion predicates, references, reset/resume state. UI imports exact types. Local practice calls same engine with browser crypto random; online server calls with crypto random. Use deterministic fixtures only for explicit lessons.

## Server (Authority Shard)
Same origin production at localhost:3000. Development Vite :5173 proxies /api and /ws to :3000. Node HTTP routes:
GET /api/session establishes HttpOnly SameSite session, returns `{csrf}`.
GET /api/templates => builtins.
POST /api/rooms `{nickname,templateId?,template?}` -> `{roomId,invite,spectatorInvite,view}`.
POST /api/join `{invite,nickname,spectator?:boolean}` -> `{roomId,view}`.
GET /api/rooms/:id -> projected view only.
POST /api/rooms/:id/commands `{requestId,revision,command}` -> `{view}`. CSRF via x-csrf-token.
WS /ws?room=ID same-origin session; sends `{type:'snapshot',view}`; commands through HTTP (durable), WS presence ephemeral `{type:'pointer',x,y}`. Auto reconnect fresh snapshot.
RoomView `{id,title,revision,profile,template,table?:TableView,game?:GameView,you:{id,seat:number|null,host:boolean},participants:[{id,nickname,seat,connected}],locked,history:string[],savedAt}` template is initial definition only. Host invite retrieval dedicated authenticated endpoint or create response; never broadcast credentials.
Command wrapper `{type:'table',action:TableCommand}` / `{type:'game',action:GameAction}` / admin commands seat,leave,lock,rotate-invite,remove,transfer,reset. Server agent documents exact admin shape. Host same game information permissions as guest. Guided requires seats 0/1; no arbitrary card commands.
