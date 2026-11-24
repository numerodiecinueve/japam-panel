/* JAPAM · Carnets QR  (se integra solo al panel; solo administración)
 *
 * Instalación: guarda este archivo junto a index.html y, en index.html, reemplaza el final
 *     </script></body></html>
 * por
 *     </script>
 *     <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 *     <script src="carnets.js"></script>
 *     </body></html>
 *
 * Requiere en Supabase: Edge Function "card-api" (acciones issue / revoke)
 * y, opcional, la columna students.photo_url.
 */
(() => {
  const carnetCss = `
  .carnet{width:324px;height:204px;border-radius:14px;border:1px solid #b8c4dd;background:#fff;display:flex;flex-direction:column;overflow:hidden;
    font-family:system-ui,"Segoe UI",Arial,sans-serif;break-inside:avoid;color:#0B2A6B;box-sizing:border-box;
    -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .carnet .hd{height:44px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px;color:#fff;background:linear-gradient(100deg,#0B2A6B,#1F4FA8);border-bottom:3px solid #FFC928}
  .carnet .hd img{height:34px;width:auto}
  .carnet .hd b{display:block;font-size:11px;letter-spacing:.04em;line-height:1.15}
  .carnet .hd small{display:block;font-size:8px;line-height:1.15;opacity:.92}
  .carnet .bd{flex:1;min-height:0;display:flex;gap:10px;padding:8px 10px}
  .carnet .lf{width:74px;flex:none;display:flex;flex-direction:column;align-items:center;gap:4px}
  .carnet .foto{width:74px;height:92px;object-fit:cover;border-radius:8px;background:#dfe6f3;border:1px solid #c5d0e6;display:grid;place-items:center;font-weight:800;font-size:22px;color:#6b7fa8}
  .carnet .lf small{font-size:7px;text-align:center;line-height:1.15;color:#5b6b8c}
  .carnet .rt{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between}
  .carnet .nm{font-size:13px;font-weight:800;line-height:1.15;text-transform:uppercase;word-break:break-word}
  .carnet .gr{font-size:10px;margin-top:3px;color:#33466f;font-weight:600}
  .carnet .qr{width:92px;height:92px;align-self:flex-end;background:#fff}
  .carnet .qr img,.carnet .qr canvas{width:92px!important;height:92px!important;display:block}
  `;
  const css = carnetCss + `
  .cn-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px}
  .cn-note{color:var(--mut);font-size:13.5px;min-height:20px;margin-top:10px}
  #carnets-print{display:flex;flex-wrap:wrap;gap:12px;margin-top:6px}`;

  const E = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const gradeTxt = s => [s.grade, s.section].filter(Boolean).join(' ');

  function carnetHTML(st, id) {
    const ini = String(st.name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const foto = st.photo_url
      ? `<img class="foto" src="${E(st.photo_url)}" alt="">`
      : `<div class="foto">${E(ini)}</div>`;
    return `
    <div class="carnet">
      <div class="hd">
        <img src="escudo.png" alt="">
        <div><b>I.E. 56004</b><small>Cap. Julio A. Ponce Antúnez de Mayolo</small></div>
      </div>
      <div class="bd">
        <div class="lf">${foto}<small>Carnet personal<br>e intransferible</small></div>
        <div class="rt">
          <div><div class="nm">${E(st.name)}</div><div class="gr">${E(st.level ? st.level + ' · ' : '')}${E(gradeTxt(st))}</div></div>
          <div class="qr" id="${id}"></div>
        </div>
      </div>
    </div>`;
  }

  function drawQR(elId, text) {
    new QRCode(document.getElementById(elId), { text, width: 92, height: 92, correctLevel: QRCode.CorrectLevel.M });
  }

  function printCarnets(out) {
    const clone = out.cloneNode(true);
    const src = [...out.querySelectorAll('.qr')], dst = [...clone.querySelectorAll('.qr')];
    src.forEach((q, i) => {
      const cv = q.querySelector('canvas'), im = document.createElement('img');
      im.src = cv ? cv.toDataURL('image/png') : ((q.querySelector('img') || {}).src || '');
      dst[i].innerHTML = ''; dst[i].appendChild(im);
    });
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentDocument; d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.href}"><title>Carnets JAPAM</title>
      <style>${carnetCss}@page{margin:10mm}body{margin:0;background:#fff}.g{display:flex;flex-wrap:wrap;gap:6mm}</style></head>
      <body><div class="g">${clone.innerHTML}</div></body></html>`);
    d.close();
    const imgs = [...d.images].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }));
    Promise.all(imgs).then(() => {
      f.contentWindow.focus(); f.contentWindow.print();
      setTimeout(() => f.remove(), 60000);
    });
  }

  async function callApi(body) {
    const { data, error } = await db.functions.invoke('card-api', { body });
    if (error) {
      let m = error.message;
      try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch {}
      throw new Error(m || 'Error');
    }
    if (!data || !data.ok) throw new Error((data && data.error) || 'Error');
    return data;
  }

  async function init(root, students) {
    if (typeof QRCode === 'undefined') {
      root.innerHTML = '<h3>Carnets QR</h3><p class="sub">Falta la librería de códigos QR. Revisa que el script de qrcodejs esté en index.html y que haya internet.</p>';
      return;
    }
    if (!document.getElementById('carnets-css')) {
      const st = document.createElement('style'); st.id = 'carnets-css'; st.textContent = css; document.head.appendChild(st);
    }

    const groups = [...new Set(students.map(gradeTxt).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    root.innerHTML = `
      <h3>Carnets QR</h3>
      <p class="sub">Emite un carnet individual o todo un salón. El QR solo se muestra al emitirlo; si hay que reimprimir, se emite uno nuevo y el anterior queda anulado.</p>
      <div class="cn-row">
        <label class="fld" style="flex-basis:220px"><span>Buscar alumno</span><input id="c-search" placeholder="Buscar alumno…" autocomplete="off"></label>
        <label class="fld" style="flex-basis:300px"><span>Alumno</span><select id="c-select"></select></label>
      </div>
      <div class="cn-row">
        <button class="btn" id="c-issue">Emitir / reemplazar carnet</button>
        <button class="btn red" id="c-revoke">Anular carnet</button>
        <button class="btn ghost" id="c-print">Imprimir</button>
      </div>
      <div class="cn-row" style="margin-top:18px">
        <label class="fld" style="flex-basis:260px"><span>Salón completo</span><select id="c-group">${groups.map(g => `<option>${E(g)}</option>`).join('') || '<option value="">Sin salones</option>'}</select></label>
        <button class="btn ghost" id="c-batch">Emitir todo el salón</button>
      </div>
      <div id="carnets-print"></div>
      <p class="cn-note" id="c-msg"></p>`;

    const $r = s => root.querySelector(s);
    const sel = $r('#c-select'), out = $r('#carnets-print');
    const msgEl = $r('#c-msg');
    const say = t => { msgEl.textContent = t; };
    const fill = (q = '') => {
      const n = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const f = students.filter(s => (s.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(n)).slice(0, 300);
      sel.innerHTML = f.map(s => `<option value="${s.id}">${E(s.name)} — ${E(gradeTxt(s))}</option>`).join('') || '<option value="">Sin resultados</option>';
    };
    fill();
    $r('#c-search').oninput = e => fill(e.target.value);

    $r('#c-issue').onclick = async () => {
      const st = students.find(s => s.id === sel.value);
      if (!st) return;
      if (!await ask(`El carnet anterior de ${st.name} dejará de funcionar.`, { title: '¿Emitir carnet nuevo?', ok: 'Emitir' })) return;
      try {
        const { qr } = await callApi({ action: 'issue', student_id: st.id });
        const id = 'qr-' + st.id + '-' + Date.now();
        out.insertAdjacentHTML('afterbegin', carnetHTML(st, id));
        drawQR(id, qr);
        say('Carnet emitido. El anterior quedó anulado.');
      } catch (e) { say('Error: ' + e.message); msg(e.message, 1); }
    };

    $r('#c-revoke').onclick = async () => {
      const st = students.find(s => s.id === sel.value);
      if (!st) return;
      if (!await ask(`El carnet de ${st.name} dejará de funcionar.`, { title: '¿Anular carnet?', ok: 'Anular' })) return;
      try { await callApi({ action: 'revoke', student_id: st.id }); say('Carnet anulado.'); msg('Carnet anulado.'); }
      catch (e) { say('Error: ' + e.message); msg(e.message, 1); }
    };

    $r('#c-batch').onclick = async () => {
      const g = $r('#c-group').value;
      const list = students.filter(s => gradeTxt(s) === g);
      if (!list.length) return say('No hay alumnos en ese salón.');
      if (!await ask(`Se emitirán ${list.length} carnets nuevos para ${g}. Los anteriores quedarán anulados.`, { title: '¿Emitir todo el salón?', ok: 'Emitir' })) return;
      out.innerHTML = '';
      const btn = $r('#c-batch'); btn.disabled = true;
      let done = 0;
      for (const st of list) {
        try {
          const { qr } = await callApi({ action: 'issue', student_id: st.id });
          const id = 'qr-' + st.id + '-' + Date.now();
          out.insertAdjacentHTML('beforeend', carnetHTML(st, id));
          drawQR(id, qr);
          done++;
          say(`Emitidos ${done} de ${list.length}…`);
        } catch (e) { say(`Error con ${st.name}: ${e.message}`); }
      }
      btn.disabled = false;
      say(`Listo: ${done} de ${list.length} carnets. Pulsa Imprimir (activa "Gráficos de fondo").`);
    };

    $r('#c-print').onclick = () => {
      if (!out.querySelector('.carnet')) return say('Primero emite un carnet; luego podrás imprimirlo.');
      printCarnets(out);
    };
  }

  /* ---------- integración con el panel ---------- */
  TITULOS.carnets = ['Carnets QR', 'Emitir e imprimir carnets de alumnos'];
  P.carnets = '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 5.5-1.5 6 0M15 9h3M15 12h3M15 15h3"/>';

  const _render = render;
  render = async function () {
    if (view !== 'carnets') return _render();
    clearInterval(CD);
    document.querySelectorAll('.nv').forEach(b => {
      const on = b.dataset.v === view; b.classList.toggle('on', on);
      if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    $('#tt').textContent = TITULOS.carnets[0]; $('#ts').textContent = TITULOS.carnets[1];
    const c = $('#content'); c.classList.remove('enter'); c.onclick = null; c.onchange = null;
    c.innerHTML = '<div class="sk"></div>';
    try {
      if (me.role !== 'admin') { c.innerHTML = ''; return; }
      await loadStudents();
      c.innerHTML = '<section class="glass card" id="carnets-root"></section>';
      await init($('#carnets-root'), students);
    } catch (e) { c.innerHTML = ''; msg(e.message, 1); }
    void c.offsetWidth; c.classList.add('enter');
  };

  const _shell = shell;
  shell = function () {
    _shell();
    if (!me || me.role !== 'admin') return;
    const ref = document.querySelector('.nv[data-v="docentes"]');
    if (!ref || document.querySelector('.nv[data-v="carnets"]')) return;
    const b = document.createElement('button');
    b.className = 'nv'; b.dataset.v = 'carnets'; b.title = 'Carnets QR';
    b.innerHTML = `${ic('carnets')}<span>${innerWidth > 900 ? 'Carnets QR' : 'Carnets'}</span>`;
    b.onclick = () => { view = 'carnets'; render(); };
    ref.after(b);
  };
})();
