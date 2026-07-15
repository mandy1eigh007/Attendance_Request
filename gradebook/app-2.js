function attendanceFor(studentId){ return live.attendance.filter(x=>x.student_id===studentId); }
function demeritsFor(studentId){ return live.demerits.filter(x=>x.student_id===studentId && !x.voided && !x.excused); }
function attendanceSummary(studentId){
  const rows=attendanceFor(studentId);
  const count=code=>rows.filter(r=>r.status===code).length;
  return {records:rows.length,onTime:count("OT"),late:count("L"),excused:count("AE"),unexcused:count("AU"),absences:count("AE")+count("AU")};
}
function demeritSummary(studentId){
  const rows=demeritsFor(studentId), total=rows.reduce((s,r)=>s+(Number(r.pts_num)||0),0);
  return {rows,total};
}
function tradeMathThreshold(){ return 70; }
function rubricConfig(rubricId){ return classConfig.rubrics[rubricId] || {active:true,assignedDimensions:[],dueDate:""}; }
function rubricScores(state,rubricId){
  const v=state.rubricRatings?.[rubricId];
  return v && typeof v==="object" ? v : {};
}
function weightOf(c){
  const m=String(c.Weight||"").match(/\d+(?:\.\d+)?/);
  return m?Number(m[0]):0;
}
function rubricResult(state,rubric){
  const scores=rubricScores(state,rubric.id);
  let earned=0,total=0,count=0;
  rubric.criteria.forEach((c,i)=>{
    const sc=num(scores[i]);
    if(sc===null||sc<1||sc>5)return;
    const w=weightOf(c); earned+=(sc/5)*w; total+=w; count++;
  });
  return {percentage:total?earned/total*100:null,complete:rubric.criteria.length>0&&count===rubric.criteria.length,count,totalCriteria:rubric.criteria.length};
}
function dimensionResult(state,dimension,manualValue=null){
  const mapped=RUBRICS.filter(r=>{
    const cfg=rubricConfig(r.id);
    return cfg.active!==false && cfg.assignedDimensions.includes(dimension);
  });
  const results=mapped.map(r=>({rubric:r,result:rubricResult(state,r)}));
  const completed=results.filter(x=>x.result.complete);
  if(mapped.length){
    return {percentage:completed.length?avg(completed.map(x=>x.result.percentage)):null,complete:completed.length===mapped.length,total:mapped.length,completed:completed.length,source:"rubrics",results};
  }
  const manual=num(manualValue);
  return {percentage:manual,complete:manual!==null,total:0,completed:0,source:"manual",results:[]};
}
function manualMathGrade(state){
  if(num(state.manualGrades.math)!==null)return num(state.manualGrades.math);
  const finals=avg([state.math.final13,state.math.final45]);
  const quizzes=avg([state.math.quiz1,state.math.quiz2,state.math.unit45pt1,state.math.unit45pt2]);
  const mid=num(state.math.midterm);
  return avg([finals,quizzes,mid]);
}
function aceStationStatus(state,key){
  const attempts=state.aces?.stations?.[key]?.attempts||[];
  for(let i=attempts.length-1;i>=0;i--){
    if(attempts[i]?.status)return attempts[i].status;
  }
  return "";
}
function aceResult(state){
  const statuses=ACE_STATIONS.map(st=>aceStationStatus(state,st.key));
  const passed=statuses.filter(x=>x==="Pass").length;
  const attempted=statuses.filter(Boolean).length;
  return {percentage:(passed/ACE_STATIONS.length)*100,passed,attempted,total:ACE_STATIONS.length,complete:attempted===ACE_STATIONS.length,pass:(passed/ACE_STATIONS.length)*100>=Number(classConfig.aceThreshold||70)};
}
function pdpResult(state){
  const finals=PDP_STANDARDS.map(([k])=>state.professional?.standards?.[k]?.final||"");
  const complete=finals.every(Boolean);
  const pass=complete&&finals.every(x=>x==="Meeting"||x==="Exceeding");
  return {complete,pass,finals};
}
function pdAssignmentResult(state){
  const mapped=RUBRICS.filter(r=>{
    const cfg=rubricConfig(r.id);
    return cfg.active!==false && cfg.assignedDimensions.includes("Professional Development");
  });
  if(!mapped.length){
    const v=state.pdAssignmentsOnTime;
    return {complete:!!v,pass:v==="Yes",detail:v?"Manual confirmation":"No PD rubrics mapped"};
  }
  const rows=mapped.map(r=>{
    const grade=rubricResult(state,r);
    const tracking=state.assignmentTracking?.[r.id]||{};
    return {rubric:r,grade,status:tracking.status||""};
  });
  const complete=rows.every(x=>x.grade.complete&&x.status);
  const pass=complete&&rows.every(x=>["On time","Excused"].includes(x.status));
  return {complete,pass,detail:`${rows.filter(x=>x.grade.complete&&x.status).length}/${rows.length} completed and dated`,rows};
}
function serviceResult(state){
  const s=state.service||{};
  const sh=num(s.serviceHours)||0,mh=num(s.mentoringHours)||0;
  const pass=sh>=Number(classConfig.serviceHours||8)&&mh>=Number(classConfig.mentoringHours||2)&&s.serviceVerified==="Yes"&&s.mentoringVerified==="Yes";
  const complete=String(s.serviceHours)!==""&&String(s.mentoringHours)!==""&&!!s.serviceVerified&&!!s.mentoringVerified;
  return {complete,pass,serviceHours:sh,mentoringHours:mh};
}
function certificationSummary(state){
  const passed=CERTS.filter(([k])=>["Passed","Card Received"].includes(state.safety?.[k]?.status)).length;
  return {passed,total:CERTS.length};
}
function requirementRows(studentId){
  const state=getStudent(studentId), att=attendanceSummary(studentId), dem=demeritSummary(studentId);
  const pdGrade=dimensionResult(state,"Professional Development",state.manualGrades.professional);
  const shop=dimensionResult(state,"Shop",state.manualGrades.shop);
  const mappedMath=dimensionResult(state,"Math",manualMathGrade(state));
  const math={...mappedMath,threshold:tradeMathThreshold(state)};
  const ace=aceResult(state),pdp=pdpResult(state),pdAssignments=pdAssignmentResult(state),service=serviceResult(state);
  return [
    {key:"attendance",label:"Attendance",complete:att.records>0,pass:att.absences<=3,detail:`${att.absences} day(s) absent · ${att.late} late`},
    {key:"demerits",label:"Demerits",complete:true,pass:dem.total<10,detail:`${dem.total} / 10 points`},
    {key:"math",label:"Math",complete:math.complete&&math.percentage!==null,pass:math.percentage!==null&&math.percentage>=math.threshold,detail:`${fmt(math.percentage)} · 70% required to graduate`},
    {key:"shop",label:"Construction projects",complete:shop.complete&&shop.percentage!==null,pass:shop.percentage!==null&&shop.percentage>=Number(classConfig.shopThreshold||70),detail:`${fmt(shop.percentage)} · ${classConfig.shopThreshold||70}% required`},
    {key:"aces",label:"ACEs",complete:ace.complete,pass:ace.pass,detail:`${ace.passed}/${ace.total} passed · ${fmt(ace.percentage)}`},
    {key:"fitness",label:"Physical fitness test",complete:!!state.fitnessTest,pass:state.fitnessTest==="Pass",detail:state.fitnessTest||"Not recorded"},
    {key:"pdAssignments",label:"PD assignments on time",complete:pdAssignments.complete,pass:pdAssignments.pass,detail:pdAssignments.detail},
    {key:"pdp",label:"Final PDP standards",complete:pdp.complete,pass:pdp.pass,detail:pdp.complete?(pdp.pass?"All Meeting/Exceeding":"One or more below Meeting"):"Final checkpoint incomplete"},
    {key:"drug",label:"Drug screening",complete:!!state.drugScreen,pass:state.drugScreen==="Pass",detail:state.drugScreen||"Not recorded"},
    {key:"service",label:"Service & mentoring hours",complete:service.complete,pass:service.pass,detail:`${service.serviceHours}/${classConfig.serviceHours||8} service · ${service.mentoringHours}/${classConfig.mentoringHours||2} mentoring`}
  ];
}
function readiness(studentId){
  const rows=requirementRows(studentId);
  const failed=rows.filter(r=>r.complete&&!r.pass);
  const incomplete=rows.filter(r=>!r.complete);
  const passed=rows.filter(r=>r.complete&&r.pass);
  const percent=rows.length?passed.length/rows.length*100:0;
  if(failed.length)return {label:"Not Eligible",type:"bad",failed,incomplete,rows,percent};
  if(incomplete.length)return {label:"Incomplete",type:"warn",failed,incomplete,rows,percent};
  return {label:"Eligible",type:"good",failed,incomplete,rows,percent};
}
function riskFlags(studentId){
  const state=getStudent(studentId),att=attendanceSummary(studentId),dem=demeritSummary(studentId),req=readiness(studentId);
  const flags=[];
  if(att.absences>=2)flags.push(`${att.absences} absence days`);
  if(dem.total>=7)flags.push(`${dem.total} demerit points`);
  const math=req.rows.find(r=>r.key==="math"); if(math.complete&&!math.pass)flags.push("Math below target threshold");
  const shop=req.rows.find(r=>r.key==="shop"); if(shop.complete&&!shop.pass)flags.push("Shop below 70%");
  const ace=req.rows.find(r=>r.key==="aces"); if(ace.complete&&!ace.pass)flags.push("ACEs below 70%");
  if(req.incomplete.length)flags.push(`${req.incomplete.length} requirement(s) incomplete`);
  const cert=certificationSummary(state); if(cert.passed<CERTS.length)flags.push(`${CERTS.length-cert.passed} certification(s) incomplete`);
  return flags;
}

