/***********************
 * 0) Safe Jotform shim
 ***********************/
(function(){
  if (window.JFCustomWidget) return;
  const mem = { value: localStorage.getItem('wf_widget_value') || '' };
  window.JFCustomWidget = {
    subscribe(ev, cb){
      if (ev === 'ready') { setTimeout(()=>cb({ value: mem.value }), 0); }
      else if (ev === 'submit') { /* noop in standalone */ }
    },
    sendData({ value }){
      try { localStorage.setItem('wf_widget_value', value); } catch(e){}
    },
    sendSubmit(){ /* noop */ },
    getWidgetSetting(){ return null; },
    getWidgetSettings(){ return {}; },
    requestFrameResize(){},
    replaceWidget(){},
  };
})();

/***********************
 * 1) State
 ***********************/
const ACTIONS = { CLOSE:'close', RESTART_WORKFLOW:'restart_workflow', RESTART_CURRENT:'restart_current', JUMP:'jump' };

let steps = []; // [{ name, assigneeType:'team'|'automated', assignee, description, resources:[{resourceId}], branches:[{outcome,action,next}] , app?, appActionKey?, appActionType?, zapSteps?, requiresFilter? }]
let assigneePool = [];
let title = "", startsWhen = "", endsWhen = "", milestones = [];
let topResources = []; // [{id,type,name,mode?,link?,fileName?,fileData?, email?, automation?, scope:{...}}]
let libFilter = 'all';
let libQuery = '';
let apps = []; // [{ app:'Calendly', actions:[{type:'trigger', key, name, requiresFilter, notes}] }]
let whoFilter = 'all'; // 'all'|'team'|'auto'

// Pricing defaults (you can change in Settings)
let zapStepRate = 80;
let emailStepRate = 80;
let schedulerRate = 125;
let otherHourlyRate = 300;
// Forms component rates
let formRate = {
  question: 0,   // supply later if you want a nonzero default
  condition: 0,
  pdf: 0,
  email: 0,
  signature: 0,
  addon: 0
};
// Settings
let clickupWebhookUrl = "";


/***********************
 * 2) DOM references
 ***********************/
const $ = (id)=>document.getElementById(id);

// top-level inputs
const wfTitle = $('wfTitle'), wfStarts = $('wfStarts'), wfEnds = $('wfEnds'), wfMilestones = $('wfMilestones');

// assignees
const chips = $('assigneeChips'), assigneeInput = $('assigneeInput'), addAssigneeBtn = $('addAssigneeBtn');

// Outline: Stage, Category, Item Title
const stRow = document.createElement('div'); stRow.className='rowline';
stRow.innerHTML = `<label class="small">Stage / Workflow Name</label>`;
const stIn = document.createElement('input'); stIn.type='text'; stIn.value=step.stage||""; stIn.placeholder='e.g., Discovery';
stIn.addEventListener('input', ()=>{ step.stage = stIn.value; persist(); });
stRow.appendChild(stIn); metaWrap.appendChild(stRow);

const catRow = document.createElement('div'); catRow.className='rowline';
catRow.innerHTML = `<label class="small">Category</label>`;
const catSel = document.createElement('select');
["","Automation","Forms","Email Marketing Campaigns","Scheduler","Other"].forEach(v=>{
  const o=document.createElement('option'); o.value=v; o.textContent = v || "(none)"; catSel.appendChild(o);
});
catSel.value = step.category||"";
catSel.addEventListener('change', ()=>{ step.category = catSel.value; persist(); renderRollup(); });
catRow.appendChild(catSel); metaWrap.appendChild(catRow);

const itemRow = document.createElement('div'); itemRow.className='rowline';
itemRow.innerHTML = `<label class="small">Item (Title)</label>`;
const itemIn = document.createElement('input'); itemIn.type='text'; itemIn.value=step.itemTitle||""; itemIn.placeholder='Human-readable item name';
itemIn.addEventListener('input', ()=>{ step.itemTitle = itemIn.value; persist(); });
itemRow.appendChild(itemIn); metaWrap.appendChild(itemRow);

// Additional Details + Fields
const addRow = document.createElement('div'); addRow.className='rowline';
addRow.innerHTML = `<label class="small">Additional Details</label>`;
const addIn = document.createElement('textarea'); addIn.value=step.additionalDetails||"";
addIn.addEventListener('input', ()=>{ step.additionalDetails = addIn.value; persist(); });
addRow.appendChild(addIn); metaWrap.appendChild(addRow);

const fldRow = document.createElement('div'); fldRow.className='rowline';
fldRow.innerHTML = `<label class="small">Fields (free entry)</label>`;
const fldIn = document.createElement('textarea'); fldIn.value=step.fieldsNote||"";
fldIn.addEventListener('input', ()=>{ step.fieldsNote = fldIn.value; persist(); });
fldRow.appendChild(fldIn); metaWrap.appendChild(fldRow);

// Docs/Login/Refs/Testing Checklist
const mkText = (lab, key, ph='')=>{
  const r=document.createElement('div'); r.className='rowline';
  const l=document.createElement('label'); l.textContent=lab; l.className='small';
  const t=document.createElement('textarea'); t.placeholder=ph; t.value=step[key]||"";
  t.addEventListener('input', ()=>{ step[key]=t.value; persist(); });
  r.appendChild(l); r.appendChild(t); metaWrap.appendChild(r);
};
mkText('Documents Needed','docsNeeded','One per line…');
mkText('Logins','logins','System → who has access?');
mkText('References','references','Links, screenshots…');
mkText('Testing Checklist','testingChecklist','Checklist notes…');

// Status + Responsible
const sRow = document.createElement('div'); sRow.className='rowline';
sRow.innerHTML = `<label class="small">Status</label>`;
const sSel = document.createElement('select');
['Do Now','Do Later',"Don't Do",'Done'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; sSel.appendChild(o); });
sSel.value = step.status || 'Do Now';
sSel.addEventListener('change', ()=>{ step.status = sSel.value; persist(); renderRollup(); });
sRow.appendChild(sSel); metaWrap.appendChild(sRow);

const rRow = document.createElement('div'); rRow.className='rowline';
rRow.innerHTML = `<label class="small">Responsible</label>`;
const rSel = document.createElement('select');
['Client','Sphynx Team','Joint'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; rSel.appendChild(o); });
rSel.value = step.responsible || 'Sphynx Team';
rSel.addEventListener('change', ()=>{ step.responsible = rSel.value; persist(); renderRollup(); });
rRow.appendChild(rSel); metaWrap.appendChild(rRow);

// Category-specific inputs
if (step.category === 'Forms'){
  step.form = step.form || { questions:0, conditions:0, pdfs:0, emails:0, signatures:0, addons:0 };
  const f = step.form;
  const makeNum = (lab, key)=>{
    const r=document.createElement('div'); r.className='rowline';
    r.innerHTML = `<label class="small">${lab}</label>`;
    const i=document.createElement('input'); i.type='number'; i.min='0'; i.step='1'; i.value=Number(f[key]||0);
    i.addEventListener('input', ()=>{ f[key]=Number(i.value||0); persist(); renderRollup(); });
    r.appendChild(i); metaWrap.appendChild(r);
  };
  makeNum('# Questions','questions');
  makeNum('# Conditions','conditions');
  makeNum('# PDFs','pdfs');
  makeNum('# Emails','emails');
  makeNum('# Signatures','signatures');
  makeNum('# Add-ons','addons');
}
if (step.category === 'Scheduler'){
  const r=document.createElement('div'); r.className='rowline';
  r.innerHTML = `<label class="small">Units (page / event / team member)</label>`;
  const i=document.createElement('input'); i.type='number'; i.min='0'; i.step='1'; i.value=Number(step.schedulerUnits||0);
  i.addEventListener('input', ()=>{ step.schedulerUnits = Number(i.value||0); persist(); renderRollup(); });
  r.appendChild(i); metaWrap.appendChild(r);
}
if (step.category === 'Other'){
  const r=document.createElement('div'); r.className='rowline';
  r.innerHTML = `<label class="small">Estimated Hours</label>`;
  const i=document.createElement('input'); i.type='number'; i.min='0'; i.step='0.25'; i.value=Number(step.otherHours||0);
  i.addEventListener('input', ()=>{ step.otherHours = Number(i.value||0); persist(); renderRollup(); });
  r.appendChild(i); metaWrap.appendChild(r);
}

// tabs + library/builder/apps
const libTabBtn = $('libTabBtn'), builderTabBtn = $('builderTabBtn'), appsTabBtn = $('appsTabBtn');
const libraryWrap = $('libraryWrap'), builderWrap = $('builderWrap'), appsWrap = $('appsWrap');
const libMenu = $('libMenu'), libSearch = $('libSearch');

// top resources
const topResList = $('topResources'), topResType = $('topResType'), topResName = $('topResName'), topResBuilder = $('topResBuilder'), addTopResBtn = $('addTopRes');

// apps
const appsSearch = $('appsSearch'), importAppsBtn = $('importAppsBtn'), importAppsFile = $('importAppsFile');

