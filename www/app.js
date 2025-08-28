/* MVP+ com File System Access API + árvore + renomear + drag&drop */
const ls = {
  get(k, d=null){ try{return JSON.parse(localStorage.getItem(k)) ?? d}catch{ return d } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)) },
  rm(k){ localStorage.removeItem(k) }
};
const KEYS = {
  prefs: 'mdapp.prefs',
  history: 'mdapp.history',
  drafts: 'mdapp.drafts',
  settings: 'mdapp.settings'
};
const state = {
  fsSupported: 'showDirectoryPicker' in window,
  rootHandle: null, // FileSystemDirectoryHandle
  fallbackFiles: [], // File[] (when using webkitdirectory)
  tree: null, // node structure
  current: { path: null, node: null, handle: null, isFallback: false },
  dragging: null
};

const $ = window.jQuery;
const $tree = $('#tree');
const $editor = $('#editor');
const $preview = $('#preview');
const $rawHtml = $('#rawHtml');
const prefs = Object.assign({ visiblePanels:{sidebar:true,editor:true,preview:true,aiBar:true} }, ls.get(KEYS.prefs, {}));
const settings = Object.assign({ apiKey:'', modelId:'gemini-2.5-flash-lite', dark:false }, ls.get(KEYS.settings, {}));

/* ---------- SWEETALERT HELPERS (substitui prompt/confirm/alert) ---------- */
async function swalPrompt(title, inputValue = '', inputPlaceholder = '') {
  const res = await Swal.fire({
    title,
    input: 'text',
    inputValue,
    inputPlaceholder,
    showCancelButton: true,
    confirmButtonText: 'OK',
    cancelButtonText: 'Cancelar',
    inputAttributes: { autocapitalize: 'off', autocorrect: 'off' }
  });
  return res.isConfirmed ? res.value : null;
}

async function swalConfirm(title, text = '') {
  const res = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sim',
    cancelButtonText: 'Não'
  });
  return !!res.isConfirmed;
}

function swalAlert(title, icon = 'info') {
  return Swal.fire({ title, icon });
}
/* --------------------------------------------------------------------- */





init();

function init(){
  $('#fsSupportBadge').text(state.fsSupported ? 'Acesso direto' : 'Fallback');
  applyPanelVisibility();
  applyTheme(settings.dark ? 'dark' : 'light');

  $('#btnToggleSidebar').on('click', ()=> togglePanel('#sidebar','sidebar'));
  $('#btnToggleEditor').on('click', ()=> togglePanel('#editorPanel','editor'));
  $('#btnTogglePreview').on('click', ()=> togglePanel('#previewPanel','preview'));
  $('#btnToggleAI').on('click', ()=> togglePanel('.ai-bar','aiBar'));

  $('#btnOpenFolder').on('click', openFolder);
  $('#dirPicker').on('change', handleWebkitDirectory);

  $('#btnSave').on('click', saveCurrent);
  $('#btnNewFile').on('click', newFileDialog);
  $('#btnNewFolder').on('click', newFolderDialog);
  $('#btnCollapseAll').on('click', ()=> $tree.find('ul').addClass('d-none'));

  $('#btnOpenHTML').on('click', openPreviewInNewTab);
  $('#btnShowRawHTML').on('click', ()=> { $rawHtml.toggleClass('d-none'); });

  $('#btnSettings').on('click', ()=> new bootstrap.Modal('#settingsModal').show());
  $('#btnSaveSettings').on('click', saveSettingsFromModal);
  $('#btnRunAI').on('click', runAIOnCurrent);

  $editor.on('input', onEditorInput);
  $(document).on('keydown', onKeyDown);

  restoreLastSession();
}

/* Panels */
function togglePanel(sel, key){
  $(sel).toggleClass('hide');
  prefs.visiblePanels[key] = !$(sel).hasClass('hide');
  ls.set(KEYS.prefs, prefs);
}
function applyPanelVisibility(){
  if (!prefs.visiblePanels.sidebar) $('#sidebar').addClass('hide');
  if (!prefs.visiblePanels.editor) $('#editorPanel').addClass('hide');
  if (!prefs.visiblePanels.preview) $('#previewPanel').addClass('hide');
  if (!prefs.visiblePanels.aiBar) $('.ai-bar').addClass('hide');
}
function applyTheme(mode){
  document.body.classList.toggle('dark', mode==='dark');
}
function toggleDarkTheme(){
  const next = !document.body.classList.contains('dark');
  applyTheme(next?'dark':'light');
  settings.dark = next; ls.set(KEYS.settings, settings);
}

