// Hospitalar 2026 PWA
const APP_VERSION = '1.0.0';
const DIAS_FEIRA = [
  { d: '2026-05-19', label: 'Ter 19/mai' },
  { d: '2026-05-20', label: 'Qua 20/mai' },
  { d: '2026-05-21', label: 'Qui 21/mai' },
  { d: '2026-05-22', label: 'Sex 22/mai' },
];
const HORARIOS = [];
for (let h = 10; h <= 21; h++) {
  HORARIOS.push(`${String(h).padStart(2,'0')}:00`);
  if (h < 21) HORARIOS.push(`${String(h).padStart(2,'0')}:30`);
}

let empresas = [];
let poolList = [];
let currentView = 'list-view';
let currentEmpresaId = null;
let currentFilter = 'all';
let currentRua = '';
let mediaRecorder = null;
let recordedChunks = [];
let recAudioBlob = null;
const CUSTOM_ID_BASE = 100000;
const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/1RPA_YAnZnoYW1ZkOphoXDm74s1enP0Qvnm_h23tIYCI/export?format=csv&gid=1770656616';

// ------- BOOTSTRAP -------
async function bootstrap() {
  const count = await db.getEmpresasCount();
  if (count === 0) {
    // Primeiro load: baixa data.json e popula
    showToast('Carregando base de empresas…');
    const res = await fetch('data.json');
    const list = await res.json();
    await db.bulkEmpresas(list);
  }
  empresas = await db.getEmpresas();
  empresas.sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
  // Carrega pool de expositores extras (não-visitados mas disponíveis)
  try {
    const pr = await fetch('pool.json');
    poolList = await pr.json();
  } catch (e) {
    console.warn('Pool não carregou', e);
    poolList = [];
  }
  populateRuas();
  render();
  updateCounter();
}