// toolbar, feedback
const stepNameInput = $('stepNameInput'), addStepBtn = $('addStepBtn'), vizBtn = $('vizBtn'), exportBtn = $('exportBtn'), importBtn = $('importBtn'), importFile = $('importFile'), clearAllBtn = $('clearAllBtn');
const statusOk = $('statusOk'), statusErr = $('statusErr');

// filters
const filterAll = $('filterAll'), filterTeam = $('filterTeam'), filterAuto = $('filterAuto');

// viz
const vizWrap = $('vizWrap'), viz = $('viz');

// rollup + settings
const rollupSummary = $('rollupSummary');
const settingsBtn = $('settingsBtn'), settingsPanel = $('settingsPanel'), zapRateInput = $('zapRateInput');

// steps area
const cards = $('cards'), emptyState = $('emptyState');

/***********************
 * 3) Utils
 ***********************/
const debounce = (fn, ms=2000) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; };
const showOk = () => { statusOk.style.display='block'; setTimeout(()=>statusOk.style.display='none', 900); };
const showErr = (msg) => { statusErr.textContent = msg; statusErr.style.display='block'; setTimeout(()=>statusErr.style.display='none', 3000); };
const allStepNames = () => steps.map(s=>s.name);
const hasName = (n) => steps.some(s=>s.name.toLowerCase()===(n||'').toLowerCase());
const uniqueName = (base) => { let n=(base||'').trim()||'Untitled Step'; if(!hasName(n))return n; let i=2; while(hasName(`${n} ${i}`)) i++; return `${n} ${i}`; };
const sanitizeName = (s) => (s||"").trim().replace(/\s+/g,' ');
const newId = () => 'r_' + Math.random().toString(36).slice(2,10);
const fileToDataUrl = (file) => new Promise((resolve,reject)=>{ const fr=new FileReader(); fr.onload=()=>resolve(fr.result); fr.onerror=reject; fr.readAsDataURL(file); });

/***********************
 * 4) Import/Export & Persist
 ***********************/
function setStateFromPayload(obj){
  steps = Array.isArray(obj.steps) ? obj.steps : [];
  assigneePool = Array.isArray(obj.assigneePool) ? obj.assigneePool : [];
  title = obj.title || "";
  startsWhen = obj.startsWhen || "";
  endsWhen = obj.endsWhen || "";
  if (Array.isArray(obj.milestones)) milestones = obj.milestones;
  else if (obj.milestones) milestones = String(obj.milestones).split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
  topResources = Array.isArray(obj.resources) ? obj.resources : [];
  topResources.forEach(r => { if (!r.id) r.id = newId(); });
  if (Array.isArray(obj.apps)) apps = obj.apps;
  if (typeof obj.zapStepRate === 'number') zapStepRate = obj.zapStepRate;
  if (typeof obj.emailStepRate === 'number') emailStepRate = obj.emailStepRate;
  if (typeof obj.schedulerRate === 'number') schedulerRate = obj.schedulerRate;
  if (typeof obj.otherHourlyRate === 'number') otherHourlyRate = obj.otherHourlyRate;
  if (obj.formRate) formRate = Object.assign(formRate, obj.formRate);
  if (typeof obj.clickupWebhookUrl === 'string') clickupWebhookUrl = obj.clickupWebhookUrl;

  // migrate legacy step resource objects
  steps.forEach(s=>{
    if (!Array.isArray(s.resources)) { s.resources=[]; return; }
    s.resources = s.resources.map(rr=>{
      if (rr && rr.resourceId) return rr;
      if (rr && rr.type){
        if (!rr.id) rr.id = newId();
        const exists = topResources.find(tr => tr.id === rr.id) ||
                       topResources.find(tr => tr.name === rr.name && tr.type === rr.type);
        const id = exists ? exists.id : (topResources.push(rr), rr.id);
        return { resourceId:id };
      }
      return rr;
    });
  });
}

function loadFromValue(v){
  if (!v) return;
  try {
    const obj = JSON.parse(v);
    if (Array.isArray(obj)) steps = obj;
    else if (obj && typeof obj === 'object') setStateFromPayload(obj);
  } catch(e){}
}

function payload(){
  return {
    title, startsWhen, endsWhen, milestones,
    assigneePool, resources: topResources, steps,
    apps,
    zapStepRate, emailStepRate, schedulerRate, otherHourlyRate,
    formRate,
    clickupWebhookUrl
  };
}

function persistImmediate(){
  try { JFCustomWidget.sendData({ value: JSON.stringify(payload()) }); } catch(e){}
  render(); renderViz(); renderRollup();
  showOk();
}

const persist = debounce(persistImmediate, 2000);

/***********************
 * 5) Validation
 ***********************/
function validateAll() {
  const names = allStepNames();
  if (!names.length) return "Add at least one step.";
  for (const n of names) if (!n.trim()) return "Step names cannot be empty.";
  const lower = names.map(n=>n.toLowerCase());
  const dup = lower.find((n,i)=> lower.indexOf(n)!==i);
  if (dup) return "Step names must be unique.";
  for (const s of steps) {
    if (s.assigneeType === 'team' && s.assignee && !assigneePool.includes(s.assignee)) {
      return `Step "${s.name}" assigns to "${s.assignee}", which is not in Possible Assignees.`;
    }
    for (const b of (s.branches||[])) {
      if (!b.outcome || !b.outcome.trim()) return `Outcome label missing on step "${s.name}".`;
      if (![ACTIONS.CLOSE,ACTIONS.RESTART_WORKFLOW,ACTIONS.RESTART_CURRENT,ACTIONS.JUMP].includes(b.action))
        return `Invalid action on step "${s.name}".`;
      if (b.action===ACTIONS.JUMP) {
        if (!b.next || !b.next.trim()) return `On step "${s.name}", outcome "${b.outcome}" must specify a jump target.`;
      }
    }
    if (Array.isArray(s.resources)) {
      for (const rr of s.resources) {
        if (!topResources.find(tr=>tr.id===rr.resourceId)) {
          return `Step "${s.name}" references a resource that no longer exists.`;
        }
      }
    }
  }
  return "";
}

/***********************
 * 6) Assignee chip UI
 ***********************/
function renderAssignees(){
  chips.innerHTML = "";
  assigneePool.forEach(name=>{
    const c = document.createElement('span'); c.className='chip';
    const txt = document.createElement('span'); txt.textContent = name;
    const x = document.createElement('button'); x.innerHTML = '&times;'; x.title='Remove';
    x.addEventListener('click', ()=>{
      assigneePool = assigneePool.filter(a=>a!==name);
      steps.forEach(s=>{ if (s.assigneeType==='team' && s.assignee===name) s.assignee=""; });
      persist();
    });
    c.appendChild(txt); c.appendChild(x); chips.appendChild(c);
  });
}

addAssigneeBtn.addEventListener('click', ()=>{
  const n = sanitizeName(assigneeInput.value);
  if (!n) return;
  if (!assigneePool.includes(n)) assigneePool.push(n);
  assigneeInput.value = "";
  persist();
});
assigneeInput.addEventListener('keydown', (e)=>{
  if (e.key==='Enter'){ e.preventDefault(); addAssigneeBtn.click(); }
});

/***********************
 * 7) Resources: helpers & builders
 ***********************/
function ensureScope(r){
  r.scope = r.scope || {
    scopeSummary:"", effortHours:"", billing:"fixed", internalCost:"", price:"", sku:"", includeInProposal:false
  };
  return r.scope;
}
function blankResource(type, name){
  const base = { id:newId(), type, name, mode:null, link:"", fileName:"", fileData:"" };
  if (type==='email') base.email = { subject:"", body:"", to:"", from:"", conditions:"" };
  if (type==='automation') base.automation = { system:"", action:"", notes:"" };
  ensureScope(base);
  return base;
}
function resourceSummary(r){
  if (!r) return "(empty)";
  const kind = r.type==='email' ? "Email Template" : r.type==='form' ? "Form" : r.type==='automation' ? "Automation" : "Other";
  return `${kind}: ${r.name || "(unnamed)"}`;
}

