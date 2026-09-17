(() => {
  let metadata=null, allTracks=[], totalCount=0, running=false, diagPages=new Map();
  const injected=document.createElement('script'); injected.src=browser.runtime.getURL('apple-music-interceptor.js'); injected.dataset.pe='v19';
  (document.head || document.documentElement).appendChild(injected);
  injected.addEventListener('playlist-data', e => {
    try {
      const raw=JSON.parse(e.detail), offset=raw.offset ?? 0;
      const tracks=(raw.tracks ?? []).map(t=>({id:t.id ?? '',title:t.title ?? '',artist:t.artist ?? '',album:t.album,duration:t.duration}));
      if(raw.title) metadata={title:raw.title,creator:raw.creator};
      if(raw.totalCount) totalCount=raw.totalCount;
      if(raw.diag){const k=`${raw.diag.isTrackPage?'T':'P'}:${raw.diag.offset}:${raw.diag.url}`;diagPages.set(k,{...raw.diag,seenAt:new Date().toISOString()});}
      if(raw.isTrackPage && offset>0) {
        while(allTracks.length<offset) allTracks.push({id:'',title:'',artist:''});
        allTracks.splice(offset,tracks.length,...tracks);
      } else allTracks=tracks;
      const payload={source:'apple-music',title:metadata?.title ?? 'Unknown Playlist',creator:metadata?.creator,tracks:allTracks.filter(t=>t.title!==''),totalCount:totalCount || allTracks.length,detectedAt:Date.now(),diagnostics:[...diagPages.values()]};
      browser.runtime.sendMessage({type:'PLAYLIST_DETECTED',payload});
    } catch(err){console.error('[playlist-exporter v19] content',err);}
  });
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const scroller=()=>document.querySelector('#scrollable-page');
  const getPlaylist=async()=>{try{return await browser.runtime.sendMessage({type:'GET_PLAYLIST'});}catch{return null;}};
  const css=(el,o)=>Object.assign(el.style,o);
  function statusEl(){let s=document.getElementById('pe-v19-status'); if(!s){s=document.createElement('div');s.id='pe-v19-status';css(s,{position:'fixed',right:'20px',bottom:'70px',zIndex:'2147483647',padding:'7px 10px',borderRadius:'8px',background:'rgba(17,24,39,.94)',color:'#fff',font:'600 12px/1.3 system-ui,sans-serif',boxShadow:'0 3px 12px rgba(0,0,0,.3)'});document.documentElement.appendChild(s);}return s;}
  const setStatus=t=>{statusEl().textContent=t;console.log('[playlist-exporter v19]',t);};
  async function refresh(){if(running)return;const p=await getPlaylist();if(!p){setStatus('Open an Apple Music playlist');return;}const h=p.tracks.length,t=p.totalCount??h;setStatus(h>=t?`READY — ${h} TRACKS`:`${h} / ${t} TRACKS`);}
  async function loadAll(btn){
    if(running){running=false;btn.textContent='LOAD ALL';setStatus('CANCELLED');return;}
    const sc=scroller();if(!sc){setStatus('Apple Music playlist not ready');return;}
    running=true;btn.textContent='CANCEL';let lastHeight=sc.scrollHeight,stable=0;
    for(let i=1;i<=120&&running;i++){
      sc.scrollTop=sc.scrollHeight;sc.dispatchEvent(new Event('scroll',{bubbles:true}));await sleep(1400);
      const p=await getPlaylist(),h=p?.tracks.length??0,t=p?.totalCount??h;setStatus(t?`LOADING — ${h} / ${t}`:'LOADING…');if(t>0&&h>=t)break;
      const sh=sc.scrollHeight;stable=sh>lastHeight+5?0:stable+1;lastHeight=sh;
      if(stable>=2){sc.scrollTop=Math.max(0,sh-sc.clientHeight-900);sc.dispatchEvent(new Event('scroll',{bubbles:true}));await sleep(300);sc.scrollTop=sc.scrollHeight;sc.dispatchEvent(new Event('scroll',{bubbles:true}));}
      if(stable>=10)break;
    }
    running=false;btn.textContent='LOAD ALL';const p=await getPlaylist();if(p){const h=p.tracks.length,t=p.totalCount??h,m=Math.max(0,t-h);const d=diagSummary(p);setStatus(h>=t?`READY — ${h} TRACKS`:`STOPPED — ${h} / ${t} (MISSING ${m}) • API REQS ${d.requests} • DUPLICATES ${d.duplicates} • UNRESOLVED ${d.unresolved}`);}else setStatus('DONE');
  }
  function esc(v){v=String(v??'');return /[,"\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;}
  function csv(p){return ['title,artist,album,duration_ms',...p.tracks.map(t=>`${esc(t.title)},${esc(t.artist)},${esc(t.album)},${t.duration??''}`)].join('\n')+'\n';}
  function safe(n){return (n||'apple-music-playlist').replace(/[\\/:*?"<>|]/g,'_').trim()||'apple-music-playlist';}
  function duplicateGroups(p){
    const groups=new Map();
    (p?.tracks??[]).forEach((t,i)=>{
      const meta=[t.title??'',t.artist??'',t.album??''].map(x=>String(x).trim().toLocaleLowerCase()).join('\u241f');
      const key=t.id ? `id:${t.id}` : `meta:${meta}`;
      if(!groups.has(key)) groups.set(key,{id:t.id??'',title:t.title??'',artist:t.artist??'',album:t.album??'',positions:[]});
      groups.get(key).positions.push(i+1);
    });
    return [...groups.values()].filter(g=>g.positions.length>1).sort((a,b)=>a.positions[0]-b.positions[0]);
  }
  function duplicateCsv(p){
    const groups=duplicateGroups(p);
    return ['title,artist,album,count,extra_occurrences,positions,apple_music_id',...groups.map(g=>`${esc(g.title)},${esc(g.artist)},${esc(g.album)},${g.positions.length},${g.positions.length-1},${esc(g.positions.join(';'))},${esc(g.id)}`)].join('\n')+'\n';
  }
  async function exportDuplicates(btn){
    const p=await getPlaylist();if(!p?.tracks?.length){setStatus('No playlist data yet');return;}
    const groups=duplicateGroups(p),extras=groups.reduce((n,g)=>n+g.positions.length-1,0);
    if(!groups.length){setStatus('NO DUPLICATES FOUND');const old=btn.textContent;btn.textContent='NONE ✓';setTimeout(()=>btn.textContent=old,1800);return;}
    downloadText(`${safe(p.title)}-duplicates.csv`,duplicateCsv(p),'text/csv;charset=utf-8');
    const old=btn.textContent;btn.textContent='EXPORTED ✓';setStatus(`DUPLICATES — ${groups.length} SONGS / ${extras} EXTRA OCCURRENCES`);setTimeout(()=>btn.textContent=old,1800);
  }
  async function exportNow(btn){
    const p=await getPlaylist();if(!p?.tracks?.length){setStatus('No playlist data yet');return;}
    const h=p.tracks.length,t=p.totalCount??h,m=Math.max(0,t-h);
    const blob=new Blob([csv(p)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safe(p.title)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    const old=btn.textContent;btn.textContent='EXPORTED ✓';setStatus(m?`EXPORTED — ${h} TRACKS (MISSING ${m})`:`EXPORTED — ${h} TRACKS`);setTimeout(()=>btn.textContent=old,1800);
  }

  function trackKey(t){
    const meta=[t?.title??'',t?.artist??'',t?.album??''].map(x=>String(x).trim().toLocaleLowerCase()).join('\u241f');
    return t?.id ? `id:${t.id}` : `meta:${meta}`;
  }
  function sameMultiset(a,b){
    if(a.length!==b.length)return false;
    const m=new Map(); for(const k of a)m.set(k,(m.get(k)||0)+1);
    for(const k of b){const n=m.get(k)||0;if(!n)return false;n===1?m.delete(k):m.set(k,n-1);} return m.size===0;
  }
  function analyzeDuplicateBlocks(p){
    const tracks=p?.tracks??[], groups=duplicateGroups(p), diffs=new Map();
    for(const g of groups){const ps=g.positions;for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const d=ps[j]-ps[i];diffs.set(d,(diffs.get(d)||0)+1);}}
    const ranked=[...diffs.entries()].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
    if(!ranked.length)return null;
    const [shift,shiftMatches]=ranked[0];
    const keys=tracks.map(trackKey), src=[];
    for(let i=0;i+shift<keys.length;i++)if(keys[i]===keys[i+shift])src.push(i);
    let best=null,start=null,prev=null;
    for(const i of [...src,Number.POSITIVE_INFINITY]){
      if(start===null){start=i;prev=i;continue;}
      if(i===prev+1){prev=i;continue;}
      const run={start,end:prev,length:prev-start+1};if(!best||run.length>best.length)best=run;start=i;prev=i;
    }
    if(!best||!Number.isFinite(best.start))return {shift,shiftMatches,exact:null};
    let blockStart=best.start, note='Exact-order duplicate block';
    // If everything before the exact run matches the corresponding target window as a multiset,
    // treat it as a reordered prefix of the same duplicated block.
    if(best.start>0 && best.start<=shift){
      const a=keys.slice(0,best.start), b=keys.slice(shift,shift+best.start);
      if(a.length && sameMultiset(a,b)){blockStart=0;note=`First ${best.start} tracks contain the same songs but in a different order`;}
    }
    const blockEnd=best.end, dupStart=blockStart+shift, dupEnd=blockEnd+shift;
    return {shift,shiftMatches,blockStart:blockStart+1,blockEnd:blockEnd+1,dupStart:dupStart+1,dupEnd:dupEnd+1,
      exactStart:best.start+1,exactEnd:best.end+1,exactDupStart:best.start+shift+1,exactDupEnd:best.end+shift+1,note,
      originalFirst:tracks[blockStart],originalLast:tracks[blockEnd],duplicateFirst:tracks[dupStart],duplicateLast:tracks[dupEnd],after:tracks[dupEnd+1]??null};
  }
  function fmtTrack(t){return t?`${t.title || '[Untitled]'} — ${t.artist || '[Unknown artist]'}`:'(end of playlist)';}
  async function showBlocks(){
    const p=await getPlaylist();if(!p?.tracks?.length){setStatus('No playlist data yet');return;}
    const a=analyzeDuplicateBlocks(p);if(!a){setStatus('NO DUPLICATE BLOCK FOUND');return;}
    let panel=document.getElementById('pe-v19-block-panel');if(panel)panel.remove();
    panel=document.createElement('div');panel.id='pe-v19-block-panel';css(panel,{position:'fixed',right:'20px',bottom:'118px',zIndex:'2147483647',width:'min(560px,calc(100vw - 40px))',maxHeight:'60vh',overflow:'auto',padding:'16px',borderRadius:'12px',background:'rgba(17,24,39,.98)',color:'#fff',font:'13px/1.5 system-ui,sans-serif',boxShadow:'0 8px 28px rgba(0,0,0,.45)'});
    const title=document.createElement('div');title.textContent='LIKELY DUPLICATE BLOCK';css(title,{fontWeight:'800',fontSize:'14px',marginBottom:'10px'});
    const lines=[
      `Original: ${a.blockStart}–${a.blockEnd} (${a.blockEnd-a.blockStart+1} tracks)`,
      `  START  ${fmtTrack(a.originalFirst)}`,
      `  END    ${fmtTrack(a.originalLast)}`,
      `Duplicate: ${a.dupStart}–${a.dupEnd} (${a.dupEnd-a.dupStart+1} tracks)`,
      `  START  ${fmtTrack(a.duplicateFirst)}`,
      `  END    ${fmtTrack(a.duplicateLast)}`,
      `Exact same order: ${a.exactStart}–${a.exactEnd} ↔ ${a.exactDupStart}–${a.exactDupEnd}`,
      a.note,
      `After duplicate block: ${a.dupEnd+1}  ${fmtTrack(a.after)}`,
      `Dominant position shift: +${a.shift} (${a.shiftMatches} duplicate-pair matches)`
    ];
    const pre=document.createElement('pre');pre.textContent=lines.join('\n');css(pre,{whiteSpace:'pre-wrap',margin:'0',font:'12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace'});
    const close=document.createElement('button');close.textContent='CLOSE';css(close,{marginTop:'12px',padding:'7px 10px',border:'0',borderRadius:'7px',background:'#374151',color:'#fff',fontWeight:'700',cursor:'pointer'});close.onclick=()=>panel.remove();
    panel.append(title,pre,close);document.documentElement.appendChild(panel);setStatus(`BLOCK — ${a.blockStart}–${a.blockEnd} ↔ ${a.dupStart}–${a.dupEnd}`);
  }
  function diagSummary(p){
    const ds=p?.diagnostics??[], pages=ds.filter(d=>d.isTrackPage), offsets=[...new Set(pages.map(d=>d.offset))].sort((a,b)=>a-b);
    const parsed=pages.reduce((n,d)=>n+(d.tracksParsed||0),0), placeholders=pages.reduce((n,d)=>n+(d.placeholderCount||0),0), duplicates=pages.reduce((n,d)=>n+(d.duplicateOccurrences||0),0), unresolved=pages.reduce((n,d)=>n+(d.unresolvedFromData||0),0);
    return {requests:pages.length,offsets,parsed,placeholders,duplicates,unresolved,last:pages.sort((a,b)=>String(a.seenAt).localeCompare(String(b.seenAt))).at(-1)};
  }
  function downloadText(name,text,type='text/plain;charset=utf-8'){
    const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportDiag(){
    const p=await getPlaylist();if(!p){setStatus('No diagnostic data yet');return;}
    const d=diagSummary(p),dg=duplicateGroups(p),report={playlist:p.title,totalCount:p.totalCount,exportableTracks:p.tracks?.length??0,missing:Math.max(0,(p.totalCount??0)-(p.tracks?.length??0)),globalDuplicateSongs:dg.length,globalExtraOccurrences:dg.reduce((n,g)=>n+g.positions.length-1,0),globalDuplicates:dg,summary:d,requests:p.diagnostics??[]};
    downloadText(`${safe(p.title)}-diagnostic-v19.json`,JSON.stringify(report,null,2),'application/json;charset=utf-8');
    setStatus(`DIAG EXPORTED — API ${p.tracks?.length??0}/${p.totalCount??0}, REQS ${d.requests}, DUPLICATES ${d.duplicates}, UNRESOLVED ${d.unresolved}`);
  }

  function install(){
    if(document.getElementById('pe-v19-controls'))return;const wrap=document.createElement('div');wrap.id='pe-v19-controls';css(wrap,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483647',display:'flex',gap:'8px'});
    const common={padding:'11px 14px',border:'0',borderRadius:'8px',color:'#fff',font:'700 12px system-ui,sans-serif',cursor:'pointer',boxShadow:'0 3px 12px rgba(0,0,0,.3)'};
    const load=document.createElement('button');load.textContent='LOAD ALL';css(load,{...common,background:'#111827'});load.onclick=()=>loadAll(load);
    const exp=document.createElement('button');exp.textContent='EXPORT CSV';css(exp,{...common,background:'#166534'});exp.onclick=()=>exportNow(exp);const dup=document.createElement('button');dup.textContent='EXPORT DUPLICATES';css(dup,{...common,background:'#b45309'});dup.onclick=()=>exportDuplicates(dup);const block=document.createElement('button');block.textContent='SHOW BLOCK';css(block,{...common,background:'#0369a1'});block.onclick=()=>showBlocks();const diag=document.createElement('button');diag.textContent='EXPORT DIAG';css(diag,{...common,background:'#7c3aed'});diag.onclick=()=>exportDiag();wrap.append(load,exp,dup,block,diag);document.documentElement.appendChild(wrap);statusEl();refresh();
  }
  function boot(){install();setInterval(()=>{if(!document.getElementById('pe-v19-controls'))install();else refresh();},2000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