/* Folder open */
async function openFolder(){
  if (state.fsSupported){
    try{
      const dirHandle = await window.showDirectoryPicker({ mode:'readwrite' });
      state.rootHandle = dirHandle;
      await buildTreeFromHandle();
      saveHistoryEntry(dirHandle.name, {kind:'fs', ts:Date.now()});
      renderTree();
    }catch(e){ /* cancel or error */ }
  } else {
    $('#dirPicker').click();
  }
}
function handleWebkitDirectory(e){
  const files = Array.from(e.target.files || []);
  state.fallbackFiles = files.filter(f=> f.name.toLowerCase().endsWith('.md'));
  buildTreeFromFileList();
  saveHistoryEntry('Diretório (fallback)', {kind:'fallback', ts:Date.now()});
  renderTree();
}

/* Tree building */
function newNode({name, kind, path, handle=null, children=[]}){
  return { name, kind, path, handle, children, parent:null };
}
async function buildTreeFromHandle(){
  const root = newNode({ name: await safeName(state.rootHandle), kind:'dir', path:'/' , handle: state.rootHandle });
  root.children = await readDirectoryRecursive(state.rootHandle, '/');
  root.children.forEach(c=> c.parent = root);
  state.tree = root;
}
async function readDirectoryRecursive(dirHandle, basePath){
  const out = [];
  for await (const [name, entry] of dirHandle.entries()){
    if (entry.kind === 'directory'){
      const node = newNode({ name, kind:'dir', path: basePath + name + '/', handle: entry });
      node.children = await readDirectoryRecursive(entry, node.path);
      node.children.forEach(c=> c.parent = node);
      out.push(node);
    } else if (entry.kind === 'file' && name.toLowerCase().endsWith('.md')) {
      out.push(newNode({ name, kind:'file', path: basePath + name, handle: entry }));
    }
  }
  out.sort(sortNodes);
  return out;
}
function buildTreeFromFileList(){
  const root = newNode({ name:'(fallback)', kind:'dir', path:'/' });
  const map = { '/': root };
  for (const f of state.fallbackFiles){
    const rel = (f.webkitRelativePath || f.name).split('/').filter(Boolean);
    let cur = root; let p = '/';
    for (let i=0;i<rel.length;i++){
      const seg = rel[i];
      const last = i === rel.length-1;
      if (last){
        const node = newNode({ name: seg, kind:'file', path: p + seg, handle: f });
        node.parent = cur; cur.children.push(node);
      } else {
        const nextPath = p + seg + '/';
        if (!map[nextPath]){
          const dir = newNode({ name: seg, kind:'dir', path: nextPath });
          dir.parent = cur; cur.children.push(dir); map[nextPath] = dir;
        }
        cur = map[nextPath]; p = nextPath;
      }
    }
  }
  walk(root, n=> n.children && n.children.sort(sortNodes));
  state.tree = root;
}
function sortNodes(a,b){
  if (a.kind!==b.kind) return a.kind==='dir' ? -1 : 1;
  return a.name.localeCompare(b.name);
}
function walk(node, fn){
  fn(node);
  (node.children||[]).forEach(ch=> walk(ch, fn));
}
async function safeName(h){
  try{ return h.name }catch{ return 'Pasta' }
}

/* Tree render */
function renderTree(){
  $tree.empty();
  if (!state.tree){ return }
  $('#history').html(renderHistoryHTML());
  const $rootUL = $('<ul class="list-unstyled m-0"></ul>');
  (state.tree.children||[]).forEach(ch=> $rootUL.append(renderNode(ch)));
  $tree.append($rootUL);
}
function renderNode(node){
  const $li = $('<li></li>').addClass(node.kind==='dir'?'folder':'file').attr('data-path', node.path);
  const $item = $('<div class="item" draggable="true"></div>');
  const $icon = $('<span class="icon"></span>').text(node.kind==='dir'?'▸':'📝');
  const $name = $('<span class="name"></span>').text(node.name).attr('title', node.path);
  const $actions = $('<span class="actions d-flex"></span>');
  const $btnOpen = $('<button class="btn btn-light btn-sm">Abrir</button>').on('click', ()=> node.kind==='file' && openFile(node));
  const $btnRen = $('<button class="btn btn-light btn-sm">Renomear</button>').on('click', ()=> renameNode(node));
  const $btnDel = $('<button class="btn btn-light btn-sm">Excluir</button>').on('click', ()=> deleteNode(node));
  if (node.kind==='file') $actions.append($btnOpen);
  $actions.append($btnRen, $btnDel);

  $item.append($icon, $name, $actions);
  $li.append($item);

  // expand/collapse
  if (node.kind==='dir'){
    $icon.css('cursor','pointer');
    $icon.on('click', ()=> $ul.toggleClass('d-none'));
  }

  // click to open file
  if (node.kind==='file'){
    $name.css('cursor','pointer').on('click', ()=> openFile(node));
  }

  // DnD
  $item.on('dragstart', (e)=> onDragStart(e, node));
  $item.on('dragover', (e)=> onDragOver(e, node));
  $item.on('dragleave', ()=> $item.removeClass('drag-over'));
  $item.on('drop', (e)=> onDrop(e, node));

  let $ul = $('<ul class="list-unstyled ms-3"></ul>');
  if (node.kind==='dir' && node.children?.length){
    node.children.forEach(ch=> $ul.append(renderNode(ch)));
  } else {
    $ul = $('<ul></ul>');
  }
  $li.append($ul);
  return $li;
}

