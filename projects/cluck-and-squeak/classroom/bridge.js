/** Existing-sticker renderer. Never deletes/reparents combatants or changes their content. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ClassroomBridge=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CAP=300,PREFIX='cs:classroom:',OWNER='cluck-classroom';
  // Older classroom sessions accepted 500. Keep their restore records readable.
  const RESTORE_CAP=500;
  const types=new Set(['TEXT','RECTANGLE','ELLIPSE','VECTOR','POLYGON','STAR','STAMP','SHAPE_WITH_TEXT','GROUP','INSTANCE']);
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function textOf(n){return String(typeof n.characters==='string'?n.characters:n.text&&typeof n.text.characters==='string'?n.text.characters:'');}
  function classify(n){const text=textOf(n),name=String(n.name||'');const v=text+' '+name;
    const c=/🐔|🐓|🐣|🐤|🐥|\bchicken\b|\brooster\b/i.test(v),m=/🐭|🐁|🐀|\bmouse\b|\bmice\b|\brat\b/i.test(v);return c===m?null:c?'chicken':'mouse';}
  function eligible(n){
    if(!n||!types.has(n.type)||n.removed||!Number.isFinite(n.width)||!Number.isFinite(n.height)||n.width<=0||n.height<=0||n.width>512||n.height>512)return false;
    for(let p=n;p&&p.type!=='PAGE'&&p.type!=='DOCUMENT';p=p.parent)if(p.locked||p.visible===false)return false;
    for(let p=n.parent;p&&p.type!=='PAGE';p=p.parent)if(p.type==='INSTANCE')return false;
    if(n.getPluginData&&(n.getPluginData('cs:owner')||n.getPluginData(PREFIX+'owner')))return false;
    if(n.type==='TEXT'&&textOf(n).length>32)return false;
    let remaining=64;function safe(node){if(--remaining<0||!types.has(node.type)||node.locked||node.visible===false)return false;return !(node.children||[]).some(c=>!safe(c));}
    return safe(n);
  }
  function invertPoint(t,x,y){const d=t[0][0]*t[1][1]-t[0][1]*t[1][0];if(Math.abs(d)<1e-8)throw Error('Cannot move a sticker inside a zero-scale parent.');const dx=x-t[0][2],dy=y-t[1][2];return{x:(t[1][1]*dx-t[0][1]*dy)/d,y:(-t[1][0]*dx+t[0][0]*dy)/d};}
  function relativeTo(parent,absolute){
    const d=parent[0][0]*parent[1][1]-parent[0][1]*parent[1][0];if(Math.abs(d)<1e-8)throw Error('Cannot restore inside a zero-scale group.');
    const p=invertPoint(parent,absolute[0][2],absolute[1][2]);
    return [[(parent[1][1]*absolute[0][0]-parent[0][1]*absolute[1][0])/d,(parent[1][1]*absolute[0][1]-parent[0][1]*absolute[1][1])/d,p.x],[(-parent[1][0]*absolute[0][0]+parent[0][0]*absolute[1][0])/d,(-parent[1][0]*absolute[0][1]+parent[0][0]*absolute[1][1])/d,p.y]];
  }
  function create(figma,options={}){
    const page=figma.currentPage,session=options.session||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const now=options.now||Date.now,post=m=>figma.ui.postMessage(m);
    let roster=new Map(),ledger=null,begun=false,temps=[],lastFrame=-1,queue=Promise.resolve(),saveCounter=0;
    const node=id=>figma.getNodeById(id);
    function current(){if(figma.currentPage.id!==page.id)throw Error('Return to the original battle page before continuing.');}
    function host(){current();let active;try{active=JSON.parse(page.getPluginData(PREFIX+'host')||'null');}catch(e){}
      if(active&&active.session!==session&&now()-active.at<10000)throw Error('Another host is running this classroom battle. Stop their plugin first, then wait 10 seconds.');
      if(!active||active.session!==session||now()-active.at>=2000){
        page.setPluginData(PREFIX+'host',JSON.stringify({session,at:now()}));
      }}
    function save(){const raw=JSON.stringify(ledger),generation=now().toString(36)+'-'+session+'-'+(++saveCounter),keys=[];
      if(raw.length>1500000)throw Error('Restore record too large; use fewer or simpler stickers.');
      for(let i=0;i<raw.length;i+=12000){const key=PREFIX+'save:'+generation+':'+keys.length;page.setPluginData(key,raw.slice(i,i+12000));keys.push(key);}
      let old;try{old=JSON.parse(page.getPluginData(PREFIX+'manifest')||'null');}catch(e){}
      page.setPluginData(PREFIX+'manifest',JSON.stringify({version:1,keys,length:raw.length}));
      if(old)for(const key of old.keys||[])if(key.startsWith(PREFIX+'save:'))page.setPluginData(key,'');
    }
    function load(){const manifest=page.getPluginData(PREFIX+'manifest');if(!manifest)return;
      let meta;try{meta=JSON.parse(manifest);if(meta.version!==1||!Array.isArray(meta.keys)||meta.keys.length>150)throw Error();const raw=meta.keys.map(k=>{if(!k.startsWith(PREFIX+'save:'))throw Error();return page.getPluginData(k);}).join('');if(raw.length!==meta.length)throw Error();ledger=JSON.parse(raw);if(ledger.version!==1||!Array.isArray(ledger.entries)||ledger.entries.length>RESTORE_CAP)throw Error();}
      catch(e){throw Error('A classroom restore record is unreadable. Do not start a new battle until that record has been recovered.');}
      temps=ledger.temps||[];
    }
    function snapshot(n,team){const t=clone(n.absoluteTransform),b=n.absoluteBoundingBox;
      if(!b||!t||!n.relativeTransform)throw Error('This sticker has no usable page geometry.');
      const label=String(n.name||'')+' '+textOf(n);
      const role=/cavalry|knight|lancer/i.test(label)?'cavalry':/spear|pike|phalanx/i.test(label)?'spear':
        /ranger|archer|slinger|🏹/i.test(label)?'ranged':undefined;
      return {id:n.id,team,role,parentId:n.parent.id,relativeTransform:clone(n.relativeTransform),opacity:'opacity'in n?n.opacity:1,
        absolute:t,center:{x:b.x+b.width/2,y:b.y+b.height/2},radius:Math.max(12,Math.min(36,Math.max(b.width,b.height)/2))};}
    function data(){return [...roster.values()].map(s=>({id:s.id,team:s.team,role:s.role,x:s.center.x,y:s.center.y,radius:s.radius}));}
    function move(s,x,y,dead,routed){const n=node(s.id);if(!n||n.removed)throw Error('A combatant was deleted. Pause and restore the remaining stickers.');
      if(n.parent.id!==s.parentId)throw Error('A combatant was moved into another group. Pause and restore; its new parent will be preserved.');
      for(let p=n;p&&p.type!=='PAGE'&&p.type!=='DOCUMENT';p=p.parent)if(p.locked)throw Error('A combatant or parent is locked. Unlock it before restoring.');
      const tx=s.absolute[0][2]+x-s.center.x,ty=s.absolute[1][2]+y-s.center.y;
      const p=n.parent.type==='PAGE'?{x:tx,y:ty}:invertPoint(n.parent.absoluteTransform,tx,ty);
      const current=n.relativeTransform;
      if(Math.abs(current[0][2]-p.x)>.01||Math.abs(current[1][2]-p.y)>.01){
        n.relativeTransform=[[s.relativeTransform[0][0],s.relativeTransform[0][1],p.x],[s.relativeTransform[1][0],s.relativeTransform[1][1],p.y]];
      }
      const opacity=s.opacity*(dead?.25:routed?.7:1);
      if('opacity'in n&&Math.abs(n.opacity-opacity)>.001)n.opacity=opacity;
    }
    function tag(n,kind){n.setPluginData(PREFIX+'owner',OWNER);n.setPluginData(PREFIX+'session',ledger.id);n.setPluginData(PREFIX+'kind',kind);temps.push(n.id);ledger.temps=temps;}
    async function decorations(){
      let font;for(const family of ['Inter','Roboto']){try{font={family,style:'Regular'};await figma.loadFontAsync(font);break;}catch(e){font=null;}}
      if(font){const h=figma.createText();tag(h,'scoreboard');h.fontName=font;h.fontSize=38;h.characters='🐔 CHICKENS  vs  MICE 🐭\nClassroom battle • ready';
        const list=[...roster.values()],xs=list.map(s=>s.center.x),ys=list.map(s=>s.center.y);h.x=Math.min(...xs);h.y=Math.min(...ys)-180;
        // Find an unused strip; do not put the new scoreboard on top of an existing card.
        for(let attempt=0;attempt<30;attempt++){const hb={x:h.x,y:h.y,width:h.width,height:h.height};const overlap=page.children.some(n=>n.id!==h.id&&!roster.has(n.id)&&n.absoluteBoundingBox&&intersects(hb,n.absoluteBoundingBox));if(!overlap)break;h.y-=180;}
      }
      for(let i=0;i<12;i++){const p=figma.createEllipse();tag(p,'projectile');p.resize(10,10);p.opacity=0;p.fills=[{type:'SOLID',color:{r:.95,g:.65,b:.1}}];}
      save();
    }
    function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
    async function handle(m){
      current();const type=m&&m.type;
      if(type==='CB_INIT'){
        try{load();}catch(e){post({type:'CB_ERROR',message:e.message,fatal:true});return;}
        post({type:'CB_READY',cap:CAP,recovery:!!ledger,restorable:ledger?ledger.entries.length:0});return;
      }
      if(type==='CB_HEARTBEAT'){if(begun)host();return;}
      if(type==='CB_ENROLL'){
        if(ledger||begun)throw Error('Restore this battle before changing the roster.');
        if(!['auto','chicken','mouse'].includes(m.team))throw Error('Invalid team.');
        let added=0,skipped=0,unrecognized=0;const next=new Map(roster);
        for(const n of page.selection){if(!eligible(n)){skipped++;continue;}const team=m.team==='auto'?classify(n):m.team;if(!team){unrecognized++;continue;}
          for(const s of next.values()){const other=node(s.id);if(other&&other.id!==n.id){for(let p=n.parent;p;p=p.parent)if(p.id===other.id)throw Error('Select a sticker group or its contents, not both.');for(let p=other.parent;p;p=p.parent)if(p.id===n.id)throw Error('Select a sticker group or its contents, not both.');}}
          if(!next.has(n.id))added++;next.set(n.id,snapshot(n,team));}
        if(next.size>CAP)throw Error('That would enroll '+next.size+' stickers. Maximum '+CAP+'; none from this selection were added.');
        roster=next;post({type:'CB_ROSTER',combatants:data(),added,skipped,unrecognized});return;
      }
      if(type==='CB_CLEAR'){
        if(ledger)throw Error('Restore stickers before clearing the roster.');roster.clear();post({type:'CB_ROSTER',combatants:[],added:0,skipped:0,unrecognized:0});return;
      }
      if(type==='CB_BEGIN'){
        if(begun){post({type:'CB_BEGUN'});return;}if(ledger)throw Error('Restore the previous battle before starting another.');host();
        if(roster.size>CAP||![...roster.values()].some(s=>s.team==='chicken')||![...roster.values()].some(s=>s.team==='mouse'))throw Error('Enroll both armies before starting.');
        // Re-capture immediately before first mutation, so pre-battle student edits are not lost.
        for(const [id,s]of roster){const n=node(id);if(!eligible(n))throw Error('A selected sticker is no longer available. Clear and enroll the armies again.');roster.set(id,snapshot(n,s.team));}
        ledger={version:1,id:session,pageId:page.id,entries:[...roster.values()],temps:[]};save();begun=true;
        await decorations();figma.commitUndo&&figma.commitUndo();post({type:'CB_BEGUN',combatants:data()});return;
      }
      if(type==='CB_FRAME'){
        if(!begun||!ledger)throw Error('Start the classroom session before moving stickers.');host();
        if(!Number.isInteger(m.sequence)||m.sequence<=lastFrame){post({type:'CB_APPLIED',sequence:m.sequence});return;}
        if(!Array.isArray(m.updates)||m.updates.length>160)throw Error('Invalid render batch.');
        // Validate complete batch before applying any writes.
        for(const u of m.updates)if(!roster.has(u.id)||!Number.isFinite(u.x)||!Number.isFinite(u.y)||Math.abs(u.x)>10000000||Math.abs(u.y)>10000000)throw Error('Rejected invalid combatant update.');
        for(const u of m.updates)move(roster.get(u.id),u.x,u.y,!!u.isDead,!!u.isRouted);
        const projectiles=Array.isArray(m.projectiles)?m.projectiles.slice(0,12):[];
        let index=0;for(const id of temps){const n=node(id);if(!n)continue;if(n.getPluginData(PREFIX+'kind')==='projectile'){
          const p=projectiles[index++];if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){n.x=p.x;n.y=p.y;if(n.opacity!==1)n.opacity=1;}else if(n.opacity!==0)n.opacity=0;
        }else if(m.hud&&typeof m.hud==='string'&&n.characters!==m.hud.slice(0,350))n.characters=m.hud.slice(0,350);}
        lastFrame=m.sequence;post({type:'CB_APPLIED',sequence:m.sequence});return;
      }
      if(type==='CB_FOCUS'){
        const ns=[...roster.keys()].map(node).filter(Boolean);for(const id of temps){const n=node(id);if(n&&n.getPluginData(PREFIX+'kind')==='scoreboard')ns.push(n);}if(ns.length)figma.viewport.scrollAndZoomIntoView(ns);return;
      }
      if(type==='CB_RESTORE'){
        host();if(!ledger)load();let missing=0,blocked=0;
        const remaining=[];for(const s of ledger?ledger.entries:[]){const n=node(s.id);if(!n||n.removed){missing++;continue;}
          if(n.parent.id!==s.parentId||n.locked){remaining.push(s);blocked++;continue;}
          // Groups may automatically rebase their origin when children move. Restore the
          // captured absolute transform through today's parent transform in that case.
          try{n.relativeTransform=n.parent.type==='GROUP'?relativeTo(n.parent.absoluteTransform,s.absolute):clone(s.relativeTransform);if('opacity'in n)n.opacity=s.opacity;}catch(e){remaining.push(s);blocked++;}}
        for(const id of temps){const n=node(id);if(n&&n.getPluginData(PREFIX+'owner')===OWNER&&ledger&&n.getPluginData(PREFIX+'session')===ledger.id)n.remove();}
        temps=[];begun=false;lastFrame=-1;
        if(remaining.length){ledger.entries=remaining;ledger.temps=[];save();throw Error(blocked+' stickers were reparented or locked; those were preserved. Move them back/unlock them, then restore again.');}
        if(ledger){ledger.entries=[];ledger.temps=[];save();const meta=JSON.parse(page.getPluginData(PREFIX+'manifest'));for(const k of meta.keys)page.setPluginData(k,'');page.setPluginData(PREFIX+'manifest','');}
        ledger=null;roster.clear();figma.commitUndo&&figma.commitUndo();post({type:'CB_RESTORED',missing});return;
      }
      throw Error('Unknown classroom command.');
    }
    function dispatch(m){const task=queue.then(()=>handle(m));queue=task.catch(e=>post({type:'CB_ERROR',message:e.message}));return queue;}
    figma.ui.onmessage=dispatch;
    if(figma.on){figma.on('currentpagechange',()=>post({type:'CB_ERROR',message:'Page changed. Battle paused; return to its original page to restore.'}));figma.on('close',()=>{try{const active=JSON.parse(page.getPluginData(PREFIX+'host')||'null');if(active&&active.session===session)page.setPluginData(PREFIX+'host','');}catch(e){}});}
    return {dispatch,getRoster:()=>[...roster.values()]};
  }
  return {CAP,eligible,classify,invertPoint,create};
});