function populateRuas() {
  const ruas = [...new Set(empresas.map(e => e.rua).filter(Boolean))].sort();
  const sel = document.getElementById('rua-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as ruas</option>';
  ruas.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = `Rua ${r}`;
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

async function updateCounter() {
  const visitas = await db.getAllVisitas();
  const prio = empresas.filter(e => e.status === 'sim').length;
  const feitas = visitas.filter(v => v.status === 'feita').length;
  const voltar = visitas.filter(v => v.status === 'voltar').length;
  document.getElementById('counter').textContent =
    `${prio} prioridade · ${feitas} feitas · ${voltar} voltar`;
}

// ------- LIST VIEW -------
async function render() {
  const q = document.getElementById('q').value.toLowerCase().trim();
  const visitas = await db.getAllVisitas();
  const visMap = Object.fromEntries(visitas.map(v => [v.empresa_id, v]));

  let list = empresas.filter(e => {
    if (currentRua && e.rua !== currentRua) return false;
    if (currentFilter === 'sim' && e.status !== 'sim') return false;
    if (currentFilter === 'provavel' && e.status !== 'provavel') return false;
    if (currentFilter === 'intern' && e.status !== 'intern') return false;
    if (currentFilter === 'agenda') {
      const v = visMap[e.id]; if (!v || v.status !== 'voltar') return false;
    }
    if (currentFilter === 'feita') {
      const v = visMap[e.id]; if (!v || v.status !== 'feita') return false;
    }
    if (currentFilter === 'naofeita') {
      const v = visMap[e.id]; if (v && v.status === 'feita') return false;
    }
    if (currentFilter === 'custom') {
      if (!e.custom) return false;
    }
    if (q) {
      const hay = (e.empresa + ' ' + e.rua + e.stand + ' ' +
        (e.prospects||[]).map(p => p.nome).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Ordena: prioridade primeiro, depois feita por último
  list.sort((a, b) => {
    const ordStatus = { sim: 0, provavel: 1, intern: 2, '': 3, nao: 4 };
    const sa = ordStatus[a.status] ?? 5;
    const sb = ordStatus[b.status] ?? 5;
    if (sa !== sb) return sa - sb;
    return a.empresa.localeCompare(b.empresa, 'pt-BR');
  });

  const ul = document.getElementById('empresa-list');
  ul.innerHTML = '';
  list.forEach(e => {
    const v = visMap[e.id];
    const card = document.createElement('li');
    const cls = e.status || 'sem-status';
    card.className = 'empresa-card ' + cls + (e.stand ? '' : ' no-stand');

    const standHtml = e.stand
      ? `<div class="stand-badge"><div class="rua">${e.rua||''}</div>${e.stand}</div>`
      : `<div class="stand-badge">sem stand</div>`;

    const visitaTag = v ?
      (v.status === 'feita' ? '<span class="status-pill feita">visitada</span>' :
       v.status === 'voltar' ? '<span class="status-pill voltar">voltar</span>' : '')
      : '';
    const interesseTag = v && v.interesse ?
      `<span class="status-pill interesse-${v.interesse}">${
        v.interesse === 'muito' ? 'muito interessado' :
        v.interesse === 'algum' ? 'algum interesse' : 'sem interesse'
      }</span>` : '';

    const prospectsLabel = (e.prospects||[]).map(p => p.nome).filter(Boolean).join(', ');

    card.innerHTML = `
      ${standHtml}
      <div class="info">
        <div class="nome">${escapeHtml(e.empresa)}</div>
        <div class="meta">
          ${e.status ? `<span class="status-pill ${e.status}">${labelStatus(e.status)}</span>`: ''}
          ${visitaTag}${interesseTag}
        </div>
        ${prospectsLabel ? `<div class="muted" style="margin-top:2px">${escapeHtml(prospectsLabel)}</div>`: ''}
      </div>
    `;
    card.addEventListener('click', () => openDetail(e.id));
    ul.appendChild(card);
  });

  document.getElementById('empty-state').classList.toggle('hidden', list.length > 0);
}

function labelStatus(s) {
  return { sim:'prioridade', provavel:'provável', intern:'internacional', nao:'não visitar' }[s] || s;
}

function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

// ------- DETAIL VIEW -------
async function openDetail(id) {
  currentEmpresaId = id;
  const e = await db.getEmpresa(id);
  const v = (await db.getVisita(id)) || {
    empresa_id: id, status: '', agenda_dia: '', agenda_hora: '', agenda_quem: '',
    interesse: '', proximos: [], proximos_outros: '',
    notas: '', cartao_blob: null, audio_blob: null, transcricao: '', site: ''
  };

  document.body.classList.add('detail-mode');
  setView('detail-view');
  const view = document.getElementById('detail-view');

  const prospectsHtml = (e.prospects||[]).map((p, idx) => {
    const photoKey = `${id}_p${idx}`;
    return `
      <div class="prospect" data-photo-key="${photoKey}">
        <label class="photo" for="photo-${photoKey}">
          <span class="ph-fallback">${(p.nome||'?').charAt(0)}</span>
          <input type="file" id="photo-${photoKey}" accept="image/*" class="photo-input">
        </label>
        <div class="info">
          <div class="nome">${escapeHtml(p.nome || '— sem nome —')}</div>
          <div class="actions">
            ${p.linkedin && p.linkedin.includes('linkedin') ?
              `<a href="${p.linkedin}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
            <button class="btn-edit-prospect" data-idx="${idx}">Editar</button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div class="muted">Sem prospects cadastrados.</div>';

  const proximosOpts = ['ligar','apresentacao','whatsapp','email','outros'];
  const proximosLabels = {ligar:'Ligar', apresentacao:'Mandar apresentação',
    whatsapp:'WhatsApp', email:'E-mail', outros:'Outros'};

  view.innerHTML = `
    <div class="detail-header">
      <button class="back">‹</button>
      <div class="title">
        <div class="nome">${escapeHtml(e.empresa)}</div>
        <div class="sub">${e.rua ? `Rua ${e.rua} · Stand ${e.stand}` : 'Sem stand definido'}
          ${e.status ? ` · ${labelStatus(e.status)}` : ''}</div>
      </div>
    </div>
    <div class="detail-body">

      <section class="card">
        <h3 style="margin-top:0">Prospects</h3>
        ${prospectsHtml}
        <button class="btn small" id="btn-add-prospect">+ Adicionar prospect</button>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Site</h3>
        <input type="text" id="f-site" placeholder="https://…" value="${escapeHtml(v.site||'')}">
        <div class="row" style="margin-top:6px">
          <button class="btn small" id="btn-google">Buscar no Google</button>
          ${v.site ? `<a class="btn small" href="${escapeHtml(v.site)}" target="_blank" style="text-align:center">Abrir site</a>` : ''}
        </div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Status da visita</h3>
        <div class="radio-group" id="rg-status">
          <label data-val="feita"><span>Feita</span></label>
          <label data-val="voltar"><span>Voltar depois</span></label>
        </div>

        <div id="agenda-block" class="${v.status==='voltar' ? '' : 'hidden'}">
          <label>Dia</label>
          <select id="f-agenda-dia">
            <option value="">Escolha…</option>
            ${DIAS_FEIRA.map(d => `<option value="${d.d}" ${v.agenda_dia===d.d?'selected':''}>${d.label}</option>`).join('')}
          </select>
          <label>Hora</label>
          <select id="f-agenda-hora">
            <option value="">Escolha…</option>
            ${HORARIOS.map(h => `<option value="${h}" ${v.agenda_hora===h?'selected':''}>${h}</option>`).join('')}
          </select>
          <label>Quem procurar / observações</label>
          <input type="text" id="f-agenda-quem" placeholder="Ex: João, ele vai estar lá depois das 14h"
            value="${escapeHtml(v.agenda_quem||'')}">
        </div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Interesse</h3>
        <div class="radio-group" id="rg-interesse">
          <label data-val="sem"><span>Sem interesse</span></label>
          <label data-val="algum"><span>Algum</span></label>
          <label data-val="muito"><span>Muito</span></label>
        </div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Próximos passos</h3>
        ${proximosOpts.map(o => `
          <label style="display:flex; gap:8px; align-items:center; margin-top:6px">
            <input type="checkbox" name="proximo" value="${o}" ${(v.proximos||[]).includes(o)?'checked':''}>
            <span>${proximosLabels[o]}</span>
          </label>`).join('')}
        <label>Detalhar "Outros" / observações</label>
        <textarea id="f-proximos-outros" rows="2">${escapeHtml(v.proximos_outros||'')}</textarea>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Registro da conversa</h3>
        <label>Texto</label>
        <textarea id="f-notas" rows="4" placeholder="Principais pontos…">${escapeHtml(v.notas||'')}</textarea>

        <h3>Áudio</h3>
        <div class="audio-block">
          <button class="btn rec-btn" id="btn-rec">🎙️ Gravar</button>
          <div id="audio-preview" style="${v.audio_blob ? '' : 'display:none'}">
            <audio id="audio-player" controls></audio>
            <button class="btn small" id="btn-rec-clear">Apagar áudio</button>
          </div>
          <label>Transcrição (auto + edição manual)</label>
          <textarea id="f-transcricao" rows="3">${escapeHtml(v.transcricao||'')}</textarea>
          <button class="btn small" id="btn-transcribe">Transcrever (online)</button>
        </div>
      </section>

      <section class="card">
        <h3 style="margin-top:0">Foto do cartão recebido</h3>
        <div class="card-foto-cartao">
          <label class="placeholder" id="cartao-placeholder">
            <span>📷 Tirar / escolher foto</span>
            <input type="file" id="f-cartao" accept="image/*" capture="environment" style="display:none">
          </label>
          <div id="cartao-preview" style="display:none">
            <img id="cartao-img">
            <button class="btn small" id="btn-cartao-clear">Apagar</button>
          </div>
        </div>
      </section>

      <button class="btn primary" id="btn-save">Salvar</button>
      <button class="btn danger" id="btn-delete-visita" style="${v.empresa_id && v.status ? '' : 'display:none'}">
        Apagar registro
      </button>
    </div>
  `;

  // Eventos
  view.querySelector('.back').onclick = closeDetail;
  view.querySelector('#btn-google').onclick = () => {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(e.empresa + ' hospitalar 2026')}`, '_blank');
  };
  view.querySelector('#btn-save').onclick = saveVisita;
  view.querySelector('#btn-delete-visita').onclick = deleteVisita;

  // Radio groups
  setupRadio('rg-status', v.status, (val) => {
    document.getElementById('agenda-block').classList.toggle('hidden', val !== 'voltar');
  });
  setupRadio('rg-interesse', v.interesse);

  // Foto cartão
  if (v.cartao_blob) renderCartao(v.cartao_blob);
  view.querySelector('#cartao-placeholder').onclick = (ev) => {
    ev.preventDefault();
    view.querySelector('#f-cartao').click();
  };
  view.querySelector('#f-cartao').onchange = (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    renderCartao(file);
  };
  view.querySelector('#btn-cartao-clear')?.addEventListener('click', () => {
    document.getElementById('cartao-preview').style.display = 'none';
    document.getElementById('cartao-placeholder').style.display = 'flex';
    document.getElementById('f-cartao').value = '';
    pendingCartao = null;
  });

  // Áudio
  recordedChunks = []; recAudioBlob = null;
  if (v.audio_blob) {
    document.getElementById('audio-player').src = URL.createObjectURL(v.audio_blob);
    document.getElementById('audio-preview').style.display = '';
    recAudioBlob = v.audio_blob;
  }
  view.querySelector('#btn-rec').onclick = toggleRecord;
  view.querySelector('#btn-rec-clear')?.addEventListener('click', () => {
    document.getElementById('audio-preview').style.display = 'none';
    recAudioBlob = null;
  });
  view.querySelector('#btn-transcribe').onclick = transcribeLive;

  // Foto prospects
  (e.prospects||[]).forEach((p, idx) => {
    const photoKey = `${id}_p${idx}`;
    db.getFoto(photoKey).then(blob => {
      if (blob) {
        const el = view.querySelector(`[data-photo-key="${photoKey}"] .photo`);
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        el.querySelector('.ph-fallback')?.remove();
        el.prepend(img);
      }
    });
    const input = view.querySelector(`#photo-${photoKey}`);
    if (input) input.onchange = async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      await db.putFoto(photoKey, file);
      const el = view.querySelector(`[data-photo-key="${photoKey}"] .photo`);
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      el.querySelector('img')?.remove();
      el.querySelector('.ph-fallback')?.remove();
      el.prepend(img);
      showToast('Foto salva');
    };
  });

  // Edit prospect
  view.querySelectorAll('.btn-edit-prospect').forEach(btn => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      await editProspect(id, idx);
    };
  });
  view.querySelector('#btn-add-prospect').onclick = async () => {
    await addProspect(id);
  };
}

let pendingCartao = null;

function renderCartao(blob) {
  pendingCartao = blob;
  const img = document.getElementById('cartao-img');
  img.src = URL.createObjectURL(blob);
  document.getElementById('cartao-preview').style.display = '';
  document.getElementById('cartao-placeholder').style.display = 'none';
}

function setupRadio(groupId, initial, onChange) {
  const grp = document.getElementById(groupId);
  if (!grp) return;
  grp.querySelectorAll('label').forEach(label => {
    if (label.dataset.val === initial) label.classList.add('selected');
    label.onclick = () => {
      grp.querySelectorAll('label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
      if (onChange) onChange(label.dataset.val);
    };
  });
}

function getRadioVal(groupId) {
  const grp = document.getElementById(groupId);
  if (!grp) return '';
  const sel = grp.querySelector('label.selected');
  return sel ? sel.dataset.val : '';
}

async function saveVisita() {
  const id = currentEmpresaId;
  const proximos = Array.from(document.querySelectorAll('input[name="proximo"]:checked')).map(i => i.value);
  const v = {
    empresa_id: id,
    status: getRadioVal('rg-status'),
    agenda_dia: document.getElementById('f-agenda-dia')?.value || '',
    agenda_hora: document.getElementById('f-agenda-hora')?.value || '',
    agenda_quem: document.getElementById('f-agenda-quem')?.value || '',
    interesse: getRadioVal('rg-interesse'),
    proximos: proximos,
    proximos_outros: document.getElementById('f-proximos-outros').value,
    notas: document.getElementById('f-notas').value,
    site: document.getElementById('f-site').value.trim(),
    transcricao: document.getElementById('f-transcricao').value,
    cartao_blob: pendingCartao,
    audio_blob: recAudioBlob,
  };
  await db.putVisita(v);
  showToast('Salvo');
  updateCounter();
  closeDetail();
  render();
}

async function deleteVisita() {
  if (!confirm('Apagar todo o registro desta visita?')) return;
  const dbi = await openDB();
  const t = dbi.transaction('visitas', 'readwrite');
  t.objectStore('visitas').delete(currentEmpresaId);
  t.oncomplete = () => {
    showToast('Apagado');
    closeDetail();
    render();
    updateCounter();
  };
}

function closeDetail() {
  document.body.classList.remove('detail-mode');
  setView('list-view');
  document.querySelector('.nav-btn[data-view="list-view"]').click();
}

async function editProspect(empresa_id, idx) {
  const e = await db.getEmpresa(empresa_id);
  const p = e.prospects[idx];
  const nome = prompt('Nome do prospect:', p.nome || '');
  if (nome === null) return;
  const linkedin = prompt('LinkedIn (URL):', p.linkedin || '');
  if (linkedin === null) return;
  e.prospects[idx] = { nome: nome.trim(), linkedin: linkedin.trim() };
  await db.putEmpresa(e);
  // Atualiza cache local
  const idxL = empresas.findIndex(x => x.id === empresa_id);
  if (idxL >= 0) empresas[idxL] = e;
  openDetail(empresa_id);
  showToast('Prospect atualizado');
}

async function addProspect(empresa_id) {
  const nome = prompt('Nome do novo prospect:');
  if (!nome) return;
  const linkedin = prompt('LinkedIn (URL) — opcional:') || '';
  const e = await db.getEmpresa(empresa_id);
  e.prospects = e.prospects || [];
  e.prospects.push({ nome: nome.trim(), linkedin: linkedin.trim() });
  await db.putEmpresa(e);
  const idxL = empresas.findIndex(x => x.id === empresa_id);
  if (idxL >= 0) empresas[idxL] = e;
  openDetail(empresa_id);
  showToast('Prospect adicionado');
}

// ------- ÁUDIO -------
async function toggleRecord() {
  const btn = document.getElementById('btn-rec');
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    btn.textContent = '🎙️ Gravar';
    btn.classList.remove('recording');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
                 (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      recAudioBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      document.getElementById('audio-player').src = URL.createObjectURL(recAudioBlob);
      document.getElementById('audio-preview').style.display = '';
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    btn.textContent = '⏹ Parar';
    btn.classList.add('recording');
  } catch (err) {
    alert('Não foi possível acessar o microfone: ' + err.message);
  }
}

function transcribeLive() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert('Transcrição automática não suportada neste navegador. Use Chrome no Android.');
    return;
  }
  const rec = new SR();
  rec.lang = 'pt-BR';
  rec.continuous = true;
  rec.interimResults = true;
  const textarea = document.getElementById('f-transcricao');
  const start = textarea.value;
  let finalText = '';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) finalText += t + ' ';
      else interim += t;
    }
    textarea.value = (start + ' ' + finalText + interim).trim();
  };
  rec.onend = () => { showToast('Transcrição finalizada'); };
  rec.onerror = (e) => { showToast('Erro: ' + e.error); };
  rec.start();
  showToast('Falando… toque novamente para parar');
  const btn = document.getElementById('btn-transcribe');
  btn.textContent = '⏹ Parar transcrição';
  btn.onclick = () => { rec.stop(); btn.textContent = 'Transcrever (online)';
    btn.onclick = transcribeLive; };
}

