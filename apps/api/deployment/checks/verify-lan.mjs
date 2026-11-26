import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const base = 'http://192.168.1.33';
for (const path of ['/api/','/api/json','/api/static/swagger-ui.css','/api/v1/health','/api/v1/system/memory','/api/v1/metrics/current']) {
  const response=await fetch(base+path,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,path);
}
const socket=new WebSocket('ws://192.168.1.33/api/v1/ws');
const frames=[];
socket.on('message',raw=>frames.push(JSON.parse(raw.toString())));
const timeout=setTimeout(()=>{socket.terminate();},10000);
try {
  await once(socket,'open');
  socket.send(JSON.stringify({type:'subscribe',requestId:'lan-verify',topic:'system.memory',intervalSeconds:2}));
  const end=Date.now()+8000;
  while(!frames.some(frame=>frame.type==='update') && Date.now()<end)await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(frames.some(frame=>frame.type==='snapshot' && frame.data.source==='linux'));
  assert.ok(frames.some(frame=>frame.type==='update'));
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),base,rest:'passed',webSocketHandshake:'passed',linuxSnapshot:'passed',liveUpdate:'passed'},null,2));
} finally {clearTimeout(timeout);socket.terminate();}