/* SAFE builder (fixes earlier event bugs) */
function builderForResource(container, r, onChange){
  container.innerHTML = "";
  ensureScope(r);

  const grid = document.createElement('div'); grid.className='resgrid';

  // Name
  const rowName = document.createElement('div'); rowName.className='resrow';
  rowName.innerHTML = `<label>Name</label>`;
  const inpName = document.createElement('input'); inpName.type='text'; inpName.placeholder='Resource name';
  inpName.value = r.name || "";
  inpName.addEventListener('input', ()=>{ r.name = inpName.value; onChange(); });
  rowName.appendChild(inpName); grid.appendChild(rowName);

  // Mode controls
  let modeFields = document.createElement('div');

  function renderModeFields(){
    modeFields.innerHTML = "";
    if (r.type==='form'){
      if (!r.mode) r.mode='upload';
      if (r.mode==='link'){
        const row = document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Form Link</label>`;
        const i=document.createElement('input'); i.type='text'; i.placeholder='https://...'; i.value=r.link||"";
        i.addEventListener('input', ()=>{ r.link=i.value; onChange(); });
        row.appendChild(i); modeFields.appendChild(row);
      } else {
        const row = document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Upload PDF</label>`;
        const f=document.createElement('input'); f.type='file'; f.accept=".pdf,.doc,.docx,.png,.jpg,.jpeg";
        f.addEventListener('change', async ()=>{
          const file=f.files?.[0]; if(!file){ r.fileName=""; r.fileData=""; onChange(); return; }
          if (file.size > 4*1024*1024){ alert("This file is large; consider linking instead."); return; }
          r.fileName=file.name; r.link=""; r.fileData=await fileToDataUrl(file); onChange();
        });
        row.appendChild(f); modeFields.appendChild(row);
        const mini=document.createElement('div'); mini.className='mini'; mini.textContent = r.fileName?`Attached: ${r.fileName}`:'No file attached';
        modeFields.appendChild(mini);
      }
    } else if (r.type==='email'){
      if (!r.mode) r.mode='input';
      if (r.mode==='upload'){
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Upload Template</label>`;
        const f=document.createElement('input'); f.type='file'; f.accept=".pdf,.html,.txt,.doc,.docx";
        f.addEventListener('change', async ()=>{
          const file=f.files?.[0]; if(!file){ r.fileName=""; r.fileData=""; onChange(); return; }
          if (file.size > 4*1024*1024){ alert("This file is large; consider linking instead."); return; }
          r.fileName=file.name; r.fileData=await fileToDataUrl(file); onChange();
        });
        row.appendChild(f); modeFields.appendChild(row);
        const mini=document.createElement('div'); mini.className='mini'; mini.textContent = r.fileName?`Attached: ${r.fileName}`:'No file attached';
        modeFields.appendChild(mini);
      } else {
        const mk = (lab, key, ph='')=>{
          const row=document.createElement('div'); row.className='resrow';
          row.innerHTML = `<label>${lab}</label>`;
          const input=document.createElement(key==='body'?'textarea':'input');
          if (key!=='body') input.type='text';
          input.placeholder=ph; input.value=(r.email?.[key])||"";
          input.addEventListener('input', ()=>{ r.email=r.email||{}; r.email[key]=input.value; onChange(); });
          row.appendChild(input); modeFields.appendChild(row);
        };
        mk('Subject','subject','Subject line');
        mk('Body','body','Email body...');
        mk('To','to','email@example.com');
        mk('From','from','noreply@example.com');
        mk('Conditions','conditions','e.g., if client type = VIP');
      }
    } else if (r.type==='other'){
      if (!r.mode) r.mode='link';
      if (r.mode==='link'){
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Link</label>`;
        const i=document.createElement('input'); i.type='text'; i.placeholder='https://...'; i.value=r.link||"";
        i.addEventListener('input', ()=>{ r.link=i.value; onChange(); });
        row.appendChild(i); modeFields.appendChild(row);
      } else {
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Upload File</label>`;
        const f=document.createElement('input'); f.type='file';
        f.addEventListener('change', async ()=>{
          const file=f.files?.[0]; if(!file){ r.fileName=""; r.fileData=""; onChange(); return; }
          if (file.size > 4*1024*1024){ alert("This file is large; consider linking instead."); return; }
          r.fileName=file.name; r.link=""; r.fileData=await fileToDataUrl(file); onChange();
        });
        row.appendChild(f); modeFields.appendChild(row);
        const mini=document.createElement('div'); mini.className='mini'; mini.textContent = r.fileName?`Attached: ${r.fileName}`:'No file attached';
        modeFields.appendChild(mini);
      }
    } else if (r.type==='automation'){
      const mk = (lab, key, ph='')=>{
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>${lab}</label>`;
        const input=document.createElement(key==='notes'?'textarea':'input'); if (key!=='notes') input.type='text';
        input.placeholder=ph; input.value=(r.automation?.[key])||"";
        input.addEventListener('input', ()=>{ r.automation=r.automation||{}; r.automation[key]=input.value; onChange(); });
        row.appendChild(input); modeFields.appendChild(row);
      };
      mk('System','system','e.g., Zapier / Make / Salesforce Flow');
      mk('Action','action','e.g., Create Task, Update Record');
      mk('Notes','notes','Parameters, conditions, etc.');
    }
  }

  if (r.type!=='automation'){
    const rowMode = document.createElement('div'); rowMode.className='resrow';
    rowMode.innerHTML = `<label>Mode</label>`;
    const wrap = document.createElement('div'); wrap.className='radio-line';
    const rd = (label, val)=>{
      const lab=document.createElement('label');
      const input=document.createElement('input'); input.type='radio'; input.name=`mode_${r.id}`; input.value=val; input.checked = (r.mode===val);
      input.addEventListener('change', ()=>{ r.mode=val; onChange(); renderModeFields(); });
      const span=document.createElement('span'); span.textContent=label; span.style.marginLeft='6px';
      lab.appendChild(input); lab.appendChild(span); return lab;
    };
    if (r.type==='form'){ wrap.appendChild(rd('Upload file','upload')); wrap.appendChild(rd('Link to form','link')); }
    if (r.type==='email'){ wrap.appendChild(rd('Upload email template','upload')); wrap.appendChild(rd('Input email template','input')); }
    if (r.type==='other'){ wrap.appendChild(rd('Upload file','upload')); wrap.appendChild(rd('Link','link')); }
    rowMode.appendChild(wrap); grid.appendChild(rowMode);
  }

  grid.appendChild(modeFields);
  container.appendChild(grid);
  renderModeFields();

  // Scope & Pricing panel
  const scopeBox = document.createElement('details'); scopeBox.className='resource'; scopeBox.open=false;
  scopeBox.innerHTML = `<summary>Scope & Pricing</summary>`;
  const sg = document.createElement('div'); sg.className='resgrid';
  const mk = (lab, key, type='text', ph='')=>{
    const row=document.createElement('div'); row.className='resrow';
    row.innerHTML = `<label>${lab}</label>`;
    const input=document.createElement(type==='textarea'?'textarea':'input'); if (type!=='textarea') input.type=type;
    input.placeholder=ph; input.value = r.scope[key] ?? "";
    input.addEventListener('input', ()=>{ r.scope[key] = input.value; onChange(); });
    row.appendChild(input); sg.appendChild(row);
  };
  mk('Scope Summary','scopeSummary','textarea','Describe what’s included…');
  mk('Effort (hours)','effortHours','number','');
  const billRow=document.createElement('div'); billRow.className='resrow'; billRow.innerHTML=`<label>Billing</label>`;
  const billSel=document.createElement('select'); ['fixed','hourly','recurring'].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v[0].toUpperCase()+v.slice(1); billSel.appendChild(o); });
  billSel.value=r.scope.billing||'fixed'; billSel.addEventListener('change', ()=>{ r.scope.billing=billSel.value; onChange(); });
  billRow.appendChild(billSel); sg.appendChild(billRow);
  mk('Internal Cost ($)','internalCost','number','');
  mk('Price ($)','price','number','');
  mk('SKU / Code','sku','text','');
  const inclRow=document.createElement('div'); inclRow.className='resrow'; inclRow.innerHTML=`<label>Include in Proposals</label>`;
  const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=!!r.scope.includeInProposal; cb.addEventListener('change', ()=>{ r.scope.includeInProposal=cb.checked; onChange(); });
  inclRow.appendChild(cb); sg.appendChild(inclRow);
  scopeBox.appendChild(sg); container.appendChild(scopeBox);
}

function renderResourceList(listEl, arr, onChange){
  listEl.innerHTML = "";
  if (!arr.length){
    const empty = document.createElement('div'); empty.className='mini'; empty.textContent='No resources yet.';
    listEl.appendChild(empty); return;
  }
  arr.forEach((r)=>{
    const det = document.createElement('details'); det.className='resource';
    const sum = document.createElement('summary'); sum.className='reshead';
    const title = document.createElement('span'); title.textContent = resourceSummary(r);
    const del = document.createElement('button'); del.className='btn res-del'; del.textContent='Delete';
    del.addEventListener('click', (e)=>{ e.preventDefault(); topResources.splice(topResources.indexOf(r),1); onChange(); });
    sum.appendChild(title); sum.appendChild(del);
    det.appendChild(sum);

    const inner = document.createElement('div');
    builderForResource(inner, r, onChange);
    det.appendChild(inner);
    listEl.appendChild(det);
  });
}

function renderTopResources(){
  if (libraryWrap.style.display !== 'none'){
    renderLibMenu();
    const arr = filteredResources();
    renderResourceList(topResList, arr, persist);
  } else {
    renderResourceList(topResList, topResources, persist);
  }
}

