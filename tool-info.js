/* Tool reference info: purpose + how it works (from tools-data.js) and a live photo/summary from Wikipedia. */
(() => {
  'use strict';
  const fams = window.HANGER_FAMILIES || [], KEY = 'hanger-wiki-v1', pending = new Map();
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) {}
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const familyFor = name => fams.find(f => f.re.test(name || '')) || null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) {} };
  function wiki(f) {
    if (!f || !f.w.length) return Promise.resolve(null);
    if (f.k in cache) return Promise.resolve(cache[f.k]);
    if (pending.has(f.k)) return pending.get(f.k);
    const p = (async () => {
      let failed = false;
      for (const t of f.w) {
        try {
          const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/ /g, '_')) + '?redirect=true');
          if (!r.ok) continue;
          const j = await r.json();
          if (j.type === 'disambiguation') continue;
          const big = j.originalimage && j.originalimage.width <= 2200 ? j.originalimage.source : null;
          const out = { title: j.title, extract: j.extract || '', img: j.thumbnail && j.thumbnail.source, big, url: j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page };
          if (out.extract || out.img) { cache[f.k] = out; save(); return out; }
        } catch (_) { failed = true; }
      }
      if (!failed) { cache[f.k] = null; save(); }
      return null;
    })().finally(() => pending.delete(f.k));
    pending.set(f.k, p);
    return p;
  }
  function decorate(root) {
    root.querySelectorAll('.tool-cell[data-id]').forEach(cell => {
      const av = cell.querySelector('.tool-avatar');
      if (!av) return;
      const f = familyFor(cell.querySelector('.tool-name')?.textContent);
      wiki(f).then(w => {
        if (!w || !w.img || !av.isConnected) return;
        const img = new Image(); img.className = 'tool-thumb'; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        img.onload = () => { if (av.isConnected) av.replaceWith(img); };
        img.src = w.img;
      });
    });
  }
  async function open(r) {
    const f = familyFor(r.name), box = document.getElementById('infoBody');
    document.getElementById('infoTitle').textContent = r.name;
    document.getElementById('infoKicker').textContent = (r.category || 'TOOL').toUpperCase() + ' · ' + r.sku;
    const facts = `<div class="info-facts"><div><small>Quantity</small><b>${esc(r.quantity)}</b></div><div><small>Status</small><b>${esc(r.status)}</b></div><div><small>Location</small><b>${esc(r.location || 'Not specified')}</b></div></div>`;
    const text = f ? `<h3>What it is used for</h3><p>${esc(f.p)}</p><h3>How it works</h3><p>${esc(f.h)}</p>` : '<p class="info-empty">No reference information has been added for this tool yet.</p>';
    box.innerHTML = `<div class="info-photo" id="infoPhoto" hidden></div>${facts}${text}<div id="infoWiki"></div>`;
    document.getElementById('infoDialog').showModal();
    if (!f || !f.w.length) return;
    document.getElementById('infoWiki').innerHTML = '<p class="info-note">Loading photo and summary…</p>';
    const w = await wiki(f), slot = document.getElementById('infoWiki');
    if (!slot) return;
    if (!w) { slot.innerHTML = '<p class="info-note">Photo and summary unavailable (offline or not found).</p>'; return; }
    if (w.img || w.big) {
      const ph = document.getElementById('infoPhoto'), img = new Image(); img.alt = r.name; img.referrerPolicy = 'no-referrer';
      img.onload = () => { ph.replaceChildren(img); ph.hidden = false; };
      img.onerror = () => { if (img.src !== w.img && w.img) img.src = w.img; };
      img.src = w.big || w.img;
    }
    slot.innerHTML = `<h3>About: ${esc(w.title)}</h3><p>${esc(w.extract)}</p><p class="info-note">Text and photo from <a href="${esc(w.url || 'https://en.wikipedia.org')}" target="_blank" rel="noopener">Wikipedia</a> (Wikimedia Commons, free licence). Photo shows the general tool type, not your exact item.</p>`;
  }
  window.HangerInfo = { familyFor, decorate, open };
})();
