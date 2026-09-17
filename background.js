function badgeText(n, complete) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return String(n);
  return complete ? String(n) : `${n}↓`;
}
function updateBadge(p) {
  const have = p.tracks.length, total = p.totalCount ?? have, complete = have >= total;
  browser.action.setBadgeText({text: badgeText(have, complete)});
  browser.action.setBadgeBackgroundColor({color: complete ? '#22c55e' : '#f59e0b'});
}
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'PLAYLIST_DETECTED') {
    const playlist = message.payload;
    browser.storage.local.set({playlist}); updateBadge(playlist); return Promise.resolve({ok:true});
  }
  if (message.type === 'GET_PLAYLIST') {
    return browser.storage.local.get('playlist').then(r => r.playlist ?? null);
  }
});
