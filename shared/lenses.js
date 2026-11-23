/* Shared lens lexicon for Opposite City pages. No build step, no library.
   Load with <script src="/shared/lenses.js"></script>; everything hangs off `lenses`.

   The lexicon is /prism/lex.txt: line 1 is JSON ({axes:[{key,label,family,eng,run,n}]}),
   every later line is word<TAB>one character per lens. Character code minus 33,
   over 93, times 100 is the score on that study's own scale set to 0-100; a space
   means the study did not rate the word. Nothing is ever guessed for a space.

   Used by prism/, feelhose/ and copywriter/. Keep behaviour identical for all
   three: change it here only with a headless check of each. */
(function(){
'use strict';

var AX=[], IDX={}, LEX=new Map(), loading=null;

/* Where each lens comes from and whether it may be used in paid work.
   cleared: true  = licence allows commercial use (CC BY 4.0, credit given)
            false = research and non-commercial only
            null  = terms not yet checked; treated as not cleared */
var SOURCES={
  ousiometer:{name:'ousiometer (Dodds et al., built on NRC VAD v1)',licence:'research and non-commercial only',cleared:false},
  nrc:{name:'NRC VAD Lexicon v2',licence:'research and non-commercial only',cleared:false},
  labmt:{name:'labMT happiness',licence:'terms not yet checked',cleared:null},
  lancaster:{name:'Lancaster Sensorimotor Norms',licence:'CC BY 4.0',cleared:true},
  brysbaert:{name:'Brysbaert concreteness',licence:'terms not yet checked',cleared:null},
  glasgow:{name:'Glasgow Norms',licence:'CC BY 4.0',cleared:true},
  kuperman:{name:'Kuperman age of acquisition',licence:'terms not yet checked',cleared:null},
  emfd:{name:'extended Moral Foundations Dictionary',licence:'terms not yet checked',cleared:null}
};
var SOURCE_OF={
  goodness:'ousiometer',power:'ousiometer',aggression:'ousiometer',danger:'ousiometer',structure:'ousiometer',
  valence:'nrc',arousal:'nrc',dominance:'nrc',happiness:'labmt',
  visual:'lancaster',auditory:'lancaster',haptic:'lancaster',olfactory:'lancaster',gustatory:'lancaster',
  interoceptive:'lancaster',hand:'lancaster',foot:'lancaster',mouth:'lancaster',head:'lancaster',torso:'lancaster',
  concreteness:'brysbaert',imageability:'glasgow',size:'glasgow',gender:'glasgow',familiarity:'glasgow',
  aoa:'kuperman',care:'emfd',fairness:'emfd',loyalty:'emfd',authority:'emfd',sanctity:'emfd'
};
var FAMILY_COLOUR={essence:'#ff8a65',feeling:'#ffe14d',body:'#4dd9ff',substance:'#8cff6a',life:'#c99bff',moral:'#ff7ad1'};

/* parse the whole file; resolves to the axes list */
function parse(t){
  var nl=t.indexOf('\n'), meta=JSON.parse(t.slice(0,nl));
  AX=meta.axes; IDX={}; AX.forEach(function(a,i){IDX[a.key]=i; a.source=SOURCE_OF[a.key]||null;});
  LEX=new Map(); var b=t.slice(nl+1), p=0;
  while(p<b.length){var e=b.indexOf('\n',p); if(e<0)break; var tab=b.indexOf('\t',p); LEX.set(b.slice(p,tab),b.slice(tab+1,e)); p=e+1;}
  return AX;
}
function load(url){
  if(!loading) loading=fetch(url||'/prism/lex.txt').then(function(r){
    if(!r.ok) throw new Error('the lexicon answered '+r.status); return r.text();
  }).then(parse).catch(function(e){loading=null; throw e;});
  return loading;
}

/* raw token -> null, or {word, form, forms:[{form,v}]}.
   word is the lower-cased token; form is the first entry found; forms are every
   entry found, in the order tried, so a lens one form lacks can fall through to
   the next. Suffix trimming is simple on purpose. */
function look(raw){
  var w=String(raw).toLowerCase().replace(/’/g,"'"), tries=[w];
  var b=w.replace(/'s$/,''); if(b!==w)tries.push(b);
  if(b.endsWith('ies'))tries.push(b.slice(0,-3)+'y');
  if(b.endsWith('es')&&b.length>4)tries.push(b.slice(0,-2));
  if(b.endsWith('s')&&b.length>3&&!/(ss|us|is)$/.test(b))tries.push(b.slice(0,-1));
  if(b.endsWith('ied'))tries.push(b.slice(0,-3)+'y');
  if(b.endsWith('ed')){tries.push(b.slice(0,-2),b.slice(0,-1)); if(/(.)\1ed$/.test(b))tries.push(b.slice(0,-3));}
  if(b.endsWith('ing')){tries.push(b.slice(0,-3),b.slice(0,-3)+'e'); if(/(.)\1ing$/.test(b))tries.push(b.slice(0,-4));}
  if(b.endsWith('ly'))tries.push(b.slice(0,-2));
  if(b.includes('-'))tries.push(b.replace(/-/g,''));
  var forms=[];
  for(var i=0;i<tries.length;i++){var k=tries[i], v=LEX.get(k); if(v&&!forms.some(function(f){return f.form===k;}))forms.push({form:k,v:v});}
  return forms.length?{word:w,form:forms[0].form,forms:forms}:null;
}
/* hit + lens key or index -> score 0-100 (unrounded), or null if no form was rated */
function score(hit,lens){
  if(!hit)return null; var i=typeof lens==='number'?lens:IDX[lens]; if(i==null)return null;
  for(var j=0;j<hit.forms.length;j++){var c=hit.forms[j].v.charCodeAt(i); if(c!==32)return (c-33)/93*100;}
  return null;
}
/* text -> [{w,hit} | {sep}], words and the runs between them, in order.
   Joining every w and sep gives back the text exactly. */
function tokens(text){
  var out=[], re=/[A-Za-z][A-Za-z'’\-]*|[^A-Za-z]+/g, m;
  while((m=re.exec(text))){var s=m[0];
    if(/^[A-Za-z]/.test(s)){var t=s.replace(/['’\-]+$/,''); out.push({w:t,hit:look(t)}); if(t.length<s.length)out.push({sep:s.slice(t.length)});}
    else out.push({sep:s});}
  return out;
}
/* words (tokens with w) or a text -> one row per lens:
   {key,label,family,n,mean,run,eng,diff,ratio,hi,lo}. mean averages the rated
   words each time they occur; diff and ratio are against everyday English (run).
   opt.round rounds each word's score first, as prism/ shows it. opt.lenses limits
   the rows to those keys. */
function profile(words,opt){
  opt=opt||{}; if(typeof words==='string')words=tokens(words).filter(function(t){return t.w;});
  var keys=opt.lenses||AX.map(function(a){return a.key;});
  return keys.map(function(k){var a=AX[IDX[k]], sum=0, n=0, hi=null, lo=null;
    words.forEach(function(t){var v=score(t.hit,k); if(v==null)return; if(opt.round)v=Math.round(v);
      sum+=v; n++; if(!hi||v>hi.v)hi={w:t.w,v:v}; if(!lo||v<lo.v)lo={w:t.w,v:v};});
    var mean=n?sum/n:null;
    return {key:k,label:a.label,family:a.family,n:n,mean:mean,run:a.run,eng:a.eng,
      diff:mean==null?null:mean-a.run,ratio:mean==null?null:mean/a.run,hi:hi,lo:lo};
  });
}
/* the lenses allowed under a setting: {commercial:true} keeps only cleared ones */
function allowed(opt){
  opt=opt||{};
  return AX.filter(function(a){return !opt.commercial||(SOURCES[a.source]&&SOURCES[a.source].cleared===true);});
}

window.lenses={
  load:load, parse:parse, look:look, score:score, tokens:tokens, profile:profile, allowed:allowed,
  get axes(){return AX;}, get size(){return LEX.size;},
  index:function(k){return IDX[k];}, axis:function(k){return AX[IDX[k]];},
  has:function(w){return LEX.has(w);},
  SOURCES:SOURCES, FAMILY_COLOUR:FAMILY_COLOUR
};
})();
