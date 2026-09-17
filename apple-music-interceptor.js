(() => {
  const scriptEl = document.currentScript;
  const originalFetch = window.fetch;
  function extractUrl(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    if (input instanceof Request) return input.url;
    return '';
  }
  function attrsToTrack(a, placeholder=false) {
    return {title:a?.name ?? '[Unavailable / unreleased track]',artist:a?.artistName ?? '',album:a?.albumName,duration:a?.durationInMillis,placeholder:placeholder || !a?.name};
  }
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = extractUrl(args[0]);
      if (!url.includes('amp-api.music.apple.com') || !url.includes('/playlists/')) return response;
      const u = new URL(url), offset = parseInt(u.searchParams.get('offset') || '0', 10), isTrackPage = url.includes('/tracks');
      response.clone().json().then(json => {
        try {
          const tracks=[]; let title, creator, totalCount;
          const pd=json?.data?.[0];
          if (pd?.attributes?.name) { title=pd.attributes.name; creator=pd.attributes.curatorName; }
          if (pd?.relationships?.tracks?.meta?.total) totalCount=pd.relationships.tracks.meta.total;
          if (json?.resources?.['library-playlists']) for (const pl of Object.values(json.resources['library-playlists'])) {
            if (!title && pl?.attributes?.name) title=pl.attributes.name;
            if (pl?.relationships?.tracks?.meta?.total) totalCount=pl.relationships.tracks.meta.total;
          }
          if (json?.resources?.playlists) for (const pl of Object.values(json.resources.playlists)) {
            if (!title && pl?.attributes?.name) title=pl.attributes.name;
            if (!creator && pl?.attributes?.curatorName) creator=pl.attributes.curatorName;
          }

          const rel=pd?.relationships?.tracks?.data ?? [];
          const resources=json?.resources ?? {};
          const librarySongs=resources['library-songs'] ?? {};
          const songs=resources.songs ?? {};
          const songResources = Object.keys(librarySongs).length ? librarySongs : songs;

          // v18 FIX: track-page json.data is the ordered playlist occurrence list.
          // resources is a map keyed by ID, so repeated songs collapse there. Resolve EACH
          // data item through the resource map to preserve duplicate occurrences and order.
          let resolvedFromData=0, unresolvedFromData=0;
          if (isTrackPage && Array.isArray(json?.data) && json.data.length) {
            for (const item of json.data) {
              const id=item?.id;
              const resource=(id && (librarySongs[id] ?? songs[id])) || null;
              const a=resource?.attributes ?? item?.attributes;
              if (a) { tracks.push({id, ...attrsToTrack(a)}); resolvedFromData++; }
              else { tracks.push({id, ...attrsToTrack(null,true)}); unresolvedFromData++; }
            }
            if (json?.meta?.total) totalCount=json.meta.total;
          } else {
            for (const t of rel) tracks.push({id:t?.id, ...attrsToTrack(t?.attributes)});
            if (tracks.length===0 && Object.keys(songResources).length) {
              for (const [id,song] of Object.entries(songResources)) tracks.push({id, ...attrsToTrack(song?.attributes)});
            }
          }

          const next = json?.next ?? pd?.relationships?.tracks?.next ?? null;
          const rawDataCount = Array.isArray(json?.data) ? json.data.length : 0;
          const relCount = Array.isArray(rel) ? rel.length : 0;
          const resourceSongCount = Object.keys(songResources).length;
          const ids=(isTrackPage && Array.isArray(json?.data)) ? json.data.map(x=>x?.id).filter(Boolean) : [];
          const freq={}; for(const id of ids) freq[id]=(freq[id]||0)+1;
          const duplicateIds=Object.entries(freq).filter(([,n])=>n>1).map(([id,count])=>({id,count}));
          const duplicateOccurrences=duplicateIds.reduce((n,x)=>n+(x.count-1),0);
          const resourceBuckets=Object.fromEntries(Object.entries(resources).map(([k,v])=>[k, v && typeof v==='object' ? Object.keys(v).length : 0]));

          scriptEl?.dispatchEvent(new CustomEvent('playlist-data',{detail:JSON.stringify({source:'apple-music',title,creator,tracks,offset,totalCount,isTrackPage,diag:{url,offset,isTrackPage,tracksParsed:tracks.length,rawDataCount,relCount,resourceSongCount,placeholderCount:tracks.filter(t=>t.placeholder).length,resolvedFromData,unresolvedFromData,uniqueDataIds:new Set(ids).size,duplicateOccurrences,duplicateIds,resourceBuckets,hasNext:!!next,next}})}));
        } catch(e) { console.error('[playlist-exporter v18] parse',e); }
      });
    } catch(e) { console.error('[playlist-exporter v18] fetch',e); }
    return response;
  };
})();
