/* Operations Library SPA — consolidated file

Features kept/added:
- Apps with function chips and autosuggest
- Functions catalog with autosuggest
- Tech Comparison (apps weighted criteria)
- Resources: Zaps, Forms, Workflows (editor replaced), Scheduling, Email Campaigns
- Settings: Team (members + roles), Segments, Datapoints, Folder Hierarchy (visual tree + merge-field pills),
           Naming Conventions (combined household + folder: individual / jointSame / jointDifferent)
- Workflow editor: card layout, step templates modal, drag-reorder, resources, outcomes, tokens
- Cross-references: resources/datapoints backlinks

Assumes your HTML sidebar routes:
  /apps, /resources (Functions), /settings (settings home),
  /resources/zaps, /resources/forms, /resources/workflows, /resources/scheduling, /resources/email-campaigns
Also available:
  /apps/functions, /apps/tech, /settings/naming-conventions, /settings/folder-hierarchy, /settings/datapoints, /settings/team
*/

(function () {
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
      { id: uid(), name:'Calendly',   category:'Scheduler', notes:'add filter step for event type', needsFilter:true,  functions:["Scheduler"] },
      { id: uid(), name:'ScheduleOnce', category:'Scheduler', notes:'needs filter for event',        needsFilter:true,  functions:["Scheduler"] },
      { id: uid(), name:'Wealthbox',  category:'CRM',        notes:'',                                needsFilter:false, functions:["CRM","Pipeline Management","Task Management"] },
    ]),

    // Functions catalog you can extend; used by autosuggests
    functions: store.get('functions', FUNCTION_TYPES.map(t => ({ id: uid(), type: t, name: t }))),

    zaps: store.get('zaps', []),
    forms: store.get('forms', []),
    workflows: store.get('workflows', []), // migrated below if legacy
    scheduling: store.get('scheduling', []),
    emailCampaigns: store.get('emailCampaigns', []),
    emailTemplates: store.get('emailTemplates', []), // optional: {id, name, body?}

    // Settings
    teamMembers: store.get('teamMembers', [{ id: uid(), name:'Arielle', roleNotes:'', roles: ['Managing Partner'] }]),
    roles: store.get('roles', ['Managing Partner','Advisor','Client Service Specialist']),
    segments: store.get('segments', ['Prospects','Paid AUM','Hourly','Pro Bono']),
    datapoints: store.get('datapoints', ['First Name','Last Name','Email','Domain','Household','householdName']),

    // Combined Naming Conventions
    naming: store.get('naming', {
      household: {
        individual: '{Last}, {First}',
        jointSame: '{Last}, {First} & {PartnerFirst}',
        jointDifferent: '{Last}, {First} & {PartnerLast}, {PartnerFirst}',
      },
      folder: {
        individual: '{householdName}',
        jointSame: '{householdName}',
        jointDifferent: '{householdName}',
      }
    }),

    // Folder hierarchy authoring text (with tokens) + sample preview values
    folderHierarchy: store.get('folderHierarchy',
`Clients/
  {householdName}/
    Meetings/
    Documents/
    Statements/`),

    folderPreviewSamples: store.get('folderPreviewSamples', {
      First: 'Alex', Last: 'Taylor', PartnerFirst: 'Jordan', PartnerLast: 'Taylor',
      householdName: 'Taylor, Alex & Jordan'
    }),

    // Step templates (modal in workflows)
    stepTemplates: store.get('stepTemplates', [
      { id: uid(), type:'Schedule Meeting',    title:'Schedule {Meeting Type}', notes:'Send link; confirm agenda; share pre-reads', checklist:['Send link','Confirm agenda','Attach docs'] },
      { id: uid(), type:'Pre-Meeting Prep',    title:'Prep for {Meeting Type}', notes:'Review CRM notes; prep questions; confirm objectives', checklist:['Review notes','Prep questions','Confirm objectives'] },
      { id: uid(), type:'Conduct Meeting',     title:'Conduct {Meeting Type}',  notes:'Run agenda; capture decisions; assign owners', checklist:['Run agenda','Capture decisions','Assign owners'] },
      { id: uid(), type:'Post-Meeting Prep',   title:'Post-Meeting Prep',       notes:'Clean notes; draft recap; create tasks', checklist:['Clean notes','Draft recap','Create tasks'] },
      { id: uid(), type:'Conduct Phone Call',  title:'Call: {Topic}',           notes:'Short agenda; confirm outcomes; log notes', checklist:['Agenda','Outcomes','Log notes'] },
      { id: uid(), type:'Send Email',          title:'Email: {Subject}',        notes:'Draft subject; bullets; CTA', checklist:['Subject','Bullets','CTA'] },
      { id: uid(), type:'Send Text Message',   title:'Text: {Context}',         notes:'Short copy; include link if needed', checklist:['Short copy','Optional link'] },
      { id: uid(), type:'Request Item',        title:'Request: {Item Name}',    notes:'Specify format; due date; upload location', checklist:['Format','Due date','Upload link'] },
      { id: uid(), type:'Follow Up',           title:'Follow Up: {Topic}',      notes:'Reference context; restate ask; next step', checklist:['Context','Ask','Next step'] },
      { id: uid(), type:'Item Received',       title:'Item Received: {Item}',   notes:'Verify completeness; file docs; notify', checklist:['Verify','File','Notify'] },
      { id: uid(), type:'Task',                title:'Task: {What}',            notes:'Atomic action; definition of done; owner', checklist:['Define done','Assign owner'] },
    ]),

    pricing: { zapStep:80, emailStep:80, schedulerPage:125, otherHourly:300 },

    // volatile cross-ref cache (not persisted)
    _refs: { resources:{}, datapoints:{} }
  };

  // Migrate legacy workflows shape if needed
  if (Array.isArray(state.workflows) && state.workflows.length && !state.workflows[0]?.steps) {
    state.workflows = [{
      id: uid(),
      name: 'General',
      notes: '',
      steps: state.workflows.map(s => ({
        id: uid(),
        type: s.type || 'Task',
        title: s.step || s.title || 'Step',
        description: s.notes || '',
        assigneeId: '',
        dueOffsetDays: Number(s.dueOffsetDays || 0),
        milestone: !!s.milestone,
        outcomes: Array.isArray(s.outcomes) ? s.outcomes : [],
        resources: Array.isArray(s.resources) ? s.resources : [],
        checklist: Array.isArray(s.checklist) ? s.checklist.slice() : [],
        _open: false
      }))
    }];
  }

  persist();

  function persist(){
    store.set('apps', state.apps);
    store.set('functions', state.functions);
    store.set('zaps', state.zaps);
    store.set('forms', state.forms);
    store.set('workflows', state.workflows);
    store.set('scheduling', state.scheduling);
    store.set('emailCampaigns', state.emailCampaigns);
    store.set('emailTemplates', state.emailTemplates);

    store.set('teamMembers', state.teamMembers);
    store.set('roles', state.roles);
    store.set('segments', state.segments);
    store.set('datapoints', state.datapoints);

    store.set('naming', state.naming);
    store.set('folderHierarchy', state.folderHierarchy);
    store.set('folderPreviewSamples', state.folderPreviewSamples);
    store.set('stepTemplates', state.stepTemplates);

    rebuildCrossRefs();
  }

  // ---------- Utils ----------
  function $(sel, el=document){ return el.querySelector(sel); }
  function $all(sel, el=document){ return Array.from(el.querySelectorAll(sel)); }
  function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }
  function money(n){ return `$${Number(n||0).toFixed(2)}`; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function dedupe(arr){ return Array.from(new Set(arr)); }
  function currentFunctionNames(){ return dedupe((state.functions||[]).map(f=>f.name).filter(Boolean)); }
  function tokensIn(text){
    const out = [];
    String(text||'').replace(/\{([A-Za-z0-9_ ]+)\}/g, (_,k)=>{ out.push(k); return _; });
    return out;
  }
  function teamOptions(){
    return (state.teamMembers||[]).map(m=>({ id:m.id, name:m.name||'(Unnamed)' }));
  }
  function findById(arr,id){ return (arr||[]).find(x=>x.id===id); }
  function guessType(name){
    if (FUNCTION_TYPES.includes(name)) return name;
    const n = (name||'').toLowerCase();
    if (n.includes('email')) return 'Email';
    if (n.includes('calendar') || n.includes('schedule')) return 'Scheduler';
    if (n.includes('crm') || n.includes('pipeline')) return 'CRM';
    if (n.includes('invoice') || n.includes('billing')) return 'Billing / Invoicing';
    return 'Other';
  }
  function attachAutosuggest(input, { suggestions = [], max = 8, onPick } = {}){
    let list = document.createElement('div');
    Object.assign(list.style, {
      position:'absolute', background:'#0f131b', border:'1px solid var(--line)', borderRadius:'10px',
      padding:'4px', boxShadow:'0 6px 20px rgba(0,0,0,.35)', zIndex:50, display:'none'
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
    function highlight(i){
      curIdx = i;
      Array.from(list.children).forEach((el,idx)=>{ el.style.background = idx===i ? '#131a27' : 'transparent'; });
    }
    function pick(val){
      input.value = val; onPick && onPick(val); hide();
    }
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

  // ---------- Cross-refs ----------
  function rebuildCrossRefs(){
    const resMap = {};   // key: `${kind}:${id}` -> [{wfId,wfName,stepId,stepTitle}]
    const dpMap  = {};   // key: token -> [{wfId,wfName,stepId,field:'title'|'description'}]
    (state.workflows||[]).forEach(wf=>{
      (wf.steps||[]).forEach(st=>{
        (st.resources||[]).forEach(r=>{
          const key = `${r.kind}:${r.id}`;
          (resMap[key] ||= []).push({ wfId:wf.id, wfName:wf.name, stepId:st.id, stepTitle:st.title });
        });
        tokensIn(st.title).forEach(tok=>{
          (dpMap[tok] ||= []).push({ wfId:wf.id, wfName:wf.name, stepId:st.id, field:'title' });
        });
        tokensIn(st.description).forEach(tok=>{
          (dpMap[tok] ||= []).push({ wfId:wf.id, wfName:wf.name, stepId:st.id, field:'description' });
        });
      });
    });
    state._refs = { resources: resMap, datapoints: dpMap };
  }

  function resourceLookup(kind, id){
    const dict = {
      zap: state.zaps,
      form: state.forms,
      scheduler: state.scheduling,
      emailCampaign: state.emailCampaigns,
      emailTemplate: state.emailTemplates
    };
    const row = findById(dict[kind]||[], id);
    if (!row) return { name:`(${kind}:${id})` };
    return { name: row.title || row.name || row.campaign || row.event || row.id };
  }
  function resourceOptions(kind){
    const src = ({
      zap: state.zaps,
      form: state.forms,
      scheduler: state.scheduling,
      emailCampaign: state.emailCampaigns,
      emailTemplate: state.emailTemplates
    })[kind] || [];
    return src.map(x=>({ id:x.id, name: x.title||x.name||x.campaign||x.event||x.id }));
  }
  function kindLabel(k){
    return ({zap:'Zap', form:'Form', scheduler:'Scheduling', emailCampaign:'Email Campaign', emailTemplate:'Email Template'})[k] || k;
  }

  // ---------- Routing ----------
  const routes = {
    '/apps': renderApps,
    '/apps/functions': renderFunctions,
    '/apps/tech': renderTechComparison,

    '/resources': renderFunctions,
    '/resources/zaps': renderZaps,
    '/resources/forms': renderForms,
    '/resources/workflows': renderWorkflows,
    '/resources/scheduling': renderScheduling,
    '/resources/email-campaigns': renderEmailCampaigns,

    '/settings': renderSettingsHome,
    '/settings/team': renderTeam,
    '/settings/segments': renderSegments,
    '/settings/datapoints': renderDatapoints,
    '/settings/folder-hierarchy': renderFolderHierarchy,
    '/settings/naming-conventions': renderNaming,
  };

  function currentPath(){
    const h = (location.hash || '#/apps').slice(1);
    return h || '/apps';
  }
  function navigate(){
    const path = currentPath();
    const view = $('#view');
    const fn = routes[path] || renderNotFound;
    $all('[data-route]').forEach(a=>{
      if (a.getAttribute('href') === '#'+path) a.classList.add('active');
      else a.classList.remove('active');
    });
    $('#crumbs').textContent = path.split('/').filter(Boolean).join(' / ');
    view.innerHTML = '';
    fn(view, path);
  }
  window.addEventListener('hashchange', navigate);
  window.addEventListener('load', navigate);

  // ---------- Topbar actions ----------
  $('#exportAll').addEventListener('click', ()=>{
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'operations-library.json';
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  });
  $('#importAll').addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = e=>{
      const f = e.target.files[0]; if(!f) return;
      const fr = new FileReader();
      fr.onload = ()=>{
        try{
          const obj = JSON.parse(fr.result);
          Object.assign(state, obj);
          persist(); navigate();
        }catch(_){ alert('Invalid JSON'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  });
  $('#resetAll').addEventListener('click', ()=>{
    if(!confirm('Reset all data?')) return;
    localStorage.clear(); location.reload();
  });

  // ---------- Pages ----------
  function renderNotFound(el){
    el.innerHTML = `<div class="card"><h2>Not Found</h2><div class="muted">No route for ${currentPath()}</div></div>`;
  }

  // Tech Comparison
  function renderTechComparison(el){
    el.innerHTML = `
      <div class="card sticky">
        <h2>Tech Comparison</h2>
        <div class="row">
          <div class="muted">Pick apps to compare, add criteria & weights, then score.</div>
          <div class="spacer"></div>
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <label style="min-width:120px">Compare Apps</label>
          <select id="tcApps" multiple size="6" style="min-width:280px">
            ${ (state.apps||[]).map(a=>`<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.category||'Other')})</option>`).join('') }
          </select>
        </div>

        <div class="row" style="margin:10px 0">
          <button class="btn small" id="addCriterion">Add Criterion</button>
        </div>

        <table id="tcTable">
          <thead>
            <tr><th>Criterion</th><th>Weight (0–5)</th><th>Notes</th><th></th></tr>
          </thead>
          <tbody></tbody>
        </table>

        <div class="row" style="margin-top:12px">
          <button class="btn primary small" id="calcScores">Run Analysis</button>
          <div class="spacer"></div>
          <div id="tcResult" class="pill">No results yet</div>
        </div>
      </div>
    `;

    const page = { criteria: [] };
    const tbody = el.querySelector('#tcTable tbody');

    function drawCriteria(){
      tbody.innerHTML = '';
      page.criteria.forEach(c=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(c.name||'')}" placeholder="e.g., Compliance fit"></td>
          <td><input type="number" min="0" max="5" step="0.5" value="${Number(c.weight||0)}"></td>
          <td><input type="text" value="${esc(c.notes||'')}" placeholder="Scoring notes"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        const [nameInp, weightInp, notesInp] = tr.querySelectorAll('input');
        nameInp.addEventListener('input', ()=> c.name = nameInp.value);
        weightInp.addEventListener('input', ()=> c.weight = Number(weightInp.value||0));
        notesInp.addEventListener('input', ()=> c.notes = notesInp.value);
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          page.criteria = page.criteria.filter(x=>x!==c); drawCriteria();
        });
        tbody.appendChild(tr);
      });
    }

    el.querySelector('#addCriterion').addEventListener('click', ()=>{
      page.criteria.push({ name:'', weight:0, notes:'' });
      drawCriteria();
    });

    el.querySelector('#calcScores').addEventListener('click', ()=>{
      const selApps = Array.from(el.querySelector('#tcApps').selectedOptions).map(o=>o.value);
      if (!selApps.length) { alert('Pick at least one app.'); return; }
      if (!page.criteria.length) { alert('Add at least one criterion.'); return; }

      const totalWeight = page.criteria.reduce((s,c)=> s + Number(c.weight||0), 0) || 1;
      const result = selApps.map(id=>{
        const app = (state.apps||[]).find(a=>a.id===id);
        const score = totalWeight; // placeholder, replace with per-app ratings if you add them
        return { id, name: app?.name || id, score };
      }).sort((a,b)=> b.score - a.score);

      el.querySelector('#tcResult').textContent = `Rank: ${result.map(r=>`${r.name} (${r.score})`).join('  ·  ')}`;
    });

    drawCriteria();
  }

  // Apps
  function renderApps(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <h2>Apps</h2>
        <div class="row">
          <div class="spacer"></div>
          <button class="btn small" id="addApp">Add App</button>
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="appSearch" placeholder="Search apps…">
          <select id="appCategory">
            <option value="">All Categories</option>
            ${['Scheduler','CRM','Automation','Forms','Email','Other'].map(c=>`<option>${c}</option>`).join('')}
          </select>
        </div>
        <div id="appsTable"></div>
        <div class="notice">Assign functions per app using the chips; start typing to autosuggest.</div>
      </div>
    `;
    el.appendChild(wrap);

    const $table = $('#appsTable', wrap);
    const $search = $('#appSearch', wrap);
    const $cat = $('#appCategory', wrap);

    function renderTable(){
      const q = ($search.value||'').toLowerCase().trim();
      const c = $cat.value || '';
      const rows = state.apps.filter(a=>{
        const okCat = !c || a.category === c;
        const okQ = !q || [a.name,a.category,a.notes,(a.functions||[]).join(' ')].join(' ').toLowerCase().includes(q);
        return okCat && okQ;
      });

      const t = document.createElement('table');
      t.innerHTML = `
        <thead><tr>
          <th>Name</th><th>Category</th><th>Notes</th><th>Needs Filter</th><th>Functions</th><th></th>
        </tr></thead>
        <tbody></tbody>
      `;
      const tb = t.querySelector('tbody');
      rows.forEach(app=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(app.name)}" data-f="name"></td>
          <td>
            <select data-f="category">
              ${['Scheduler','CRM','Automation','Forms','Email','Other'].map(v=>`<option ${app.category===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" value="${esc(app.notes||'')}" data-f="notes"></td>
          <td><input type="checkbox" ${app.needsFilter?'checked':''} data-f="needsFilter"></td>
          <td>
            <div class="chips" data-f="functions"></div>
            <div class="row" style="margin-top:6px">
              <input type="text" class="funcInput" placeholder="Add function… (type to search)">
              <button class="btn small addFunc">Add</button>
            </div>
          </td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          if (inp.classList.contains('chips')) return;
          inp.addEventListener('input', ()=>{
            const f = inp.getAttribute('data-f');
            if (inp.type==='checkbox') app[f]=inp.checked; else app[f]=inp.value;
            persist();
          });
        });

        const box = tr.querySelector('.chips');
        function drawChips(){
          box.innerHTML = '';
          (app.functions||[]).forEach(fnName=>{
            const chip = pill(fnName);
            const x = miniX();
            x.addEventListener('click', ()=>{
              app.functions = (app.functions||[]).filter(n=>n!==fnName);
              persist(); drawChips();
            });
            chip.appendChild(x);
            box.appendChild(chip);
          });
        }
        drawChips();

        const input = tr.querySelector('.funcInput');
        const addBtn = tr.querySelector('.addFunc');
        const sug = attachAutosuggest(input, {
          suggestions: currentFunctionNames(),
          onPick: (val)=> addFn(val)
        });
        function addFn(val){
          const v = (val || input.value || '').trim(); if(!v) return;
          app.functions = dedupe([...(app.functions||[]), v]);
          if (!state.functions.some(f=>f.name===v)){
            state.functions.push({ id:uid(), type: guessType(v), name:v });
          }
          input.value=''; sug.updateSuggestions(currentFunctionNames());
          persist(); drawChips();
        }
        addBtn.addEventListener('click', ()=> addFn());

        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete app?')) return;
          state.apps = state.apps.filter(x=>x.id!==app.id); persist(); renderTable();
        });

        tb.appendChild(tr);
      });

      $table.innerHTML = '';
      $table.appendChild(t);
    }

    $('#addApp', wrap).addEventListener('click', ()=>{
      state.apps.unshift({ id:uid(), name:'', category:'Other', notes:'', needsFilter:false, functions:[] });
      persist(); renderTable();
    });
    $search.addEventListener('input', renderTable);
    $cat.addEventListener('change', renderTable);
    renderTable();

    function pill(text){
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.display='inline-flex';
      span.style.alignItems='center';
      span.style.gap='6px';
      span.textContent = text;
      return span;
    }
    function miniX(){
      const b = document.createElement('button');
      b.className='btn small ghost';
      b.style.border='none';
      b.style.padding='0 6px';
      b.style.lineHeight='1.4';
      b.textContent='×';
      return b;
    }
  }

  // Functions
  function renderFunctions(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <h2>Functions</h2>
        <div class="row">
          <div class="pill">Default types are preloaded; add or refine as needed.</div>
          <div class="spacer"></div>
          <button class="btn small" id="addFnRow">Add Function</button>
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <input type="text" id="fnSearch" placeholder="Search functions…">
          <select id="fnTypeFilter">
            <option value="">All Types</option>
            ${FUNCTION_TYPES.map(t=>`<option>${t}</option>`).join('')}
          </select>
        </div>
        <table id="fnTable">
          <thead><tr><th>Type</th><th>Function</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
    el.appendChild(wrap);

    const $search = $('#fnSearch', wrap);
    const $typeFilter = $('#fnTypeFilter', wrap);
    const $tb = $('#fnTable tbody', wrap);

    function draw(){
      const q = ($search.value||'').toLowerCase().trim();
      const tf = $typeFilter.value || '';
      const rows = (state.functions||[]).filter(f=>{
        const okT = !tf || f.type === tf;
        const okQ = !q || [f.type,f.name].join(' ').toLowerCase().includes(q);
        return okT && okQ;
      });

      $tb.innerHTML = '';
      rows.forEach(fn=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <select class="fnType">
              ${FUNCTION_TYPES.map(t=>`<option ${fn.type===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" class="fnName" value="${esc(fn.name)}" placeholder="Function name…"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelector('.fnType').addEventListener('change', e=>{ fn.type = e.target.value; persist(); });
        const nameInput = tr.querySelector('.fnName');
        const sug = attachAutosuggest(nameInput, { suggestions: currentFunctionNames(), onPick: val=>{ fn.name=val; persist(); } });
        nameInput.addEventListener('input', e=>{ fn.name = e.target.value; persist(); });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete function?')) return;
          state.functions = state.functions.filter(x=>x.id!==fn.id); persist(); draw();
        });
        $tb.appendChild(tr);
      });
    }

    $('#addFnRow', wrap).addEventListener('click', ()=>{
      state.functions.unshift({ id:uid(), type: FUNCTION_TYPES[0], name:'' });
      persist(); draw();
    });
    $search.addEventListener('input', draw);
    $typeFilter.addEventListener('change', draw);
    draw();
  }

  // Zaps
  function renderZaps(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <h2>Zaps</h2>
        <div class="row">
          <button class="btn small" id="addZap">Add Zap Step</button>
          <div class="spacer"></div>
          <div class="pill">Pricing: $${state.pricing.zapStep}/step</div>
        </div>
      </div>

      <div class="card">
        <table id="zapTable">
          <thead><tr>
            <th>Title</th><th>App</th><th>Type</th><th>Event</th><th>Needs Filter</th><th>Price</th><th></th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div class="row" style="margin-top:10px">
          <div class="spacer"></div>
          <div>Total Approved (Do Now, Sphynx/Joint): <b id="zapTotal">$0.00</b></div>
        </div>
      </div>
    `;
    el.appendChild(wrap);

    function priceRow(){ return state.pricing.zapStep; }
    function renderTable(){
      const tb = $('#zapTable tbody', wrap); tb.innerHTML = '';
      state.zaps.forEach(z=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(z.title||'')}" data-f="title"></td>
          <td><input type="text" value="${esc(z.app||'')}" data-f="app"></td>
          <td><select data-f="stepType">${['Trigger','Action'].map(t=>`<option ${z.stepType===t?'selected':''}>${t}</option>`).join('')}</select></td>
          <td><input type="text" value="${esc(z.event||'')}" data-f="event"></td>
          <td><input type="checkbox" ${z.needsFilter?'checked':''} data-f="needsFilter"></td>
          <td>${money(priceRow())}</td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            const f = inp.getAttribute('data-f');
            if (inp.type==='checkbox') z[f]=inp.checked; else z[f]=inp.value;
            persist(); renderTotals();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete step?')) return;
          state.zaps = state.zaps.filter(x=>x.id!==z.id); persist(); renderTable(); renderTotals();
        });
        tb.appendChild(tr);
      });
    }
    function renderTotals(){
      const total = state.zaps.length * priceRow();
      $('#zapTotal', wrap).textContent = money(total);
    }
    $('#addZap', wrap).addEventListener('click', ()=>{
      state.zaps.unshift({ id:uid(), title:'', app:'', stepType:'Action', event:'', needsFilter:false });
      persist(); renderTable(); renderTotals();
    });
    renderTable(); renderTotals();

    // backlinks
    renderResourceBacklinks(el, 'zap', state.zaps, z => z.title||z.name||z.id);
  }

  // Forms
  function renderForms(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <h2>Forms</h2>
        <div class="row">
          <button class="btn small" id="addForm">Add Form Item</button>
          <div class="spacer"></div>
          <div class="pill">Pricing: Questions/Conditions/PDFs/Emails/Signatures/Add-ons</div>
        </div>
      </div>

      <div class="card">
        <table id="formsTable">
          <thead><tr>
            <th>Title</th><th>Questions</th><th>Conditions</th><th>PDFs</th><th>Emails</th><th>Signatures</th><th>Add-ons</th><th></th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="card">
        <div class="collapse" id="livePrefill">
          <div class="c-head"><span class="caret">▶</span><b>Live Prefill (Spreadsheet → Form) – Collapsible</b></div>
          <div class="c-body">
            <div class="row" style="margin:12px 12px 0">
              <button class="btn small" id="initPrefill">Load Prefill Module</button>
              <span class="muted">Mounts your existing mapping/prefill UI here.</span>
            </div>
            <div id="prefillMount" style="padding:12px"></div>
          </div>
        </div>
      </div>
    `;
    el.appendChild(wrap);

    const col = $('#livePrefill', wrap);
    $('.c-head', col).addEventListener('click', ()=> col.classList.toggle('open'));

    function renderTable(){
      const tb = $('#formsTable tbody', wrap); tb.innerHTML = '';
      state.forms.forEach(f=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(f.title||'')}" data-f="title"></td>
          <td><input type="number" value="${Number(f.questions||0)}" data-f="questions"></td>
          <td><input type="number" value="${Number(f.conditions||0)}" data-f="conditions"></td>
          <td><input type="number" value="${Number(f.pdfs||0)}" data-f="pdfs"></td>
          <td><input type="number" value="${Number(f.emails||0)}" data-f="emails"></td>
          <td><input type="number" value="${Number(f.signatures||0)}" data-f="signatures"></td>
          <td><input type="number" value="${Number(f.addons||0)}" data-f="addons"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            const fkey = inp.getAttribute('data-f');
            f[fkey] = inp.type==='number' ? Number(inp.value||0) : inp.value;
            persist();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete form item?')) return;
          state.forms = state.forms.filter(x=>x.id!==f.id); persist(); renderTable();
        });
        tb.appendChild(tr);
      });
    }

    $('#addForm', wrap).addEventListener('click', ()=>{
      state.forms.unshift({ id:uid(), title:'', questions:0, conditions:0, pdfs:0, emails:0, signatures:0, addons:0 });
      persist(); renderTable();
    });
    $('#initPrefill', wrap).addEventListener('click', ()=>{
      const mount = $('#prefillMount', wrap);
      mount.innerHTML = '<div class="muted">Mount point ready. Paste/initialize your existing Prefill module here.</div>';
    });

    renderTable();

    // backlinks
    renderResourceBacklinks(el, 'form', state.forms, f => f.title||f.name||f.id);
  }

  // Workflows — card editor with templates
  function renderWorkflows(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <h2>Workflows</h2>
        <div class="row">
          <div class="muted">Card editor with assignee, due, milestones, outcomes, resources, tokens.</div>
          <div class="spacer"></div>
          <button class="btn small" id="addWorkflow">New Workflow</button>
        </div>
      </div>
      <div id="wfGrid" class="grid cols-2"></div>
    `;
    el.appendChild(wrap);

    $('#addWorkflow', wrap).addEventListener('click', ()=>{
      const wf = { id:uid(), name:'New Workflow', notes:'', steps:[] };
      state.workflows.unshift(wf); persist(); draw();
    });

    function draw(){
      const grid = $('#wfGrid', wrap);
      grid.innerHTML = '';
      (state.workflows||[]).forEach(wf=>{
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="row" style="align-items:center">
            <input type="text" class="wfName" value="${esc(wf.name||'')}" style="font-weight:700; font-size:16px; background:#0f131b; border-radius:8px; padding:6px 8px; border:1px solid var(--line); flex:1" />
            <button class="btn small" data-act="templates">Templates</button>
            <button class="btn small" data-act="duplicate">Duplicate</button>
            <button class="btn small" data-act="delete">Delete</button>
          </div>
          <div class="row" style="margin-top:6px">
            <textarea class="wfNotes" placeholder="Workflow notes…" style="width:100%; min-height:50px; background:#0f131b; border:1px solid var(--line); border-radius:8px; padding:8px">${esc(wf.notes||'')}</textarea>
          </div>

          <div class="row" style="margin:10px 0">
            <button class="btn small" data-act="addStep">Add Step</button>
          </div>

          <div class="grid" id="steps_${wf.id}" style="gap:10px"></div>
        `;
        grid.appendChild(card);

        // header actions
        card.querySelector('.wfName').addEventListener('input', e=>{ wf.name = e.target.value; persist(); });
        card.querySelector('.wfNotes').addEventListener('input', e=>{ wf.notes = e.target.value; persist(); });

        card.querySelector('[data-act="delete"]').addEventListener('click', ()=>{
          if(!confirm('Delete workflow?')) return;
          state.workflows = state.workflows.filter(x=>x.id!==wf.id); persist(); draw();
        });
        card.querySelector('[data-act="duplicate"]').addEventListener('click', ()=>{
          const copy = JSON.parse(JSON.stringify(wf));
          copy.id = uid(); copy.name = wf.name + ' (Copy)';
          copy.steps.forEach(s=> s.id = uid());
          state.workflows.unshift(copy); persist(); draw();
        });
        card.querySelector('[data-act="templates"]').addEventListener('click', ()=> openTemplateModal(wf));
        card.querySelector('[data-act="addStep"]').addEventListener('click', ()=>{
          wf.steps.push(newBlankStep()); persist(); paintSteps();
        });

        // steps UI
        function paintSteps(){
          const host = card.querySelector(`#steps_${wf.id}`);
          host.innerHTML = '';
          (wf.steps||[]).forEach((st, idx)=>{
            const step = document.createElement('div');
            step.className = 'card';
            step.style.borderStyle = st.milestone ? 'double' : 'solid';
            step.style.cursor = 'move';
            step.draggable = true;
            step.dataset.id = st.id;

            step.innerHTML = `
              <div class="row" style="align-items:center">
                <span class="pill">${idx+1}</span>
                <select class="s_type">
                  ${dedupe(['Schedule Meeting','Pre-Meeting Prep','Conduct Meeting','Post-Meeting Prep','Conduct Phone Call','Send Email','Send Text Message','Request Item','Follow Up','Item Received','Task']).map(t=>`<option ${st.type===t?'selected':''}>${esc(t)}</option>`).join('')}
                </select>
                <input type="text" class="s_title" value="${esc(st.title||'')}" placeholder="Step title (supports {Tokens})" style="flex:1">
                <label class="row" style="gap:6px"><input type="checkbox" class="s_milestone" ${st.milestone?'checked':''}> Milestone</label>
                <button class="btn small" data-act="expand">${st._open?'▾':'▸'}</button>
                <button class="btn small" data-act="dup">Duplicate</button>
                <button class="btn small" data-act="del">Delete</button>
              </div>

              <div class="s_detail" style="margin-top:8px; display:${st._open?'block':'none'}">
                <div class="grid cols-2">
                  <div>
                    <label>Description (supports {Tokens})</label>
                    <textarea class="s_desc" style="min-height:70px">${esc(st.description||'')}</textarea>
                  </div>
                  <div>
                    <div class="grid">
                      <div class="row">
                        <div style="flex:1">
                          <label>Assignee</label>
                          <select class="s_assignee">
                            <option value="">—</option>
                            ${teamOptions().map(o=>`<option value="${esc(o.id)}" ${st.assigneeId===o.id?'selected':''}>${esc(o.name)}</option>`).join('')}
                          </select>
                        </div>
                        <div>
                          <label>Due Offset (days)</label>
                          <input type="number" class="s_due" value="${Number(st.dueOffsetDays||0)}" style="width:110px">
                        </div>
                      </div>

                      <div>
                        <label>Outcomes</label>
                        <div class="row" style="flex-wrap:wrap; gap:6px" data-box="outcomes"></div>
                        <div class="row" style="margin-top:6px">
                          <input type="text" class="s_outcomeInp" placeholder="Add outcome…">
                          <button class="btn small" data-act="addOutcome">Add</button>
                        </div>
                      </div>

                      <div>
                        <label>Resources</label>
                        <div class="row" style="flex-wrap:wrap; gap:6px" data-box="resources"></div>
                        <div class="row" style="margin-top:6px; gap:6px">
                          <select class="s_resKind" style="min-width:160px">
                            <option value="zap">Zaps</option>
                            <option value="form">Forms</option>
                            <option value="scheduler">Scheduling</option>
                            <option value="emailCampaign">Email Campaigns</option>
                            <option value="emailTemplate">Email Templates</option>
                          </select>
                          <select class="s_resItem" style="min-width:220px"></select>
                          <button class="btn small" data-act="addRes">Link</button>
                        </div>
                      </div>

                      <div>
                        <label>Tokens</label>
                        <div class="row" style="flex-wrap:wrap; gap:6px" data-box="tokens"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `;
            // wire main
            step.querySelector('.s_type').addEventListener('change', e=>{ st.type = e.target.value; persist(); });
            step.querySelector('.s_title').addEventListener('input', e=>{ st.title = e.target.value; persist(); });
            step.querySelector('.s_milestone').addEventListener('change', e=>{ st.milestone = e.target.checked; persist(); step.style.borderStyle = st.milestone?'double':'solid'; });
            step.querySelector('.s_desc').addEventListener('input', e=>{ st.description = e.target.value; persist(); });
            step.querySelector('.s_assignee').addEventListener('change', e=>{ st.assigneeId = e.target.value; persist(); });
            step.querySelector('.s_due').addEventListener('input', e=>{ st.dueOffsetDays = Number(e.target.value||0); persist(); });

            // outcomes UI
            const outBox = step.querySelector('[data-box="outcomes"]');
            function paintOutcomes(){
              outBox.innerHTML = '';
              (st.outcomes||[]).forEach(name=>{
                const c = chip(name);
                const x = miniX(); x.addEventListener('click', ()=>{ st.outcomes = st.outcomes.filter(n=>n!==name); persist(); paintOutcomes(); });
                c.appendChild(x); outBox.appendChild(c);
              });
            }
            step.querySelector('[data-act="addOutcome"]').addEventListener('click', ()=>{
              const inp = step.querySelector('.s_outcomeInp');
              const v = (inp.value||'').trim(); if(!v) return;
              st.outcomes = dedupe([...(st.outcomes||[]), v]); inp.value=''; persist(); paintOutcomes();
            });
            paintOutcomes();

            // resources UI
            const resKind = step.querySelector('.s_resKind');
            const resItem = step.querySelector('.s_resItem');
            function loadResItems(){
              const opts = resourceOptions(resKind.value);
              resItem.innerHTML = opts.map(o=>`<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('') || `<option value="">(none)</option>`;
            }
            loadResItems();
            resKind.addEventListener('change', loadResItems);
            step.querySelector('[data-act="addRes"]').addEventListener('click', ()=>{
              const kind = resKind.value; const id = resItem.value; if(!id) return;
              st.resources = st.resources || [];
              if (!st.resources.some(r=>r.kind===kind && r.id===id)){
                st.resources.push({ kind, id });
                persist(); paintResources();
              }
            });

            const resBox = step.querySelector('[data-box="resources"]');
            function paintResources(){
              resBox.innerHTML = '';
              (st.resources||[]).forEach(r=>{
                const info = resourceLookup(r.kind, r.id);
                const c = chip(`${kindLabel(r.kind)}: ${info.name}`);
                const x = miniX(); x.addEventListener('click', ()=>{
                  st.resources = st.resources.filter(x=> !(x.kind===r.kind && x.id===r.id));
                  persist(); paintResources();
                });
                c.appendChild(x); resBox.appendChild(c);
              });
            }
            paintResources();

            // tokens helper
            const tokBox = step.querySelector('[data-box="tokens"]');
            function paintTokens(){
              tokBox.innerHTML = '';
              const toks = dedupe(['householdName', ...state.datapoints]).map(t=>`{${t}}`);
              toks.forEach(tok=>{
                const p = chip(tok); p.style.cursor='pointer';
                p.addEventListener('click', ()=>{
                  const titleEl = step.querySelector('.s_title');
                  const descEl = step.querySelector('.s_desc');
                  if (document.activeElement === descEl) {
                    insertAtCursor(descEl, tok); st.description = descEl.value;
                  } else {
                    insertAtCursor(titleEl, tok); st.title = titleEl.value;
                  }
                  persist();
                });
                tokBox.appendChild(p);
              });
            }
            paintTokens();

            // row actions
            step.querySelector('[data-act="expand"]').addEventListener('click', ()=>{
              st._open = !st._open;
              step.querySelector('.s_detail').style.display = st._open ? 'block':'none';
              step.querySelector('[data-act="expand"]').textContent = st._open ? '▾':'▸';
              persist();
            });
            step.querySelector('[data-act="dup"]').addEventListener('click', ()=>{
              const clone = JSON.parse(JSON.stringify(st)); clone.id = uid(); wf.steps.splice(idx+1,0,clone); persist(); paintSteps();
            });
            step.querySelector('[data-act="del"]').addEventListener('click', ()=>{
              if(!confirm('Delete step?')) return;
              wf.steps = wf.steps.filter(x=>x.id!==st.id); persist(); paintSteps();
            });

            // drag & drop
            step.addEventListener('dragstart', e=>{
              e.dataTransfer.setData('text/plain', st.id);
              step.style.opacity = '.6';
            });
            step.addEventListener('dragend', ()=> step.style.opacity = '');
            step.addEventListener('dragover', e=> e.preventDefault());
            step.addEventListener('drop', e=>{
              e.preventDefault();
              const draggedId = e.dataTransfer.getData('text/plain');
              const srcIdx = wf.steps.findIndex(x=>x.id===draggedId);
              const dstIdx = wf.steps.findIndex(x=>x.id===st.id);
              if (srcIdx<0 || dstIdx<0 || srcIdx===dstIdx) return;
              const [moved] = wf.steps.splice(srcIdx,1);
              wf.steps.splice(dstIdx,0,moved);
              persist(); paintSteps();
            });

            host.appendChild(step);
          });
        }
        paintSteps();
      });
    }
    draw();

    // Template modal
    function openTemplateModal(wf){
      const modal = document.createElement('div');
      Object.assign(modal.style, {
        position:'fixed', inset:'0', background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99
      });
      modal.innerHTML = `
        <div class="card" style="width:800px; max-height:80vh; overflow:auto">
          <div class="row" style="align-items:center">
            <h3 style="margin:0">Step Templates</h3>
            <div class="spacer"></div>
            <button class="btn small" data-act="close">Close</button>
          </div>
          <div class="row" style="margin:8px 0">
            <input type="text" id="tplQ" placeholder="Search templates…" style="flex:1">
            <select id="tplType"><option value="">All Types</option>${dedupe(state.stepTemplates.map(t=>t.type)).map(t=>`<option>${esc(t)}</option>`).join('')}</select>
            <button class="btn small" data-act="newTpl">New</button>
          </div>
          <table id="tplTbl">
            <thead><tr><th>Type</th><th>Title</th><th>Notes</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      `;
      document.body.appendChild(modal);

      function paint(){
        const q = ($('#tplQ', modal).value||'').toLowerCase().trim();
        const ty = $('#tplType', modal).value || '';
        const rows = state.stepTemplates.filter(t=>{
          const okT = !ty || t.type===ty;
          const okQ = !q || [t.type,t.title,t.notes,(t.checklist||[]).join(' ')].join(' ').toLowerCase().includes(q);
          return okT && okQ;
        });
        const tb = $('#tplTbl tbody', modal); tb.innerHTML='';
        rows.forEach(tpl=>{
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${esc(tpl.type)}</td>
            <td>${esc(tpl.title)}</td>
            <td class="muted">${esc((tpl.notes||'').slice(0,80))}</td>
            <td style="text-align:right">
              <button class="btn small" data-act="insert">Insert</button>
              <button class="btn small" data-act="edit">Edit</button>
              <button class="btn small" data-act="del">Delete</button>
            </td>
          `;
          tr.querySelector('[data-act="insert"]').addEventListener('click', ()=>{
            wf.steps.push({
              id:uid(),
              type:tpl.type, title:tpl.title, description:tpl.notes||'',
              assigneeId:'', dueOffsetDays:0, milestone:false,
              outcomes:[], resources:[], checklist:(tpl.checklist||[]).slice(), _open:true
            });
            persist();
          });
          tr.querySelector('[data-act="edit"]').addEventListener('click', ()=> editTpl(tpl));
          tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
            if(!confirm('Delete template?')) return;
            state.stepTemplates = state.stepTemplates.filter(x=>x.id!==tpl.id); persist(); paint();
          });
          tb.appendChild(tr);
        });
      }
      function editTpl(tpl){
        const panel = document.createElement('div');
        panel.className='card';
        panel.style.margin='10px 0';
        panel.innerHTML = `
          <div class="grid cols-2">
            <div>
              <label>Type</label>
              <select id="et_type">${dedupe(['Schedule Meeting','Pre-Meeting Prep','Conduct Meeting','Post-Meeting Prep','Conduct Phone Call','Send Email','Send Text Message','Request Item','Follow Up','Item Received','Task']).map(t=>`<option ${tpl.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
            </div>
            <div>
              <label>Title</label>
              <input type="text" id="et_title" value="${esc(tpl.title||'')}">
            </div>
          </div>
          <label style="margin-top:8px">Notes (becomes description)</label>
          <textarea id="et_notes" style="min-height:70px">${esc(tpl.notes||'')}</textarea>
          <label style="margin-top:8px">Checklist (one per line)</label>
          <textarea id="et_chk" style="min-height:70px">${esc((tpl.checklist||[]).join('\n'))}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn small" id="et_save">Save</button></div>
        `;
        modal.querySelector('.card').appendChild(panel);
        $('#et_save', panel).addEventListener('click', ()=>{
          tpl.type = $('#et_type', panel).value;
          tpl.title = $('#et_title', panel).value;
          tpl.notes = $('#et_notes', panel).value;
          tpl.checklist = ($('#et_chk', panel).value||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
          persist(); panel.remove(); paint();
        });
      }
      $('#tplQ', modal).addEventListener('input', paint);
      $('#tplType', modal).addEventListener('change', paint);
      modal.addEventListener('click', e=>{ if(e.target.dataset.act==='close' || e.target===modal) modal.remove(); });
      $('[data-act="newTpl"]', modal).addEventListener('click', ()=>{
        const t={ id:uid(), type:'Task', title:'New Template', notes:'', checklist:[] };
        state.stepTemplates.unshift(t); persist(); paint();
      });
      paint();
    }

    function newBlankStep(){
      return { id:uid(), type:'Task', title:'New Step', description:'', assigneeId:'', dueOffsetDays:0, milestone:false, outcomes:[], resources:[], checklist:[], _open:true };
    }

    // local helpers
    function pill(text){
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.display='inline-flex';
      span.style.alignItems='center';
      span.style.gap='6px';
      span.textContent = text;
      return span;
    }
    function miniX(){
      const b = document.createElement('button');
      b.className='btn small ghost';
      b.style.border='none';
      b.style.padding='0 6px';
      b.style.lineHeight='1.4';
      b.textContent='×';
      return b;
    }
    function insertAtCursor(input, text){
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0,start) + text + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + text.length;
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.focus();
    }
    function chip(text){ const c=document.createElement('span'); c.className='pill'; c.textContent=text; return c; }
  }

  // Scheduling
  function renderScheduling(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Scheduling</h2><div class="row"><div class="pill">Pricing: $${state.pricing.schedulerPage} / page / event / team member</div></div></div>
      <div class="card"><div class="muted">Track each scheduling asset here. Add columns as needed.</div></div>
    `;
    renderResourceBacklinks(el, 'scheduler', state.scheduling, s => s.title||s.name||s.event||s.id);
  }

  // Email Campaigns
  function renderEmailCampaigns(el){
    el.innerHTML = `
      <div class="card sticky">
        <h2>Email Campaigns</h2>
        <div class="row"><div class="pill">Pricing: $${state.pricing.emailStep}/step</div></div>
      </div>
      <div class="card">
        <table id="ecTable">
          <thead><tr><th>Campaign</th><th>Steps</th><th>Assets/Notes</th><th>Price</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="row" style="margin-top:10px">
          <button class="btn small" id="addEC">Add Campaign</button>
          <div class="spacer"></div>
          <div>Total: <b id="ecTotal">$0.00</b></div>
        </div>
      </div>
    `;
    function rowPrice(steps){ return (Number(steps||0) * state.pricing.emailStep); }
    function draw(){
      const tb = $('#ecTable tbody', el); tb.innerHTML='';
      (state.emailCampaigns||[]).forEach(c=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(c.name||'')}" data-f="name"></td>
          <td><input type="number" value="${Number(c.steps||0)}" data-f="steps"></td>
          <td><input type="text" value="${esc(c.notes||'')}" data-f="notes"></td>
          <td>${money(rowPrice(c.steps))}</td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            const f = inp.getAttribute('data-f');
            c[f] = inp.type==='number' ? Number(inp.value||0) : inp.value;
            persist(); totals();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete campaign?')) return;
          state.emailCampaigns = state.emailCampaigns.filter(x=>x.id!==c.id); persist(); draw(); totals();
        });
        tb.appendChild(tr);
      });
    }
    function totals(){
      const total = (state.emailCampaigns||[]).reduce((sum,c)=> sum + rowPrice(c.steps), 0);
      $('#ecTotal', el).textContent = money(total);
    }
    $('#addEC', el).addEventListener('click', ()=>{
      state.emailCampaigns.unshift({ id:uid(), name:'', steps:0, notes:'' }); persist(); draw(); totals();
    });
    draw(); totals();

    // backlinks
    renderResourceBacklinks(el, 'emailCampaign', state.emailCampaigns, c => c.name||c.title||c.id);
  }

  // Settings home
  function renderSettingsHome(el){
    el.innerHTML = `
      <div class="grid cols-3">
        <a class="card" href="#/settings/team" data-route><h3>Team</h3><div class="muted">Members & roles with cross-refs.</div></a>
        <a class="card" href="#/settings/segments" data-route><h3>Segments</h3><div class="muted">Client segments for scoping & workflows.</div></a>
        <a class="card" href="#/settings/datapoints" data-route><h3>Datapoints</h3><div class="muted">Standard fields used across tools.</div></a>
        <a class="card" href="#/settings/folder-hierarchy" data-route><h3>Folder Hierarchy</h3><div class="muted">Visual tree + merge-field pills.</div></a>
        <a class="card" href="#/settings/naming-conventions" data-route><h3>Naming Conventions</h3><div class="muted">Household & Folder naming patterns.</div></a>
      </div>
    `;
  }

  // Team (Members + Roles; chip editor)
  function renderTeam(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky"><h2>Team</h2></div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Team Members</h3>
          <table id="tmTable">
            <thead><tr><th>Name</th><th>Role Notes</th><th>Roles</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
          <div class="row" style="margin-top:10px"><button class="btn small" id="addTM">Add Member</button></div>
        </div>
        <div class="card">
          <h3>Roles</h3>
          <table id="rolesTable">
            <thead><tr><th>Role</th><th>Assigned</th><th></th></tr></thead>
            <tbody></tbody>
          </table>
          <div class="row" style="margin-top:10px">
            <input type="text" id="newRole" placeholder="New role…">
            <button class="btn small" id="addRole">Add Role</button>
          </div>
        </div>
      </div>
    `;
    el.appendChild(wrap);

    function drawMembers(){
      const tb = $('#tmTable tbody', wrap); tb.innerHTML='';
      state.teamMembers.forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(m.name||'')}" data-f="name"></td>
          <td><input type="text" value="${esc(m.roleNotes||'')}" data-f="roleNotes"></td>
          <td>
            <div class="chips" data-f="roles"></div>
            <div class="row" style="margin-top:6px">
              <input type="text" class="roleInput" placeholder="Add role…">
              <button class="btn small addRoleBtn">Add</button>
            </div>
          </td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          if (inp.classList.contains('chips')) return;
          inp.addEventListener('input', ()=>{
            m[inp.getAttribute('data-f')] = inp.value; persist(); drawRoles();
          });
        });
        // chips
        const box = tr.querySelector('.chips');
        function drawChips(){
          box.innerHTML='';
          (m.roles||[]).forEach(r=>{
            const chip = pill(r);
            const x = miniX();
            x.addEventListener('click', ()=>{
              m.roles = (m.roles||[]).filter(x=>x!==r); persist(); drawChips(); drawRoles();
            });
            chip.appendChild(x);
            box.appendChild(chip);
          });
        }
        drawChips();
        const input = tr.querySelector('.roleInput');
        const addBtn = tr.querySelector('.addRoleBtn');
        const sug = attachAutosuggest(input, { suggestions: state.roles, onPick: val=>add(val) });
        function add(val){
          const v = (val||input.value||'').trim(); if(!v) return;
          if (!state.roles.includes(v)) state.roles.push(v);
          m.roles = dedupe([...(m.roles||[]), v]);
          input.value=''; sug.updateSuggestions(state.roles);
          persist(); drawChips(); drawRoles();
        }
        addBtn.addEventListener('click', ()=> add());

        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Remove member?')) return;
          state.teamMembers = state.teamMembers.filter(x=>x.id!==m.id); persist(); drawMembers(); drawRoles();
        });

        tb.appendChild(tr);
      });
    }

    function drawRoles(){
      const tb = $('#rolesTable tbody', wrap); tb.innerHTML='';
      state.roles.forEach(role=>{
        const assigned = state.teamMembers.filter(m => (m.roles||[]).includes(role)).map(m=>m.name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${esc(role)}</td>
          <td>${assigned.map(n=>`<span class="pill" style="margin-right:6px">${esc(n)}</span>`).join('') || '<span class="muted">—</span>'}</td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete role? (removes from members too)')) return;
          state.roles = state.roles.filter(r=>r!==role);
          state.teamMembers.forEach(m=> m.roles = (m.roles||[]).filter(r=>r!==role));
          persist(); drawMembers(); drawRoles();
        });
        tb.appendChild(tr);
      });
    }

    $('#addTM', wrap).addEventListener('click', ()=>{
      state.teamMembers.unshift({ id:uid(), name:'', roleNotes:'', roles:[] });
      persist(); drawMembers(); drawRoles();
    });
    $('#addRole', wrap).addEventListener('click', ()=>{
      const v = ($('#newRole', wrap).value||'').trim(); if(!v) return;
      if (!state.roles.includes(v)) state.roles.push(v);
      $('#newRole', wrap).value=''; persist(); drawRoles();
    });

    drawMembers(); drawRoles();

    function pill(text){
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.display='inline-flex';
      span.style.alignItems='center';
      span.style.gap='6px';
      span.textContent = text;
      return span;
    }
    function miniX(){
      const b = document.createElement('button');
      b.className='btn small ghost';
      b.style.border='none';
      b.style.padding='0 6px';
      b.style.lineHeight='1.4';
      b.textContent='×';
      return b;
    }
  }

  // Segments
  function renderSegments(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Segments</h2></div>
      <div class="card">
        <div id="segList"></div>
        <div class="row" style="margin-top:10px">
          <input type="text" id="segNew" placeholder="New segment…">
          <button class="btn small" id="segAdd">Add</button>
        </div>
      </div>
    `;
    function draw(){
      const box = $('#segList', el); box.innerHTML='';
      const t = document.createElement('table');
      t.innerHTML = `<thead><tr><th>Segment</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector('tbody');
      state.segments.forEach((s, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(s)}" data-i="${idx}"></td>
          <td><button class="btn small" data-i="${idx}" data-act="del">Delete</button></td>
        `;
        tr.querySelector('input').addEventListener('input', e=>{ state.segments[idx] = e.target.value; persist(); });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          state.segments.splice(idx,1); persist(); draw();
        });
        tb.appendChild(tr);
      });
      box.appendChild(t);
    }
    $('#segAdd', el).addEventListener('click', ()=>{
      const v = ($('#segNew', el).value||'').trim(); if(!v) return;
      state.segments.push(v); persist(); $('#segNew', el).value=''; draw();
    });
    draw();
  }

  // Datapoints (+ backlinks)
  function renderDatapoints(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Datapoints</h2></div>
      <div class="card">
        <div id="dpList"></div>
        <div class="row" style="margin-top:10px">
          <input type="text" id="dpNew" placeholder="New datapoint…">
          <button class="btn small" id="dpAdd">Add</button>
        </div>
      </div>
    `;
    function draw(){
      const box = $('#dpList', el); box.innerHTML='';
      const t = document.createElement('table');
      t.innerHTML = `<thead><tr><th>Datapoint</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector('tbody');
      state.datapoints.forEach((d, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(d)}" data-i="${idx}"></td>
          <td><button class="btn small" data-i="${idx}" data-act="del">Delete</button></td>
        `;
        tr.querySelector('input').addEventListener('input', e=>{ state.datapoints[idx] = e.target.value; persist(); });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          state.datapoints.splice(idx,1); persist(); draw();
        });
        tb.appendChild(tr);
      });
      box.appendChild(t);
    }
    $('#dpAdd', el).addEventListener('click', ()=>{
      const v = ($('#dpNew', el).value||'').trim(); if(!v) return;
      state.datapoints.push(v); persist(); $('#dpNew', el).value=''; draw();
    });
    draw();

    renderDatapointBacklinks(el);
  }

  // Folder Hierarchy — visual tree + merge-field pills
  function renderFolderHierarchy(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky"><h2>Folder Hierarchy</h2></div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Editor</h3>
          <label>Structure (indent with two spaces). Click a pill to insert at cursor.</label>
          <div class="row" style="flex-wrap:wrap; gap:6px; margin-bottom:8px" id="dpPills"></div>
          <textarea id="fh" spellcheck="false">${esc(state.folderHierarchy)}</textarea>
          <div class="row" style="margin-top:8px">
            <button class="btn small" id="saveFH">Save</button>
            <div class="spacer"></div>
            <label>Sample values JSON</label>
            <input type="text" id="sampleJSON" value="${esc(JSON.stringify(state.folderPreviewSamples))}">
          </div>
        </div>
        <div class="card">
          <h3>Preview</h3>
          <div id="treePreview" style="white-space:normal"></div>
        </div>
      </div>
    `;
    el.appendChild(wrap);

    // Merge-field pills
    const pillsBox = $('#dpPills', wrap);
    const tokens = dedupe(['householdName', ...state.datapoints]).map(t => `{${t}}`);
    tokens.forEach(tok=>{
      const p = pill(tok);
      p.style.cursor='pointer';
      p.addEventListener('click', ()=> insertAtCursor($('#fh', wrap), tok));
      pillsBox.appendChild(p);
    });

    // Save + live preview
    $('#saveFH', wrap).addEventListener('click', ()=>{
      state.folderHierarchy = $('#fh', wrap).value;
      try{
        state.folderPreviewSamples = JSON.parse($('#sampleJSON', wrap).value || '{}');
      }catch(_){}
      persist(); buildPreview();
    });

    $('#fh', wrap).addEventListener('input', buildPreview);
    $('#sampleJSON', wrap).addEventListener('change', buildPreview);
    buildPreview();

    function buildPreview(){
      const raw = $('#fh', wrap).value;
      const replaced = replaceTokens(raw, state.folderPreviewSamples);
      const tree = indentToTree(replaced);
      $('#treePreview', wrap).innerHTML = renderTree(tree);
    }

    function pill(text){
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.display='inline-flex';
      span.style.alignItems='center';
      span.style.gap='6px';
      span.textContent = text;
      return span;
    }
    function insertAtCursor(input, text){
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0,start) + text + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + text.length;
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.focus();
    }
    function replaceTokens(s, dict){
      return String(s||'').replace(/\{([A-Za-z0-9_ ]+)\}/g, (_,k)=> dict[k] ?? `{${k}}`);
    }
    function indentToTree(text){
      const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
      const root = { name:'/', children:[], depth:-1 };
      const stack = [root];
      lines.forEach(line=>{
        const m = line.match(/^(\s*)(.*)$/);
        const depth = Math.floor((m[1]||'').length / 2);
        const name = m[2].trim();
        const node = { name, children:[], depth };
        while (stack.length && stack[stack.length-1].depth >= depth) stack.pop();
        stack[stack.length-1].children.push(node);
        stack.push(node);
      });
      return root;
    }
    function renderTree(node){
      if (!node.children || !node.children.length) return '';
      const ul = document.createElement('ul');
      ul.style.listStyle='none';
      ul.style.paddingLeft='16px';
      node.children.forEach(ch=>{
        const li = document.createElement('li');
        li.style.margin='4px 0';
        li.innerHTML = `<span style="color:#c8d3eb">📁 ${esc(ch.name)}</span>`;
        const inner = renderTree(ch);
        if (inner){
          const div = document.createElement('div');
          div.innerHTML = inner;
          li.appendChild(div.firstChild);
        }
        ul.appendChild(li);
      });
      const wrap = document.createElement('div'); wrap.appendChild(ul);
      return wrap.innerHTML;
    }
  }

  // Naming Conventions — combined page
  function renderNaming(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky"><h2>Naming Conventions</h2></div>

      <div class="card">
        <h3>Household Naming</h3>
        ${threeCols('household')}
      </div>

      <div class="card">
        <h3>Folder Naming</h3>
        ${threeCols('folder')}
      </div>

      <div class="card">
        <h3>Quick Tokens</h3>
        <div class="row" id="ncPills" style="flex-wrap:wrap; gap:6px"></div>
      </div>
    `;
    el.appendChild(wrap);

    // Wire inputs
    wireSet('household');
    wireSet('folder');

    // Token pills insert into focused input
    const ncPills = $('#ncPills', wrap);
    const tokens = dedupe(['householdName', ...state.datapoints]).map(t => `{${t}}`);
    tokens.forEach(tok=>{
      const p = pill(tok); p.style.cursor='pointer';
      p.addEventListener('click', ()=>{
        const target = wrap.querySelector('input.__focused');
        if (target) insertAtCursor(target, tok);
      });
      ncPills.appendChild(p);
    });
    wrap.querySelectorAll('input[type="text"]').forEach(inp=>{
      inp.addEventListener('focus', ()=> inp.classList.add('__focused'));
      inp.addEventListener('blur',  ()=> inp.classList.remove('__focused'));
    });

    function threeCols(key){
      const v = state.naming[key];
      return `
        <div class="grid cols-3">
          <div>
            <label>Individual</label>
            <input type="text" id="${key}_individual" value="${esc(v.individual||'')}" />
          </div>
          <div>
            <label>Joint (Same Last Name)</label>
            <input type="text" id="${key}_jointSame" value="${esc(v.jointSame||'')}" />
          </div>
          <div>
            <label>Joint (Different Last Name)</label>
            <input type="text" id="${key}_jointDifferent" value="${esc(v.jointDifferent||'')}" />
          </div>
        </div>
      `;
    }
    function wireSet(key){
      ['individual','jointSame','jointDifferent'].forEach(k=>{
        const id = `${key}_${k}`;
        const inp = $('#'+id, wrap);
        inp.addEventListener('input', ()=>{
          state.naming[key][k] = inp.value;
          persist();
        });
      });
    }

    function pill(text){
      const span = document.createElement('span');
      span.className = 'pill';
      span.style.display='inline-flex';
      span.style.alignItems='center';
      span.style.gap='6px';
      span.textContent = text;
      return span;
    }
    function insertAtCursor(input, text){
      const start = input.selectionStart ?? input.value.length;
      const end   = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0,start) + text + input.value.slice(end);
      input.selectionStart = input.selectionEnd = start + text.length;
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.focus();
    }
  }

  // ---------- Backlinks helpers ----------
  function renderResourceBacklinks(el, kind, rows, labelGetter){
    const card = document.createElement('div');
    card.className='card';
    card.innerHTML = `<h3>Linked From Workflows</h3><div id="bk_${kind}"></div>`;
    el.appendChild(card);

    const box = card.querySelector(`#bk_${kind}`);
    const table = document.createElement('table');
    table.innerHTML = `<thead><tr><th>${esc(kindLabel(kind))}</th><th>Links</th><th>Details</th></tr></thead><tbody></tbody>`;
    const tb = table.querySelector('tbody');

    rows.forEach(item=>{
      const id = item.id;
      const refs = state._refs.resources[`${kind}:${id}`] || [];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(labelGetter(item))}</td>
        <td>${refs.length}</td>
        <td>${refs.length ? refs.map(r=>`${esc(r.wfName)} » ${esc(r.stepTitle)}`).join('<br>') : '<span class="muted">—</span>'}</td>
      `;
      tb.appendChild(tr);
    });
    box.appendChild(table);
  }

  function renderDatapointBacklinks(el){
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `<h3>Datapoint References</h3>`;
    const t = document.createElement('table');
    t.innerHTML = `<thead><tr><th>Datapoint</th><th>Used In</th></tr></thead><tbody></tbody>`;
    const tb = t.querySelector('tbody');

    const tokens = dedupe(['householdName', ...state.datapoints]);
    tokens.forEach(tok=>{
      const refs = state._refs.datapoints[tok] || [];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>{${esc(tok)}}</td>
        <td>${refs.length ? refs.map(r=>`${esc(r.wfName)} » Step ${esc(findById(findById(state.workflows,r.wfId)?.steps||[], r.stepId)?.title || '')} (${esc(r.field)})`).join('<br>') : '<span class="muted">—</span>'}</td>
      `;
      tb.appendChild(tr);
    });
    card.appendChild(t);
    el.appendChild(card);
  }

})();
