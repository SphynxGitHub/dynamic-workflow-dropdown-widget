/* ==========
   Sphynx Workflow Builder – app.js
   ========== */

// Helpers
const $ = (id)=> document.getElementById(id);
const show = (el, visible) => { el && (el.style.display = visible ? '' : 'none'); };
const sanitize = (s)=> (s||'').trim();
const newId = ()=> 'r_' + Math.random().toString(36).slice(2,10);

// Actions
const ACTIONS = { CLOSE:'close', RESTART_WORKFLOW:'restart_workflow', RESTART_CURRENT:'restart_current', JUMP:'jump' };

// State
let steps = []; // each step carries outline + impl + scoping fields
let assigneePool = [];
let title = "", startsWhen = "", endsWhen = "", milestones = [];
let topResources = []; // [{id,type,name,mode?,link?,fileName?,fileData?,email?,automation? }]
let apps = []; // [{app, actions:[{type,key,name,requiresFilter,notes}]}]

// Pricing defaults & settings
let zapStepRate = 80;
let emailStepRate = 80;
let schedulerRate = 125;
let otherHourlyRate = 300;
let formRate = { question:0, condition:0, pdf:0, email:0, signature:0, addon:0 };
let clickupWebhookUrl = "";

// Debounced persist
const debounce = (fn, ms=1000) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
const persist = debounce(persistImmediate, 1200);

// Payload helpers
function payload(){
  return {
    title, startsWhen, endsWhen, milestones,
    assigneePool,
    resources: topResources,
    steps,
    apps,
    zapStepRate, emailStepRate, schedulerRate, otherHourlyRate,
    formRate,
    clickupWebhookUrl
  };
}
function setStateFromPayload(obj){
  steps = Array.isArray(obj.steps) ? obj.steps : [];
  assigneePool = Array.isArray(obj.assigneePool) ? obj.assigneePool : [];
  title = obj.title || ""; startsWhen = obj.startsWhen || ""; endsWhen = obj.endsWhen || "";
  milestones = Array.isArray(obj.milestones) ? obj.milestones :
               obj.milestones ? String(obj.milestones).split(/[\n,]+/).map(s=>s.trim()).filter(Boolean) : [];
  topResources = Array.isArray(obj.resources) ? obj.resources : [];
  topResources.forEach(r=>{ if(!r.id) r.id=newId(); });

  apps = Array.isArray(obj.apps) ? obj.apps : [];
  if (typeof obj.zapStepRate === 'number') zapStepRate = obj.zapStepRate;
  if (typeof obj.emailStepRate === 'number') emailStepRate = obj.emailStepRate;
  if (typeof obj.schedulerRate === 'number') schedulerRate = obj.schedulerRate;
  if (typeof obj.otherHourlyRate === 'number') otherHourlyRate = obj.otherHourlyRate;
  if (obj.formRate) formRate = Object.assign(formRate, obj.formRate);
  if (typeof obj.clickupWebhookUrl === 'string') clickupWebhookUrl = obj.clickupWebhookUrl;
}

function persistImmediate(){
  const value = JSON.stringify(payload());
  try { JFCustomWidget.sendData({ value }); } catch(e){}
  renderAll();
  flashOk();
}

// Status UI
const statusOk = $('statusOk');
const statusErr = $('statusErr');
function flashOk(){ if(!statusOk) return; statusOk.style.display='block'; setTimeout(()=>statusOk.style.display='none', 800); }
function showErr(msg){ if(!statusErr) return; statusErr.textContent = msg; statusErr.style.display='block'; setTimeout(()=>statusErr.style.display='none', 2500); }

// Tabs
const tabBuilder = $('tabBuilder');
const tabLibrary = $('tabLibrary');
const tabApps = $('tabApps');
const tabSettings = $('tabSettings');

const paneBuilder = $('paneBuilder');
const paneLibrary = $('paneLibrary');
const paneApps = $('paneApps');
const paneSettings = $('paneSettings');

function activate(tab){
  [tabBuilder, tabLibrary, tabApps, tabSettings].forEach(b=> b.classList.remove('active'));
  tab.classList.add('active');
  show(paneBuilder, tab===tabBuilder);
  show(paneLibrary, tab===tabLibrary);
  show(paneApps, tab===tabApps);
  show(paneSettings, tab===tabSettings);
  if (tab===tabLibrary) renderRollup();
}
tabBuilder.addEventListener('click', ()=>activate(tabBuilder));
tabLibrary.addEventListener('click', ()=>activate(tabLibrary));
tabApps.addEventListener('click', ()=>activate(tabApps));
tabSettings.addEventListener('click', ()=>activate(tabSettings));

// DOM refs (Builder)
const wfTitle = $('wfTitle'), wfStarts=$('wfStarts'), wfEnds=$('wfEnds'), wfMilestones=$('wfMilestones');
const chips = $('assigneeChips'), assigneeInput=$('assigneeInput'), addAssigneeBtn=$('addAssigneeBtn');
const topResList=$('topResources'), topResType=$('topResType'), topResName=$('topResName'), topResBuilder=$('topResBuilder'), addTopResBtn=$('addTopRes');
const stepNameInput=$('stepNameInput'), addStepBtn=$('addStepBtn'), exportBtn=$('exportBtn'), clearAllBtn=$('clearAllBtn');
const cards=$('cards'), emptyState=$('emptyState'), importBtn=$('importBtn'), importFile=$('importFile');

