(function () {
  'use strict';
  var storeKey='sixfold.marketing.v1', endpoint='', busy=false, timer=null, state, session;
  var allowed=['visit','game_loaded','run_started','battle_completed','run_completed','recipe_created','hall_earned','great_hall_earned'];
  var disabled=navigator.globalPrivacyControl===true || navigator.doNotTrack==='1';
  function uuid(){return crypto.randomUUID().replaceAll('-','');}
  function clean(value){return String(value||'').replace(/[^a-zA-Z0-9_. -]/g,'').slice(0,80);}
  try { disabled=disabled || localStorage.getItem('sixfold.analytics.optout')==='1'; } catch (_) {}
  if(disabled) { window.sixfoldMarketing={init:function(){},track:function(){}};return; }
  try { state=JSON.parse(localStorage.getItem(storeKey)); } catch (_) {}
  if(!state || !/^[a-f0-9]{32}$/.test(state.visitor||'')) {
    var params=new URLSearchParams(location.search);
    state={visitor:uuid(),source:clean(params.get('utm_source'))||'direct',medium:clean(params.get('utm_medium')),campaign:clean(params.get('utm_campaign')),queue:[]};
  }
  if(!Array.isArray(state.queue))state.queue=[];
  state.queue=state.queue.slice(-100);
  try { session=sessionStorage.getItem(storeKey);if(!session){session=uuid();sessionStorage.setItem(storeKey,session);} } catch(_){session=uuid();}
  function save(){try{localStorage.setItem(storeKey,JSON.stringify(state));}catch(_){}}
  async function flush(){
    if(busy || !endpoint || !state.queue.length)return;
    busy=true;
    try {
      while(state.queue.length){
        var event=state.queue[0];
        var res=await fetch(endpoint+'/v1/analytics/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),keepalive:true,credentials:'omit'});
        if(!res.ok){if(res.status===400 || res.status===403){state.queue.shift();save();continue;}break;}
        state.queue.shift();save();
      }
    }catch(_){}finally{busy=false;if(state.queue.length && !timer)timer=setTimeout(function(){timer=null;flush();},30000);}
  }
  async function track(name,run,detail){
    if(!allowed.includes(name))return;
    run=String(run||'');detail=clean(detail);
    if(!['visit','game_loaded'].includes(name) && !/^[a-zA-Z0-9_-]{8,80}$/.test(run))return;
    var id=uuid();
    // Milestone IDs are deterministic across reloads; actual recipe actions remain distinct.
    if(['run_started','run_completed','battle_completed','hall_earned','great_hall_earned'].includes(name)){
      var bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state.visitor+'|'+run+'|'+name+'|'+detail));
      id=Array.from(new Uint8Array(bytes),function(x){return x.toString(16).padStart(2,'0');}).join('');
    }
    if(!state.queue.some(function(e){return e.id===id;}))state.queue.push({id:id,visitor:state.visitor,session:session,event:name,run:run,detail:detail,source:state.source,medium:state.medium,campaign:state.campaign});
    if(state.queue.length>100)state.queue.shift();save();flush();
  }
  var visited=false;
  function init(value){try{var url=new URL(value);if(url.protocol!=='https:' && url.hostname!=='localhost' && url.hostname!=='127.0.0.1')return;endpoint=url.origin;if(!visited){visited=true;track('visit');}flush();}catch(_){}}
  window.sixfoldMarketing={init:init,track:function(name,run,detail){track(name,run,detail).catch(function(){});}};
  window.addEventListener('online',flush);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush();});
  save();
  var script=document.currentScript;
  if(script && script.dataset.endpoint)init(script.dataset.endpoint);
})();