// ------- AGENDA VIEW -------
async function renderAgenda() {
  const visitas = await db.getAllVisitas();
  const extras = await db.getAllExtras();
  const view = document.getElementById('agenda-view');

  const byDay = {};
  DIAS_FEIRA.forEach(d => byDay[d.d] = []);
  const noDate = [];

  // Visitas "voltar"
  for (const v of visitas.filter(x => x.status === 'voltar')) {
    const e = empresas.find(x => x.id === v.empresa_id);
    if (!e) continue;
    const item = {
      type: 'visita',
      hora: v.agenda_hora || '--:--',
      titulo: e.empresa,
      sub: `${e.rua ? `Rua ${e.rua} · Stand ${e.stand}` : 'sem stand'}${v.agenda_quem ? ' · ' + v.agenda_quem : ''}`,
      empresa_id: e.id,
    };
    if (v.agenda_dia && byDay[v.agenda_dia]) byDay[v.agenda_dia].push(item);
    else noDate.push(item);
  }
  // Extras (camiseta)
  for (const x of extras) {
    const item = {
      type: 'extra',
      id: x.id,
      hora: x.hora || '--:--',
      titulo: x.nome || 'Contato sem nome',
      sub: [x.telefone, x.local, x.obs].filter(Boolean).join(' · '),
    };
    if (x.dia && byDay[x.dia]) byDay[x.dia].push(item);
    else noDate.push(item);
  }
  // Ordena por hora
  Object.values(byDay).forEach(list => list.sort((a,b) => a.hora.localeCompare(b.hora)));

  let html = '<h2 style="margin-top:0">Agenda</h2>';
  DIAS_FEIRA.forEach(d => {
    if (byDay[d.d].length === 0) return;
    html += `<div class="agenda-day"><h3>${d.label}</h3>`;
    html += byDay[d.d].map(item => agendaItemHtml(item)).join('');
    html += '</div>';
  });
  if (noDate.length) {
    html += '<div class="agenda-day"><h3>Sem dia definido</h3>';
    html += noDate.map(item => agendaItemHtml(item)).join('');
    html += '</div>';
  }
  if (DIAS_FEIRA.every(d => byDay[d.d].length === 0) && noDate.length === 0) {
    html += '<div class="empty">Sem agendamentos ainda.</div>';
  }
  view.innerHTML = html;

  view.querySelectorAll('.agenda-item').forEach(el => {
    el.onclick = () => {
      if (el.dataset.type === 'visita') {
        openDetail(parseInt(el.dataset.empresaId));
      } else {
        editExtra(parseInt(el.dataset.id));
      }
    };
  });
}

