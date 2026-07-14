/* Cohotrack Gradebook v1 — static Cloudflare UI, data stored through /api/gradebook */
const RUBRICS = window.COHOTRACK_RUBRICS || [];

const DIMENSIONS = [
  "Professional Development","ACEs","Shop","Math",
  "Safety Certifications","Physical Fitness","Service Learning & Speed Mentoring"
];

const ACE_STATIONS = [
  {key:"wheelbarrow",label:"Wheelbarrow",time:"16 min",goal:"24 trips totaling 200 ft with 3 sandbags (60 lb each) per trip; proper technique; no tipping or dropping."},
  {key:"blockCarry",label:"Block Carry",time:"8 min",goal:"Move and correctly stack 45 concrete blocks over 30 ft, centered on the pallet, without damage."},
  {key:"brickStation",label:"Brick Station",time:"16 min",goal:"Move and correctly stack 285 bricks over 30 ft using brick tongs; centered, square, and undamaged."},
  {key:"plywood",label:"Plywood",time:"3 min",goal:"Move 5 sheets of 3/4-inch CDX plywood 30 ft and return using proper lifting; no shoulder carry."},
  {key:"lumberCarry",label:"Lumber Carry",time:"3 min",goal:"Move 8 2x4s and 8 2x6s 30 ft and return using a hip carry and neat stacks."},
  {key:"rebarCarry",label:"Rebar Carry",time:"16 min",goal:"Complete 30 trips of 100 ft using a shoulder carry and tire elevators."},
  {key:"grading",label:"Grading",time:"16 min",goal:"Move 1/2 yard of sand 35 ft, dump, screed level, and clean the area."},
  {key:"ladder",label:"Ladder",time:"2 min",goal:"Move, erect, and climb a ladder 5 times over 30 ft with OSHA-compliant setup and three-point contact."},
  {key:"rebarTie",label:"Rebar Tie",time:"2 min",goal:"Complete 12 tight, unbroken ties: 8 snap and 4 saddle, pulling wire from the reel."},
  {key:"drywallScrews",label:"Drywall Screws",time:"2 min",goal:"Set 16 screws flush with a clean dimple; no torn paper, cracking, protruding, or overdriven screws."},
  {key:"nailing",label:"Nailing",time:"2 min",goal:"Drive 10 16d and 8 8d sinkers flush. Bent nails do not count."},
  {key:"measuring",label:"Measuring",time:"2 min",goal:"At least 20 of 24 measurements correct within ±1/16 inch, upright and upside down."},
  {key:"mileRun",label:"Mile Run",time:"10 min",goal:"Complete 1 mile on a measured course."}
];

const PDP_STANDARDS = [
  ["reliability","Reliability"],["attitude","Attitude"],["adaptability","Adaptability"],
  ["productivity","Productivity"],["professionalism","Professionalism"],["problemSolving","Problem Solving"]
];
const PDP_LEVELS = ["","Beginning","Approaching","Meeting","Exceeding"];
const ASSIGNMENT_STATUS = ["","On time","Late","Missing","Excused"];
const CERT_STATUSES = ["","Not Scheduled","Scheduled","Attended","Passed","Failed","Retest Needed","Card Received"];
const YES_NO = ["","Yes","No"];
const PASS_FAIL = ["","Pass","Fail"];
const MATH_FIELDS = [
  ["quiz1","Quiz 1"],["quiz2","Quiz 2"],["midterm","Midterm"],
  ["unit45pt1","Unit 4/5 Quiz Pt 1"],["unit45pt2","Unit 4/5 Quiz Pt 2"],
  ["final13","Final Unit 1–3"],["final45","Final Unit 4–5"]
];
const CERTS = [
  ["osha10","OSHA-10"],["flagger","Flagger"],["forklift","Forklift"]
];
const TRADE_OPTIONS = [
  "","Boilermaker","Carpenter","Cement Mason","Electrician","Elevator Constructor",
  "HVAC","Ironworker","Laborer","Lineman","Operating Engineer","Painter","Pipefitter",
  "Plumber","Sheet Metal","Steamfitter","Other"
];

const TABS = [
  ["overview","Overview"],["requirements","Requirements"],["pdp","PDP Checkpoints"],
  ["aces","ACEs"],["math","Math"],["certifications","Certifications"],
  ["service","Service & Mentoring"],["rubrics","Assignment Rubrics"],["report","Student Report"]
];

let gbPassword = "";
let bootstrap = {instructors:[],classes:[]};
let currentInstructorId = "";
let currentClassId = "";
let roster = [];
let live = {attendance:[],demerits:[]};
let studentStates = {};
let classConfig = freshConfig();
let activeTab = "overview";
let selectedStudentId = "";
let selectedAceStation = "wheelbarrow";
let selectedCert = "osha10";
let rubricFilter = {search:"",dimension:"",mapping:""};
let aceModalState = null;
const studentSaveTimers = new Map();
let configSaveTimer = null;

