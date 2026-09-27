import type { Zone, Component } from '../tabletop/types.js';
export interface CardDefinition { id:string; rank:string; suit:string; face?:string }
export interface DeckDefinition { id:string; zone:string; cards:string[] }
export type SetupOperation = { op:'shuffle';zone:string } | { op:'deal';zone:string;target:string;count:number } | { op:'place';zone:string;target:string;count:number;faceUp:boolean } | { op:'initialize-counter';id:string;value:number };
export interface TableTemplate { schemaVersion:1; id:string; title:string; description:string; author:string; profile:'free'|'intrilex-core'|'intrilex-first-contact'; width:number; height:number; seats:number; zones:Zone[]; cards:CardDefinition[]; decks:DeckDefinition[]; objects:Component[]; setup:SetupOperation[]; background:string; labels:{text:string;x:number;y:number}[]; seatLayout:{seat:number;x:number;y:number}[]; plugins?:{intrilex?:{rulesVersion:'4.3.1';lessonIds?:string[]}} }
