(function(){
  // ---------- Persistence ----------
  const store = {
    get(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch(_){ return def; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  };

  // ---------- Catalogs ----------
  const FUNCTION_TYPES = [
    "Automation","Billing / Invoicing","Bookkeeping","Calendar","CRM","Custodian / TAMP",
    "Data Aggregation","Data Gathering","eSignature","Email","Email Marketing",
    "File Sharing / Document Storage","Financial Planning","Lead Generation","Mind Mapping",
    "Notes Storage","Office Suite","Other Financial","Password Manager","Phone / Text",
    "Pipeline Management","Project Management","Risk Tolerance","Scheduler","Task Management",
    "Tax Planning","Tax Prep","Time Tracking","Transcription","Video Conferencing",
    "Video Recording","Website","Other"
  ];

  // ---------- State ----------
  let state = {
    apps: store.get('apps', [
      { id: uid(), name:'Calendly',   category:'Scheduler', needsFilter:false, icon:'🗓️', iconData:null,
        functions:["Scheduler"],
        datapoints: {
          "First Name":{inbound:"invitee_first", outbound:"{invitee_first}"},
          "Last Name": {inbound:"invitee_last",  outbound:"{invitee_last}"},
          "Email Address":{inbound:"invitee_email", outbound:"{invitee_email}"},
          "Phone Number":{inbound:"phone", outbound:"{phone}"}
        },
        integrations:[ {name:"Google Calendar", direct:true, zapier:false}, {name:"Zoom", direct:false, zapier:true} ]
      },
      { id: uid(), name:'Google Calendar', category:'Calendar', needsFilter:false, icon:'📆', iconData:null, functions:["Calendar"], datapoints:{}, integrations:[] },
      { id: uid(), name:'Wealthbox',  category:'CRM', needsFilter:false, icon:'📇', iconData:null, functions:["CRM","Pipeline Management","Task Management"], datapoints:{}, integrations:[] },
    ]),
    functions: store.get('functions', FUNCTION_TYPES.map(t => ({ id: uid(), type: t, name: t }))),

    zaps: store.get('zaps', []),
    forms: store.get('forms', []),
    workflows: store.get('workflows', []),
    scheduling: store.get('scheduling', []),
    emailCampaigns: store.get('emailCampaigns', []),

    teamMembers: store.get('teamMembers', [{ id: uid(), name:'Arielle', roleNotes:'', roles: ['Managing Partner'] }]),
    roles: store.get('roles', ['Managing Partner','Advisor','Client Service Specialist']),
    segments: store.get('segments', ['Prospects','Paid AUM','Hourly','Pro Bono']),
    datapoints: store.get('datapoints', ['First Name','Last Name','Email Address','Phone Number','householdName']),

    naming: store.get('naming', {
      household: { individual:'{Last}, {First}', jointSame:'{Last}, {First} & {PartnerFirst}', jointDifferent:'{Last}, {First} & {PartnerLast}, {PartnerFirst}' },
      folder: { individual:'{householdName}', jointSame:'{householdName}', jointDifferent:'{householdName}' }
    }),
    folderHierarchy: store.get('folderHierarchy',
`Clients/
  {householdName}/
    Meetings/
    Documents/
    Statements/`),
    folderPreviewSamples: store.get('folderPreviewSamples', {
      First:'Alex', Last:'Taylor', PartnerFirst:'Jordan', PartnerLast:'Taylor', householdName:'Taylor, Alex & Jordan'
    }),
    ui: store.get('ui', { smallCards:false }),
    pricing: { zapStep:80, emailStep:80, schedulerPage:125, otherHourly:300 }
  };
  persist();

  function persist(){
    [
      'apps','functions','zaps','forms','workflows','scheduling','emailCampaigns',
      'teamMembers','roles','segments','datapoints','naming','folderHierarchy','folderPreviewSamples','ui'
    ].forEach(k => store.set(k, state[k]));
  }

  // ---------- Utils ----------
  function $(sel, el=document){ return el.querySelector(sel); }
  function $all(sel, el=document){ return Array.from(el.querySelectorAll(sel)); }
  function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function dedupe(arr){ return Array.from(new Set(arr)); }
  function initial(name){ return (name||'?').trim().slice(0,1).toUpperCase(); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o||null)); }

  // Emoji/asset library (includes your uploaded sample as a selectable image)
  const ICON_LIBRARY = [
    '🗓️','📆','📇','⚙️','✉️','📞','🧩','🔗','✅','🧠',
    // local sample image:
    {'img':'/mnt/data/Tech Analysis Sample 2.png'} // will be transformed to a served URL
  ];

  // ---------- Routing ----------
  const routes = {
    '/apps': renderAppsPage,
    '/apps/functions': renderFunctionsPage,
    '/apps/tech': renderTechComparison,
    '/resources/zaps': renderZaps,
    '/resources/forms': renderForms,
    '/resources/workflows': renderWorkflows,
    '/resources/scheduling': renderScheduling,
    '/resources/email-campaigns': renderEmailCampaigns,
    '/settings/team': renderTeam,
    '/settings/segments': renderSegments,
    '/settings/datapoints': renderDatapoints,
    '/settings/folder-hierarchy': renderFolderHierarchy,
    '/settings/naming-conventions': renderNaming,
  };
  function currentPath(){ const h=(location.hash||'#/apps').slice(1); return h||'/apps'; }
  function navigate(){
    const path = currentPath();
    const view = $('#view');
    const fn = routes[path] || renderNotFound;
    $all('[data-route]').forEach(a=> a.classList.toggle('active', a.getAttribute('href')==='#'+path));
    $('#crumbs').textContent = path.split('/').filter(Boolean).join(' / ');
    view.innerHTML=''; fn(view,path);
  }
  addEventListener('hashchange', navigate);
  addEventListener('load', navigate);

  // Topbar buttons
  $('#exportAll').addEventListener('click', ()=>{
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='operations-library.json'; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
  });
  $('#importAll').addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = e=>{
      const f = e.target.files[0]; if(!f) return;
      const fr = new FileReader();
      fr.onload = ()=>{ try{ Object.assign(state, JSON.parse(fr.result)); persist(); navigate(); }catch(_){ alert('Invalid JSON'); } };
      fr.readAsText(f);
    };
    inp.click();
  });
  $('#resetAll').addEventListener('click', ()=>{ if(confirm('Reset all data?')){ localStorage.clear(); location.reload(); } });

  // ---------- Apps/Functions cards ----------
  function renderAppsPage(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <h2 style="margin:0">Applications</h2>
          <div class="spacer"></div>
          <button class="btn small" id="addApp">+ Add New</button>
          <a href="#" id="toggleIcons" class="muted">${state.ui.smallCards ? 'Details' : 'Icons'}</a>
        </div>
        <div id="appsGrid" class="af-grid ${state.ui.smallCards?'af-small':''}"></div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="row" style="margin-bottom:10px">
          <h2 style="margin:0">Functions</h2>
          <div class="spacer"></div>
          <button class="btn small" id="addFunction">+ Add New</button>
          <a href="#" id="toggleIcons2" class="muted">${state.ui.smallCards ? 'Details' : 'Icons'}</a>
        </div>
        <div id="functionsGrid" class="af-grid ${state.ui.smallCards?'af-small':''}"></div>
      </div>
    `;
    el.appendChild(wrap);

    function drawApps(){
      const grid = $('#appsGrid', wrap); grid.innerHTML='';
      (state.apps||[]).forEach(app=>{
        const card = document.createElement('div'); card.className='af-card';
        card.innerHTML = `
          <div class="af-head">
            <div class="af-icon">${app.iconData ? `<img src="${app.iconData}">` : esc(app.icon||initial(app.name))}</div>
            <div>${esc(app.name)}</div>
          </div>
          <div class="af-list">${esc((app.functions||[]).join('\n'))}</div>
        `;
        card.addEventListener('click', ()=> openAppModal(app.id));
        grid.appendChild(card);
      });
    }

    function drawFunctions(){
      const grid = $('#functionsGrid', wrap); grid.innerHTML='';
      const map = {};
      (state.apps||[]).forEach(a=>{
        (a.functions||[]).forEach(fn=>{
          map[fn] = map[fn] || [];
          map[fn].push(a.name);
        });
      });
      Object.keys(map).sort().forEach(fnName=>{
        const card = document.createElement('div'); card.className='af-card';
        card.innerHTML = `
          <div class="af-head">
            <div class="af-icon">${esc(initial(fnName))}</div>
            <div>${esc(fnName)}</div>
          </div>
          <div class="af-list">${esc(map[fnName].join('\n'))}</div>
        `;
        card.addEventListener('click', ()=> openFunctionModal(fnName));
        grid.appendChild(card);
      });
    }

    $('#toggleIcons', wrap).addEventListener('click', (e)=>{ e.preventDefault(); state.ui.smallCards=!state.ui.smallCards; persist(); $('#appsGrid',wrap).classList.toggle('af-small'); $('#functionsGrid',wrap).classList.toggle('af-small'); $('#toggleIcons').textContent=state.ui.smallCards?'Details':'Icons'; $('#toggleIcons2').textContent=state.ui.smallCards?'Details':'Icons'; });
    $('#toggleIcons2', wrap).addEventListener('click', (e)=>{ e.preventDefault(); state.ui.smallCards=!state.ui.smallCards; persist(); $('#appsGrid',wrap).classList.toggle('af-small'); $('#functionsGrid',wrap).classList.toggle('af-small'); $('#toggleIcons').textContent=state.ui.smallCards?'Details':'Icons'; $('#toggleIcons2').textContent=state.ui.smallCards?'Details':'Icons'; });

    $('#addApp', wrap).addEventListener('click', ()=>{
      state.apps.unshift({ id:uid(), name:'', category:'Other', needsFilter:false, icon:'📦', iconData:null, functions:[], datapoints:{}, integrations:[] });
      persist(); drawApps();
    });
    $('#addFunction', wrap).addEventListener('click', ()=>{
      state.functions.unshift({ id:uid(), type: FUNCTION_TYPES[0], name:'' });
      persist(); drawFunctions();
    });

    drawApps(); drawFunctions();
  }

  // ---------- Modal (view) ----------
  const modal = $('#modalRoot');
  const modalTitle = $('#modalTitle');
  const modalIcon  = $('#modalIcon');
  const modalBody  = $('#modalBody');
  const modalClose = $('#modalClose');

  let modalCtx = { type:'app', targetId:null };

  function openAppModal(appId){
    const app = state.apps.find(a=>a.id===appId); if(!app) return;
    modalCtx = { type:'app', targetId:appId };
    modal.classList.add('open');

    // Title + icon
    renderModalHeader(app);

    // Sections
    modalBody.innerHTML = '';
    modalBody.appendChild( section('Functions', app.functions?.length ? app.functions.map(esc).join('<br>') : '<span class="muted">None</span>', ()=> openFunctionsEditor(app.id)) );

    // Datapoints table
    const dpRows = state.datapoints.map(master=>{
      const row = app.datapoints?.[master] || {inbound:'',outbound:''};
      return `<tr><td>${esc(master)}</td><td>${esc(row.inbound||'')}</td><td>${esc(row.outbound||'')}</td></tr>`;
    }).join('');
    modalBody.appendChild( section('Datapoints',
      `<table><thead><tr><th>Master</th><th>Inbound (In-App)</th><th>Outbound (In-App)</th></tr></thead><tbody>${dpRows}</tbody></table>`,
      ()=> openDatapointsEditor(app.id)
    ));

    // Used In (one-way)
    const used = buildUsedIn(app.name);
    const usedHtml = used.length ? used.map(u=>`<a href="${u.hash}" class="pill">${esc(u.label)}</a>`).join(' ') : '<span class="muted">No links yet</span>';
    modalBody.appendChild( section('Used In Resources', usedHtml, null) );

    // Integrations
    const intHtml = app.integrations?.length
      ? app.integrations.map(it=>`<div class="row" style="margin:4px 0"><span class="pill">${esc(it.name)}</span><span class="muted">Direct: ${it.direct?'Yes':'No'}</span><span class="muted">Zapier: ${it.zapier?'Yes':'No'}</span></div>`).join('')
      : '<span class="muted">None</span>';
    modalBody.appendChild( section('Integrations', intHtml, ()=> openIntegrationsEditor(app.id) ) );
  }

  function renderModalHeader(app){
    modalIcon.innerHTML = app.iconData ? `<img src="${app.iconData}">` : esc(app.icon || initial(app.name));
    modalIcon.style.cursor='pointer';
    modalIcon.title = 'Change icon';
    modalIcon.onclick = ()=> openIconChooser(app.id);

    modalTitle.textContent = app.name || 'Untitled App';
    // inline edit: autosave on blur / Enter
    modalTitle.onkeydown = (e)=>{
      if(e.key==='Enter'){ e.preventDefault(); modalTitle.blur(); }
    };
    modalTitle.onblur = ()=>{
      const v = modalTitle.textContent.trim();
      const target = state.apps.find(a=>a.id===modalCtx.targetId);
      if(target){ target.name = v; persist(); }
    };
  }

  modalClose.addEventListener('click', ()=> modal.classList.remove('open'));

  function section(title, html, onClick){
    const box = document.createElement('div'); box.className='section card';
    box.innerHTML = `<h4>${esc(title)}</h4><div class="section-body">${html}</div>`;
    if(onClick){ box.style.cursor='pointer'; box.addEventListener('click', onClick); }
    return box;
  }

  // ---------- Slideout Editors (autosave) ----------
  const slide = $('#editorSlideout');
  const slideTitle = $('#slideTitle');
  const slideBody = $('#slideBody');
  $('#slideClose').addEventListener('click', ()=> slide.classList.remove('open'));

  function openFunctionsEditor(appId){
    const app = state.apps.find(a=>a.id===appId); if(!app) return;
    slideTitle.textContent = `Edit Functions — ${app.name}`;
    slideBody.innerHTML = '';
    const chipBox = document.createElement('div'); chipBox.className='row'; slideBody.appendChild(chipBox);

    function drawChips(){
      chipBox.innerHTML='';
      (app.functions||[]).forEach(name=>{
        const chip = document.createElement('span'); chip.className='chip';
        chip.innerHTML = `${esc(name)} <button title="Remove" class="icon-btn">×</button>`;
        chip.querySelector('button').onclick = ()=>{ app.functions = app.functions.filter(n=>n!==name); persist(); drawChips(); };
        chipBox.appendChild(chip);
      });
    }
    drawChips();

    const row = document.createElement('div'); row.className='row'; row.style.marginTop='12px';
    row.innerHTML = `<input type="text" id="fnAdd" placeholder="Add function…"><button class="btn small">Add</button>`;
    slideBody.appendChild(row);
    const input = row.querySelector('input'); row.querySelector('button').onclick = add;
    const sug = attachAutosuggest(input, { suggestions: currentFunctionNames(), onPick: add });
    function add(val){
      const v = (val||input.value||'').trim(); if(!v) return;
      app.functions = dedupe([...(app.functions||[]), v]);
      if (!state.functions.some(f=>f.name===v)) state.functions.push({ id:uid(), type: guessType(v), name:v });
      input.value=''; sug.updateSuggestions(currentFunctionNames()); persist(); drawChips();
    }

    slide.classList.add('open');
  }

  function openDatapointsEditor(appId){
    const app = state.apps.find(a=>a.id===appId); if(!app) return;
    app.datapoints = app.datapoints || {};
    slideTitle.textContent = `Edit Datapoints — ${app.name}`;
    slideBody.innerHTML = `<table><thead><tr><th>Master</th><th>Inbound (In-App Name)</th><th>Outbound (In-App Name)</th></tr></thead><tbody></tbody></table>`;
    const tb = slideBody.querySelector('tbody');
    state.datapoints.forEach(master=>{
      const cur = app.datapoints[master] || {inbound:'', outbound:''};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(master)}</td>
        <td><input type="text" value="${esc(cur.inbound||'')}"></td>
        <td><input type="text" value="${esc(cur.outbound||'')}"></td>`;
      const [inInp,outInp] = tr.querySelectorAll('input');
      inInp.addEventListener('input', ()=>{ app.datapoints[master] = { ...(app.datapoints[master]||{}), inbound:inInp.value }; persist(); });
      outInp.addEventListener('input', ()=>{ app.datapoints[master] = { ...(app.datapoints[master]||{}), outbound:outInp.value }; persist(); });
      tb.appendChild(tr);
    });
    slide.classList.add('open');
  }

  function openIntegrationsEditor(appId){
    const app = state.apps.find(a=>a.id===appId); if(!app) return;
    app.integrations = app.integrations || [];
    slideTitle.textContent = `Edit Integrations — ${app.name}`;
    slideBody.innerHTML = '';
    const list = document.createElement('div'); slideBody.appendChild(list);

    const addRow = document.createElement('div'); addRow.className='row'; addRow.style.marginTop='12px';
    addRow.innerHTML = `<input type="text" id="intName" placeholder="Partner name…">
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="intDirect"> Direct</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="intZapier"> Zapier</label>
      <button class="btn small">Add</button>`;
    slideBody.appendChild(addRow);

    function draw(){
      list.innerHTML='';
      app.integrations.forEach((it, idx)=>{
        const row = document.createElement('div'); row.className='row'; row.style.margin='6px 0';
        row.innerHTML = `<span class="pill">${esc(it.name)}</span>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" ${it.direct?'checked':''} data-k="direct"> Direct</label>
          <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" ${it.zapier?'checked':''} data-k="zapier"> Zapier</label>
          <button class="btn small" data-act="del">Remove</button>`;
        row.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
          chk.addEventListener('change', ()=>{ it[chk.getAttribute('data-k')] = chk.checked; persist(); });
        });
        row.querySelector('[data-act="del"]').addEventListener('click', ()=>{ app.integrations.splice(idx,1); persist(); draw(); });
        list.appendChild(row);
      });
    }
    draw();

    addRow.querySelector('button').onclick = ()=>{
      const name = addRow.querySelector('#intName').value.trim();
      const direct = addRow.querySelector('#intDirect').checked;
      const zapier = addRow.querySelector('#intZapier').checked;
      if(!name) return;
      app.integrations.push({ name, direct, zapier }); persist(); draw();
      addRow.querySelector('#intName').value=''; addRow.querySelector('#intDirect').checked=false; addRow.querySelector('#intZapier').checked=false;
    };

    slide.classList.add('open');
  }

  // ---------- Icon chooser ----------
  const iconSlide = $('#iconSlideout');
  $('#iconClose').addEventListener('click', ()=> iconSlide.classList.remove('open'));
  const libBox = $('#iconLib');
  function buildIconLibrary(){
    libBox.innerHTML='';
    ICON_LIBRARY.forEach(item=>{
      const btn = document.createElement('button'); btn.className='btn small';
      if(typeof item === 'string'){ btn.textContent=item; }
      else { btn.innerHTML = `<img src="${item.img}" style="width:22px;height:22px;border-radius:6px;vertical-align:middle">`; }
      btn.style.borderRadius='10px';
      btn.addEventListener('click', ()=> chooseIcon(item));
      libBox.appendChild(btn);
    });
  }
  buildIconLibrary();

  let iconTargetId = null;
  function openIconChooser(appId){
    iconTargetId = appId;
    iconSlide.classList.add('open');
  }
  function chooseIcon(item){
    const app = state.apps.find(a=>a.id===iconTargetId); if(!app) return;
    if (typeof item === 'string'){ app.icon = item; app.iconData = null; }
    else { app.iconData = item.img; }
    persist();
    // live refresh modal header
    if (modal.classList.contains('open') && modalCtx.targetId===app.id) renderModalHeader(app);
  }
  $('#iconFile').addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    const fr = new FileReader();
    fr.onload = ()=> chooseIcon({img: fr.result});
    fr.readAsDataURL(f);
  });

  // ---------- Function modal (simple) ----------
  function openFunctionModal(fnName){
    modalCtx = { type:'function', targetId:fnName };
    const apps = state.apps.filter(a => (a.functions||[]).includes(fnName)).map(a=>a.name);
    modal.classList.add('open');
    modalIcon.textContent = initial(fnName);
    modalTitle.textContent = fnName;
    modalTitle.onblur = null; modalTitle.onkeydown = null; modalIcon.onclick = null;
    modalBody.innerHTML = '';
    modalBody.appendChild( section('Applications', apps.length ? apps.map(esc).join('<br>') : '<span class="muted">None</span>', null) );
  }

  // ---------- Used In builder ----------
  function buildUsedIn(appName){
    const out = [];
    (state.zaps||[]).forEach(z => { if ((z.app||'').toLowerCase().includes((appName||'').toLowerCase())) out.push({ label:`Automation: ${z.title||z.event||'Zap'}`, hash:'#/resources/zaps' }); });
    (state.forms||[]).forEach(f => { if ((f.title||'').toLowerCase().includes((appName||'').toLowerCase())) out.push({ label:`Form: ${f.title}`, hash:'#/resources/forms' }); });
    (state.workflows||[]).forEach(w => { const txt = `${w.stage||''} ${w.step||''} ${w.notes||''}`.toLowerCase(); if (txt.includes((appName||'').toLowerCase())) out.push({label:`Workflow: ${w.step||'Step'}`, hash:'#/resources/workflows'}); });
    (state.emailCampaigns||[]).forEach(c => { const txt = `${c.name||''} ${c.notes||''}`.toLowerCase(); if (txt.includes((appName||'').toLowerCase())) out.push({label:`Email: ${c.name}`, hash:'#/resources/email-campaigns'}); });
    (state.scheduling||[]).forEach(s => { const txt = `${s.name||''} ${s.notes||''}`.toLowerCase(); if (txt.includes((appName||'').toLowerCase())) out.push({label:`Scheduling: ${s.name||'Page'}`, hash:'#/resources/scheduling'}); });
    return out;
  }

  // ---------- Other pages (kept terse) ----------
  function renderFunctionsPage(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <h2 style="margin:0">Functions</h2>
          <div class="spacer"></div>
          <button class="btn small" id="addFnRow">Add Function</button>
        </div>
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="fnSearch" placeholder="Search functions…">
          <select id="fnTypeFilter"><option value="">All Types</option>${FUNCTION_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
        </div>
        <table id="fnTable"><thead><tr><th>Type</th><th>Function</th><th></th></tr></thead><tbody></tbody></table>
      </div>`;
    el.appendChild(wrap);
    const $search=$('#fnSearch',wrap), $filter=$('#fnTypeFilter',wrap), $tb=$('#fnTable tbody',wrap);
    function draw(){
      const q = ($search.value||'').toLowerCase().trim(); const tf=$filter.value||'';
      const rows=(state.functions||[]).filter(f=>(!tf||f.type===tf) && (!q||[f.type,f.name].join(' ').toLowerCase().includes(q)));
      $tb.innerHTML=''; rows.forEach(fn=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td><select class="fnType">${FUNCTION_TYPES.map(t=>`<option ${fn.type===t?'selected':''}>${t}</option>`).join('')}</select></td>
          <td><input type="text" class="fnName" value="${esc(fn.name)}"></td><td><button class="btn small" data-act="del">Delete</button></td>`;
        tr.querySelector('.fnType').addEventListener('change', e=>{ fn.type=e.target.value; persist(); });
        const nameInput=tr.querySelector('.fnName'); const sug=attachAutosuggest(nameInput,{suggestions: currentFunctionNames(), onPick: v=>{ fn.name=v; persist(); }});
        nameInput.addEventListener('input', e=>{ fn.name=e.target.value; persist(); });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{ if(confirm('Delete function?')){ state.functions = state.functions.filter(x=>x.id!==fn.id); persist(); draw(); } });
        $tb.appendChild(tr);
      });
    }
    $('#addFnRow',wrap).addEventListener('click', ()=>{ state.functions.unshift({ id:uid(), type:FUNCTION_TYPES[0], name:'' }); persist(); draw(); });
    $search.addEventListener('input', draw); $filter.addEventListener('change', draw); draw();
  }

  function renderTechComparison(el){
    el.innerHTML = `<div class="card"><h2>Tech Comparison</h2><div class="muted">Stub — plug your analyzer here.</div></div>`;
  }

  function renderZaps(el){ el.innerHTML = `<div class="card"><h2>Zaps</h2><div class="muted">List your automation steps here.</div></div>`; }
  function renderForms(el){ el.innerHTML = `<div class="card"><h2>Forms</h2><div class="muted">Track forms here.</div></div>`; }
  function renderWorkflows(el){ el.innerHTML = `<div class="card"><h2>Workflows</h2><div class="muted">Card-based editor to come.</div></div>`; }
  function renderScheduling(el){ el.innerHTML = `<div class="card"><h2>Scheduling</h2><div class="muted">Track scheduling assets.</div></div>`; }

  function renderTeam(el){
    el.innerHTML = `<div class="card"><h2>Team</h2><div class="muted">Team editor unchanged.</div></div>`;
  }
  function renderSegments(el){ el.innerHTML = `<div class="card"><h2>Segments</h2><div class="muted">Segments editor unchanged.</div></div>`; }
  function renderDatapoints(el){ el.innerHTML = `<div class="card"><h2>Datapoints</h2><div class="muted">Datapoints editor unchanged.</div></div>`; }

  function renderFolderHierarchy(el){
    el.innerHTML = `<div class="card"><h2>Folder Hierarchy</h2><pre style="white-space:pre-wrap">${esc(state.folderHierarchy)}</pre></div>`;
  }
  function renderNaming(el){
    el.innerHTML = `<div class="card"><h2>Naming Conventions</h2><div class="muted">Combined page retained.</div></div>`;
  }
  function renderNotFound(el){ el.innerHTML = `<div class="card"><h2>Not Found</h2><div class="muted">No route for ${currentPath()}</div></div>`; }

  // ---------- Autosuggest ----------
  function attachAutosuggest(input, { suggestions = [], max = 8, onPick } = {}){
    let list = document.createElement('div');
    Object.assign(list.style, {
      position:'absolute', background:'#0f131b', border:'1px solid var(--line)', borderRadius:'10px',
      padding:'4px', boxShadow:'0 6px 20px rgba(0,0,0,.35)', zIndex:80, display:'none'
    });
    document.body.appendChild(list);

    let curIdx = -1;
    function position(){
      const r = input.getBoundingClientRect();
      list.style.left = `${r.left + window.scrollX}px`;
      list.style.top  = `${r.bottom + window.scrollY + 4}px`;
      list.style.minWidth = `${r.width}px`;
    }
    function hide(){ list.style.display='none'; curIdx=-1; }
    function show(){ list.style.display='block'; position(); }
    function build(){
      const q = (input.value||'').toLowerCase().trim();
      const opts = suggestions.filter(s=>!q || s.toLowerCase().includes(q)).slice(0,max);
      list.innerHTML = '';
      if(!opts.length){ hide(); return; }
      opts.forEach((opt,i)=>{
        const item = document.createElement('div');
        item.textContent = opt;
        Object.assign(item.style,{ padding:'6px 8px', cursor:'pointer', borderRadius:'8px' });
        item.addEventListener('mouseenter', ()=> highlight(i));
        item.addEventListener('mouseleave', ()=> highlight(-1));
        item.addEventListener('mousedown', (e)=>{ e.preventDefault(); pick(opt); });
        list.appendChild(item);
      });
      show(); highlight(-1);
    }
    function highlight(i){ curIdx=i; Array.from(list.children).forEach((el,idx)=> el.style.background = idx===i ? '#131a27' : 'transparent'); }
    function pick(val){ input.value = val; onPick && onPick(val); hide(); }
    input.addEventListener('input', build);
    input.addEventListener('focus', build);
    input.addEventListener('blur', ()=> setTimeout(hide, 80));
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    input.addEventListener('keydown', (e)=>{
      if(list.style.display==='none') return;
      if(e.key==='ArrowDown'){ e.preventDefault(); highlight(Math.min(curIdx+1, list.children.length-1)); }
      else if(e.key==='ArrowUp'){ e.preventDefault(); highlight(Math.max(curIdx-1, -1)); }
      else if(e.key==='Enter'){ if(curIdx>=0){ e.preventDefault(); pick(list.children[curIdx].textContent); } }
      else if(e.key==='Escape'){ hide(); }
    });
    return { updateSuggestions(arr){ suggestions = arr||[]; build(); }, destroy(){ document.body.removeChild(list); } };
  }

  // ---------- Helpers ----------
  function currentFunctionNames(){ return dedupe((state.functions||[]).map(f=>f.name).filter(Boolean)); }
  function guessType(name){
    const n = (name||'').toLowerCase();
    if (FUNCTION_TYPES.includes(name)) return name;
    if (n.includes('email')) return 'Email';
    if (n.includes('calendar') || n.includes('schedule')) return 'Scheduler';
    if (n.includes('crm') || n.includes('pipeline')) return 'CRM';
    if (n.includes('invoice') || n.includes('billing')) return 'Billing / Invoicing';
    return 'Other';
  }

})();