// DOM refs (Library)
const libraryList=$('libraryList'); const libraryFilters=document.querySelectorAll('[data-libfilter]');
const rollupBox=$('rollupBox');

// DOM refs (Apps)
const appsCsvInput=$('appsCsvInput'); const clearAppsBtn=$('clearAppsBtn'); const appsPreview=$('appsPreview');

// DOM refs (Settings)
const zapRateInput=$('zapRateInput'), emailStepRateInput=$('emailStepRateInput'), schedulerRateInput=$('schedulerRateInput'), otherHourlyRateInput=$('otherHourlyRateInput');
const formRateQuestionInput=$('formRateQuestionInput'), formRateConditionInput=$('formRateConditionInput'),
      formRatePdfInput=$('formRatePdfInput'), formRateEmailInput=$('formRateEmailInput'),
      formRateSignatureInput=$('formRateSignatureInput'), formRateAddonInput=$('formRateAddonInput');
const clickupWebhookInput=$('clickupWebhookInput');
const exportScopingCsvBtn=$('exportScopingCsvBtn'); const sendToClickupBtn=$('sendToClickupBtn');

// ---------- Workflow info handlers ----------
wfTitle.addEventListener('input', ()=>{ title=wfTitle.value; persist(); });
wfStarts.addEventListener('input', ()=>{ startsWhen=wfStarts.value; persist(); });
wfEnds.addEventListener('input', ()=>{ endsWhen=wfEnds.value; persist(); });
wfMilestones.addEventListener('input', ()=>{ milestones = wfMilestones.value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean); persist(); });

// ---------- Assignee Pool ----------
function renderAssignees(){
  chips.innerHTML = "";
  assigneePool.forEach(name=>{
    const c = document.createElement('span'); c.className='chip';
    const txt=document.createElement('span'); txt.textContent=name;
    const x=document.createElement('button'); x.innerHTML='&times;'; x.title='Remove';
    x.addEventListener('click', ()=>{
      assigneePool = assigneePool.filter(a=>a!==name);
      steps.forEach(s=>{ if(s.assigneeType==='team' && s.assignee===name) s.assignee=""; });
      persist();
    });
    c.appendChild(txt); c.appendChild(x); chips.appendChild(c);
  });
}
addAssigneeBtn.addEventListener('click', ()=>{
  const n=sanitize(assigneeInput.value); if(!n) return;
  if (!assigneePool.includes(n)) assigneePool.push(n);
  assigneeInput.value=""; persist();
});
assigneeInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){e.preventDefault(); addAssigneeBtn.click();} });

// ---------- Resources (builders) ----------
function blankResource(type, name){
  const base = { id:newId(), type, name, mode:null, link:"", fileName:"", fileData:"" };
  if (type==='email') base.email={subject:"", body:"", to:"", from:"", conditions:""};
  if (type==='automation') base.automation={system:"", action:"", notes:""};
  return base;
}
function resourceSummary(r){
  if (!r) return "(empty)";
  const kind = r.type==='email' ? "Email" : r.type==='form' ? "Form" : r.type==='automation' ? "Automation" : "Other";
  return `${kind}: ${r.name || "(unnamed)"}`;
}
function fileToDataUrl(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); }); }

