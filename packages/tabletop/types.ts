export interface Zone { id:string; name:string; kind:'table'|'hand'|'pile'; visibility:'public'|'owner'|'hidden'; owner?:number; x:number; y:number; width:number; height:number }
export interface Card { id:string; rank:string; suit:string; face?:string; zone:string; x:number; y:number; rotation:number; faceUp:boolean; locked:boolean; attachedTo?:string; revealedTo?:number[] }
export interface Component { id:string; kind:'counter'|'token'|'dice'|'note'|'label'; text:string; value:number; x:number; y:number; locked:boolean }
export interface TableState { cards:Record<string,Card>; zones:Zone[]; objects:Component[]; seats:number; width:number; height:number; history:string[] }
export interface VisibleCard { id:string; rank?:string; suit?:string; face?:string; zone:string; x:number; y:number; rotation:number; faceUp:boolean; locked:boolean; attachedTo?:string; revealedTo?:number[] }
export interface TableView { cards:VisibleCard[]; zones:(Zone & {count:number})[]; objects:Component[]; seats:number; width:number; height:number; history:string[] }
export interface TableActor { seat:number|null; host:boolean }
export interface TableCommand { type:'move'|'flip'|'rotate'|'align'|'stack'|'unstack'|'fan'|'draw'|'deal'|'split'|'merge'|'shuffle'|'top'|'bottom'|'sort'|'reorder'|'reveal'|'hide'|'lock'|'attach'|'detach'|'component'|'remove-component'; ids?:string[]; zone?:string; from?:string; x?:number; y?:number; count?:number; value?:number; text?:string; targets?:number[]; componentKind?:Component['kind']; target?:string; confirm?:boolean }
