/* SPA scaffold + Apps → Functions & Tech Comparison */
(function(){
  // --------- State & persistence ----------
  const store = {
    get(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch(_){ return def; } },
    set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
    del(k){ localStorage.removeItem(k); }
  };

  const DEFAULT_FUNCTIONS = [
    "Automation","Billing / Invoicing","Bookkeeping","Calendar","CRM","Custodian / TAMP","Data Aggregation",
    "Data Gathering","eSignature","Email","Email Marketing","File Sharing / Document Storage","Financial Planning",
    "Lead Generation","Mind Mapping","Notes Storage","Office Suite","Other Financial","Password Manager",
    "Phone / Text","Pipeline Management","Project Management","Risk Tolerance","Scheduler","Task Management",
    "Tax Planning","Tax Prep","Time Tracking","Transcription","Video Conferencing","Video Recording","Website","Other"
  ];

  let state = {
    apps: store.get('apps', [
      { id: uid(), name:'Calendly', category:'Scheduler', notes:'', needsFilter:true },
      { id: uid(), name:'ScheduleOnce', category:'Scheduler', notes:'', needsFilter:true },
      { id: uid(), name:'Wealthbox', category:'CRM', notes:'', needsFilter:false },
    ]),
    // NEW: functions catalog
    functions: store.get('functions', DEFAULT_FUNCTIONS.map(n=>({ id:uid(), name:n, systemIds:[] }))),

    // Per-function analyses (criteria/weights/ratings)
    // analyses[functionId] = { criteria:[{id,name,weight}], ratings: { systemId: { [criterionId]: rating0to5 } } }
    analyses: store.get('analyses', {}),

    zaps: store.get('zaps', []),
    forms: store.get('forms', []),
    workflows: store.get('workflows', []),
    scheduling: store.get('scheduling', []),
    emailCampaigns: store.get('emailCampaigns', []),

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
    store.set('functions', state.functions);
    store.set('analyses', state.analyses);

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
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // --------- Routing ----------
  const routes = {
    '/apps': renderAppsHub,
    '/apps/functions': renderFunctions,
    '/apps/tech': renderTechComparison,

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
    const h = (location.hash || '#/apps/functions').slice(1);
    return h || '/apps/functions';
  }

  function navigate(){
    const path = currentPath();
    const view = $('#view');
    const fn = routes[path] || renderNotFound;

    $all('[data-route]').forEach(a=>{
      if (a.getAttribute('href') === '#'+path) a.classList.add('active');
      else a.classList.remove('active');
    });

    $('#crumbs') && ($('#crumbs').textContent = path.split('/').filter(Boolean).join(' / '));

    view.innerHTML = '';
    fn(view, path);
  }

  window.addEventListener('hashchange', navigate);
  window.addEventListener('load', navigate);

  // --------- Topbar actions ----------
  $('#exportAll') && $('#exportAll').addEventListener('click', ()=>{
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'operations-library.json';
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  });

  $('#importAll') && $('#importAll').addEventListener('click', ()=>{
    const inp = document.createElement('input'); inp.type='file'; inp.accept='application/json';
    inp.onchange = e=>{
      const f = e.target.files[0]; if(!f) return;
      const fr = new FileReader();
      fr.onload = ()=>{
        try{
          const obj = JSON.parse(fr.result);
          Object.assign(state, obj);
          persist(); navigate();
        }catch(err){ alert('Invalid JSON'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  });

  $('#resetAll') && $('#resetAll').addEventListener('click', ()=>{
    if(!confirm('Reset all data?')) return;
    localStorage.clear(); location.reload();
  });

  // --------- Renderers ----------
  function renderNotFound(el){
    el.innerHTML = `<div class="card"><div class="muted">No route for ${currentPath()}</div></div>`;
  }

  // Apps hub with two tiles
  function renderAppsHub(el){
    el.innerHTML = `
      <div class="grid cols-2">
        <a class="card" href="#/apps/functions"><h3>Functions</h3><div class="muted">Assign apps to business functions; launch comparisons.</div></a>
        <a class="card" href="#/apps/tech"><h3>Tech Comparison</h3><div class="muted">Weighted scoring by criteria for chosen systems.</div></a>
      </div>
      <div class="card">
        <div class="muted">You can still manage your App list elsewhere; this section references it.</div>
      </div>
    `;
  }

  // Apps → Functions
  function renderFunctions(el){
    const allApps = state.apps.slice().sort((a,b)=>a.name.localeCompare(b.name));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <div class="row" style="align-items:center">
          <div><b>Functions</b></div>
          <div class="spacer"></div>
          <button class="btn small" id="addFunc">Add Function</button>
        </div>
      </div>

      <div class="card">
        <div id="fnTable"></div>
      </div>
    `;
    el.appendChild(wrap);

    function renderTable(){
      const box = $('#fnTable', wrap);
      const t = document.createElement('table');
      t.innerHTML = `
        <thead><tr>
          <th>Function</th>
          <th>Systems (select one or more)</th>
          <th></th>
        </tr></thead>
        <tbody></tbody>
      `;
      const tb = t.querySelector('tbody');

      state.functions.forEach(f=>{
        const tr = document.createElement('tr');
        const selected = new Set(f.systemIds||[]);
        tr.innerHTML = `
          <td style="min-width:240px"><input type="text" value="${esc(f.name)}" data-f="name"></td>
          <td>
            <div class="row" style="flex-wrap:wrap; gap:6px">
              ${allApps.map(a=>{
                const id = `ck_${f.id}_${a.id}`;
                return `
                  <label class="pill" for="${id}" style="user-select:none; cursor:pointer">
                    <input type="checkbox" id="${id}" data-app="${a.id}" ${selected.has(a.id)?'checked':''} style="margin-right:6px">
                    ${esc(a.name)}
                  </label>
                `;
              }).join('')}
            </div>
          </td>
          <td style="white-space:nowrap">
            <a class="btn small" href="#/apps/tech?fn=${encodeURIComponent(f.id)}">Run analysis</a>
            <button class="btn small" data-act="del">Delete</button>
          </td>
        `;
        // name edit
        tr.querySelector('[data-f="name"]').addEventListener('input', e=>{
          f.name = e.target.value; persist();
        });
        // selection changes
        tr.querySelectorAll('input[type="checkbox"][data-app]').forEach(ck=>{
          ck.addEventListener('change', ()=>{
            const appId = ck.getAttribute('data-app');
            const set = new Set(f.systemIds||[]);
            if (ck.checked) set.add(appId); else set.delete(appId);
            f.systemIds = Array.from(set);
            persist();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if (!confirm('Delete function?')) return;
          state.functions = state.functions.filter(x=>x.id!==f.id);
          delete state.analyses[f.id];
          persist(); renderTable();
        });
        tb.appendChild(tr);
      });

      box.innerHTML = ''; box.appendChild(t);
    }

    $('#addFunc', wrap).addEventListener('click', ()=>{
      state.functions.unshift({ id:uid(), name:'', systemIds:[] }); persist(); renderTable();
    });

    renderTable();
  }

  // Apps → Tech Comparison
  function renderTechComparison(el){
    // parse ?fn=functionId
    const q = new URLSearchParams((location.hash.split('?')[1]||''));
    const initialFnId = q.get('fn') || (state.functions[0]?.id || null);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <div class="row" style="align-items:center">
          <div><b>Tech Comparison</b></div>
          <div class="spacer"></div>
          <select id="fnPick"></select>
          <button class="btn small" id="addCriterion">Add Criterion</button>
        </div>
      </div>

      <div class="card">
        <div class="row" style="margin-bottom:8px">
          <div class="pill">Weights must sum to 100%</div>
          <div class="spacer"></div>
          <button class="btn" id="normalize">Normalize Weights</button>
        </div>
        <div id="matrix"></div>
        <div class="row" style="margin-top:8px">
          <div class="spacer"></div>
          <button class="btn primary" id="saveAnalysis">Save Analysis</button>
        </div>
      </div>
    `;
    el.appendChild(wrap);

    // function picker
    const fnPick = $('#fnPick', wrap);
    state.functions.forEach(f=>{
      const opt = new Option(f.name, f.id);
      fnPick.appendChild(opt);
    });
    if (initialFnId && state.functions.some(f=>f.id===initialFnId)) fnPick.value = initialFnId;

    function getCtx(){
      const fnId = fnPick.value;
      const fn = state.functions.find(x=>x.id===fnId) || state.functions[0];
      const sysIds = (fn?.systemIds||[]).filter(id=> state.apps.some(a=>a.id===id));
      const systems = sysIds.map(id => state.apps.find(a=>a.id===id));
      state.analyses[fn.id] ||= { criteria: [], ratings:{} };
      const model = state.analyses[fn.id];
      // ensure ratings containers exist
      systems.forEach(s=>{
        model.ratings[s.id] ||= {};
      });
      // prune ratings of removed systems
      Object.keys(model.ratings).forEach(sid=>{
        if (!systems.some(s=>s.id===sid)) delete model.ratings[sid];
      });
      return { fn, model, systems };
    }

    function ensureAtLeastRows(model){
      if (!model.criteria.length){
        // seed three rows
        model.criteria = [
          { id:uid(), name:'Core Fit', weight:40 },
          { id:uid(), name:'Integration', weight:30 },
          { id:uid(), name:'Cost/Value', weight:30 },
        ];
      }
    }

    function draw(){
      const { fn, model, systems } = getCtx();
      ensureAtLeastRows(model);

      // compute weight sum
      const wsum = model.criteria.reduce((n,c)=>n + Number(c.weight||0), 0);

      const box = $('#matrix', wrap); box.innerHTML = '';
      if (!systems.length){
        box.innerHTML = `<div class="muted">No systems selected for "${esc(fn.name)}". Go to <a href="#/apps/functions">Functions</a> and pick systems.</div>`;
        return;
      }

      const table = document.createElement('table');
      table.innerHTML = `
        <thead>
          <tr>
            <th style="min-width:220px">Criterion</th>
            <th style="width:120px">Weight %</th>
            ${systems.map(s=>`<th title="${esc(s.name)}">${esc(s.name)}</th>`).join('')}
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
        <tfoot>
          <tr>
            <th>Totals</th>
            <th>${wsum.toFixed(0)}%</th>
            ${systems.map(s=>{
              const total = model.criteria.reduce((sum,c)=>{
                const r = clamp0to5(model.ratings[s.id]?.[c.id]);
                const w = Number(c.weight||0)/100;
                return sum + (isFinite(r)? r*w : 0);
              }, 0);
              return `<th><div><b>${total.toFixed(2)}</b>/5</div></th>`;
            }).join('')}
            <th></th>
          </tr>
        </tfoot>
      `;
      const tb = table.querySelector('tbody');

      model.criteria.forEach((c, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" value="${esc(c.name)}" style="min-width:200px" data-f="name"></td>
          <td><input type="number" min="0" max="100" step="1" value="${Number(c.weight||0)}" data-f="weight"></td>
          ${systems.map(s=>{
            const val = clamp0to5(model.ratings[s.id]?.[c.id]);
            return `
              <td>
                <select data-sys="${s.id}" data-crit="${c.id}">
                  ${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${val===n?'selected':''}>${n}</option>`).join('')}
                </select>
              </td>
            `;
          }).join('')}
          <td><button class="btn small" data-act="del">Delete</button></td>
        `;

        tr.querySelector('[data-f="name"]').addEventListener('input', e=>{
          c.name = e.target.value; persist(); // no redraw needed
        });
        tr.querySelector('[data-f="weight"]').addEventListener('input', e=>{
          c.weight = Number(e.target.value||0); persist(); draw();
        });
        tr.querySelectorAll('select[data-sys]').forEach(sel=>{
          sel.addEventListener('change', ()=>{
            const sid = sel.getAttribute('data-sys');
            const cid = sel.getAttribute('data-crit');
            model.ratings[sid] ||= {};
            model.ratings[sid][cid] = Number(sel.value);
            persist(); draw();
          });
        });
        tr.querySelector('[data-act="del"]').addEventListener('click', ()=>{
          if (!confirm('Remove criterion?')) return;
          // remove ratings for this criterion
          Object.values(model.ratings).forEach(r => { delete r[c.id]; });
          model.criteria.splice(idx,1);
          persist(); draw();
        });

        tb.appendChild(tr);
      });

      box.appendChild(table);

      // ranking block
      const ranking = systems.map(s=>{
        const total = model.criteria.reduce((sum,c)=>{
          const r = clamp0to5(model.ratings[s.id]?.[c.id]);
          const w = Number(c.weight||0)/100;
          return sum + (isFinite(r)? r*w : 0);
        }, 0);
        return { id:s.id, name:s.name, total };
      }).sort((a,b)=>b.total - a.total);

      const rankDiv = document.createElement('div');
      rankDiv.style.marginTop = '10px';
      rankDiv.innerHTML = `
        <div class="row">
          <div class="pill">Ranking</div>
        </div>
        <table>
          <thead><tr><th>#</th><th>System</th><th>Score / 5</th></tr></thead>
          <tbody>
            ${ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.total.toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>
      `;
      box.appendChild(rankDiv);
    }

    fnPick.addEventListener('change', draw);
    $('#addCriterion', wrap).addEventListener('click', ()=>{
      const { fn, model } = getCtx();
      model.criteria.push({ id:uid(), name:'', weight:0 });
      persist(); draw();
    });
    $('#normalize', wrap).addEventListener('click', ()=>{
      const { model } = getCtx();
      const count = model.criteria.length || 1;
      const even = Math.floor(100 / count);
      const remainder = 100 - even*count;
      model.criteria.forEach((c,i)=> c.weight = even + (i<remainder?1:0));
      persist(); draw();
    });
    $('#saveAnalysis', wrap).addEventListener('click', ()=>{ persist(); alert('Saved.'); });

    draw();
  }

  function clamp0to5(v){
    const n = Number(v);
    return (Number.isFinite(n) ? Math.max(0, Math.min(5, Math.round(n))) : 0);
  }

  // ----- Resources -----
  function renderResourcesHome(el){
    el.innerHTML = `
      <div class="grid cols-3">
        <div class="card"><h3>Zaps</h3><div class="muted">Scope automation steps at $80/step; mark “Needs Filter”.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/zaps">Open</a></div></div>
        <div class="card"><h3>Forms</h3><div class="muted">Form builds by questions/conditions/PDFs/emails/signatures/add-ons.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/forms">Open</a></div></div>
        <div class="card"><h3>Workflows</h3><div class="muted">Visual mapping (placeholder here).</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/workflows">Open</a></div></div>
        <div class="card"><h3>Scheduling</h3><div class="muted">$125 / page / event / team member.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/scheduling">Open</a></div></div>
        <div class="card"><h3>Email Campaigns</h3><div class="muted">$80 per step; scope sequences and assets.</div><div class="row" style="margin-top:8px"><a class="btn" href="#/resources/email-campaigns">Open</a></div></div>
      </div>
    `;
  }

  function renderZaps(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <div class="row">
          <b>Zaps</b>
          <div class="spacer"></div>
          <button class="btn small" id="addZap">Add Zap Step</button>
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
          <div>Total: <b id="zapTotal">$0.00</b></div>
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
      const total = state.zaps.length * priceRow();
      $('#zapTotal', wrap).textContent = money(total);
    }

    $('#addZap', wrap).addEventListener('click', ()=>{
      state.zaps.unshift({ id:uid(), title:'', app:'', stepType:'Action', event:'', needsFilter:false });
      persist(); renderTable(); renderTotals();
    });

    renderTable(); renderTotals();
  }

  function renderForms(el){
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card sticky">
        <div class="row">
          <b>Forms</b>
          <div class="spacer"></div>
          <button class="btn small" id="addForm">Add Form Item</button>
          <div class="pill">Questions / Conditions / PDFs / Emails / Signatures / Add-ons</div>
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
    `;
    el.appendChild(wrap);

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

    renderTable();
  }

  function renderWorkflows(el){
    el.innerHTML = `
      <div class="card sticky">
        <b>Workflows</b>
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
          <div class="muted">Placeholder for your visualizer mount.</div>
        </div>
      </div>
    `;
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

  function renderScheduling(el){
    el.innerHTML = `
      <div class="card sticky">
        <div class="row">
          <b>Scheduling</b>
          <div class="spacer"></div>
          <div class="pill">$${state.pricing.schedulerPage} / page / event / team member</div>
        </div>
      </div>
      <div class="card">
        <div class="muted">Track each scheduling asset here (pages, events, team members).</div>
      </div>
    `;
  }

  function renderEmailCampaigns(el){
    el.innerHTML = `
      <div class="card sticky">
        <div class="row">
          <b>Email Campaigns</b>
          <div class="spacer"></div>
          <div class="pill">$${state.pricing.emailStep}/step</div>
        </div>
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

  // ----- Settings -----
  function renderSettingsHome(el){
    el.innerHTML = `
      <div class="grid cols-3">
        <a class="card" href="#/settings/team"><h3>Team</h3><div class="muted">Manage team members & roles.</div></a>
        <a class="card" href="#/settings/segments"><h3>Segments</h3><div class="muted">Client segments.</div></a>
        <a class="card" href="#/settings/datapoints"><h3>Datapoints</h3><div class="muted">Standard fields across tools.</div></a>
        <a class="card" href="#/settings/folder-hierarchy"><h3>Folder Hierarchy</h3><div class="muted">Client file structure.</div></a>
        <a class="card" href="#/settings/household-names"><h3>Household Naming</h3><div class="muted">Name format.</div></a>
        <a class="card" href="#/settings/folder-names"><h3>Folder Naming</h3><div class="muted">Default names.</div></a>
      </div>
    `;
  }

  function renderTeam(el){
    el.innerHTML = `
      <div class="card sticky"><b>Team</b></div>
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
          inp.addEventListener('input', ()=>{ m[inp.getAttribute('data-f')] = inp.value; persist(); });
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
      <div class="card sticky"><b>Segments</b></div>
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
      <div class="card sticky"><b>Datapoints</b></div>
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
      <div class="card sticky"><b>Folder Hierarchy</b></div>
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
      <div class="card sticky"><b>Household Naming Conventions</b></div>
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
      <div class="card sticky"><b>Folder Naming Conventions</b></div>
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

})();