function builderForResource(container, r, onChange){
  container.innerHTML=""; const grid=document.createElement('div'); grid.className='resgrid';

  const rowName=document.createElement('div'); rowName.className='resrow';
  rowName.innerHTML = `<label>Name</label>`;
  const inpName=document.createElement('input'); inpName.type='text'; inpName.value=r.name||""; inpName.placeholder='Resource name';
  inpName.addEventListener('input', ()=>{ r.name = inpName.value; onChange(); });
  rowName.appendChild(inpName); grid.appendChild(rowName);

  const rowMode=document.createElement('div'); rowMode.className='resrow';
  const lblMode=document.createElement('label'); lblMode.textContent='Mode';
  const modeWrap=document.createElement('div'); modeWrap.style.display='flex'; modeWrap.style.gap='12px';
  const modeFields=document.createElement('div');

  function radio(label,val){
    const wrap=document.createElement('label'); wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='6px';
    const rd=document.createElement('input'); rd.type='radio'; rd.name=`mode_${r.id}`; rd.value=val; rd.checked=(r.mode===val);
    rd.addEventListener('change', ()=>{ r.mode=val; onChange(); renderModeFields(); });
    const sp=document.createElement('span'); sp.textContent=label;
    wrap.appendChild(rd); wrap.appendChild(sp); return wrap;
  }

  function renderModeFields(){
    modeFields.innerHTML="";
    if (r.type==='form' || r.type==='other'){
      if (!r.mode) r.mode = (r.type==='form') ? 'upload' : 'link';
      if (r.mode==='link'){
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>${r.type==='form'?'Form Link':'Link'}</label>`;
        const inL=document.createElement('input'); inL.type='text'; inL.placeholder='https://...'; inL.value=r.link||"";
        inL.addEventListener('input', ()=>{ r.link=inL.value; onChange(); });
        row.appendChild(inL); modeFields.appendChild(row);
      } else {
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>${r.type==='form'?'Upload PDF':'Upload File'}</label>`;
        const f=document.createElement('input'); f.type='file';
        if (r.type==='form') f.accept=".pdf,.doc,.docx,.png,.jpg,.jpeg";
        f.addEventListener('change', async ()=>{
          const file=f.files?.[0]; if(!file){ r.fileName=""; r.fileData=""; onChange(); return; }
          r.fileName=file.name; r.link=""; r.fileData=await fileToDataUrl(file); onChange();
        });
        const mini=document.createElement('div'); mini.className='mini'; mini.textContent=r.fileName?`Attached: ${r.fileName}`:'No file attached';
        row.appendChild(f); modeFields.appendChild(row); modeFields.appendChild(mini);
      }
    } else if (r.type==='email'){
      if (!r.mode) r.mode='input';
      if (r.mode==='upload'){
        const row=document.createElement('div'); row.className='resrow';
        row.innerHTML = `<label>Upload Template</label>`;
        const f=document.createElement('input'); f.type='file'; f.accept=".pdf,.html,.txt,.doc,.docx";
        f.addEventListener('change', async ()=>{
          const file=f.files?.[0]; if(!file){ r.fileName=""; r.fileData=""; onChange(); return; }
          r.fileName=file.name; r.fileData=await fileToDataUrl(file); onChange();
        });
        const mini=document.createElement('div'); mini.className='mini'; mini.textContent=r.fileName?`Attached: ${r.fileName}`:'No file attached';
        row.appendChild(f); modeFields.appendChild(row); modeFields.appendChild(mini);
      } else {
        const mk = (lab, key, ph='')=>{
          const row=document.createElement('div'); row.className='resrow';
          row.innerHTML = `<label>${lab}</label>`;
          const input=document.createElement(key==='body'?'textarea':'input'); if (key!=='body') input.type='text';
          input.placeholder=ph; input.value=(r.email?.[key])||"";
          input.addEventListener('input', ()=>{ r.email=r.email||{}; r.email[key]=input.value; onChange(); });
          row.appendChild(input); modeFields.appendChild(row);
        };
        mk('Subject','subject','Subject line'); mk('Body','body','Email body...'); mk('To','to','email@example.com');
        mk('From','from','noreply@example.com'); mk('Conditions','conditions','e.g., VIP logic');
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
      mk('System','system','Zapier / Make / Flow'); mk('Action','action','Create Task, Update Record'); mk('Notes','notes','Params, conditions...');
    }
  }

  if (r.type!=='automation'){
    rowMode.appendChild(lblMode);
    if (r.type==='form'){ modeWrap.appendChild(radio('Upload file','upload')); modeWrap.appendChild(radio('Link to form','link')); }
    if (r.type==='email'){ modeWrap.appendChild(radio('Upload email template','upload')); modeWrap.appendChild(radio('Input email template','input')); }
    if (r.type==='other'){ modeWrap.appendChild(radio('Upload file','upload')); modeWrap.appendChild(radio('Link','link')); }
    rowMode.appendChild(modeWrap); grid.appendChild(rowMode);
  }

  grid.appendChild(modeFields); container.appendChild(grid);
  renderModeFields();
}

function renderResourceList(listEl, arr, onChange){
  listEl.innerHTML = "";
  if (!arr.length){ const empty=document.createElement('div'); empty.className='mini'; empty.textContent='No resources yet.'; listEl.appendChild(empty); return; }
  arr.forEach((r, idx)=>{
    const det=document.createElement('details'); det.className='resource';
    const sum=document.createElement('summary'); sum.textContent = resourceSummary(r);
    const del=document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.style.marginLeft='8px';
    del.addEventListener('click', (e)=>{ e.preventDefault(); arr.splice(idx,1); onChange(); });
    sum.appendChild(del); det.appendChild(sum);
    const inner=document.createElement('div'); builderForResource(inner, r, onChange); det.appendChild(inner);
    listEl.appendChild(det);
  });
}
function renderTopResources(){ renderResourceList(topResList, topResources, persist); }
function renderTopBuilder(){
  const type=topResType.value; const name=sanitize(topResName.value);
  topResBuilder.innerHTML=""; const temp=blankResource(type, name||"");
  builderForResource(topResBuilder, temp, ()=>{});
  topResBuilder._tempResource = temp;
}
topResType.addEventListener('change', renderTopBuilder);
topResName.addEventListener('input', renderTopBuilder);
addTopResBtn.addEventListener('click', ()=>{
  const t=topResType.value; const n=sanitize(topResName.value);
  if (!n) return showErr("Resource name is required.");
  const r = topResBuilder._tempResource || blankResource(t,n); r.name=n; if(!r.id) r.id=newId();
  topResources.push(r); topResName.value=""; renderTopBuilder(); persist();
});

// ---------- Step helpers ----------
function allStepNames(){ return steps.map(s=>s.name); }
function jumpTargets(selfName){ return allStepNames().filter(n => n.toLowerCase()!==String(selfName||'').toLowerCase()); }
function hasName(n){ return steps.some(s=>s.name.toLowerCase()===(n||'').toLowerCase()); }
function uniqueName(base){ let n=(base||'').trim()||'Untitled Step'; if(!hasName(n)) return n; let i=2; while(hasName(`${n} ${i}`)) i++; return `${n} ${i}`; }
function renameStepGlobally(oldName,newName){ steps.forEach(s=>s.branches.forEach(b=>{ if(b.action===ACTIONS.JUMP && b.next===oldName) b.next=newName; })); }
function deleteStepGlobally(name){
  steps = steps.filter(s=>s.name!==name);
  steps.forEach(s=>s.branches.forEach(b=>{ if(b.action===ACTIONS.JUMP && b.next===name){ b.action=ACTIONS.CLOSE; b.next=null; } }));
}

// ---------- Apps (CSV import) ----------
appsCsvInput.addEventListener('change', async ()=>{
  const file=appsCsvInput.files?.[0]; if(!file) return;
  const text=await file.text();
  const rows = parseCsv(text);
  // normalize: expect columns app,type,name,(optional key,notes,requiresFilter)
  const hdr = rows.shift().map(h=>h.trim().toLowerCase());
  const ix = (n)=> hdr.indexOf(n);
  const idxApp = firstIndex(hdr, ['app','application','system','integration','product']);
  const idxType= firstIndex(hdr, ['type','event type','kind','category']);
  const idxName= firstIndex(hdr, ['name','event','action name','label','title']);
  const idxKey = firstIndex(hdr, ['key','slug','id','event key','action key']);
  const idxNotes= firstIndex(hdr, ['notes','note','comment','comments','description','desc','important notes']);
  const idxReqF = firstIndex(hdr, ['requiresfilter','needsfilter']);
  const temp = {};
  rows.forEach(r=>{
    const app = (r[idxApp]||'').trim(); if(!app) return;
    const type=(r[idxType]||'').toLowerCase();
    const name=(r[idxName]||'').trim();
    const key = (idxKey>=0 ? (r[idxKey]||'').trim() : slug(name));
    const notes=(idxNotes>=0 ? (r[idxNotes]||'').trim() : '');
    const requiresFilter = idxReqF>=0 ? String(r[idxReqF]).toLowerCase().startsWith('t') : false;
    if (!temp[app]) temp[app]=[];
    temp[app].push({ type: normType(type), key, name, requiresFilter, notes });
  });
  apps = Object.keys(temp).sort().map(a=>({ app:a, actions: temp[a].sort((x,y)=> (x.type+y.name).localeCompare(y.type+y.name)) }));
  appsPreview.textContent = `Loaded ${apps.length} app(s).`;
  persistImmediate();
});
clearAppsBtn.addEventListener('click', ()=>{ apps=[]; appsPreview.textContent='(empty)'; persist(); });
function normType(x){ if(/trigger/i.test(x)) return 'trigger'; if(/action/i.test(x)) return 'action'; if(/search/i.test(x)) return 'search'; if(/event/i.test(x)) return 'event'; return x; }
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'item'; }
function firstIndex(hdr, arr){ for(const a of arr){ const i=hdr.indexOf(a); if(i>=0) return i; } return -1; }
function parseCsv(text){
  // simple CSV parser good enough for our columns
  const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
  return lines.map(line=>{
    const out=[]; let cur='', q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if (ch==='"' ){ if (q && line[i+1]==='"'){ cur+='"'; i++; } else { q=!q; } }
      else if (ch===',' && !q){ out.push(cur); cur=''; }
      else cur+=ch;
    }
    out.push(cur); return out;
  });
}

