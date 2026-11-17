/* Classroom host: fixed-step clock, bounded acknowledged rendering, no autoplay. */
(function(){
  'use strict';
  const B=CluckClassroom,$=id=>document.getElementById(id),post=m=>parent.postMessage({pluginMessage:m},'*');
  let roster=[],world=null,begun=false,starting=false,recovery=false,inFlight=null,sequence=0,cursor=0,renderMs=150,lastRender=0,lastClock=performance.now(),accumulator=0,lastHud=0,lastSound=0;
  const sent=new Map();let audio=null,renderFault=false,lastHudSent='',hadShots=false,lastPanel=0;
  function tell(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
  function ui(){
    const s=world?B.summary(world):{chicken:roster.filter(u=>u.team==='chicken').length,mouse:roster.filter(u=>u.team==='mouse').length};
    $('c').textContent=s.chicken;$('m').textContent=s.mouse;
    const active=world&&world.state==='running',finished=world&&world.state==='finished';
    for(const id of ['chicken','mouse','auto','clear'])$(id).disabled=begun||starting||recovery;
    $('start').disabled=recovery||starting||finished||renderFault||!s.chicken||!s.mouse||active;
    $('start').textContent=starting?'Preparing stickers…':world&&world.state==='paused'?'Resume battle':'Start battle';
    $('pause').disabled=!active;$('restore').disabled=!(begun||recovery);
    $('phase').textContent=finished?(world.winner==='draw'?'A draw!':world.winner==='chicken'?'Chickens win!':'Mice win!'):active?(Math.min(s.chicken,s.mouse)<=4?'Last stand':world.elapsed<8?'Charge!':'Battle in progress'):world&&world.state==='paused'?'Paused':'Build the armies';
    const elapsed=Math.floor(world?.elapsed||0);$('clock').textContent=Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0');
    $('cinitial').textContent=world?'of '+world.initial.chicken+' standing':'enrolled';$('minitial').textContent=world?'of '+world.initial.mouse+' standing':'enrolled';
    if(world&&world.events.length)$('events').textContent=world.events[world.events.length-1].text;
    draw();
  }
  function draw(){const ctx=$('preview').getContext('2d');if(!ctx)return;const canvas=$('preview');ctx.clearRect(0,0,canvas.width,canvas.height);const units=world?world.units:roster;if(!units.length)return;
    const xs=units.map(u=>u.x),ys=units.map(u=>u.y),left=Math.min(...xs)-50,top=Math.min(...ys)-50,w=Math.max(300,Math.max(...xs)-left+50),h=Math.max(200,Math.max(...ys)-top+50),scale=Math.min(canvas.width/w,canvas.height/h);
    for(const u of units){ctx.globalAlpha=u.isDead?.18:1;ctx.fillStyle=u.team==='chicken'?'#c18a05':'#336bcb';ctx.beginPath();ctx.arc(20+(u.x-left)*scale,10+(u.y-top)*scale,Math.max(2,Math.min(7,14*scale)),0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  }
  function makeWorld(combatants=roster){world=B.create(combatants);sent.clear();cursor=0;}
  function prepare(){
    try{makeWorld();starting=true;post({type:'CB_BEGIN'});ui();}catch(e){tell(e.message,true);}
  }
  for(const team of ['chicken','mouse','auto'])$(team).onclick=()=>post({type:'CB_ENROLL',team});
  $('clear').onclick=()=>post({type:'CB_CLEAR'});$('focus').onclick=()=>post({type:'CB_FOCUS'});
  $('start').onclick=()=>{if(begun&&world){B.start(world);lastClock=performance.now();accumulator=0;ui();}else prepare();};
  $('pause').onclick=()=>{if(world)B.pause(world);accumulator=0;tell('Paused. The stickers stay where they are; Restore returns them to their original layout.');ui();};
  $('restore').onclick=()=>{if(world)B.pause(world);inFlight=null;begun=false;recovery=true;post({type:'CB_RESTORE'});ui();};
  function render(force=false){
    if(!begun||!world||inFlight||renderFault)return;const now=performance.now();if(!force&&now-lastRender<renderMs)return;
    const updates=[],n=world.units.length;for(let checked=0;checked<n&&updates.length<160;checked++){
      const u=world.units[cursor++%n],x=Math.round(u.x),y=Math.round(u.y),key=x+','+y+','+u.isDead+','+u.isRouted;
      const previous=sent.get(u.id);
      const threshold=n>120?4:2;
      if(!previous||previous.isDead!==u.isDead||previous.isRouted!==u.isRouted||
        (world.state==='finished'?previous.key!==key:Math.hypot(previous.x-x,previous.y-y)>=threshold)){
        updates.push({id:u.id,x,y,isDead:u.isDead,isRouted:u.isRouted,key});
      }
    }
    const shots=world.projectiles.slice(0,12).map(p=>({x:p.x,y:p.y-p.z}));
    const s=B.summary(world),candidate='🐔 CHICKENS '+s.chicken+'   vs   MICE '+s.mouse+' 🐭\n'+$('phase').textContent+' · '+$('clock').textContent+'\n'+(world.state==='finished'?'Final result • restore via host plugin':'Host-controlled battle · no reinforcements');
    const hud=(now-lastHud>1000||world.state==='finished')&&candidate!==lastHudSent?candidate:null;
    if(hud)lastHud=now;if(!updates.length&&!shots.length&&!hadShots&&!hud)return;
    inFlight={sequence:++sequence,at:now,updates,hud,shots:!!shots.length};post({type:'CB_FRAME',sequence,updates:updates.map(({key,...u})=>u),projectiles:shots,hud});lastRender=now;
  }
  function tone(){if(!$('sound').checked||!world||world.state!=='running'||world.elapsed-lastSound<2)return;lastSound=world.elapsed;
    try{const C=window.AudioContext||window.webkitAudioContext;if(!audio)audio=new C();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=220;g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);o.start();o.stop(audio.currentTime+.15);}catch(e){}
  }
  window.onmessage=event=>{const m=event.data.pluginMessage;if(!m)return;
    if(m.type==='CB_READY'){recovery=m.recovery;if(recovery)tell('A previous classroom session has '+m.restorable+' original stickers saved. Restore them before starting a new battle.');}
    if(m.type==='CB_ROSTER'){roster=m.combatants;world=null;tell('Enrolled '+roster.length+' of '+B.LIMIT+' stickers. '+m.skipped+' ineligible objects skipped. '+m.unrecognized+' need an explicit team.');}
    if(m.type==='CB_BEGUN'){starting=false;begun=true;renderFault=false;lastHudSent='';if(m.combatants){roster=m.combatants;makeWorld();}B.start(world);tell('Battle started. The clock shows elapsed time.');lastClock=performance.now();accumulator=0;render(true);}
    if(m.type==='CB_APPLIED'&&inFlight&&m.sequence===inFlight.sequence){const latency=performance.now()-inFlight.at;for(const u of inFlight.updates)sent.set(u.id,u);if(inFlight.hud)lastHudSent=inFlight.hud;hadShots=inFlight.shots;inFlight=null;renderMs=latency>180?350:latency>90?250:150;$('metrics').textContent='Last board update '+Math.round(latency)+' ms · batch ≤160 · render interval '+renderMs+' ms.';return;}
    if(m.type==='CB_RESTORED'){world=null;roster=[];begun=starting=recovery=renderFault=false;inFlight=null;sent.clear();$('events').textContent='';tell('Original stickers restored. '+m.missing+' deleted stickers were left deleted. Select the armies again for a rematch.');}
    if(m.type==='CB_ERROR'){if(world)B.pause(world);if(starting||m.fatal)recovery=true;starting=false;renderFault=true;inFlight=null;tell(m.message,true);}
    ui();
  };
  setInterval(()=>{
    const now=performance.now(),elapsed=Math.min(.25,(now-lastClock)/1000);lastClock=now;
    if(inFlight&&now-inFlight.at>5000){if(world)B.pause(world);renderFault=true;tell('Board updates stopped responding. Battle paused. Restore when the board is responsive.',true);inFlight=null;ui();return;}
    if(world&&world.state==='running'&&!document.hidden){accumulator+=elapsed;let steps=0;while(accumulator>=B.DT&&steps++<5){B.step(world);accumulator-=B.DT;}tone();}else accumulator=0;
    if(now-lastPanel>=200){lastPanel=now;ui();}
    render();
  },50);
  setInterval(()=>{if(begun)post({type:'CB_HEARTBEAT'});},2000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&world&&world.state==='running'){B.pause(world);tell('Host view hidden: battle paused. Press Resume when ready.');}lastClock=performance.now();accumulator=0;ui();});
  post({type:'CB_INIT'});ui();
})();