function filteredResources(){
  return topResources.filter(r=>{
    const t = libFilter==='all' ? true : r.type===libFilter;
    if (!t) return false;
    if (!libQuery) return true;
    const s = (r.name + " " + (r.type||"") + " " + (r.mode||"") + " " + (r.scope?.sku||"")).toLowerCase();
    return s.includes(libQuery.toLowerCase());
  });
}
function renderLibMenu(){
  const counts = { all: topResources.length,
    form: topResources.filter(r=>r.type==='form').length,
    email: topResources.filter(r=>r.type==='email').length,
    automation: topResources.filter(r=>r.type==='automation').length,
    other: topResources.filter(r=>r.type==='other').length
  };
  const items = [
    {key:'all', label:'All'},
    {key:'form', label:'Forms'},
    {key:'email', label:'Email Templates'},
    {key:'automation', label:'Automations'},
    {key:'other', label:'Other'}
  ];
  libMenu.innerHTML = "";
  items.forEach(it=>{
    const row = document.createElement('div'); row.className='lib-item' + (libFilter===it.key?' active':'');
    const name = document.createElement('span'); name.textContent = it.label;
    const count = document.createElement('span'); count.className='lib-count'; count.textContent = counts[it.key];
    row.appendChild(name); row.appendChild(count);
    row.addEventListener('click', ()=>{ libFilter = it.key; renderTopResources(); renderLibMenu(); });
    libMenu.appendChild(row);
  });
}

/***********************
 * 8) Top-level Resource Builder
 ***********************/
function renderTopBuilder(){
  const type = topResType.value;
  const name = sanitizeName(topResName.value);
  topResBuilder.innerHTML = "";
  const temp = blankResource(type, name || "");
  builderForResource(topResBuilder, temp, ()=>{ /* live preview only */ });
  topResBuilder._tempResource = temp;
}
topResType && topResType.addEventListener('change', renderTopBuilder);
topResName && topResName.addEventListener('input', renderTopBuilder);
addTopResBtn && addTopResBtn.addEventListener('click', ()=>{
  const t = topResType.value;
  const n = sanitizeName(topResName.value);
  if (!n){ showErr("Resource name is required."); return; }
  const r = topResBuilder._tempResource || blankResource(t, n);
  r.name = n; if (!r.id) r.id = newId();
  topResources.push(r);
  topResName.value = "";
  renderTopBuilder();
  persist();
});

/***********************
 * 9) Tabs (Library / Builder / Apps)
 ***********************/
function setTab(mode){
  const hasLib = !!$('libraryWrap');
  const hasBld = !!$('builderWrap');
  const hasApps = !!$('appsWrap');

  if (mode==='apps' && !hasApps) mode = 'library';

  if (hasLib) $('libraryWrap').style.display = (mode==='library')?'':'none';
  if (hasBld) $('builderWrap').style.display = (mode==='builder')?'':'none';
  if (hasApps) $('appsWrap').style.display = (mode==='apps')?'':'none';

  libTabBtn && libTabBtn.classList.toggle('ghost', mode!=='library');
  builderTabBtn && builderTabBtn.classList.toggle('ghost', mode!=='builder');
  appsTabBtn && appsTabBtn.classList.toggle('ghost', mode!=='apps');

  renderTopResources();
  renderApps();
}

libTabBtn && libTabBtn.addEventListener('click', ()=> setTab('library'));
builderTabBtn && builderTabBtn.addEventListener('click', ()=> setTab('builder'));
appsTabBtn && appsTabBtn.addEventListener('click', ()=> setTab('apps'));
libSearch && libSearch.addEventListener('input', ()=>{ libQuery = libSearch.value||''; renderTopResources(); });

/***********************
 * 10) Apps (CSV import, list)
 ***********************/
function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(Boolean);
  const [hdr, ...rows] = lines;
  const cols = hdr.split(',').map(s=>s.trim().toLowerCase());
  function cell(row, key){ const i = cols.indexOf(key); return i>=0 ? (row.split(',')[i]||'').trim() : ''; }
  const group = {};
  rows.forEach(line=>{
    const row = line;
    const app = cell(row,'app');
    if (!app) return;
    const type = (cell(row,'type')||'').toLowerCase();
    const key = cell(row,'key');
    const name = cell(row,'name');
    const rf = (cell(row,'requiresfilter')||'').toLowerCase();
    const requiresFilter = rf==='true' || rf==='1' || rf==='yes';
    const notes = cell(row,'notes');
    group[app] = group[app] || [];
    group[app].push({ type, key, name, requiresFilter, notes });
  });
  const arr = Object.keys(group).sort().map(app=>{
    return { app, actions: group[app] };
  });
  return arr;
}

function renderApps(){
  const q = (appsSearch?.value||'').toLowerCase();
  const list = $('appsList'); if (!list) return;
  list.innerHTML='';
  if (!apps.length){
    const empty = document.createElement('div'); empty.className='mini'; empty.textContent='No apps loaded. Import a CSV.';
    list.appendChild(empty); return;
  }
  apps.forEach(a=>{
    const matches = !q || a.app.toLowerCase().includes(q) || a.actions.some(x => (x.name||'').toLowerCase().includes(q) || (x.key||'').toLowerCase().includes(q));
    if (!matches) return;
    const det = document.createElement('details'); det.className='resource';
    const sum = document.createElement('summary'); sum.textContent = `${a.app} (${a.actions.length})`;
    det.appendChild(sum);
    const inner = document.createElement('div');
    a.actions.forEach(x=>{
      const row = document.createElement('div'); row.className='resrow';
      const l = document.createElement('label'); l.textContent = x.type.toUpperCase();
      const v = document.createElement('div'); v.className='mini';
      v.textContent = `${x.name||x.key||'(unnamed)'}${x.requiresFilter?' • requires filter':''}${x.notes?` • ${x.notes}`:''}`;
      row.appendChild(l); row.appendChild(v); inner.appendChild(row);
    });
    det.appendChild(inner);
    list.appendChild(det);
  });
}
appsSearch && appsSearch.addEventListener('input', renderApps);
importAppsBtn && importAppsBtn.addEventListener('click', ()=> importAppsFile.click());
importAppsFile && importAppsFile.addEventListener('change', async ()=>{
  const f = importAppsFile.files?.[0]; if(!f) return;
  const text = await f.text();
  try {
    const parsed = parseCSV(text);
    apps = parsed;
    persist(); renderApps();
    importAppsFile.value="";
  } catch(e){ showErr('Could not parse CSV. Check headers.'); }
});

/***********************
 * 11) Step resource picker (with search + Custom)
 ***********************/
function renderStepResourcePicker(container, step){
  container.innerHTML = "";

  const searchRow = document.createElement('div'); searchRow.className='row';
  const search = document.createElement('input'); search.type='text'; search.placeholder = 'Search resources…';
  const header = document.createElement('div'); header.className='row';
  const sel = document.createElement('select');
  const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Add to Step';

  function buildOptions(){
    const q = (search.value || "").toLowerCase().trim();
    const matches = topResources.filter(r=>{
      const s = (r.name+" "+(r.type||"")+" "+(r.mode||"")+" "+(r.scope?.sku||"")).toLowerCase();
      return !q || s.includes(q);
    });
    sel.innerHTML = `<option value="">Select existing resource…</option>` +
      matches.map(r => `<option value="${r.id}">${resourceSummary(r)}</option>`).join('') +
      `<option value="__custom__">Custom…</option>`;
  }
  search.addEventListener('input', buildOptions);

  header.appendChild(sel); header.appendChild(addBtn);
  container.appendChild(searchRow); searchRow.appendChild(search);
  container.appendChild(header);

  const customWrap = document.createElement('div'); customWrap.className='section'; customWrap.style.display='none';
  container.appendChild(customWrap);

  let customTemp = blankResource('form','');

  function showCustomBuilder(){ customWrap.style.display=''; buildCustomUI(); }
  function hideCustomBuilder(){ customWrap.style.display='none'; customWrap.innerHTML=""; }

  function buildCustomUI(){
    customWrap.innerHTML = '';
    const row = document.createElement('div'); row.className='row';
    const typeSel = document.createElement('select');
    ['form','email','automation','other'].forEach(t=>{
      const o=document.createElement('option'); o.value=t; o.textContent=t==='email'?'Email Template':t==='form'?'Form':t==='automation'?'Automation':'Other';
      typeSel.appendChild(o);
    });
    const nameIn = document.createElement('input'); nameIn.type='text'; nameIn.placeholder='Resource name (required)';

    customTemp = blankResource('form','');
    typeSel.value = customTemp.type;
    nameIn.value = customTemp.name;

    typeSel.addEventListener('change', ()=>{ customTemp = blankResource(typeSel.value, (nameIn.value||"").trim()); renderFields(); });
    nameIn.addEventListener('input', ()=>{ customTemp.name = (nameIn.value||"").trim(); });

    row.appendChild(typeSel); row.appendChild(nameIn);
    customWrap.appendChild(row);

    const fields = document.createElement('div');
    customWrap.appendChild(fields);

    function onChange(){ /* live typing only */ }
    function renderFields(){ fields.innerHTML = ''; builderForResource(fields, customTemp, onChange); }
    renderFields();

    const actions = document.createElement('div'); actions.className='row'; actions.style.justifyContent='flex-end';
    const saveBtn = document.createElement('button'); saveBtn.className='btn primary'; saveBtn.textContent='Save Resource & Add';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn'; cancelBtn.textContent='Cancel';

    saveBtn.addEventListener('click', ()=>{
      const nm = (customTemp.name||"").trim();
      if (!nm){ showErr("Resource name is required."); return; }
      if (!customTemp.id) customTemp.id = newId();
      topResources.push(customTemp);
      step.resources = step.resources || [];
      step.resources.push({ resourceId: customTemp.id });
      persist();
      hideCustomBuilder();
      buildOptions();
      renderStepResourceList(container, step);
    });
    cancelBtn.addEventListener('click', ()=>{ hideCustomBuilder(); sel.value=""; });

    actions.appendChild(cancelBtn); actions.appendChild(saveBtn);
    customWrap.appendChild(actions);
  }

  sel.addEventListener('change', ()=>{
    if (sel.value === '__custom__'){ showCustomBuilder(); }
    else { hideCustomBuilder(); }
  });

  addBtn.addEventListener('click', ()=>{
    const val = sel.value;
    if (!val){ showErr("Choose a resource or select Custom."); return; }
    if (val === '__custom__'){ showCustomBuilder(); return; }
    step.resources = step.resources || [];
    if (!step.resources.find(x=>x.resourceId===val)){
      step.resources.push({ resourceId: val });
      persist();
      renderStepResourceList(container, step);
    }
  });

  buildOptions();
  renderStepResourceList(container, step);
}