// ---------- Pricing ----------
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
function isApproved(s){ return (s.status === 'Do Now') && (s.responsible === 'Sphynx Team' || s.responsible === 'Joint'); }
function computeTotals(){
  let resourcesTotal=0, hoursTotal=0;
  topResources.forEach(r=>{ const s=r.scope||{}; if (s.includeInProposal) { resourcesTotal += Number(s.price||0); hoursTotal += Number(s.effortHours||0); }});
  let zapStepsTotal = steps.reduce((sum,s)=> sum + Number(s.zapSteps||0), 0);
  const automationsTotal = steps.filter(s=>s.category==='Automation').reduce((sum,s)=> sum+priceForStep(s),0);
  const formsTotal = steps.filter(s=>s.category==='Forms').reduce((sum,s)=> sum+priceForStep(s),0);
  const emailTotal = steps.filter(s=>s.category==='Email Marketing Campaigns').reduce((sum,s)=> sum+priceForStep(s),0);
  const schedulerTotal = steps.filter(s=>s.category==='Scheduler').reduce((sum,s)=> sum+priceForStep(s),0);
  const otherTotal = steps.filter(s=>s.category==='Other').reduce((sum,s)=> sum+priceForStep(s),0);
  const approvedTotal = steps.filter(isApproved).reduce((sum,s)=> sum+priceForStep(s),0);
  const perStep = steps.map(s=>({ name:s.name, category:s.category||'', price:priceForStep(s), zapSteps:Number(s.zapSteps||0) }));
  return {
    resourcesTotal, hoursTotal, zapStepsTotal, automationsTotal, formsTotal, emailTotal, schedulerTotal, otherTotal,
    approvedTotal, grandTotal: resourcesTotal+automationsTotal+formsTotal+emailTotal+schedulerTotal+otherTotal, perStep
  };
}

// === Scoping rows (CSV / webhook) ===
function scopingRows(){
  return steps.map(s => ({
    stage: s.stage || "",
    workflowName: title || "",
    stepName: s.name || "",
    notes: s.description || "",
    category: s.category || "",
    itemTitle: s.itemTitle || "",
    app: s.app || "",
    type: s.appActionType || "",
    event: s.appActionKey || "",
    additionalDetails: s.additionalDetails || "",
    fields: s.fieldsNote || "",
    documentsNeeded: s.docsNeeded || "",
    logins: s.logins || "",
    references: s.references || "",
    testingChecklist: s.testingChecklist || "",
    status: s.status || "",
    responsible: s.responsible || "",
    price: priceForStep(s),
  }));
}