/* File open/render */
async function openFile(node){
  state.current = { path: node.path, node, handle: node.handle || null, isFallback: !state.fsSupported };
  $('#currentFileName').text(node.name);
  $('#dirtyBadge').addClass('d-none');

  let content = '';
  if (state.fsSupported){
    const file = await node.handle.getFile();
    content = await file.text();
  } else {
    const f = node.handle;
    content = typeof f.text === 'function' ? await f.text() : (ls.get(KEYS.drafts, {})[node.path]?.content || '');
  }
  const draft = ls.get(KEYS.drafts, {})[node.path];
  if (draft?.modified && draft.content !== content) content = draft.content;

  $editor.val(content);
  renderPreview(content);
}

/* Editor/Preview */
function onEditorInput(){
  const val = $editor.val();
  renderPreview(val);
  $('#dirtyBadge').toggleClass('d-none', !state.current.path);
  // autosave draft
  if (state.current.path){
    const drafts = ls.get(KEYS.drafts, {});
    drafts[state.current.path] = { content: val, modified: Date.now() };
    ls.set(KEYS.drafts, drafts);
  }
}
function renderPreview(md){
  const html = marked.parse(md || '');
  const safe = DOMPurify.sanitize(html);
  $preview.html(safe);
  $rawHtml.text(safe);
}
function openPreviewInNewTab(){
  const html = `
<!doctype html><meta charset="utf-8">
<title>${escapeHtml($('#currentFileName').text()||'preview')}</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>body{font-family:"Noto Sans",sans-serif;margin:40px;max-width:800px}</style>
${$preview.html()}`;
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}
function escapeHtml(s){ return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

/* Save */
async function saveCurrent(){
  if (!state.current.path){ alert('Abra um arquivo primeiro.'); return; }
  const content = $editor.val();
  if (state.fsSupported){
    try{
      // ensure handle exists (create if missing)
      let fileHandle = state.current.handle;
      if (!fileHandle){
        const parent = await getParentHandleByPath(state.current.node.path);
        fileHandle = await parent.getFileHandle(state.current.node.name, { create:true });
        state.current.handle = fileHandle;
      }
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      $('#statusText').text('Salvo no disco');
      $('#dirtyBadge').addClass('d-none');
    }catch(e){
      console.error(e);
      alert('Falha ao salvar. Cheque permissões.');
    }
  } else {
    // fallback: download
    const filename = state.current.node.name || 'untitled.md';
    const blob = new Blob([content], {type:'text/markdown'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
    $('#statusText').text('Download gerado (fallback)');
    $('#dirtyBadge').addClass('d-none');
  }
}

/* Create/Rename/Delete usando SweetAlert2 */
async function newFileDialog(){
  const name = await swalPrompt('Nome do arquivo (.md):', 'novo.md', 'novo.md');
  if (!name) return;
  if (!name.toLowerCase().endsWith('.md')) {
    await swalAlert('Use extensão .md', 'warning');
    return;
  }
  const parent = await getTargetFolderForCreate();
  if (!parent) return;
  if (state.fsSupported){
    try{
      const h = await parent.getFileHandle(name, { create:true });
      await writeText(h, '# Novo arquivo\n');
      await buildTreeFromHandle(); renderTree();
    }catch(e){
      console.error(e);
      await swalAlert('Não foi possível criar o arquivo.', 'error');
    }
  } else {
    // fallback: apenas índice + draft
    const path = (parent.path||'/') + name;
    addFallbackFileNode(path, name, '');
    renderTree();
  }
}

async function newFolderDialog(){
  if (!state.fsSupported){
    await swalAlert('Criar pasta requer acesso direto (Chromium).', 'warning');
    return;
  }
  const name = await swalPrompt('Nome da pasta:', 'pasta', 'nome da pasta');
  if (!name) return;
  const parent = await getTargetFolderForCreate();
  try{
    await parent.getDirectoryHandle(name, { create:true });
    await buildTreeFromHandle(); renderTree();
  }catch(e){
    console.error(e);
    await swalAlert('Não foi possível criar a pasta.', 'error');
  }
}

async function renameNode(node){
  const newName = await swalPrompt('Novo nome:', node.name, node.name);
  if (!newName || newName === node.name) return;
  if (node.kind==='file' && !newName.toLowerCase().endsWith('.md')){
    await swalAlert('Arquivos devem terminar com .md', 'warning');
    return;
  }
  if (state.fsSupported){
    try{
      const parent = await getParentHandleByPath(node.path);
      if (node.kind==='dir'){
        // rename folder: create new dir + move children + remove old (simple approach for demo)
        const newDir = await parent.getDirectoryHandle(newName, { create:true });
        await copyDir(node.handle, newDir);
        await parent.removeEntry(node.name, { recursive:true });
      } else {
        const file = await node.handle.getFile();
        const content = await file.text();
        const newFile = await parent.getFileHandle(newName, { create:true });
        await writeText(newFile, content);
        await parent.removeEntry(node.name);
      }
      await buildTreeFromHandle(); renderTree();
    }catch(e){
      console.error(e);
      await swalAlert('Falha ao renomear.', 'error');
    }
  } else {
    node.name = newName;
    node.path = (node.parent?.path||'/') + newName;
    renderTree();
  }
}

async function deleteNode(node){
  const ok = await swalConfirm(`Excluir "${node.name}"?`, 'Esta ação não pode ser facilmente desfeita.');
  if (!ok) return;
  if (state.fsSupported){
    try{
      const parent = await getParentHandleByPath(node.path);
      await parent.removeEntry(node.name, { recursive: node.kind==='dir' });
      await buildTreeFromHandle(); renderTree();
      if (state.current.path === node.path){ clearCurrent(); }
    }catch(e){
      console.error(e);
      await swalAlert('Falha ao excluir.', 'error');
    }
  } else {
    // fallback: remove do índice
    if (node.parent){
      node.parent.children = node.parent.children.filter(n=> n!==node);
      renderTree();
      if (state.current.path === node.path){ clearCurrent(); }
    }
  }
}

function clearCurrent(){
  state.current = { path:null, node:null, handle:null, isFallback: !state.fsSupported };
  $('#currentFileName').text('—'); $editor.val(''); renderPreview('');
}

/* Drag & Drop move */
function onDragStart(ev, node){
  state.dragging = node;
  ev.originalEvent.dataTransfer.setData('text/plain', node.path);
  ev.originalEvent.dropEffect = 'move';
}
function onDragOver(ev, node){
  ev.preventDefault();
  const $t = $(ev.currentTarget);
  const isValidTarget = node.kind==='dir' && state.dragging && state.dragging !== node;
  $t.toggleClass('drag-over', !!isValidTarget);
}
async function onDrop(ev, node){
  ev.preventDefault();
  $(ev.currentTarget).removeClass('drag-over');
  const src = state.dragging;
  state.dragging = null;
  if (!src || node.kind!=='dir') return;

  if (state.fsSupported){
    try{
      if (src.kind==='file'){
        const srcParent = await getParentHandleByPath(src.path);
        const srcFile = await src.handle.getFile();
        const text = await srcFile.text();
        const destFile = await node.handle.getFileHandle(src.name, { create:true });
        await writeText(destFile, text);
        await srcParent.removeEntry(src.name);
      } else {
        // move dir by copy+delete (demo)
        const destDir = await node.handle.getDirectoryHandle(src.name, { create:true });
        await copyDir(src.handle, destDir);
        const srcParent = await getParentHandleByPath(src.path);
        await srcParent.removeEntry(src.name, { recursive:true });
      }
      await buildTreeFromHandle(); renderTree();
    }catch(e){ console.error(e); alert('Falha ao mover.'); }
  } else {
    // fallback: reparent in memory
    if (src.parent){
      src.parent.children = src.parent.children.filter(n=> n!==src);
      src.parent = node;
      src.path = node.path + src.name + (src.kind==='dir' ? '/' : '');
      node.children.push(src);
      node.children.sort(sortNodes);
      renderTree();
    }
  }
}

/* Helpers FS */
async function writeText(fileHandle, content){
  const w = await fileHandle.createWritable();
  await w.write(content);
  await w.close();
}
async function copyDir(fromDir, toDir){
  for await (const [name, entry] of fromDir.entries()){
    if (entry.kind==='directory'){
      const sub = await toDir.getDirectoryHandle(name, { create:true });
      await copyDir(entry, sub);
    } else {
      const file = await entry.getFile();
      const text = await file.text();
      const dest = await toDir.getFileHandle(name, { create:true });
      await writeText(dest, text);
    }
  }
}
async function getParentHandleByPath(path){
  // path like /a/b/c.md -> parent is /a/b/
  const segs = path.split('/').filter(Boolean);
  segs.pop(); // remove file or last dir
  let cur = state.rootHandle;
  for (const s of segs){
    cur = await cur.getDirectoryHandle(s);
  }
  return cur;
}
async function getTargetFolderForCreate(){
  if (state.fsSupported){
    if (state.current.node && state.current.node.kind==='dir') return state.current.node.handle;
    return state.rootHandle || null;
  } else {
    // fallback: current folder node or root
    if (!state.tree) return null;
    return state.current.node?.kind==='dir' ? state.current.node : state.tree;
  }
}
function addFallbackFileNode(path, name, content){
  // simple add under root if parent missing
  const parent = state.tree || newNode({ name:'(fallback)', kind:'dir', path:'/' });
  state.tree = parent;
  const node = newNode({ name, kind:'file', path });
  node.parent = parent; parent.children.push(node);
  const drafts = ls.get(KEYS.drafts, {});
  drafts[path] = { content, modified: Date.now() };
  ls.set(KEYS.drafts, drafts);
}

/* History */
function saveHistoryEntry(label, meta){
  const h = ls.get(KEYS.history, []);
  h.unshift({ label, ts: meta.ts || Date.now() });
  ls.set(KEYS.history, h.slice(0, 5));
}
function renderHistoryHTML(){
  const h = ls.get(KEYS.history, []);
  if (!h.length) return '';
  const items = h.map(i=> `<span class="me-2">• ${i.label}</span>`).join('');
  return `<div class="small">${items}</div>`;
}

/* Session restore */
function restoreLastSession(){
  $('#inputApiKey').val(settings.apiKey||'');
  $('#inputModelId').val(settings.modelId||'gemini-2.5-flash-lite');
  $('#chkDark').prop('checked', !!settings.dark);
}

/* Shortcuts */
function onKeyDown(e){
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase()==='s'){ e.preventDefault(); saveCurrent(); }
  if (mod && e.key.toLowerCase()==='b'){ e.preventDefault(); wrapSelection('**'); }
  if (mod && e.key.toLowerCase()==='i'){ e.preventDefault(); wrapSelection('*'); }
}
function wrapSelection(wrapper){
  const el = $editor.get(0);
  const [start, end] = [el.selectionStart, el.selectionEnd];
  const val = $editor.val();
  const before = val.slice(0,start), sel = val.slice(start,end), after = val.slice(end);
  const out = before + wrapper + sel + wrapper + after;
  $editor.val(out).trigger('input');
  el.focus();
  el.selectionStart = start + wrapper.length;
  el.selectionEnd = end + wrapper.length;
}

/* AI functions */
function saveSettingsFromModal(){
  settings.apiKey = $('#inputApiKey').val().trim();
  settings.modelId = $('#inputModelId').val().trim() || 'gemini-2.5-flash-lite';
  settings.dark = $('#chkDark').is(':checked');
  ls.set(KEYS.settings, settings);
  applyTheme(settings.dark ? 'dark' : 'light');
  bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
}
function runAIOnCurrent(){
  if (!state.current.path) { alert('Abra um arquivo primeiro.'); return; }
  if (!settings.apiKey){ alert('Defina sua API Key nas Configurações.'); return; }
  const userPrompt = ($('#aiPromptInput').val()||'').trim();
  const content = $editor.val() || '';
  const system = 'Você é um assistente de edição de Markdown. Responda SOMENTE com o conteúdo Markdown final, sem comentários, sem blocos de código de linguagem (sem ```), e sem texto extra.';
  const body = {
    contents: [{ role:'user', parts:[{ text: `${system}\n\nInstrução do usuário:\n${userPrompt}\n\nConteúdo atual (edite e retorne apenas o Markdown final):\n${content}` }]}],
    generationConfig: { temperature: 0.3 }
  };
  $('#statusText').text('Solicitando ao Gemini...');
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.modelId)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`, {
    method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body)
  }).then(r=>r.json()).then(data=>{
    const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
    if (!text) throw new Error('Resposta vazia');
    $editor.val(text).trigger('input');
    $('#statusText').text('Conteúdo atualizado pela AI');
  }).catch(err=>{
    console.error(err); alert('Falha na chamada ao Gemini. Verifique a chave/modelo.');
    $('#statusText').text('Erro da AI');
  });
}