function agendaItemHtml(item) {
  return `
    <div class="agenda-item ${item.type==='extra'?'extra':''}"
         data-type="${item.type}"
         ${item.empresa_id!==undefined?`data-empresa-id="${item.empresa_id}"`:''}
         ${item.id!==undefined?`data-id="${item.id}"`:''}>
      <div class="hora">${item.hora}</div>
      <div class="info">
        <div>${escapeHtml(item.titulo)}</div>
        ${item.sub ? `<div class="obs">${escapeHtml(item.sub)}</div>` : ''}
      </div>
    </div>
  `;
}

// ------- EXTRAS (camiseta) VIEW -------
function renderExtrasForm(extra) {
  const isNew = !extra;
  extra = extra || { nome:'', telefone:'', email:'', dia:'', hora:'', local:'', obs:'' };
  const view = document.getElementById('extras-view');
  view.innerHTML = `
    <h2 style="margin-top:0">${isNew ? 'Novo contato' : 'Editar contato'}</h2>
    <p class="muted">Para pessoas que abordaram você ou escanearam a camiseta.</p>
    <section class="card">
      <label>Nome</label>
      <input type="text" id="ex-nome" value="${escapeHtml(extra.nome)}">
      <label>Telefone</label>
      <input type="tel" id="ex-tel" value="${escapeHtml(extra.telefone)}">
      <label>E-mail</label>
      <input type="email" id="ex-email" value="${escapeHtml(extra.email)}">
      <div class="row">
        <div>
          <label>Dia</label>
          <select id="ex-dia">
            <option value="">—</option>
            ${DIAS_FEIRA.map(d => `<option value="${d.d}" ${extra.dia===d.d?'selected':''}>${d.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label>Hora</label>
          <select id="ex-hora">
            <option value="">—</option>
            ${HORARIOS.map(h => `<option value="${h}" ${extra.hora===h?'selected':''}>${h}</option>`).join('')}
          </select>
        </div>
      </div>
      <label>Local da conversa</label>
      <input type="text" id="ex-local" placeholder="Ex: praça de alimentação, estande X" value="${escapeHtml(extra.local)}">
      <label>Observações</label>
      <textarea id="ex-obs" rows="3">${escapeHtml(extra.obs)}</textarea>
      <button class="btn primary" id="ex-save">Salvar</button>
      ${isNew ? '' : `<button class="btn danger" id="ex-delete">Apagar</button>`}
      <button class="btn" id="ex-cancel">Voltar à lista</button>
    </section>
    <hr>
    <h3>Contatos registrados</h3>
    <ul id="ex-list" style="list-style:none; padding:0; margin:0"></ul>
  `;

  view.querySelector('#ex-save').onclick = async () => {
    const data = {
      nome: document.getElementById('ex-nome').value.trim(),
      telefone: document.getElementById('ex-tel').value.trim(),
      email: document.getElementById('ex-email').value.trim(),
      dia: document.getElementById('ex-dia').value,
      hora: document.getElementById('ex-hora').value,
      local: document.getElementById('ex-local').value.trim(),
      obs: document.getElementById('ex-obs').value.trim(),
    };
    if (!data.nome && !data.telefone && !data.email) {
      alert('Preencha pelo menos nome, telefone ou e-mail.');
      return;
    }
    if (isNew) {
      await db.addExtra(data);
    } else {
      data.id = extra.id; data.created_at = extra.created_at;
      await db.putExtra(data);
    }
    showToast('Salvo');
    renderExtrasForm();
  };
  view.querySelector('#ex-cancel').onclick = () => renderExtrasForm();
  if (!isNew) view.querySelector('#ex-delete').onclick = async () => {
    if (!confirm('Apagar este contato?')) return;
    await db.deleteExtra(extra.id);
    renderExtrasForm();
  };

  // Lista de extras
  db.getAllExtras().then(list => {
    const ul = view.querySelector('#ex-list');
    list.sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
    if (!list.length) {
      ul.innerHTML = '<div class="muted">Nenhum contato ainda.</div>';
      return;
    }
    ul.innerHTML = list.map(x => `
      <li class="empresa-card" data-id="${x.id}" style="cursor:pointer">
        <div class="info">
          <div class="nome">${escapeHtml(x.nome || '(sem nome)')}</div>
          <div class="meta muted">${escapeHtml([x.telefone, x.email].filter(Boolean).join(' · '))}</div>
          <div class="muted" style="font-size:12px">${x.dia || ''} ${x.hora || ''} ${x.local ? '· '+escapeHtml(x.local) : ''}</div>
        </div>
      </li>
    `).join('');
    ul.querySelectorAll('li').forEach(li => {
      li.onclick = () => editExtra(parseInt(li.dataset.id));
    });
  });
}

async function editExtra(id) {
  const list = await db.getAllExtras();
  const extra = list.find(x => x.id === id);
  if (extra) renderExtrasForm(extra);
}

// ------- EXPORT VIEW -------
async function renderExportStats() {
  const visitas = await db.getAllVisitas();
  const extras = await db.getAllExtras();
  document.getElementById('stats').innerHTML = `
    <div>Empresas na base: <b>${empresas.length}</b></div>
    <div>Visitas feitas: <b>${visitas.filter(v => v.status==='feita').length}</b></div>
    <div>Agendadas (voltar): <b>${visitas.filter(v => v.status==='voltar').length}</b></div>
    <div>Sem visita: <b>${empresas.length - visitas.length}</b></div>
    <div>Muito interessados: <b>${visitas.filter(v => v.interesse==='muito').length}</b></div>
    <div>Algum interesse: <b>${visitas.filter(v => v.interesse==='algum').length}</b></div>
    <div>Sem interesse: <b>${visitas.filter(v => v.interesse==='sem').length}</b></div>
    <div>Contatos extras (camiseta): <b>${extras.length}</b></div>
  `;
}

async function exportJSON() {
  const visitas = await db.getAllVisitas();
  const extras = await db.getAllExtras();
  const emps = await db.getEmpresas();
  // Strip blobs (não cabem em JSON)
  const cleanV = visitas.map(v => ({
    ...v,
    cartao_blob: v.cartao_blob ? '[blob omitido — exporte fotos via UI]' : null,
    audio_blob: v.audio_blob ? '[blob omitido]' : null,
  }));
  const payload = {
    exported_at: new Date().toISOString(),
    empresas: emps,
    visitas: cleanV,
    extras: extras,
  };
  download('hospitalar-export.json', JSON.stringify(payload, null, 2), 'application/json');
}

async function exportCSV() {
  const visitas = await db.getAllVisitas();
  const headers = ['empresa','rua','stand','status_visita','agenda_dia','agenda_hora',
    'agenda_quem','interesse','proximos','proximos_outros','notas','transcricao','site','updated_at'];
  const rows = [headers];
  for (const v of visitas) {
    const e = empresas.find(x => x.id === v.empresa_id) || {};
    rows.push([
      e.empresa||'', e.rua||'', e.stand||'',
      v.status||'', v.agenda_dia||'', v.agenda_hora||'',
      v.agenda_quem||'', v.interesse||'',
      (v.proximos||[]).join('|'),
      v.proximos_outros||'',
      v.notas||'', v.transcricao||'', v.site||'',
      v.updated_at||''
    ]);
  }
  download('hospitalar-visitas.csv', toCSV(rows), 'text/csv;charset=utf-8');
}

async function exportAgendaCSV() {
  const extras = await db.getAllExtras();
  const headers = ['nome','telefone','email','dia','hora','local','obs','created_at'];
  const rows = [headers];
  for (const x of extras) {
    rows.push([x.nome||'', x.telefone||'', x.email||'', x.dia||'', x.hora||'',
      x.local||'', x.obs||'', x.created_at||'']);
  }
  download('hospitalar-camiseta.csv', toCSV(rows), 'text/csv;charset=utf-8');
}

// ------- EXPORT ZIP (com fotos, áudios, organizado) -------
function safeName(s) {
  return String(s||'').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80);
}

async function buildZip() {
  const zip = new JSZip();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const visitas = await db.getAllVisitas();
  const extras = await db.getAllExtras();
  const emps = await db.getEmpresas();
  const empMap = Object.fromEntries(emps.map(e => [e.id, e]));

  // CSVs no topo
  const visHeaders = ['empresa','rua','stand','status_visita','agenda_dia','agenda_hora',
    'agenda_quem','interesse','proximos','proximos_outros','notas','transcricao','site','updated_at'];
  const visRows = [visHeaders];
  for (const v of visitas) {
    const e = empMap[v.empresa_id] || {};
    visRows.push([
      e.empresa||'', e.rua||'', e.stand||'',
      v.status||'', v.agenda_dia||'', v.agenda_hora||'', v.agenda_quem||'',
      v.interesse||'', (v.proximos||[]).join('|'), v.proximos_outros||'',
      v.notas||'', v.transcricao||'', v.site||'', v.updated_at||''
    ]);
  }
  zip.file('00_visitas.csv', '﻿' + toCSV(visRows));

  const exHeaders = ['nome','telefone','email','dia','hora','local','obs','created_at'];
  const exRows = [exHeaders];
  for (const x of extras) {
    exRows.push([x.nome||'', x.telefone||'', x.email||'', x.dia||'', x.hora||'',
      x.local||'', x.obs||'', x.created_at||'']);
  }
  zip.file('01_camiseta.csv', '﻿' + toCSV(exRows));

  // Manifest
  zip.file('manifest.json', JSON.stringify({
    exported_at: new Date().toISOString(),
    total_empresas: emps.length,
    total_visitas: visitas.length,
    total_camiseta: extras.length,
    app: 'Hospitalar 2026'
  }, null, 2));

  // Pasta por empresa visitada
  const folder = zip.folder('visitas');
  for (const v of visitas) {
    const e = empMap[v.empresa_id]; if (!e) continue;
    const slug = `${e.rua||'X'}-${e.stand||'NN'}_${safeName(e.empresa)}`;
    const sub = folder.folder(slug);
    sub.file('dados.json', JSON.stringify({
      empresa: e.empresa, rua: e.rua, stand: e.stand, status: e.status,
      prospects: e.prospects, visita: { ...v, cartao_blob: undefined, audio_blob: undefined }
    }, null, 2));
    const notasTxt = [
      `EMPRESA: ${e.empresa}`,
      `STAND: ${e.rua||'?'}-${e.stand||'?'}`,
      `STATUS: ${v.status || '—'}`,
      v.status === 'voltar' ? `AGENDADO: ${v.agenda_dia} ${v.agenda_hora} (${v.agenda_quem||'—'})` : '',
      `INTERESSE: ${v.interesse || '—'}`,
      `PRÓXIMOS PASSOS: ${(v.proximos||[]).join(', ') || '—'}`,
      v.proximos_outros ? `OUTROS: ${v.proximos_outros}` : '',
      '',
      '--- NOTAS ---',
      v.notas || '(vazio)',
      '',
      '--- TRANSCRIÇÃO ---',
      v.transcricao || '(vazio)',
      '',
      '--- PROSPECTS ---',
      ...(e.prospects||[]).map(p => `${p.nome} ${p.linkedin ? '— '+p.linkedin : ''}`)
    ].filter(Boolean).join('\n');
    sub.file('notas.txt', notasTxt);
    if (v.audio_blob) {
      const ext = (v.audio_blob.type && v.audio_blob.type.includes('mp4')) ? 'm4a' : 'webm';
      sub.file('audio.' + ext, v.audio_blob);
    }
    if (v.cartao_blob) {
      const ext = (v.cartao_blob.type || 'image/jpeg').split('/')[1] || 'jpg';
      sub.file('cartao.' + ext, v.cartao_blob);
    }
    // Fotos prospects
    for (let i = 0; i < (e.prospects||[]).length; i++) {
      const foto = await db.getFoto(`${e.id}_p${i}`);
      if (foto) {
        const ext = (foto.type || 'image/jpeg').split('/')[1] || 'jpg';
        const nome = safeName(e.prospects[i].nome || `prospect_${i+1}`);
        sub.file(`prospect_${i+1}_${nome}.${ext}`, foto);
      }
    }
  }

  // Pasta camiseta
  if (extras.length) {
    const ef = zip.folder('camiseta');
    for (const x of extras) {
      const horaSafe = (x.hora||'??').replace(':','h');
      const fname = `${x.dia||'sem-dia'}_${horaSafe}_${safeName(x.nome||'sem-nome')}.txt`;
      ef.file(fname, [
        `NOME: ${x.nome||''}`,
        `TELEFONE: ${x.telefone||''}`,
        `EMAIL: ${x.email||''}`,
        `DIA: ${x.dia||''}`,
        `HORA: ${x.hora||''}`,
        `LOCAL: ${x.local||''}`,
        '',
        '--- OBSERVAÇÕES ---',
        x.obs||'(vazio)'
      ].join('\n'));
    }
  }

  showToast('Compactando…');
  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => {
      if (Math.round(meta.percent) % 10 === 0) {
        showToast(`Compactando ${Math.round(meta.percent)}%…`);
      }
    }
  );
  return { blob, filename: `hospitalar-2026_${stamp}.zip` };
}

async function exportZipDownload() {
  const btn = document.getElementById('btn-export-zip');
  btn.disabled = true; const orig = btn.textContent; btn.textContent = 'Gerando ZIP…';
  try {
    const { blob, filename } = await buildZip();
    download(filename, blob);
    showToast('ZIP pronto');
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function exportShareDrive() {
  const btn = document.getElementById('btn-export-share');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Gerando ZIP…';
  let blob, filename, file;
  try {
    const r = await buildZip();
    blob = r.blob; filename = r.filename;
    file = new File([blob], filename, { type: 'application/zip' });
  } catch (e) {
    alert('Erro ao gerar ZIP: ' + e.message);
    btn.disabled = false; btn.textContent = orig;
    return;
  }
  // Tenta share. Se falhar (user gesture expirou, denied, sem suporte), baixa.
  let shared = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    btn.textContent = 'Abrindo menu compartilhar…';
    try {
      await navigator.share({
        files: [file],
        title: 'Hospitalar 2026 — Export',
      });
      shared = true;
      showToast('Compartilhado');
    } catch (e) {
      if (e.name === 'AbortError') {
        // Usuário cancelou — não baixa
        btn.disabled = false; btn.textContent = orig;
        return;
      }
      // NotAllowedError / permission denied / outros: vai pro fallback
      console.warn('Share falhou, baixando ZIP:', e);
    }
  }
  if (!shared) {
    download(filename, blob);
    showToast('Baixado. Abra Downloads e compartilhe com o Drive.');
  }
  btn.disabled = false; btn.textContent = orig;
}

function toCSV(rows) {
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',')).join('\n');
}

function download(filename, content, type) {
  const blob = typeof content === 'string'
    ? new Blob(['﻿' + content], { type })
    : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------- VIEW SWITCH -------
function setView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewId);
  });
  // Body class para CSS por view
  ['view-list-view','view-detail-view','view-agenda-view','view-extras-view','view-export-view']
    .forEach(c => document.body.classList.remove(c));
  document.body.classList.add('view-' + viewId);
  if (viewId !== 'detail-view') document.body.classList.remove('detail-mode');
  if (viewId === 'agenda-view') renderAgenda();
  if (viewId === 'extras-view') renderExtrasForm();
  if (viewId === 'export-view') { renderExportStats(); updateSyncLabel(); }
  // Counter sempre atualizado em troca de view
  updateCounter();
}

// ------- SYNC GOOGLE SHEETS -------
function parseCSV(text) {
  const rows = []; let cur = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') {}
      else cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function parseEmpresaStand(s) {
  s = s.trim();
  let m = s.match(/^(.+),\s*([A-Z])-([A-Za-z0-9]+)\s*$/);
  if (m) return { empresa: m[1].trim(), rua: m[2].toUpperCase(), stand: m[3].toLowerCase() };
  if (s.includes(',')) {
    const idx = s.lastIndexOf(',');
    const nome = s.substring(0, idx).trim();
    const tail = s.substring(idx+1).trim();
    m = tail.match(/^([A-Z])-?([A-Za-z0-9]+)$/i);
    if (m) return { empresa: nome, rua: m[1].toUpperCase(), stand: m[2].toLowerCase() };
    m = tail.match(/([A-Z])-([A-Za-z0-9]+)/i);
    if (m) return { empresa: nome, rua: m[1].toUpperCase(), stand: m[2].toLowerCase() };
    return { empresa: nome, rua: '', stand: '' };
  }
  return { empresa: s, rua: '', stand: '' };
}
function normName(s) {
  return (s||'').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g, '');
}
function normStatusSync(s) {
  s = (s||'').trim().toLowerCase();
  if (s.startsWith('sim')) return 'sim';
  if (s.startsWith('n')) return 'nao';
  if (s.startsWith('prov')) return 'provavel';
  if (s.startsWith('int')) return 'intern';
  return '';
}

async function syncFromSheets() {
  const headerBtn = document.getElementById('btn-sync');
  const exportBtn = document.getElementById('btn-export-sync');
  const setBusy = (b) => {
    if (headerBtn) headerBtn.classList.toggle('spinning', b);
    if (exportBtn) { exportBtn.disabled = b; exportBtn.textContent = b ? 'Atualizando…' : 'Atualizar do Sheets agora'; }
  };
  setBusy(true);
  try {
    const res = await fetch(SHEETS_CSV_URL + '&t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseCSV(text); rows.shift();

    const remote = [];
    for (const r of rows) {
      if (!r[0] || !r[0].trim()) continue;
      const { empresa, rua, stand } = parseEmpresaStand(r[0]);
      const status = normStatusSync(r[1] || '');
      const prospects = [
        { nome: (r[2]||'').trim(), linkedin: (r[3]||'').trim() },
        { nome: (r[4]||'').trim(), linkedin: (r[5]||'').trim() },
      ];
      const cleanedProspects = prospects.map(p => ({
        nome: p.nome,
        linkedin: (p.linkedin && p.linkedin.toLowerCase().includes('linkedin.com')) ? p.linkedin : ''
      })).filter(p => p.nome || p.linkedin);
      remote.push({ empresa, rua, stand, status, prospects: cleanedProspects, norm: normName(empresa) });
    }

    const local = await db.getEmpresas();
    const localByNorm = {};
    for (const l of local) localByNorm[normName(l.empresa)] = l;

    let updated = 0, added = 0, unchanged = 0;
    const nonCustomIds = local.filter(e => e.id < CUSTOM_ID_BASE).map(e => e.id);
    let nextId = (nonCustomIds.length ? Math.max(...nonCustomIds) : 0) + 1;

    const toSave = [];
    for (const r of remote) {
      const exist = localByNorm[r.norm];
      if (exist) {
        const changed = exist.empresa !== r.empresa || exist.rua !== r.rua
          || exist.stand !== r.stand || exist.status !== r.status
          || JSON.stringify(exist.prospects||[]) !== JSON.stringify(r.prospects);
        if (changed) {
          toSave.push({
            id: exist.id,
            empresa: r.empresa, rua: r.rua, stand: r.stand,
            status: r.status, prospects: r.prospects,
            custom: !!exist.custom,
          });
          updated++;
        } else unchanged++;
      } else {
        toSave.push({
          id: nextId++,
          empresa: r.empresa, rua: r.rua, stand: r.stand,
          status: r.status, prospects: r.prospects,
        });
        added++;
      }
    }

    if (toSave.length) await db.bulkEmpresas(toSave);
    empresas = await db.getEmpresas();
    empresas.sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
    populateRuas(); render(); updateCounter();

    localStorage.setItem('lastSync', new Date().toISOString());
    updateSyncLabel();
    showToast(`${updated} atualizadas · ${added} novas · ${unchanged} sem mudança`);
  } catch (e) {
    alert('Erro ao sincronizar: ' + e.message + '\n\nVerifique sua conexão com a internet.');
  } finally {
    setBusy(false);
  }
}

function updateSyncLabel() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const last = localStorage.getItem('lastSync');
  el.textContent = last
    ? 'Último sync: ' + new Date(last).toLocaleString('pt-BR')
    : 'Ainda não sincronizado nesta sessão';
}

// ------- POOL DE EMPRESAS NOVAS -------
function openPoolModal() {
  document.getElementById('pool-modal').classList.remove('hidden');
  document.getElementById('pool-search').value = '';
  renderPool('');
  setTimeout(() => document.getElementById('pool-search').focus(), 100);
}

function closePoolModal() {
  document.getElementById('pool-modal').classList.add('hidden');
}

function renderPool(q) {
  const ql = q.toLowerCase().trim();
  // Exclui o que já está na base local (empresas já adicionadas)
  const baseNames = new Set(empresas.map(e =>
    e.empresa.toLowerCase().replace(/[^a-z0-9]/g, '')));
  const filtered = poolList.filter(p => {
    const norm = p.empresa.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (baseNames.has(norm)) return false;
    if (!ql) return true;
    const hay = (p.empresa + ' ' + p.rua + p.stand + ' ' + (p.secao||'')).toLowerCase();
    return hay.includes(ql);
  });
  const list = document.getElementById('pool-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="muted" style="padding:16px; text-align:center">Sem resultados no pool.<br>Use "Criar manualmente" abaixo.</div>';
    return;
  }
  list.innerHTML = filtered.map(p => `
    <div class="pool-item" data-empresa="${escapeHtml(p.empresa)}"
         data-rua="${escapeHtml(p.rua)}" data-stand="${escapeHtml(p.stand)}">
      <div class="stand-mini ${p.stand ? '' : 'no-stand'}">
        ${p.stand ? `${p.rua}-${p.stand}` : 'sem stand'}
      </div>
      <div style="flex:1; min-width:0">
        <div class="nome">${escapeHtml(p.empresa)}</div>
        <div class="secao">${escapeHtml(p.secao || '')}</div>
      </div>
      <div style="color: var(--accent); font-size: 22px; font-weight: 600">+</div>
    </div>
  `).join('');
  list.querySelectorAll('.pool-item').forEach(el => {
    el.onclick = () => addFromPool({
      empresa: el.dataset.empresa,
      rua: el.dataset.rua,
      stand: el.dataset.stand,
    });
  });
}

async function addFromPool(p) {
  // Cria empresa custom com id alto e abre detalhe
  const allCustomIds = empresas.filter(e => e.id >= CUSTOM_ID_BASE).map(e => e.id);
  const newId = allCustomIds.length ? Math.max(...allCustomIds) + 1 : CUSTOM_ID_BASE;
  const novo = {
    id: newId,
    empresa: p.empresa,
    rua: p.rua || '',
    stand: p.stand || '',
    status: '',
    prospects: [],
    custom: true,
  };
  await db.putEmpresa(novo);
  empresas.push(novo);
  empresas.sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'));
  closePoolModal();
  populateRuas();
  updateCounter();
  showToast('Adicionada: ' + p.empresa);
  openDetail(newId);
}

async function createManualEmpresa() {
  const nome = prompt('Nome da empresa:');
  if (!nome || !nome.trim()) return;
  const standRaw = prompt('Stand (ex: A-10, ou deixe vazio):') || '';
  const m = standRaw.match(/([A-Z])-?([A-Za-z0-9]+)/i);
  await addFromPool({
    empresa: nome.trim(),
    rua: m ? m[1].toUpperCase() : '',
    stand: m ? m[2].toLowerCase() : '',
  });
}

// ------- EVENTOS GLOBAIS -------
function setupEvents() {
  document.getElementById('q').addEventListener('input', debounce(render, 200));
  document.querySelectorAll('#filter-row .chip').forEach(b => {
    if (b.dataset.filter === currentFilter) b.classList.add('active');
    b.onclick = () => {
      document.querySelectorAll('#filter-row .chip').forEach(c => c.classList.remove('active'));
      b.classList.add('active');
      currentFilter = b.dataset.filter;
      render();
    };
  });
  document.getElementById('rua-select').addEventListener('change', (e) => {
    currentRua = e.target.value; render();
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => setView(b.dataset.view);
  });
  document.getElementById('btn-export-json').onclick = exportJSON;
  document.getElementById('btn-export-csv').onclick = exportCSV;
  document.getElementById('btn-export-agenda-csv').onclick = exportAgendaCSV;
  document.getElementById('btn-export-zip').onclick = exportZipDownload;
  document.getElementById('btn-export-share').onclick = exportShareDrive;
  document.getElementById('btn-sync').onclick = syncFromSheets;
  document.getElementById('btn-export-sync').onclick = syncFromSheets;
  document.getElementById('fab-add').onclick = openPoolModal;
  document.getElementById('pool-close').onclick = closePoolModal;
  document.getElementById('pool-modal').addEventListener('click', (e) => {
    if (e.target.id === 'pool-modal') closePoolModal();
  });
  document.getElementById('pool-search').addEventListener('input', debounce((e) => {
    renderPool(e.target.value);
  }, 150));
  document.getElementById('pool-manual').onclick = () => {
    closePoolModal();
    createManualEmpresa();
  };
  document.getElementById('btn-reset').onclick = async () => {
    if (!confirm('Isso apaga TODOS os dados (visitas, contatos, fotos, áudios). Confirma?')) return;
    if (!confirm('Tem certeza absoluta? Faça export antes.')) return;
    await db.clearAll();
    location.reload();
  };
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div'); el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1800);
}

// ------- INIT -------
document.addEventListener('DOMContentLoaded', async () => {
  setupEvents();
  document.querySelectorAll('#filter-row .chip').forEach(b => {
    if (b.dataset.filter === 'all') b.classList.add('active');
  });
  document.body.classList.add('view-list-view');
  await bootstrap();
});