// ---------- Render Steps ----------
function renderSteps(){
  if (!steps.length){ cards.innerHTML=""; emptyState.style.display=""; return; }
  emptyState.style.display="none"; cards.innerHTML="";

  steps.forEach((step, idx)=>{
    const card=document.createElement('div'); card.className='card';

    // header with name + trash
    const header=document.createElement('header');
    const titleInput=document.createElement('input'); titleInput.value=step.name; titleInput.placeholder="Step name";
    titleInput.addEventListener('change', ()=>{
      const next=uniqueName(titleInput.value);
      if (next!==step.name){ const old=step.name; step.name=next; renameStepGlobally(old,next); persist(); }
      else { step.name=next; persist(); }
    });
    const delBtn=document.createElement('button');
    delBtn.className='iconbtn red'; delBtn.title='Delete Step'; delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline>
           <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
           <path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>`;
    delBtn.addEventListener('click', ()=>{
      if (confirm(`Delete "${step.name}"? Branches pointing here will switch to Close Workflow.`)){ deleteStepGlobally(step.name); persist(); }
    });
    header.appendChild(titleInput); header.appendChild(delBtn); card.appendChild(header);

    // meta container
    const metaWrap=document.createElement('div'); metaWrap.className='meta';

    // Assignee Type
    const atRow=mkRow('Assignee Type'); const atSel=document.createElement('select');
    [{v:'team',label:'Team Member'},{v:'automated',label:'Automated'}].forEach(o=>{ const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.label; atSel.appendChild(opt); });
    step.assigneeType = step.assigneeType || 'team'; atSel.value=step.assigneeType;
    atSel.addEventListener('change', ()=>{ step.assigneeType=atSel.value; if(step.assigneeType!=='team') step.assignee=""; persist(); renderAll(); });
    atRow.appendChild(atSel); metaWrap.appendChild(atRow);

    // Assignee
    const anRow=mkRow('Assignee');
    if (step.assigneeType==='team'){
      const nameSel=document.createElement('select'); nameSel.innerHTML=`<option value="">Select a team member…</option>`;
      assigneePool.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; nameSel.appendChild(o); });
      if(!assigneePool.includes(step.assignee)) step.assignee="";
      nameSel.value = step.assignee||""; nameSel.addEventListener('change', ()=>{ step.assignee = nameSel.value||""; persist(); });
      anRow.appendChild(nameSel);
    } else {
      const info=document.createElement('div'); info.textContent="Automated"; info.style.color="#475569"; anRow.appendChild(info);
    }
    metaWrap.appendChild(anRow);

    // Outline fields
    metaWrap.appendChild(textRow('Stage / Workflow Name','stage', step, 'e.g., Discovery'));
    metaWrap.appendChild(selectRow('Category','category', step, ["","Automation","Forms","Email Marketing Campaigns","Scheduler","Other"], ()=>{ persist(); renderAll(); }));
    metaWrap.appendChild(textRow('Item (Title)','itemTitle', step, 'Human-readable item name'));
    metaWrap.appendChild(textareaRow('Additional Details','additionalDetails', step));
    metaWrap.appendChild(textareaRow('Fields (free entry)','fieldsNote', step));
    metaWrap.appendChild(textareaRow('Documents Needed','docsNeeded', step));
    metaWrap.appendChild(textareaRow('Logins','logins', step));
    metaWrap.appendChild(textareaRow('References','references', step));
    metaWrap.appendChild(textareaRow('Testing Checklist','testingChecklist', step));

    // Status + Responsible
    metaWrap.appendChild(selectRow('Status','status', step, ['Do Now','Do Later',"Don't Do",'Done'], ()=>{ persist(); renderRollup(); }));
    metaWrap.appendChild(selectRow('Responsible','responsible', step, ['Client','Sphynx Team','Joint'], ()=>{ persist(); renderRollup(); }));

    // Category-specific inputs
    if (step.category === 'Forms'){
      step.form = step.form || { questions:0, conditions:0, pdfs:0, emails:0, signatures:0, addons:0 };
      metaWrap.appendChild(numberRow('# Questions', step.form, 'questions'));
      metaWrap.appendChild(numberRow('# Conditions', step.form, 'conditions'));
      metaWrap.appendChild(numberRow('# PDFs', step.form, 'pdfs'));
      metaWrap.appendChild(numberRow('# Emails', step.form, 'emails'));
      metaWrap.appendChild(numberRow('# Signatures', step.form, 'signatures'));
      metaWrap.appendChild(numberRow('# Add-ons', step.form, 'addons'));
    }
    if (step.category==='Scheduler'){
      metaWrap.appendChild(numberRow('Units (page | event | team member)', step, 'schedulerUnits'));
    }
    if (step.category==='Other'){
      metaWrap.appendChild(numberRow('Estimated Hours', step, 'otherHours', 0.25));
    }

    // App + Event (from apps library)
    const appRow=mkRow('App'); const appSel=document.createElement('select');
    appSel.innerHTML = `<option value="">(none)</option>` + apps.map(a=>`<option value="${a.app}">${a.app}</option>`).join('');
    appSel.value = step.app || ""; appSel.addEventListener('change', ()=>{ step.app=appSel.value||""; step.appActionKey=""; step.appActionType=""; refreshAction(); });
    appRow.appendChild(appSel); metaWrap.appendChild(appRow);

    const actRow=mkRow('Type / Event'); const typeSel=document.createElement('select'); const evSel=document.createElement('select');
    typeSel.innerHTML = `<option value="">(type)</option><option value="trigger">Trigger</option><option value="action">Action</option><option value="search">Search</option>`;
    typeSel.value = step.appActionType || ""; evSel.innerHTML=`<option value="">(event)</option>`;
    function refreshAction(){
      const appObj = apps.find(a=>a.app===step.app);
      const acts = appObj ? appObj.actions.filter(x=>!typeSel.value || x.type===typeSel.value) : [];
      evSel.innerHTML = `<option value="">(event)</option>` + acts.map(x=>`<option value="${x.key}">${x.name}</option>`).join('');
      // defaults for Calendly/ScheduleOnce triggers
      const autNeeds = autoNeedsFilter(step.app, typeSel.value);
      if (step.requiresFilter === undefined) step.requiresFilter = autNeeds;
      // zap steps base = 1 (+1 if needs filter)
      step.zapSteps = typeSel.value ? (1 + (step.requiresFilter?1:0)) : 0;
      persist();
    }
    typeSel.addEventListener('change', ()=>{ step.appActionType=typeSel.value||""; step.appActionKey=""; refreshAction(); });
    evSel.addEventListener('change', ()=>{ step.appActionKey=evSel.value||""; persist(); });

    actRow.appendChild(typeSel); actRow.appendChild(evSel); metaWrap.appendChild(actRow);

    // Needs Filter
    const nfRow=mkRow('Needs Filter'); const nfChk=document.createElement('input'); nfChk.type='checkbox';
    nfChk.checked = !!step.requiresFilter;
    nfChk.addEventListener('change', ()=>{
      step.requiresFilter = nfChk.checked;
      step.zapSteps = step.appActionType ? (1 + (step.requiresFilter?1:0)) : 0;
      persist(); renderRollup();
    });
    nfRow.appendChild(nfChk); metaWrap.appendChild(nfRow);

    // Description
    metaWrap.appendChild(textareaRow('Description', 'description', step));

    // Outcomes
    const rowsWrap=document.createElement('div');
    (step.branches||[]).forEach((branch, bIdx)=>{
      const row=document.createElement('div'); row.className='row';
      const outcomeInput=document.createElement('input'); outcomeInput.type='text'; outcomeInput.placeholder='Outcome (e.g., Yes / No / Retry)';
      outcomeInput.value=branch.outcome||""; outcomeInput.addEventListener('input', ()=>{ branch.outcome=outcomeInput.value; persist(); });
      const thenLbl=document.createElement('label'); thenLbl.textContent='Then:'; thenLbl.style.fontSize='12px'; thenLbl.style.color='#475569';
      const actionSelect=document.createElement('select');
      [{v:'close',label:'Close Workflow'},{v:'restart_workflow',label:'Restart Workflow'},{v:'restart_current',label:'Restart Current Step'},{v:'jump',label:'Jump to Step'}]
        .forEach(o=>{const opt=document.createElement('option'); opt.value=o.v; opt.textContent=o.label; actionSelect.appendChild(opt);});
      actionSelect.value = branch.action || 'close';
      const jumpWrap=document.createElement('div'); jumpWrap.style.display='contents';
      function renderJump(){
        jumpWrap.innerHTML=""; if (actionSelect.value!=='jump') return;
        const lbl=document.createElement('label'); lbl.textContent='Step:'; lbl.style.fontSize='12px'; lbl.style.color='#475569';
        const input=document.createElement('input'); input.setAttribute('list',`dl-${idx}-${bIdx}`); input.placeholder='Type or select a step'; input.value=branch.next||"";
        const dl=document.createElement('datalist'); dl.id=`dl-${idx}-${bIdx}`;
        jumpTargets(step.name).forEach(n=>{ const o=document.createElement('option'); o.value=n; dl.appendChild(o); });
        input.addEventListener('input', ()=>{ branch.next = sanitize(input.value)||null; persist(); });
        const line=document.createElement('div'); line.className='row'; line.appendChild(lbl); line.appendChild(input); line.appendChild(dl); jumpWrap.appendChild(line);
      }
      actionSelect.addEventListener('change', ()=>{ branch.action=actionSelect.value; if(branch.action!=='jump') branch.next=null; persist(); renderJump(); });
      const delOutcomeBtn=document.createElement('button'); delOutcomeBtn.className='btn'; delOutcomeBtn.textContent='Delete';
      delOutcomeBtn.addEventListener('click', ()=>{ step.branches.splice(bIdx,1); persist(); });
      row.appendChild(outcomeInput); row.appendChild(thenLbl); row.appendChild(actionSelect); row.appendChild(delOutcomeBtn);
      rowsWrap.appendChild(row); rowsWrap.appendChild(jumpWrap); renderJump();
    });
    const addOutcomeRow=document.createElement('div'); addOutcomeRow.className='row'; addOutcomeRow.style.justifyContent='flex-end';
    const addOutcomeBtn=document.createElement('button'); addOutcomeBtn.className='btn'; addOutcomeBtn.textContent='Add Outcome';
    addOutcomeBtn.addEventListener('click', ()=>{ step.branches = step.branches||[]; step.branches.push({outcome:"",action:'close',next:null}); persist(); });
    addOutcomeRow.appendChild(addOutcomeBtn);

    // Map preview
    const map=document.createElement('div'); map.className='mapline'; map.textContent=prettyMap(step);

    card.appendChild(metaWrap);
    const tag=document.createElement('div'); tag.className='tag'; tag.textContent=`Step ${idx+1}`; card.appendChild(tag);
    card.appendChild(document.createElement('div')).className='divider';
    card.appendChild(rowsWrap); card.appendChild(addOutcomeRow); card.appendChild(map);
    cards.appendChild(card);

    // helpers inside render
    function mkRow(label){ const r=document.createElement('div'); r.className='rowline'; const l=document.createElement('label'); l.textContent=label; l.className='small'; r.appendChild(l); return r; }
    function textRow(label,key,obj,ph=''){ const r=mkRow(label); const i=document.createElement('input'); i.type='text'; i.value=obj[key]||""; i.placeholder=ph; i.addEventListener('input', ()=>{ obj[key]=i.value; persist(); }); r.appendChild(i); return r; }
    function textareaRow(label,key,obj){ const r=mkRow(label); const t=document.createElement('textarea'); t.value=obj[key]||""; t.addEventListener('input', ()=>{ obj[key]=t.value; persist(); }); r.appendChild(t); return r; }
    function selectRow(label,key,obj,options,onchange){ const r=mkRow(label); const s=document.createElement('select'); options.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent = v||'(none)'; s.appendChild(o);}); s.value=obj[key]||""; s.addEventListener('change', ()=>{ obj[key]=s.value; onchange && onchange(); }); r.appendChild(s); return r; }
    function numberRow(label,obj,key,step=1){ const r=mkRow(label); const i=document.createElement('input'); i.type='number'; i.min='0'; i.step=String(step); i.value=Number(obj[key]||0); i.addEventListener('input', ()=>{ obj[key]=Number(i.value||0); persist(); renderRollup(); }); r.appendChild(i); return r; }
  });
}
function prettyMap(step){
  const who = step.assigneeType==='team' ? (step.assignee||'(unassigned)') : 'Automated';
  const head = `Assigned to: ${who}`;
  if (!step.branches || !step.branches.length) return head + '\nNo outcomes defined yet.';
  const lines = step.branches.map(b=>{
    const out=(b.outcome||'(no label)');
    if (b.action==='close') return `• ${out} → Close Workflow`;
    if (b.action==='restart_workflow') return `• ${out} → Restart Workflow`;
    if (b.action==='restart_current') return `• ${out} → Restart Current Step`;
    if (b.action==='jump') return `• ${out} → Jump to Step ${b.next || "(unset)"}`;
    return `• ${out} → (?)`;
  });
  return [head, ...lines].join('\n');
}
function autoNeedsFilter(appName, type){
  const a=(appName||'').toLowerCase();
  if (!a) return false;
  if ((a.includes('calendly') || a.includes('scheduleonce')) && type==='trigger') return true;
  return false;
}

// ---------- Library & Rollup ----------
libraryFilters.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    libraryFilters.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderLibrary(btn.getAttribute('data-libfilter')||'');
  });
});
function renderLibrary(filter){
  const arr = topResources.filter(r=> !filter || r.type===filter);
  const list = document.createElement('div');
  arr.forEach(r=>{
    const det=document.createElement('details'); det.className='resource';
    const sum=document.createElement('summary'); sum.textContent = resourceSummary(r);
    det.appendChild(sum);
    const inner=document.createElement('div'); builderForResource(inner, r, persist); det.appendChild(inner);
    list.appendChild(det);
  });
  libraryList.innerHTML=""; libraryList.appendChild(list);
}
function renderRollup(){
  if (!rollupBox) return;
  const t = computeTotals(); rollupBox.innerHTML="";
  const mk = (lab, val) => { const row=document.createElement('div'); row.className='resrow'; row.innerHTML=`<label>${lab}</label><div class="mini">${val}</div>`; rollupBox.appendChild(row); };
  mk('Resources Total', `$${t.resourcesTotal.toFixed(2)}`);
  mk('Automations Total', `$${t.automationsTotal.toFixed(2)}`);
  mk('Forms Total', `$${t.formsTotal.toFixed(2)}`);
  mk('Email Campaigns Total', `$${t.emailTotal.toFixed(2)}`);
  mk('Scheduler Total', `$${t.schedulerTotal.toFixed(2)}`);
  mk('Other Total', `$${t.otherTotal.toFixed(2)}`);
  mk('Approved (Do Now & Sphynx/Joint)', `$${t.approvedTotal.toFixed(2)}`);
  mk('Grand Total', `$${t.grandTotal.toFixed(2)}`);
  const det=document.createElement('details'); det.className='resource'; det.innerHTML='<summary>Per Step Breakdown</summary>';
  const inner=document.createElement('div');
  t.perStep.forEach(p=>{ const row=document.createElement('div'); row.className='resrow'; row.innerHTML=`<label>${p.name} (${p.category||'—'})</label><div class="mini">$${p.price.toFixed(2)}${p.zapSteps?` • ${p.zapSteps} zap steps`:''}</div>`; inner.appendChild(row); });
  det.appendChild(inner); rollupBox.appendChild(det);
}

// ---------- Toolbar ----------
addStepBtn.addEventListener('click', ()=>{
  const base = sanitize(stepNameInput.value) || "New Step";
  const name = uniqueName(base);
  steps.push({
    name,
    // outline
    stage:"", category:"", itemTitle:"", additionalDetails:"", fieldsNote:"", docsNeeded:"", logins:"", references:"", testingChecklist:"",
    status:'Do Now', responsible:'Sphynx Team',
    // impl
    assigneeType:'team', assignee:"", description:"", resources:[], branches:[],
    // apps + scoping
    app:"", appActionKey:"", appActionType:"", zapSteps:0, requiresFilter: undefined,
    form:{questions:0,conditions:0,pdfs:0,emails:0,signatures:0,addons:0},
    schedulerUnits:0, otherHours:0
  });
  stepNameInput.value=""; persist();
});
exportBtn.addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(payload(), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='workflow.json';
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
});
clearAllBtn.addEventListener('click', ()=>{
  if (!confirm('Clear everything?')) return;
  steps=[]; title=""; startsWhen=""; endsWhen=""; milestones=[]; assigneePool=[]; topResources=[]; apps=[];
  persist();
});
importBtn.addEventListener('click', ()=> importFile.click());
importFile.addEventListener('change', async ()=>{
  const file=importFile.files?.[0]; if(!file) return;
  try{
    const obj = JSON.parse(await file.text()); setStateFromPayload(obj); importFile.value=""; persistImmediate();
  }catch(e){ showErr('Import failed: invalid JSON'); }
});

// ---------- Settings bindings ----------
function numberFrom(input){ const v=Number(input.value||0); return Number.isFinite(v)?v:0; }
tabSettings.addEventListener('click', ()=>{
  zapRateInput.value=zapStepRate; emailStepRateInput.value=emailStepRate; schedulerRateInput.value=schedulerRate; otherHourlyRateInput.value=otherHourlyRate;
  formRateQuestionInput.value=formRate.question; formRateConditionInput.value=formRate.condition; formRatePdfInput.value=formRate.pdf;
  formRateEmailInput.value=formRate.email; formRateSignatureInput.value=formRate.signature; formRateAddonInput.value=formRate.addon;
  clickupWebhookInput.value=clickupWebhookUrl||"";
});
zapRateInput.addEventListener('input', ()=>{ zapStepRate=numberFrom(zapRateInput); persist(); renderRollup(); });
emailStepRateInput.addEventListener('input', ()=>{ emailStepRate=numberFrom(emailStepRateInput); persist(); renderRollup(); });
schedulerRateInput.addEventListener('input', ()=>{ schedulerRate=numberFrom(schedulerRateInput); persist(); renderRollup(); });
otherHourlyRateInput.addEventListener('input', ()=>{ otherHourlyRate=numberFrom(otherHourlyRateInput); persist(); renderRollup(); });
formRateQuestionInput.addEventListener('input', ()=>{ formRate.question=numberFrom(formRateQuestionInput); persist(); renderRollup(); });
formRateConditionInput.addEventListener('input', ()=>{ formRate.condition=numberFrom(formRateConditionInput); persist(); renderRollup(); });
formRatePdfInput.addEventListener('input', ()=>{ formRate.pdf=numberFrom(formRatePdfInput); persist(); renderRollup(); });
formRateEmailInput.addEventListener('input', ()=>{ formRate.email=numberFrom(formRateEmailInput); persist(); renderRollup(); });
formRateSignatureInput.addEventListener('input', ()=>{ formRate.signature=numberFrom(formRateSignatureInput); persist(); renderRollup(); });
formRateAddonInput.addEventListener('input', ()=>{ formRate.addon=numberFrom(formRateAddonInput); persist(); renderRollup(); });
clickupWebhookInput.addEventListener('input', ()=>{ clickupWebhookUrl=clickupWebhookInput.value||""; persist(); });

// Scoping CSV + ClickUp webhook
exportScopingCsvBtn.addEventListener('click', ()=>{
  const rows=scopingRows(); const headers=Object.keys(rows[0]||{placeholder:''});
  const csv=[headers.join(',')].concat(rows.map(r=> headers.map(h=> `"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))).join('\n');
  const blob=new Blob([csv], {type:'text/csv'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='scoping.csv'; document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(url); a.remove();},0);
});
sendToClickupBtn.addEventListener('click', async ()=>{
  if (!clickupWebhookUrl){ showErr('Set ClickUp Webhook URL in Settings.'); return; }
  const approved = steps.filter(isApproved).map(s => ({
    name: s.name, stage: s.stage, category: s.category, itemTitle: s.itemTitle,
    app: s.app, type: s.appActionType, event: s.appActionKey,
    details: s.additionalDetails, price: priceForStep(s), responsible: s.responsible
  }));
  try{
    await fetch(clickupWebhookUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ workflow:title, approved }) });
    flashOk();
  }catch(e){ showErr('Webhook failed. Check CORS/URL.'); }
});