function esc(value){
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
function attr(value){ return esc(value).replace(/`/g,"&#96;"); }
function num(value){
  if(value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function avg(values){
  const a = values.map(num).filter(v => v !== null);
  return a.length ? a.reduce((s,v)=>s+v,0)/a.length : null;
}
function fmt(value){
  const n = num(value);
  return n === null ? "—" : `${Number(n.toFixed(1))}%`;
}
function today(){ return new Date().toISOString().slice(0,10); }
function pill(label,type="neutral"){ return `<span class="gb-pill gb-${type}">${esc(label)}</span>`; }
function showToast(message, error=false){
  const el=document.getElementById("gbToast");
  el.textContent=message; el.className=`toast show${error?" err":""}`;
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>el.className="toast",2600);
}
function setSaveStatus(text, kind=""){
  const el=document.getElementById("gbSaveStatus");
  if(!el) return;
  el.textContent=text;
  el.style.color=kind==="bad"?"var(--rd)":kind==="good"?"var(--gr)":"var(--t3)";
}
async function api(action,payload={}){
  const res=await fetch("/api/gradebook",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({password:gbPassword,action,payload})
  });
  let data={};
  try{data=await res.json();}catch{}
  if(!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function freshConfig(){
  const rubrics={};
  RUBRICS.forEach(r=>rubrics[r.id]={active:true,assignedDimensions:[],dueDate:""});
  return {version:1,rubrics,aceThreshold:70,shopThreshold:70,serviceHours:8,mentoringHours:2};
}
function freshStudent(){
  const standards={};
  PDP_STANDARDS.forEach(([key])=>standards[key]={intro:"",mid:"",final:"",evidence:""});
  const aceStations={};
  ACE_STATIONS.forEach(s=>aceStations[s.key]={attempts:[]});
  const math={}; MATH_FIELDS.forEach(([key])=>math[key]="");
  const safety={}; CERTS.forEach(([key])=>safety[key]={status:"",date:"",expiration:"",credential:"",notes:""});
  return {
    version:1,targetTrade:"",drugScreen:"",fitnessTest:"",pdAssignmentsOnTime:"",
    professional:{standards},aces:{stations:aceStations},math,
    manualGrades:{professional:"",shop:"",math:""},
    safety,
    service:{serviceHours:"",serviceVerified:"",reflectionSubmitted:"",mentoringHours:"",mentoringVerified:"",notes:""},
    rubricRatings:{},assignmentTracking:{}
  };
}
function normalizeStudentState(raw){
  const fresh=freshStudent(), s=(raw && typeof raw==="object")?raw:{};
  const out={...fresh,...s};
  out.professional={...fresh.professional,...(s.professional||{}),standards:{...fresh.professional.standards,...(s.professional?.standards||{})}};
  PDP_STANDARDS.forEach(([k])=>out.professional.standards[k]={...fresh.professional.standards[k],...(s.professional?.standards?.[k]||{})});
  out.aces={...fresh.aces,...(s.aces||{}),stations:{...fresh.aces.stations,...(s.aces?.stations||{})}};
  ACE_STATIONS.forEach(st=>out.aces.stations[st.key]={attempts:Array.isArray(s.aces?.stations?.[st.key]?.attempts)?s.aces.stations[st.key].attempts:[]});
  out.math={...fresh.math,...(s.math||{})};
  out.manualGrades={...fresh.manualGrades,...(s.manualGrades||{})};
  out.safety={...fresh.safety,...(s.safety||{})};
  CERTS.forEach(([k])=>out.safety[k]={...fresh.safety[k],...(s.safety?.[k]||{})});
  out.service={...fresh.service,...(s.service||{})};
  out.rubricRatings={...(s.rubricRatings||{})};
  out.assignmentTracking={...(s.assignmentTracking||{})};
  return out;
}
function normalizeConfig(raw){
  const fresh=freshConfig(), cfg=(raw && typeof raw==="object")?raw:{};
  const out={...fresh,...cfg,rubrics:{...fresh.rubrics}};
  RUBRICS.forEach(r=>{
    const saved=cfg.rubrics?.[r.id]||{};
    out.rubrics[r.id]={
      active:saved.active!==false,
      assignedDimensions:Array.isArray(saved.assignedDimensions)?saved.assignedDimensions.filter(x=>DIMENSIONS.includes(x)):[],
      dueDate:saved.dueDate||""
    };
  });
  return out;
}
function getStudent(id){ return studentStates[id] || (studentStates[id]=freshStudent()); }
function studentName(id){
  const s=roster.find(x=>x.id===id);
  return s ? `${s.first} ${s.last}` : "Student";
}
function setPath(obj,path,value){
  const parts=path.split(".");
  let cur=obj;
  parts.forEach((part,i)=>{
    if(i===parts.length-1){cur[part]=value;return;}
    if(!cur[part] || typeof cur[part]!=="object") cur[part]={};
    cur=cur[part];
  });
}
function getPath(obj,path){
  return path.split(".").reduce((cur,p)=>cur==null?undefined:cur[p],obj);
}

