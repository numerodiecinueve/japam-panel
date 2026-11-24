/* JAPAM · Fotos (alumnos, padres, docentes y administrador). El administrador controla todo.
 *
 * Instalación: guarda este archivo junto a index.html y deja esta línea
 * después de <script src="carnets.js"></script>:
 *     <script src="fotos.js"></script>
 *
 * Requiere haber ejecutado 4_migracion_fotos.sql y 5_migracion_fotos_usuarios.sql.
 * - Alumnos, Padres y Docentes: botón "Subir foto" / "Cambiar foto" / "Quitar foto" en cada fila.
 * - Administrador: toca tu nombre arriba a la derecha para poner o cambiar tu foto.
 * Sin foto se siguen mostrando las iniciales.
 */
(() => {
  const BUCKET = 'student-photos';
  const MARK = `/${BUCKET}/`;
  const W = 400, H = 500;

  if (!document.getElementById('fotos-css')) {
    const st = document.createElement('style');
    st.id = 'fotos-css';
    st.textContent = '.fto-av{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;border:1px solid var(--line);box-shadow:0 4px 10px -2px rgba(0,0,0,.35)}' +
      '.me.fto-me{cursor:pointer}.me.fto-me:hover{background:var(--hover)}';
    document.head.appendChild(st);
  }

  const pathOf = url => {
    const u = String(url || ''), i = u.indexOf(MARK);
    return i < 0 ? null : decodeURIComponent(u.slice(i + MARK.length).split('?')[0]);
  };

  function toJpeg(file) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d');
        const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const w = img.naturalWidth * r, h = img.naturalHeight * r;
        x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
        x.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? ok(b) : no(new Error('No se pudo procesar la imagen.')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error('No se pudo leer la imagen. Usa un archivo JPG, PNG o WebP.')); };
      img.src = url;
    });
  }

  async function borrarArchivo(url) {
    const p = pathOf(url);
    if (!p) return;
    try { await db.storage.from(BUCKET).remove([p]); } catch {}
  }

  // Fotos de perfiles (padres/docentes): id -> url
  const PH = {};
  async function cargarPerfiles(role) {
    const { data } = await db.from('profiles').select('id,photo_url').eq('role', role);
    (data || []).forEach(p => { PH[p.id] = p.photo_url || null; });
  }

  // kind: 's' = alumno (tabla students), 'p' = perfil (padre, docente, admin)
  const getUrl = (k, id) => k === 's' ? ((students.find(x => x.id === id) || {}).photo_url || null) : (PH[id] || null);

  async function guardarUrl(k, id, url) {
    if (k === 's') {
      const { error } = await db.from('students').update({ photo_url: url }).eq('id', id);
      if (error) throw error;
      const st = students.find(x => x.id === id); if (st) st.photo_url = url;
    } else {
      const { error } = await db.rpc('set_profile_photo', { uid: id, url });
      if (error) throw error;
      PH[id] = url;
      if (me && me.id === id) me.photo_url = url;
    }
  }

  async function subir(k, id, file) {
    if (file.size > 15 * 1024 * 1024) throw new Error('La imagen pesa demasiado (máximo 15 MB).');
    const blob = await toJpeg(file);
    const path = crypto.randomUUID() + '.jpg';
    const up = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
    if (up.error) throw up.error;
    const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const old = getUrl(k, id);
    try { await guardarUrl(k, id, url); }
    catch (e) { await borrarArchivo(url); throw e; }
    await borrarArchivo(old);
  }

  async function quitar(k, id) {
    const old = getUrl(k, id);
    await guardarUrl(k, id, null);
    await borrarArchivo(old);
  }

  function rowInfo(tr) {
    const e = tr.querySelector('[data-e]'); if (e) return { k: 's', id: e.dataset.e };
    const x = tr.querySelector('[data-x]'); if (x) return { k: 'p', id: x.dataset.x };
    return null;
  }

  function paint(tr) {
    const inf = rowInfo(tr); if (!inf) return;
    const url = getUrl(inf.k, inf.id), key = String(url || '-');
    if (tr.dataset.fp === key) return;
    tr.dataset.fp = key;

    const nm = (tr.querySelector('.who b') || {}).textContent || '?';
    const who = tr.querySelector('.who');
    if (who) {
      const cur = who.querySelector('.av,.fto-av');
      const html = url ? `<img class="fto-av" src="${esc(url)}" alt="">` : av(nm);
      if (cur) cur.outerHTML = html; else who.insertAdjacentHTML('afterbegin', html);
    }
    const act = tr.querySelector('.act');
    if (act) {
      act.querySelectorAll('[data-foto],[data-fquit]').forEach(b => b.remove());
      act.insertAdjacentHTML('afterbegin',
        `<button class="btn sm ghost" data-foto="${inf.k}|${inf.id}">${ic('upload')}${url ? 'Cambiar foto' : 'Subir foto'}</button>` +
        (url ? `<button class="btn sm ghost" data-fquit="${inf.k}|${inf.id}">Quitar foto</button>` : ''));
    }
  }

  function enganchar(c, tb) {
    if (!tb) return;
    const host = tb.closest('section') || c;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.hidden = true;
    host.appendChild(inp);

    let target = null, btn = null;
    const all = () => tb.querySelectorAll('tr').forEach(paint);
    new MutationObserver(all).observe(tb, { childList: true });
    all();

    tb.addEventListener('click', async e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.foto) {
        const [k, id] = b.dataset.foto.split('|');
        target = { k, id }; btn = b; inp.value = ''; inp.click();
      } else if (b.dataset.fquit) {
        const [k, id] = b.dataset.fquit.split('|');
        const nm = (b.closest('tr').querySelector('.who b') || {}).textContent || 'esta persona';
        if (!await ask(`Se quitará la foto de ${nm}. Volverán a mostrarse sus iniciales.`, { title: '¿Quitar foto?', ok: 'Quitar' })) return;
        try { await quitar(k, id); const tr = b.closest('tr'); tr.dataset.fp = ''; paint(tr); msg('Foto quitada.'); }
        catch (er) { msg(er.message || String(er), 1); }
      }
    });

    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f || !target) return;
      const t = target, b = btn, tr = b && b.closest('tr');
      if (b) { b.disabled = true; b.textContent = 'Subiendo…'; }
      try {
        await subir(t.k, t.id, f);
        if (tr && document.body.contains(tr)) { tr.dataset.fp = ''; paint(tr); }
        msg('Foto guardada.');
      } catch (er) {
        msg(er.message || String(er), 1);
        if (b && document.body.contains(b)) { b.disabled = false; b.innerHTML = `${ic('upload')}Subir foto`; }
      }
    };
  }

  // --- Alumnos
  const _alumnos = alumnos;
  alumnos = async function (c) {
    await _alumnos(c);
    enganchar(c, c.querySelector('#tb'));
  };

  // --- Padres y docentes
  const _personas = personas;
  personas = async function (c, role) {
    await _personas(c, role);
    await cargarPerfiles(role);
    enganchar(c, c.querySelector('tbody'));
  };

  // --- Foto del administrador (barra superior)
  const _shell = shell;
  shell = function () {
    _shell();
    const box = document.querySelector('.top .me');
    if (!box || !me) return;
    PH[me.id] = me.photo_url || null;
    const pintar = () => {
      const cur = box.querySelector('.av,.fto-av');
      const html = me.photo_url ? `<img class="fto-av" src="${esc(me.photo_url)}" alt="">` : av(me.full_name || me.email || '');
      if (cur) cur.outerHTML = html; else box.insertAdjacentHTML('afterbegin', html);
    };
    pintar();
    if (me.role !== 'admin') return;
    box.classList.add('fto-me');
    box.title = 'Cambiar mi foto';
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.hidden = true;
    box.appendChild(inp);
    box.onclick = e => { if (e.target !== inp) { inp.value = ''; inp.click(); } };
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { await subir('p', me.id, f); pintar(); msg('Tu foto se actualizó.'); }
      catch (er) { msg(er.message || String(er), 1); }
    };
  };
})();