function renderStepResourceList(container, step){
  let list = container.querySelector('.step-res-list');
  if (!list){
    list = document.createElement('div'); list.className='step-res-list';
    container.appendChild(list);
  }
  list.innerHTML = "";
  const arr = step.resources || [];
  if (!arr.length){
    const empty = document.createElement('div'); empty.className='mini'; empty.textContent='No step resources yet.';
    list.appendChild(empty); return;
  }
  arr.forEach((ref, i)=>{
    const r = topResources.find(tr=>tr.id===ref.resourceId);
    const det = document.createElement('details'); det.className='resource';
    const sum = document.createElement('summary'); sum.className='reshead';
    const title = document.createElement('span'); title.textContent = r ? resourceSummary(r) : '(missing resource)';
    const del = document.createElement('button'); del.className='btn res-del'; del.textContent='Remove';
    del.addEventListener('click', (e)=>{ e.preventDefault(); step.resources.splice(i,1); persist(); });
    sum.appendChild(title); sum.appendChild(del);
    det.appendChild(sum);

    if (r){
      const inner = document.createElement('div');
      const grid = document.createElement('div'); grid.className='resgrid';
      const row1 = document.createElement('div'); row1.className='resrow';
      row1.innerHTML = `<label>Type</label><div class="mini">${r.type}</div>`;
      const row2 = document.createElement('div'); row2.className='resrow';
      row2.innerHTML = `<label>Name</label><div class="mini">${r.name}</div>`;
      grid.appendChild(row1); grid.appendChild(row2);

      if (r.type==='form' || r.type==='other'){
        const rowM=document.createElement('div'); rowM.className='resrow';
        rowM.innerHTML = `<label>Mode</label><div class="mini">${r.mode||''}</div>`;
        grid.appendChild(rowM);
        if (r.mode==='link' && r.link){
          const rowL=document.createElement('div'); rowL.className='resrow';
          const a = `<a class="mini" href="${r.link}" target="_blank">${r.link}</a>`;
          rowL.innerHTML = `<label>Link</label>${a}`;
          grid.appendChild(rowL);
        }
        if (r.mode==='upload' && r.fileName){
          const rowF=document.createElement('div'); rowF.className='resrow';
          rowF.innerHTML = `<label>File</label><div class="mini">${r.fileName}</div>`;
          grid.appendChild(rowF);
        }
      }
      if (r.type==='email'){
        const rowM=document.createElement('div'); rowM.className='resrow';
        rowM.innerHTML = `<label>Mode</label><div class="mini">${r.mode||''}</div>`;
        grid.appendChild(rowM);
        if (r.mode==='upload' && r.fileName){
          const rowF=document.createElement('div'); rowF.className='resrow';
          rowF.innerHTML = `<label>File</label><div class="mini">${r.fileName}</div>`;
          grid.appendChild(rowF);
        }
        if (r.mode==='input' && r.email){
          ['subject','to','from','conditions'].forEach(k=>{
            const row=document.createElement('div'); row.className='resrow';
            row.innerHTML = `<label>${k[0].toUpperCase()+k.slice(1)}</label><div class="mini">${r.email?.[k]||''}</div>`;
            grid.appendChild(row);
          });
          const rowB=document.createElement('div'); rowB.className='resrow';
          rowB.innerHTML = `<label>Body</label><div class="mini">${r.email.body||''}</div>`;
          grid.appendChild(rowB);
        }
      }
      if (r.type==='automation' && r.automation){
        ['system','action','notes'].forEach(k=>{
          const row=document.createElement('div'); row.className='resrow';
          row.innerHTML = `<label>${k[0].toUpperCase()+k.slice(1)}</label><div class="mini">${r.automation?.[k]||''}</div>`;
          grid.appendChild(row);
        });
      }
      if (r.scope){
        const rowS=document.createElement('div'); rowS.className='resrow';
        rowS.innerHTML = `<label>Price / SKU</label><div class="mini">$${r.scope.price||'-'} (SKU: ${r.scope.sku||'-'})</div>`;
        grid.appendChild(rowS);
      }
      inner.appendChild(grid);
      det.appendChild(inner);
    }
    list.appendChild(det);
  });
}

/***********************
 * 12) Steps render
 ***********************/
function renameStepGlobally(oldName, newName){
  steps.forEach(s=>s.branches?.forEach(b=>{
    if (b.action===ACTIONS.JUMP && b.next===oldName) b.next=newName;
  }));
}
function deleteStepGlobally(name){
  steps = steps.filter(s=>s.name!==name);
  steps.forEach(s=>s.branches?.forEach(b=>{
    if (b.action===ACTIONS.JUMP && b.next===name){ b.action=ACTIONS.CLOSE; b.next=null; }
  }));
}
const jumpTargets = (selfName) => allStepNames().filter(n => n.toLowerCase() !== (selfName||'').toLowerCase());

