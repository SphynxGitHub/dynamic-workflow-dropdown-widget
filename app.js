/* SPA scaffold with hash routing, persistence, and section stubs.
   You can paste your existing “Live Prefill” module into Resources → Forms later. */

(function(){
  // --------- State & persistence ----------
  const store = {
    get(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch(_){ return def; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
    del(k){ localStorage.removeItem(k); }
  };

  // Core datasets
  let state = {
    apps: store.get('apps', [
      { id: uid(), name:'Calendly', category:'Scheduler', notes:'add filter step for event type', needsFilter:true },
      { id: uid(), name:'ScheduleOnce', category:'Scheduler', notes:'needs filter for event', needsFilter:true },
      { id: uid(), name:'Wealthbox', category:'CRM', notes:'', needsFilter:false },
    ]),
    zaps: store.get('zaps', [
      // minimal example row structure (for scoping): { id, title, app, stepType:'Trigger|Action', event, needsFilter, price }
    ]),
    forms: store.get('forms', []), // you’ll attach your Live Prefill configs here later
    workflows: store.get('workflows', []),
    scheduling: store.get('scheduling', []),
    emailCampaigns: store.get('emailCampaigns', []),

    // Settings
    team: store.get('team', [{ id:uid(), name:'Arielle', role:'Managing Partner' }]),
    segments: store.get('segments', ['Prospects','Paid AUM','Hourly','Pro Bono']),
    datapoints: store.get('datapoints', ['First Name','Last Name','Email','Domain','Household']),
    folderHierarchy: store.get('folderHierarchy', 'Clients/\n  {Household Name}/\n    Meetings/\n    Documents/'),
    householdNames: store.get('householdNames', '{Last}, {First} & {PartnerLast}, {PartnerFirst}'),
    folderNames: store.get('folderNames', '{YYYY}-{MM}-{DD} {Meeting Type}'),

    pricing: { zapStep:80, emailStep:80, schedulerPage:125, otherHourly:300 }
  };
  persist();

  function persist(){
    store.set('apps', state.apps);
    store.set('zaps', state.zaps);
    store.set('forms', state.forms);
    store.set('workflows', state.workflows);
    store.set('scheduling', state.scheduling);
    store.set('emailCampaigns', state.emailCampaigns);

    store.set('team', state.team);
    store.set('segments', state.segments);
    store.set('datapoints', state.datapoints);
    store.set('folderHierarchy', state.folderHierarchy);
    store.set('householdNames', state.householdNames);
    store.set('folderNames', state.folderNames);
  }

  // --------- Utilities ----------
  function $(sel, el=document){ return el.querySelector(sel); }
  function $all(sel, el=document){ return Array.from(el.querySelectorAll(sel)); }
  function uid(){ return 'id_' + Math.random().toString(36).slice(2,9); }
  function money(n){ return `$${Number(n||0).toFixed(2)}`; }

  // --------- Routing ----------
  const routes = {
    '/apps': renderApps,
    '/resources': renderResourcesHome,
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
    '/settings/household-names': renderHouseholdNames,
    '/settings/folder-names': renderFolderNames,
  };

  function currentPath(){
    const h = (location.hash || '#/apps').slice(1);
    return h || '/apps';
  }

  function navigate(){
    const path = currentPath();
    const view = $('#view');
    const fn = routes[path] || renderNotFound;
    // activate nav
    $all('[data-route]').forEach(a=>{
      if (a.getAttribute('href') === '#'+path) a.classList.add('active');
      else a.classList.remove('active');
    });
    // crumbs
    $('#crumbs').textContent = path.split('/').filter(Boolean).join(' / ');
    // render
    view.innerHTML = '';
    fn(view, path);
  }

  window.addEventListener('hashchange', navigate);
  window.addEventListener('load', navigate);

  // --------- Topbar actions (export/import/reset) ----------
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
          // very light validation
          Object.assign(state, obj);
          persist(); navigate();
        }catch(err){ alert('Invalid JSON'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  });

  $('#resetAll').addEventListener('click', ()=>{
    if(!confirm('Reset all data?')) return;
    localStorage.clear(); location.reload();
  });

  // --------- Renderers ----------
  function renderNotFound(el){
    el.innerHTML = `<div class="card"><h2>Not Found</h2><div class="muted">No route for ${currentPath()}</div></div>`;
  }

  // Apps page
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
            <option>Scheduler</option>
            <option>CRM</option>
            <option>Automation</option>
            <option>Forms</option>
            <option>Email</option>
            <option>Other</option>
          </select>
        </div>
        <div id="appsTable"></div>
        <div class="notice">Tip: toggle “Needs Filter” for Calendly/ScheduleOnce when required.</div>
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
        const okQ = !q || [a.name,a.category,a.notes].join(' ').toLowerCase().includes(q);
        return okCat && okQ;
      });

      const t = document.createElement('table');
      t.innerHTML = `
        <thead><tr>
          <th>Name</th><th>Category</th><th>Notes</th><th>Needs Filter</th><th></th>
        </tr></thead>
        <tbody></tbody>
      `;
      const tb = t.querySelector('tbody');
      rows.forEach(a=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(a.name)}" data-f="name"></td>
          <td>
            <select data-f="category">
              ${['Scheduler','CRM','Automation','Forms','Email','Other'].map(v=>`<option ${a.category===v?'selected':''}>${v}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" value="${esc(a.notes||'')}" data-f="notes"></td>
          <td><input type="checkbox" ${a.needsFilter?'checked':''} data-f="needsFilter"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            const f = inp.getAttribute('data-f');
            if (inp.type === 'checkbox') a[f] = inp.checked;
            else a[f] = inp.value;
            persist();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete app?')) return;
          state.apps = state.apps.filter(x=>x.id!==a.id); persist(); renderTable();
        });
        tb.appendChild(tr);
      });
      $table.innerHTML = '';
      $table.appendChild(t);
    }

    $('#addApp', wrap).addEventListener('click', ()=>{
      state.apps.unshift({ id:uid(), name:'', category:'Other', notes:'', needsFilter:false });
      persist(); renderTable();
    });
    $search.addEventListener('input', renderTable);
    $cat.addEventListener('change', renderTable);
    renderTable();
  }

  // Resources home
  function renderResourcesHome(el){
    el.innerHTML = `
      <div class="grid cols-3">
        <div class="card"><h3>Zaps</h3><div class="muted">Scope automation steps at $80/step; mark “Needs Filter”.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/zaps">Open</a></div></div>
        <div class="card"><h3>Forms</h3><div class="muted">Form builds by questions/conditions/PDFs/emails/signatures/add-ons.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/forms">Open</a></div></div>
        <div class="card"><h3>Workflows</h3><div class="muted">Visual mapping (like your Workflow Visualizer).</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/workflows">Open</a></div></div>
        <div class="card"><h3>Scheduling</h3><div class="muted">Priced at $125 / page / event / team member.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/scheduling">Open</a></div></div>
        <div class="card"><h3>Email Campaigns</h3><div class="muted">$80 per step; scope sequences and assets.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/email-campaigns">Open</a></div></div>
      </div>
    `;
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
          <td>
            <select data-f="stepType">
              ${['Trigger','Action'].map(t=>`<option ${z.stepType===t?'selected':''}>${t}</option>`).join('')}
            </select>
          </td>
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
      // (Hook for your Do Now / Responsible filtering if you add columns)
      const total = state.zaps.length * priceRow();
      $('#zapTotal', wrap).textContent = money(total);
    }

    $('#addZap', wrap).addEventListener('click', ()=>{
      state.zaps.unshift({ id:uid(), title:'', app:'', stepType:'Action', event:'', needsFilter:false });
      persist(); renderTable(); renderTotals();
    });

    renderTable(); renderTotals();
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
          <div class="pill">Pricing: Questions/Conditions/PDFs/Emails/Signatures/Add-ons (configurable)</div>
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

    // collapse behavior
    const col = $('#livePrefill', wrap);
    $('.c-head', col).addEventListener('click', ()=> col.classList.toggle('open'));

    // forms table
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

    // Hook to mount your existing live prefill widget UI
    $('#initPrefill', wrap).addEventListener('click', ()=>{
      const mount = $('#prefillMount', wrap);
      mount.innerHTML = '';
      const info = document.createElement('div');
      info.className='muted';
      info.textContent = 'Mount point ready. Paste/initialize your existing Prefill module here.';
      mount.appendChild(info);
      // e.g. window.initLivePrefill(mount) if you expose it.
    });

    renderTable();
  }

  // Workflows
  function renderWorkflows(el){
    el.innerHTML = `
      <div class="card sticky">
        <h2>Workflows</h2>
        <div class="row"><div class="muted">Sketch your flow items; we can wire your existing visualizer next.</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Steps</h3>
          <div id="wfSteps"></div>
          <div class="row" style="margin-top:8px">
            <button class="btn small" id="addStep">Add Step</button>
          </div>
        </div>
        <div class="card">
          <h3>Preview</h3>
          <div class="muted">Placeholder for canvas visual. We’ll plug the visualizer here.</div>
        </div>
      </div>
    `;
    // Simple steps scratchpad (persist as workflows[])
    const wfKey = 'workflows';
    function renderSteps(){
      const box = $('#wfSteps', el); box.innerHTML = '';
      const items = state.workflows;
      const t = document.createElement('table');
      t.innerHTML = `<thead><tr><th>Stage</th><th>Step Name</th><th>Notes</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector('tbody');
      items.forEach(w=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(w.stage||'')}" data-f="stage"></td>
          <td><input type="text" value="${esc(w.step||'')}" data-f="step"></td>
          <td><input type="text" value="${esc(w.notes||'')}" data-f="notes"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            const f = inp.getAttribute('data-f');
            w[f] = inp.value; persist();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete step?')) return;
          state.workflows = state.workflows.filter(x=>x.id!==w.id); persist(); renderSteps();
        });
        tb.appendChild(tr);
      });
      box.appendChild(t);
    }
    $('#addStep', el).addEventListener('click', ()=>{
      state.workflows.unshift({ id:uid(), stage:'', step:'', notes:'' }); persist(); renderSteps();
    });
    renderSteps();
  }

  // Scheduling
  function renderScheduling(el){
    el.innerHTML = `
      <div class="card sticky">
        <h2>Scheduling</h2>
        <div class="row">
          <div class="pill">Pricing: $${state.pricing.schedulerPage} / page / event / team member</div>
        </div>
      </div>
      <div class="card">
        <div class="muted">Track each scheduling asset here (pages, events, team members). Add columns you need.</div>
      </div>
    `;
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
    function renderTable(){
      const tb = $('#ecTable tbody', el); tb.innerHTML = '';
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
            persist(); renderTotals();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Delete campaign?')) return;
          state.emailCampaigns = state.emailCampaigns.filter(x=>x.id!==c.id); persist(); renderTable(); renderTotals();
        });
        tb.appendChild(tr);
      });
    }
    function renderTotals(){
      const total = (state.emailCampaigns||[]).reduce((sum,c)=> sum + rowPrice(c.steps), 0);
      $('#ecTotal', el).textContent = money(total);
    }
    $('#addEC', el).addEventListener('click', ()=>{
      state.emailCampaigns.unshift({ id:uid(), name:'', steps:0, notes:'' }); persist(); renderTable(); renderTotals();
    });
    renderTable(); renderTotals();
  }

  // Settings root
  function renderSettingsHome(el){
    el.innerHTML = `
      <div class="grid cols-3">
        <a class="card" href="#/settings/team"><h3>Team</h3><div class="muted">Manage team members & roles.</div></a>
        <a class="card" href="#/settings/segments"><h3>Segments</h3><div class="muted">Client segments for scoping & workflows.</div></a>
        <a class="card" href="#/settings/datapoints"><h3>Datapoints</h3><div class="muted">Standard fields used across tools.</div></a>
        <a class="card" href="#/settings/folder-hierarchy"><h3>Folder Hierarchy</h3><div class="muted">Base structure for client files.</div></a>
        <a class="card" href="#/settings/household-names"><h3>Household Naming Conventions</h3><div class="muted">How households are named.</div></a>
        <a class="card" href="#/settings/folder-names"><h3>Folder Naming Conventions</h3><div class="muted">Default folder/file names.</div></a>
      </div>
    `;
  }

  function renderTeam(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Team</h2></div>
      <div class="card">
        <table id="teamTable">
          <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="row" style="margin-top:10px"><button class="btn small" id="addTeam">Add Member</button></div>
      </div>
    `;
    function draw(){
      const tb = $('#teamTable tbody', el); tb.innerHTML = '';
      state.team.forEach(m=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(m.name||'')}" data-f="name"></td>
          <td><input type="text" value="${esc(m.role||'')}" data-f="role"></td>
          <td><button class="btn small" data-act="del">Delete</button></td>`;
        tr.querySelectorAll('[data-f]').forEach(inp=>{
          inp.addEventListener('input', ()=>{
            m[inp.getAttribute('data-f')] = inp.value; persist();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if(!confirm('Remove member?')) return;
          state.team = state.team.filter(x=>x.id!==m.id); persist(); draw();
        });
        tb.appendChild(tr);
      });
    }
    $('#addTeam', el).addEventListener('click', ()=>{
      state.team.unshift({ id:uid(), name:'', role:'' }); persist(); draw();
    });
    draw();
  }

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
      const box = $('#segList', el); box.innerHTML = '';
      const t = document.createElement('table');
      t.innerHTML = `<thead><tr><th>Segment</th><th></th></tr></thead><tbody></tbody>`;
      const tb = t.querySelector('tbody');
      state.segments.forEach((s, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(s)}" data-i="${idx}"></td>
          <td><button class="btn small" data-i="${idx}" data-act="del">Delete</button></td>
        `;
        tr.querySelector('input').addEventListener('input', (e)=>{
          state.segments[idx] = e.target.value; persist();
        });
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
        tr.querySelector('input').addEventListener('input', e=>{
          state.datapoints[idx] = e.target.value; persist();
        });
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
  }

  function renderFolderHierarchy(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Folder Hierarchy</h2></div>
      <div class="card">
        <label>Structure (markdown-style)</label>
        <textarea id="fh">${esc(state.folderHierarchy)}</textarea>
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="saveFH">Save</button>
        </div>
      </div>
    `;
    $('#saveFH', el).addEventListener('click', ()=>{
      state.folderHierarchy = $('#fh', el).value; persist();
    });
  }

  function renderHouseholdNames(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Household Naming Conventions</h2></div>
      <div class="card">
        <label>Pattern</label>
        <input type="text" id="hn" value="${esc(state.householdNames)}" />
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="saveHN">Save</button>
        </div>
      </div>
    `;
    $('#saveHN', el).addEventListener('click', ()=>{
      state.householdNames = $('#hn', el).value; persist();
    });
  }

  function renderFolderNames(el){
    el.innerHTML = `
      <div class="card sticky"><h2>Folder Naming Conventions</h2></div>
      <div class="card">
        <label>Pattern</label>
        <input type="text" id="fn" value="${esc(state.folderNames)}" />
        <div class="row" style="margin-top:8px">
          <button class="btn small" id="saveFN">Save</button>
        </div>
      </div>
    `;
    $('#saveFN', el).addEventListener('click', ()=>{
      state.folderNames = $('#fn', el).value; persist();
    });
  }

  // --------- helpers ----------
  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
