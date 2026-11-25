/* Issue & Return page - talks to the Google Sheet through the Apps Script web app. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const page = $('issuePage'), SHEET = window.HANGER_SHEET_URL || '';
  const HIDE = ['main.content > .page-intro', 'main.content > .inventory-panel', 'main.content > .page-tip'];
  let data = { tools: [], open: [], people: [] }, pin = sessionStorage.getItem('hanger-pin') || '', toolMap = new Map(), returning = null;

  function toast(msg, error) { const t = document.createElement('div'); t.className = 'toast' + (error ? ' error' : ''); t.textContent = msg; $('toastStack').appendChild(t); setTimeout(() => t.remove(), 4500); }
  async function call(action, extra = {}) {
    if (!SHEET) throw new Error('Google Sheet is not connected yet. Paste the web app link into config.js.');
    if (!pin) pin = (prompt('Enter the store staff PIN') || '').trim();
    const r = await fetch(SHEET, { method: 'POST', body: JSON.stringify({ action, pin, ...extra }) });
    const j = await r.json();
    if (!j.ok) { if (/PIN/i.test(j.error || '')) { pin = ''; sessionStorage.removeItem('hanger-pin'); } throw new Error(j.error || 'Request failed'); }
    sessionStorage.setItem('hanger-pin', pin); data = j.data; return j;
  }
  function render() {
    toolMap = new Map(data.tools.map(t => [`${t.id} · ${t.name}`, t]));
    const opts = a => a.map(x => `<option value="${esc(x)}">`).join('');
    page.innerHTML = `<section class="page-intro"><div><div class="eyebrow">STORE COUNTER <span class="eyebrow-line"></span> ISSUE &amp; RETURN</div><h1>Issue &amp; return</h1><p>Record tools taken from and returned to the store.</p></div><button class="button button-outline" id="irRefresh">Refresh</button></section>
    <section class="inventory-panel ir-card"><h2>Take tools</h2><form id="irForm" novalidate><div class="form-grid">
      <label class="form-field"><span>Name <b>*</b></span><input name="name" list="irNames" autocomplete="off" required></label>
      <label class="form-field"><span>Badge <b>*</b></span><input name="badge" list="irBadges" autocomplete="off" required></label>
      <label class="form-field"><span>Class <b>*</b></span><input name="cls" list="irClasses" autocomplete="off" required></label>
      <label class="form-field"><span>Quantity <b>*</b></span><input name="qty" type="number" min="1" step="1" value="1" required></label>
      <label class="form-field form-field-wide"><span>Tool <b>*</b> <small>(type to search, shows how many are available)</small></span><input name="tool" list="irTools" autocomplete="off" placeholder="e.g. Vernier" required></label></div>
      <datalist id="irNames">${opts([...new Set(data.people.map(p => p.name))])}</datalist><datalist id="irBadges">${opts([...new Set(data.people.map(p => p.badge))])}</datalist><datalist id="irClasses">${opts([...new Set(data.people.map(p => p.cls))])}</datalist>
      <datalist id="irTools">${data.tools.filter(t => t.avail > 0).map(t => `<option value="${esc(t.id + ' · ' + t.name)}">${t.avail} available</option>`).join('')}</datalist>
      <p class="form-error" id="irError" hidden></p><div class="ir-actions"><button class="button button-primary" type="submit">Yes, I took these tools</button></div></form></section>
    <section class="inventory-panel ir-card"><h2>Currently out <span class="count-pill">${data.open.length}</span></h2><div class="table-scroll"><table class="data-table"><thead><tr><th>DATE OUT</th><th>NAME</th><th>BADGE</th><th>CLASS</th><th>TOOL</th><th>OUT</th><th></th></tr></thead><tbody>${data.open.map(o => `<tr><td>${esc(o.date)}</td><td>${esc(o.name)}</td><td>${esc(o.badge)}</td><td>${esc(o.cls)}</td><td>${esc(o.tool)}</td><td><b>${o.qty - o.returned}</b>${o.returned ? ` <span class="table-muted">of ${o.qty}</span>` : ''}</td><td><button class="button button-small button-outline" data-return="${esc(o.id)}">Return</button></td></tr>`).join('') || '<tr><td colspan="7" class="table-muted">Nothing is out right now.</td></tr>'}</tbody></table></div></section>`;
    $('irRefresh').onclick = load;
    $('irForm').onsubmit = submit;
    $('irForm').elements.name.addEventListener('change', e => { const p = data.people.find(x => x.name === e.target.value); if (p) { $('irForm').elements.badge.value = p.badge; $('irForm').elements.cls.value = p.cls; } });
    page.querySelectorAll('[data-return]').forEach(b => b.onclick = () => askReturn(data.open.find(o => o.id === b.dataset.return)));
  }
  async function load() { try { await call('list'); render(); } catch (e) { page.innerHTML = `<section class="page-intro"><div><h1>Issue &amp; return</h1><p class="form-error">${esc(e.message)}</p></div><button class="button button-outline" id="irRefresh">Try again</button></section>`; $('irRefresh').onclick = load; } }
  async function submit(ev) {
    ev.preventDefault(); const f = new FormData(ev.target), t = toolMap.get(f.get('tool')), err = $('irError'); err.hidden = true;
    try {
      if (!t) throw new Error('Pick a tool from the list.');
      await call('issue', { name: f.get('name'), badge: f.get('badge'), cls: f.get('cls'), toolId: t.id, qty: Number(f.get('qty')) });
      render(); toast(`Recorded: ${f.get('qty')} × ${t.name}`);
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  }
  function askReturn(o) {
    returning = o; const left = o.qty - o.returned;
    let d = $('irReturn');
    if (!d) { d = document.createElement('dialog'); d.id = 'irReturn'; d.className = 'compact-dialog confirmation-dialog'; document.body.appendChild(d); }
    d.innerHTML = `<div class="compact-content"><h2>Returning ${esc(o.tool)}</h2><p>${esc(o.name)} (${esc(o.badge)}) has ${left} out.</p><label class="form-field ir-qty"><span>How many are being returned?</span><input id="irQty" type="number" min="1" max="${left}" value="${left}"></label><p class="form-error" id="irRetErr" hidden></p><div class="dialog-footer"><button class="button button-outline" id="irRetCancel">Cancel</button><button class="button button-primary" id="irRetOk">Yes, returned</button></div></div>`;
    $('irRetCancel').onclick = () => d.close();
    $('irRetOk').onclick = async () => { try { await call('return', { logId: returning.id, qty: Number($('irQty').value) }); d.close(); render(); toast('Return recorded.'); } catch (e) { $('irRetErr').textContent = e.message; $('irRetErr').hidden = false; } };
    d.showModal();
  }
  function enter() {
    HIDE.forEach(s => document.querySelector(s).hidden = true); $('statsGrid').hidden = true; page.hidden = false;
    document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active')); $('issueNav').classList.add('active');
    $('breadcrumbCurrent').textContent = 'Issue & Return'; $('sidebar').classList.remove('open'); $('mobileScrim').hidden = true; load();
  }
  function leave() {
    page.hidden = true; $('issueNav').classList.remove('active');
    setTimeout(() => { HIDE.forEach(s => document.querySelector(s).hidden = false); $('statsGrid').hidden = document.querySelector('[data-view="trash"]').classList.contains('active'); }, 0);
  }
  $('issueNav').addEventListener('click', enter);
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { if (!page.hidden) leave(); }));
})();