function render(){
  // reflect top-level
  wfTitle.value = title; wfStarts.value = startsWhen; wfEnds.value = endsWhen;
  wfMilestones.value = (milestones||[]).join('\n');
  renderAssignees();
  renderTopResources();
  renderTopBuilder();

  // filter steps
  const list = steps.filter(s=>{
    if (whoFilter==='team') return s.assigneeType!=='automated';
    if (whoFilter==='auto') return s.assigneeType==='automated';
    return true;
  });

  if (!list.length){ cards.innerHTML=""; emptyState.style.display=""; return; }
  emptyState.style.display="none"; cards.innerHTML="";

  list.forEach((step, idx)=>{
    const card = document.createElement('div'); card.className='card';
    card.setAttribute('draggable','true');
    card.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', step.name); card.style.opacity=.5; });
    card.addEventListener('dragend', ()=>{ card.style.opacity=1; });
    card.addEventListener('dragover', (e)=>{ e.preventDefault(); card.style.outline='2px dashed #cfe0ff'; });
    card.addEventListener('dragleave', ()=>{ card.style.outline='none'; });
    card.addEventListener('drop', (e)=>{
      e.preventDefault(); card.style.outline='none';
      const name = e.dataTransfer.getData('text/plain');
      const fromIdx = steps.findIndex(s=>s.name===name);
      const toIdx = steps.findIndex(s=>s.name===step.name);
      if (fromIdx<0 || toIdx<0 || fromIdx===toIdx) return;
      const [moved] = steps.splice(fromIdx,1);
      steps.splice(toIdx,0,moved);
      persist(); renderViz();
    });

    // header
    const header = document.createElement('header');
    const titleInput = document.createElement('input');
    titleInput.value = step.name; titleInput.placeholder="Step name";
    titleInput.addEventListener('change', ()=>{
      const next = uniqueName(titleInput.value);
      if (next !== step.name){ const old=step.name; step.name=next; renameStepGlobally(old,next); persist(); }
      else { step.name=next; persist(); }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'iconbtn red'; delBtn.setAttribute('aria-label','Delete Step'); delBtn.title = 'Delete Step';
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path>
      </svg>`;
    delBtn.addEventListener('click', ()=>{
      if (confirm(`Delete "${step.name}"? Any branches pointing here will switch to Close Workflow.`)){
        deleteStepGlobally(step.name); persist();
      }
    });

    header.appendChild(titleInput); header.appendChild(delBtn);

    // meta
    const metaWrap = document.createElement('div'); metaWrap.className='meta';

    // Assignee Type
    const atRow = document.createElement('div'); atRow.className='rowline';
    const atLbl = document.createElement('label'); atLbl.textContent='Assignee Type'; atLbl.className='small';
    const atSel = document.createElement('select');
    [{v:'team',label:'Team Member'},{v:'automated',label:'Automated'}]
      .forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.label; atSel.appendChild(opt); });
    if (!step.assigneeType) step.assigneeType='team';
    atSel.value = step.assigneeType;
    atSel.addEventListener('change', ()=>{ step.assigneeType=atSel.value; if (step.assigneeType!=='team') step.assignee=""; persist(); render(); });
    atRow.appendChild(atLbl); atRow.appendChild(atSel);

    // Assignee name / Automated label
    const anRow = document.createElement('div'); anRow.className='rowline';
    const anLbl = document.createElement('label'); anLbl.textContent='Assignee'; anLbl.className='small';
    if (step.assigneeType==='team'){
      const nameSel = document.createElement('select');
      nameSel.innerHTML = `<option value="">Select a team member…</option>`;
      assigneePool.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; nameSel.appendChild(o); });
      if (!assigneePool.includes(step.assignee)) step.assignee = "";
      nameSel.value = step.assignee || "";
      nameSel.addEventListener('change', ()=>{ step.assignee = nameSel.value || ""; persist(); });
      anRow.appendChild(anLbl); anRow.appendChild(nameSel);
    } else {
      const info = document.createElement('div'); info.style.color="#475569"; info.textContent="Automated";
      anRow.appendChild(anLbl); anRow.appendChild(info);
    }

    // App + Action + Zap steps
    const appRow = document.createElement('div'); appRow.className='rowline';
    const appLbl = document.createElement('label'); appLbl.textContent='App'; appLbl.className='small';
    const appSel = document.createElement('select');
    appSel.innerHTML = `<option value="">(none)</option>` + apps.map(a=>`<option value="${a.app}">${a.app}</option>`).join('');
    appSel.value = step.app || "";
    appSel.addEventListener('change', ()=>{
      step.app = appSel.value || "";
      if (step.app && step.assigneeType!=='automated'){ step.assigneeType='automated'; }
      step.appActionKey = ""; step.appActionType=""; step.zapSteps = undefined; step.requiresFilter = false;
      persist(); render();
    });
    appRow.appendChild(appLbl); appRow.appendChild(appSel);

    metaWrap.appendChild(atRow);
    metaWrap.appendChild(anRow);
    metaWrap.appendChild(appRow);

    if (step.app){
      const actRow = document.createElement('div'); actRow.className='rowline';
      const actLbl = document.createElement('label'); actLbl.textContent='Action/Trigger'; actLbl.className='small';
      const actSel = document.createElement('select');
      const appObj = apps.find(a=>a.app===step.app);
      const acts = appObj ? appObj.actions : [];
      actSel.innerHTML = `<option value="">Select…</option>` + acts.map(x=>`<option value="${x.key}">${x.type.toUpperCase()}: ${x.name||x.key}</option>`).join('');
      actSel.value = step.appActionKey || "";
      actSel.addEventListener('change', ()=>{
        step.appActionKey = actSel.value || "";
        const pick = acts.find(x=>x.key===step.appActionKey);
        step.appActionType = pick?.type || "";
        const base = pick ? 1 + (pick.requiresFilter?1:0) : 0;
        if (step.zapSteps == null) step.zapSteps = base;
        step.requiresFilter = !!pick?.requiresFilter;
        persist(); renderRollup();
      });
      actRow.appendChild(actLbl); actRow.appendChild(actSel);

      const zRow = document.createElement('div'); zRow.className='rowline';
      const zLbl = document.createElement('label'); zLbl.textContent='Zap Steps'; zLbl.className='small';
      const zIn = document.createElement('input'); zIn.type='number'; zIn.min='0'; zIn.step='1';
      const computedBase = (()=>{ const p=(acts.find(x=>x.key===step.appActionKey)); return p?1+(p.requiresFilter?1:0):0 })();
      if (step.zapSteps == null) step.zapSteps = computedBase;
      zIn.value = step.zapSteps || 0;
      zIn.addEventListener('input', ()=>{ step.zapSteps = Number(zIn.value||0); persist(); renderRollup(); });
      zRow.appendChild(zLbl); zRow.appendChild(zIn);

      metaWrap.appendChild(actRow);
      metaWrap.appendChild(zRow);

      if (step.requiresFilter){
        const hint = document.createElement('div'); hint.className='hint';
        hint.textContent = 'This action/trigger needs an extra Filter step (added to Zap Steps).';
        metaWrap.appendChild(hint);
      }
    }

    // Description
    const descLbl = document.createElement('label'); descLbl.textContent='Description'; descLbl.className='small';
    const descTa = document.createElement('textarea'); descTa.placeholder='Notes, details, instructions…';
    descTa.value = step.description || "";
    descTa.addEventListener('input', ()=>{ step.description = descTa.value; persist(); });

    // Step resources
    const resHdr = document.createElement('div'); resHdr.className='tag'; resHdr.textContent='Resources';
    const resPicker = document.createElement('div');
    if (!Array.isArray(step.resources)) step.resources = [];
    renderStepResourcePicker(resPicker, step);

    // Outcomes
    const rowsWrap = document.createElement('div');
    step.branches = step.branches || [];
    step.branches.forEach((branch, bIdx)=>{
      const row = document.createElement('div'); row.className='row';

      const outcomeInput = document.createElement('input');
      outcomeInput.type='text'; outcomeInput.placeholder='Outcome (e.g., Yes / No / Needs Review)';
      outcomeInput.value = branch.outcome || "";
      outcomeInput.addEventListener('input', ()=>{ branch.outcome = outcomeInput.value; persist(); });

      const thenLbl = document.createElement('label'); thenLbl.className='small'; thenLbl.textContent='Then:';

      const actionSelect = document.createElement('select');
      [{v:'close',label:'Close Workflow'},{v:'restart_workflow',label:'Restart Workflow'},{v:'restart_current',label:'Restart Current Step'},{v:'jump',label:'Jump to Step'}]
        .forEach(opt=>{ const o=document.createElement('option'); o.value=opt.v; o.textContent=opt.label; actionSelect.appendChild(o); });
      if (!branch.action) branch.action = 'close';
      actionSelect.value = branch.action;

      const jumpWrap = document.createElement('div'); jumpWrap.style.display='contents';
      const makeJumpControl = ()=>{
        jumpWrap.innerHTML = "";
        if (branch.action !== 'jump') return;
        const lbl = document.createElement('label'); lbl.className='small'; lbl.textContent='Step:';
        const input = document.createElement('input'); input.setAttribute('list', `dl-${idx}-${bIdx}`);
        input.placeholder='Type or select a step'; input.value = branch.next || "";
        const dl = document.createElement('datalist'); dl.id=`dl-${idx}-${bIdx}`;
        jumpTargets(step.name).forEach(n=>{ const opt=document.createElement('option'); opt.value=n; dl.appendChild(opt); });
        input.addEventListener('input', ()=>{ branch.next = (input.value||"").trim() || null; persist(); });
        const mini = document.createElement('div'); mini.className='row';
        mini.appendChild(lbl); mini.appendChild(input); mini.appendChild(dl);
        jumpWrap.appendChild(mini);
      };
      const syncJumpControl = ()=> makeJumpControl();

      actionSelect.addEventListener('change', ()=>{
        branch.action = actionSelect.value;
        if (branch.action !== 'jump') branch.next = null;
        persist(); syncJumpControl(); renderViz();
      });

      const delOutcomeBtn = document.createElement('button'); delOutcomeBtn.className='btn'; delOutcomeBtn.textContent='Delete';
      delOutcomeBtn.addEventListener('click', ()=>{ step.branches.splice(bIdx,1); persist(); renderViz(); });

      row.appendChild(outcomeInput);
      row.appendChild(thenLbl);
      row.appendChild(actionSelect);
      row.appendChild(delOutcomeBtn);
      rowsWrap.appendChild(row);
      rowsWrap.appendChild(jumpWrap);
      syncJumpControl();
    });

    const addOutcomeRow = document.createElement('div'); addOutcomeRow.className='footer';
    const addOutcomeBtn = document.createElement('button'); addOutcomeBtn.className='btn'; addOutcomeBtn.textContent='Add Outcome';
    addOutcomeBtn.addEventListener('click', ()=>{ step.branches.push({ outcome:"", action:'close', next:null }); persist(); renderViz(); });
    addOutcomeRow.appendChild(addOutcomeBtn);

    const map = document.createElement('div'); map.className='mapline'; map.textContent = prettyMap(step);

    // Assemble
    card.appendChild(header);
    const tag = document.createElement('div'); tag.className='tag'; tag.textContent=`Step ${steps.findIndex(s=>s.name===step.name)+1}`;
    card.appendChild(tag);
    card.appendChild(document.createElement('div')).className='divider';

    metaWrap.appendChild(descLbl); metaWrap.appendChild(descTa);
    metaWrap.appendChild(resHdr); metaWrap.appendChild(resPicker);

    card.appendChild(metaWrap);
    card.appendChild(rowsWrap);
    card.appendChild(addOutcomeRow);
    card.appendChild(map);
    cards.appendChild(card);
  });
}

function prettyMap(step){
  if (!step.branches.length) return "No outcomes defined yet.";
  const who = step.assigneeType==='team' ? (step.assignee||'(unassigned)') : 'Automated';
  const head = `Assigned to: ${who}`;
  const lines = step.branches.map(b=>{
    const out = (b.outcome||'').trim() || "(no label)";
    if (b.action === 'close') return `• ${out} → Close Workflow`;
    if (b.action === 'restart_workflow') return `• ${out} → Restart Workflow`;
    if (b.action === 'restart_current') return `• ${out} → Restart Current Step`;
    if (b.action === 'jump') return `• ${out} → Jump to Step ${b.next || "(unset)"}`;
    return `• ${out} → (invalid action)`;
  });
  return [head, ...lines].join('\n');
}

/***********************
 * 13) Visualizer
 ***********************/
function renderViz(){
  if (vizWrap.style.display==='none') return;
  const W = 1200, H = 520, left=120, top=40, vgap=80, nodeW=240, nodeH=48;
  viz.setAttribute('viewBox', `0 0 ${W} ${H}`);
  while (viz.firstChild) viz.removeChild(viz.firstChild);

  const pos = {};
  steps.forEach((s,i)=>{
    const x=left, y=top + i*vgap;
    pos[s.name] = {x,y};
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    const r = document.createElementNS('http://www.w3.org/2000/svg','rect');
    const isAuto = s.assigneeType==='automated';
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('rx', 10); r.setAttribute('ry', 10);
    r.setAttribute('width', nodeW); r.setAttribute('height', nodeH);
    r.setAttribute('fill', isAuto ? '#dcfce7' : '#e8f0ff');  // green for automated, blue for team
    r.setAttribute('stroke', isAuto ? '#22c55e' : '#3b82f6');
    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', x+12); t.setAttribute('y', y+28); t.setAttribute('fill', '#0f172a'); t.setAttribute('font-size','14');
    t.textContent = s.name;
    g.appendChild(r); g.appendChild(t);
    viz.appendChild(g);
  });

  const color = {
    [ACTIONS.JUMP]:'#22c55e',
    [ACTIONS.RESTART_WORKFLOW]:'#f97316',
    [ACTIONS.RESTART_CURRENT]:'#f97316',
    [ACTIONS.CLOSE]:'#ef4444'
  };
  steps.forEach(s=>{
    const from = pos[s.name];
    if (!from) return;
    (s.branches||[]).forEach(b=>{
      let to = null;
      if (b.action===ACTIONS.JUMP && b.next && pos[b.next]) to = pos[b.next];

      const startX = from.x + 240; const startY = from.y + 24;
      let endX = to ? to.x : startX + 260;
      let endY = to ? to.y + 24 : startY;

      const path = document.createElementNS('http://www.w3.org/2000/svg','path');
      const c1x = startX + 60, c1y = startY;
      const c2x = to ? endX - 60 : startX + 200, c2y = endY;
      path.setAttribute('d', `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`);
      path.setAttribute('fill','none');
      const stroke = color[b.action] || '#94a3b8';
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', '2');
      viz.appendChild(path);

      const arrow = document.createElementNS('http://www.w3.org/2000/svg','polygon');
      const ax=endX, ay=endY;
      arrow.setAttribute('points', `${ax},${ay} ${ax-8},${ay-4} ${ax-8},${ay+4}`);
      arrow.setAttribute('fill', stroke);
      viz.appendChild(arrow);

      const label = document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x', (startX+endX)/2 );
      label.setAttribute('y', (startY+endY)/2 - 6);
      label.setAttribute('fill', '#334155'); label.setAttribute('font-size','12');
      const act = b.action===ACTIONS.JUMP ? 'Jump' :
                  b.action===ACTIONS.RESTART_CURRENT ? 'Restart Step' :
                  b.action===ACTIONS.RESTART_WORKFLOW ? 'Restart Flow' : 'Close';
      label.textContent = `${b.outcome || '(no label)'} • ${act}${b.action===ACTIONS.JUMP && b.next ? ` → ${b.next}`:''}`;
      viz.appendChild(label);
    });
  });
}

/***********************
 * 14) Cost roll-up
 ***********************/
function priceForStep(s){
  const cat = s.category || "";
  if (cat === 'Automation'){
    const stepsCount = Number(s.zapSteps||0);
    return stepsCount * zapStepRate;
  }
  if (cat === 'Forms'){
    const f = s.form || {};
    return (
      Number(f.questions||0)*Number(formRate.question||0) +
      Number(f.conditions||0)*Number(formRate.condition||0) +
      Number(f.pdfs||0)*Number(formRate.pdf||0) +
      Number(f.emails||0)*Number(formRate.email||0) +
      Number(f.signatures||0)*Number(formRate.signature||0) +
      Number(f.addons||0)*Number(formRate.addon||0)
    );
  }
  if (cat === 'Email Marketing Campaigns'){
    // $80 per “step” in the campaign; reuse zapSteps as the count field for symmetry
    const stepsCount = Number(s.zapSteps||0);
    return stepsCount * emailStepRate;
  }
  if (cat === 'Scheduler'){
    return Number(s.schedulerUnits||0) * schedulerRate;
  }
  if (cat === 'Other'){
    return Number(s.otherHours||0) * otherHourlyRate;
  }
  return 0;
}

function isApproved(s){
  // Approved = Status Do Now AND Responsible is Sphynx or Joint
  return (s.status === 'Do Now') && (s.responsible === 'Sphynx Team' || s.responsible === 'Joint');
}

function computeTotals(){
  // Resource totals remain as before
  let resourcesTotal = 0, hoursTotal = 0;
  topResources.forEach(r=>{
    const s = r.scope || {};
    if (s.includeInProposal){
      resourcesTotal += Number(s.price || 0);
      hoursTotal += Number(s.effortHours || 0);
    }
  });

  // Step-based totals
  let zapStepsTotal = 0;
  steps.forEach(s=>{ zapStepsTotal += Number(s.zapSteps || 0); });

  const automationsTotal = steps
    .filter(s=>s.category==='Automation')
    .reduce((sum,s)=> sum + priceForStep(s), 0);

  const formsTotal = steps.filter(s=>s.category==='Forms')
    .reduce((sum,s)=> sum + priceForStep(s), 0);

  const emailTotal = steps.filter(s=>s.category==='Email Marketing Campaigns')
    .reduce((sum,s)=> sum + priceForStep(s), 0);

  const schedulerTotal = steps.filter(s=>s.category==='Scheduler')
    .reduce((sum,s)=> sum + priceForStep(s), 0);

  const otherTotal = steps.filter(s=>s.category==='Other')
    .reduce((sum,s)=> sum + priceForStep(s), 0);

  const approvedTotal = steps.filter(isApproved).reduce((sum,s)=> sum + priceForStep(s), 0);

  const perStep = steps.map(s => ({
    name: s.name,
    category: s.category || '',
    price: priceForStep(s),
    zapSteps: Number(s.zapSteps||0)
  }));

  return {
    resourcesTotal, hoursTotal, zapStepsTotal, automationsTotal, formsTotal, emailTotal, schedulerTotal, otherTotal,
    approvedTotal,
    grandTotal: resourcesTotal + automationsTotal + formsTotal + emailTotal + schedulerTotal + otherTotal,
    perStep
  };
}

function renderRollup(){
  const box = rollupSummary; if (!box) return;
  const t = computeTotals();
  box.innerHTML = "";
  const mk = (lab, val) => {
    const row = document.createElement('div'); row.className='resrow';
    row.innerHTML = `<label>${lab}</label><div class="mini">${val}</div>`;
    box.appendChild(row);
  };
  mk('Resources Total', `$${t.resourcesTotal.toFixed(2)}`);
  mk('Automations Total', `$${t.automationsTotal.toFixed(2)}`);
  mk('Forms Total', `$${t.formsTotal.toFixed(2)}`);
  mk('Email Campaigns Total', `$${t.emailTotal.toFixed(2)}`);
  mk('Scheduler Total', `$${t.schedulerTotal.toFixed(2)}`);
  mk('Other Total', `$${t.otherTotal.toFixed(2)}`);
  mk('Approved (Do Now & Sphynx/Joint)', `$${t.approvedTotal.toFixed(2)}`);
  mk('Grand Total', `$${t.grandTotal.toFixed(2)}`);

  const det = document.createElement('details'); det.className='resource'; det.open=false;
  det.innerHTML = `<summary>Per Step Breakdown</summary>`;
  const inner = document.createElement('div');
  t.perStep.forEach(p=>{
    const row = document.createElement('div'); row.className='resrow';
    row.innerHTML = `<label>${p.name} (${p.category||'—'})</label><div class="mini">$${p.price.toFixed(2)}${p.zapSteps?` • ${p.zapSteps} zap steps`:''}</div>`;
    inner.appendChild(row);
  });
  det.appendChild(inner); box.appendChild(det);
}

/***********************
 * 15) Top-level inputs & buttons
 ***********************/
wfTitle && wfTitle.addEventListener('input', ()=>{ title = wfTitle.value; persist(); });
wfStarts && wfStarts.addEventListener('input', ()=>{ startsWhen = wfStarts.value; persist(); });
wfEnds && wfEnds.addEventListener('input', ()=>{ endsWhen = wfEnds.value; persist(); });
wfMilestones && wfMilestones.addEventListener('input', ()=>{
  const raw = wfMilestones.value; milestones = raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean); persist();
});

addStepBtn && addStepBtn.addEventListener('click', ()=>{
  const base = stepNameInput.value.trim() || "New Step";
  const name = uniqueName(base);
  steps.push({
    name,
    // outline
    stage: "",                    // Stage / Workflow Name
    category: "",                 // Automation | Forms | Email Marketing Campaigns | Scheduler | Other
    itemTitle: "",                // Item (Title)
    additionalDetails: "",        // Additional Details
    fieldsNote: "",               // Fields (free entry for now)
    docsNeeded: "", logins: "", references: "", testingChecklist: "",
    status: "Do Now",             // Do Now | Do Later | Don't Do | Done
    responsible: "Sphynx Team",   // Client | Sphynx Team | Joint
  
    // implementation
    assigneeType:'team',
    assignee:"",
    description:"",
    resources:[],
    branches: [],
  
    // apps + scoping
    app:"", appActionKey:"", appActionType:"",
    zapSteps: 0,
    // Needs Filter (explicit UI)
    const nfRow = document.createElement('div'); nfRow.className='rowline';
    const nfLbl = document.createElement('label'); nfLbl.textContent='Needs Filter'; nfLbl.className='small';
    const nfChk = document.createElement('input'); nfChk.type='checkbox';
    nfChk.checked = !!step.requiresFilter;
    nfChk.addEventListener('change', ()=>{
      step.requiresFilter = nfChk.checked;
      // If checked and zapSteps equals current base, add +1. If unchecked and looks like we just added it, subtract.
      // Safer: just recompute base
      const appObj = apps.find(a=>a.app===step.app);
      const acts = appObj ? appObj.actions : [];
      const pick = acts.find(x=>x.key===step.appActionKey);
      const base = pick ? 1 + ((step.requiresFilter || pick.requiresFilter) ? 1 : 0) : 0;
      step.zapSteps = base;
      persist(); renderRollup();
    });
    nfRow.appendChild(nfLbl); nfRow.appendChild(nfChk);
    metaWrap.appendChild(nfRow);
    
    // Auto-default for Calendly/ScheduleOnce triggers
    const autoNeedsFilter = ()=>{
      const appName = (step.app||"").toLowerCase();
      if (!appName) return false;
      if (appName.includes('calendly') || appName.includes('scheduleonce')) return (step.appActionType === 'trigger');
      return false;
    };
    if (step.app && step.appActionKey && step.appActionType){
      const aut = autoNeedsFilter();
      // Only auto-check if user hasn't overridden:
      if (step.requiresFilter !== true && step.requiresFilter !== false){
        step.requiresFilter = aut;
      }
      nfChk.checked = step.requiresFilter;
      const base = 1 + (step.requiresFilter ? 1 : 0);
      step.zapSteps = base;
    }
    
    // Forms component counts
    form: { questions:0, conditions:0, pdfs:0, emails:0, signatures:0, addons:0 },
  
    // Scheduler count unit
    schedulerUnits: 0,
  
    // Other hours
    otherHours: 0
  });

  stepNameInput.value = "";
  persist(); renderViz();
});

vizBtn && vizBtn.addEventListener('click', ()=>{
  const showViz = vizWrap.style.display==='none';
  vizWrap.style.display = showViz ? '' : 'none';
  cards.style.display = showViz ? 'none' : '';
  if (showViz) renderViz();
});

settingsBtn && settingsBtn.addEventListener('click', ()=>{
  const show = settingsPanel.style.display==='none';
  settingsPanel.style.display = show ? '' : 'none';
  zapRateInput.value = zapStepRate;
});
const emailStepRateInput = $('emailStepRateInput');
const schedulerRateInput = $('schedulerRateInput');
const otherHourlyRateInput = $('otherHourlyRateInput');

const formRateQuestionInput = $('formRateQuestionInput');
const formRateConditionInput = $('formRateConditionInput');
const formRatePdfInput = $('formRatePdfInput');
const formRateEmailInput = $('formRateEmailInput');
const formRateSignatureInput = $('formRateSignatureInput');
const formRateAddonInput = $('formRateAddonInput');

const clickupWebhookInput = $('clickupWebhookInput');
const exportScopingCsvBtn = $('exportScopingCsvBtn');
const sendToClickupBtn = $('sendToClickupBtn');

settingsBtn && settingsBtn.addEventListener('click', ()=>{
  const show = settingsPanel.style.display==='none';
  settingsPanel.style.display = show ? '' : 'none';
  zapRateInput.value = zapStepRate;
  emailStepRateInput.value = emailStepRate;
  schedulerRateInput.value = schedulerRate;
  otherHourlyRateInput.value = otherHourlyRate;
  formRateQuestionInput.value = formRate.question;
  formRateConditionInput.value = formRate.condition;
  formRatePdfInput.value = formRate.pdf;
  formRateEmailInput.value = formRate.email;
  formRateSignatureInput.value = formRate.signature;
  formRateAddonInput.value = formRate.addon;
  clickupWebhookInput.value = clickupWebhookUrl || "";
});

function numberFrom(input){ const v=Number(input.value||0); return Number.isFinite(v)?v:0; }

emailStepRateInput && emailStepRateInput.addEventListener('input', ()=>{ emailStepRate = numberFrom(emailStepRateInput); persist(); renderRollup(); });
schedulerRateInput && schedulerRateInput.addEventListener('input', ()=>{ schedulerRate = numberFrom(schedulerRateInput); persist(); renderRollup(); });
otherHourlyRateInput && otherHourlyRateInput.addEventListener('input', ()=>{ otherHourlyRate = numberFrom(otherHourlyRateInput); persist(); renderRollup(); });

formRateQuestionInput && formRateQuestionInput.addEventListener('input', ()=>{ formRate.question = numberFrom(formRateQuestionInput); persist(); renderRollup(); });
formRateConditionInput && formRateConditionInput.addEventListener('input', ()=>{ formRate.condition = numberFrom(formRateConditionInput); persist(); renderRollup(); });
formRatePdfInput && formRatePdfInput.addEventListener('input', ()=>{ formRate.pdf = numberFrom(formRatePdfInput); persist(); renderRollup(); });
formRateEmailInput && formRateEmailInput.addEventListener('input', ()=>{ formRate.email = numberFrom(formRateEmailInput); persist(); renderRollup(); });
formRateSignatureInput && formRateSignatureInput.addEventListener('input', ()=>{ formRate.signature = numberFrom(formRateSignatureInput); persist(); renderRollup(); });
formRateAddonInput && formRateAddonInput.addEventListener('input', ()=>{ formRate.addon = numberFrom(formRateAddonInput); persist(); renderRollup(); });

clickupWebhookInput && clickupWebhookInput.addEventListener('input', ()=>{ clickupWebhookUrl = clickupWebhookInput.value||""; persist(); });

zapRateInput && zapRateInput.addEventListener('input', ()=>{
  const v = Number(zapRateInput.value || 0);
  if (!Number.isNaN(v)) { zapStepRate = v; persist(); renderRollup(); }
});

exportBtn && exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(payload(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'workflow.json';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
});

importBtn && importBtn.addEventListener('click', ()=> importFile.click());
importFile && importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    setStateFromPayload(obj);
    importFile.value = "";
    persistImmediate();
  } catch (e) {
    statusErr.textContent = "Import failed: invalid JSON file.";
    statusErr.style.display = 'block';
    setTimeout(()=> statusErr.style.display='none', 3000);
  }
});

clearAllBtn && clearAllBtn.addEventListener('click', ()=>{
  if (confirm("Clear all steps and resources? This cannot be undone.")){
    steps = []; title=""; startsWhen=""; endsWhen=""; milestones=[]; assigneePool=[]; topResources=[];
    persist(); renderViz();
  }
});

filterAll && filterAll.addEventListener('click', ()=>{ whoFilter='all'; render(); renderViz(); });
filterTeam && filterTeam.addEventListener('click', ()=>{ whoFilter='team'; render(); renderViz(); });
filterAuto && filterAuto.addEventListener('click', ()=>{ whoFilter='auto'; render(); renderViz(); });

/***********************
 * 16) Jotform init + standalone fallback
 ***********************/
JFCustomWidget.subscribe("ready", function(formData){
  if (formData && typeof formData.value === 'string') loadFromValue(formData.value);
  setTab('library');
  render(); renderViz(); renderRollup();
  persist(); // debounced save to Jotform/Local
});

document.addEventListener('DOMContentLoaded', ()=>{
  // Fallback if not in Jotform
  setTab('library');
  render(); renderViz(); renderRollup();
});
