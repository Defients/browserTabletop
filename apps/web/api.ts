import {useCallback, useEffect, useRef, useState} from 'react';
export interface RoomView {id:string;title:string;revision:number;profile:string;template:unknown;table?:unknown;game?:unknown;you:{id:string;seat:number|null;host:boolean};participants:{id:string;nickname:string;seat:number|null;connected:boolean}[];locked:boolean;history:string[];savedAt:string}
let csrf='';
export async function api<T>(path:string,body?:unknown):Promise<T>{
 if(!csrf){const response=await fetch('/api/session');if(!response.ok)throw new Error('The table service is unavailable. Local practice still works.');csrf=(await response.json()).csrf;}
 const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','x-csrf-token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json();if(!response.ok)throw new Error(data.error||data.message||'This request could not be completed.');return data as T;
}
export type SaveStatus='saved'|'pending'|'disconnected'|'failed';
export function useRoom(initial:RoomView|null){
 const [view,setView]=useState(initial);const [status,setStatus]=useState<SaveStatus>('saved');const [error,setError]=useState('');const ref=useRef(view);ref.current=view;
 const socket=useRef<WebSocket|null>(null);const [pointers,setPointers]=useState<Record<string,{x:number;y:number}>>({});
 useEffect(()=>{if(!initial)return;let live=true;let timer:ReturnType<typeof setTimeout>;let attempts=0;
 const connect=()=>{if(!live)return;const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws?room=${encodeURIComponent(initial.id)}`);socket.current=ws;
 ws.onopen=()=>{attempts=0;setStatus('saved');};ws.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='snapshot'){setView(data.view);setStatus('saved');}if(data.type==='pointer'&&data.id)setPointers(p=>({...p,[data.id]:{x:data.x,y:data.y}}));}catch{setError('An unreadable update was received; reconnecting.');ws.close();}};
 ws.onclose=()=>{if(live){setStatus('disconnected');timer=setTimeout(connect,Math.min(8000,800*2**attempts++));}};ws.onerror=()=>ws.close();};connect();return()=>{live=false;clearTimeout(timer);socket.current?.close();};
 },[initial?.id]);
 const command=useCallback(async(command:unknown)=>{if(!ref.current)return;setStatus('pending');setError('');const body={requestId:crypto.randomUUID(),revision:ref.current.revision,command};try{const result=await api<{view:RoomView}>(`/api/rooms/${ref.current.id}/commands`,body);setView(result.view);setStatus('saved');}catch(e){setError((e as Error).message);setStatus('failed');try{const result=await api<RoomView|{view:RoomView}>(`/api/rooms/${ref.current.id}`);setView('view'in result?result.view:result);}catch{/* Keep last accepted state visible. */}}},[]);
 const lastPointer=useRef(0);const pointer=useCallback((x:number,y:number)=>{if(Date.now()-lastPointer.current<100)return;lastPointer.current=Date.now();if(socket.current?.readyState===1)socket.current.send(JSON.stringify({type:'pointer',x,y}));},[]);
 return{view,status,error,command,pointer,pointers};
}
