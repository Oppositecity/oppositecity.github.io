/* Shared atproto plumbing for Opposite City pages. No build step, no library.
   Load with <script src="/shared/atproto.js"></script>; everything hangs off `atp`.

   An account is a handle or an id (did). It lives on its own server, named in
   its identity document. Reading public records needs no sign-in. Writing
   needs an app password, which is sent only to the account's own server (or to
   bsky.social for accounts Bluesky hosts) and is never stored by this file. */
(function(){
'use strict';
var APPVIEW='https://public.api.bsky.app', ENTRY='https://bsky.social';

async function json(url,opt){
  var r=await fetch(url,opt), j=await r.json().catch(function(){return {};});
  if(!r.ok){ var e=new Error(j.message||('the server answered '+r.status)); e.status=r.status; throw e; }
  return j;
}
/* handle or did -> {did, pds}. pds is where the account's records and files are. */
async function resolve(id){
  id=String(id||'').trim().replace(/^@/,'');
  if(!id) throw new Error('no account given');
  var did=id;
  if(id.indexOf('did:')!==0){
    try{ did=(await json(APPVIEW+'/xrpc/com.atproto.identity.resolveHandle?handle='+encodeURIComponent(id))).did; }
    catch(e){ throw new Error('no account called '+id); }
  }
  var doc=await json(did.indexOf('did:web:')===0?'https://'+did.slice(8)+'/.well-known/did.json':'https://plc.directory/'+did);
  var svc=(doc.service||[]).find(function(s){return String(s.id).slice(-11)==='atproto_pds';});
  var pds=svc&&String(svc.serviceEndpoint).replace(/\/$/,'');
  if(!pds||!/^https:\/\//.test(pds)) throw new Error('that account names no server');
  return {did:did,pds:pds};
}
/* Accounts on Bluesky's own servers sign in at bsky.social; everyone else at their server. */
function entryway(pds){
  try{ return /\.bsky\.network$/.test(new URL(pds).hostname)?ENTRY:pds; }catch(e){ return pds; }
}
/* -> session {did, handle, pds, host, access, refresh} */
async function signIn(id,appPassword){
  id=String(id||'').trim().replace(/^@/,'');
  var who=await resolve(id), host=entryway(who.pds), j;
  try{
    j=await json(host+'/xrpc/com.atproto.server.createSession',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify({identifier:id,password:appPassword})});
  }catch(e){ throw new Error(e.status===401?'that account and app password did not work':e.message); }
  return {did:j.did,handle:j.handle,pds:who.pds,host:host,access:j.accessJwt,refresh:j.refreshJwt};
}
async function createRecord(s,collection,record){
  return json(s.host+'/xrpc/com.atproto.repo.createRecord',{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+s.access},
    body:JSON.stringify({repo:s.did,collection:collection,record:record})});
}
async function uploadBlob(s,blob,type){
  return (await json(s.host+'/xrpc/com.atproto.repo.uploadBlob',{method:'POST',
    headers:{'content-type':type||blob.type||'application/octet-stream',authorization:'Bearer '+s.access},body:blob})).blob;
}
/* Public, no sign-in. -> [{uri, cid, value}], newest first, at most `max`. */
async function listRecords(id,collection,max){
  var who=await resolve(id), out=[], cursor='';
  max=max||100;
  while(out.length<max){
    var j=await json(who.pds+'/xrpc/com.atproto.repo.listRecords?repo='+encodeURIComponent(who.did)+
      '&collection='+encodeURIComponent(collection)+'&limit='+Math.min(100,max-out.length)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
    out=out.concat(j.records||[]);
    if(!j.cursor||!(j.records||[]).length) break;
    cursor=j.cursor;
  }
  return out;
}
function blobUrl(pds,did,cid){
  return pds+'/xrpc/com.atproto.sync.getBlob?did='+encodeURIComponent(did)+'&cid='+encodeURIComponent(cid);
}
window.atp={resolve:resolve,entryway:entryway,signIn:signIn,createRecord:createRecord,uploadBlob:uploadBlob,listRecords:listRecords,blobUrl:blobUrl};
})();