// ---------- Library filter init ----------
renderLibrary('');

// ---------- Render everything ----------
function renderAll(){
  // top-level reflect
  wfTitle.value=title; wfStarts.value=startsWhen; wfEnds.value=endsWhen; wfMilestones.value=(milestones||[]).join('\n');
  renderAssignees(); renderTopResources(); renderTopBuilder(); renderSteps(); if (paneLibrary.style.display!=='none') renderRollup();
}

// ---------- Jotform integration ----------
try{
  JFCustomWidget.subscribe("ready", function(formData){
    if (formData && typeof formData.value === 'string'){ try{ setStateFromPayload(JSON.parse(formData.value)); }catch(e){} }
    renderAll(); persistImmediate();
  });
  JFCustomWidget.subscribe("submit", function(){
    // minimal validation
    const names = steps.map(s=>s.name.trim()).filter(Boolean);
    const dup = names.find((n,i)=> names.indexOf(n)!==i);
    const value = JSON.stringify(payload());
    if (!names.length){ showErr('Add at least one step.'); JFCustomWidget.sendSubmit({valid:false, value}); return; }
    if (dup){ showErr('Step names must be unique.'); JFCustomWidget.sendSubmit({valid:false, value}); return; }
    JFCustomWidget.sendSubmit({valid:true, value});
  });
}catch(e){ /* running standalone */ }

// Initial
renderAll();
