function rubricGradeTable(rubric){
  return `<div class="gb-table-wrap"><table class="gb-table">
    <thead><tr><th>Student</th>${rubric.criteria.map(c=>`<th title="${attr(c.Criteria)}">${esc(c.Criteria)}<br><span style="font-weight:400">${esc(c.Weight)}</span></th>`).join("")}<th>Grade</th><th>Submitted</th><th>Status</th><th>Comments</th></tr></thead>
    <tbody>${roster.map(s=>{
      const st=getStudent(s.id),scores=rubricScores(st,rubric.id),res=rubricResult(st,rubric),track=st.assignmentTracking[rubric.id]||{};
      return `<tr><td class="gb-name">${esc(s.first+" "+s.last)}</td>
        ${rubric.criteria.map((c,i)=>`<td><select data-rubric-score="${attr(rubric.id)}" data-score-index="${i}" data-student="${attr(s.id)}">
          <option value="">—</option>${[[1,"Incomplete"],[2,"Developing"],[3,"Proficient"],[4,"Professional"]].map(([n,l])=>`<option value="${n}" ${Number(scores[i])===n?"selected":""}>${n} – ${l}</option>`).join("")}</select></td>`).join("")}
        <td>${res.percentage===null?"—":fmt(res.percentage)}<div class="gb-progress"><span style="width:${Math.max(0,Math.min(100,res.percentage||0))}%"></span></div></td>
        <td><input type="date" data-student="${attr(s.id)}" data-path="assignmentTracking.${rubric.id}.submittedDate" value="${attr(track.submittedDate||"")}"></td>
        <td><select data-student="${attr(s.id)}" data-path="assignmentTracking.${rubric.id}.status">${ASSIGNMENT_STATUS.map(x=>`<option ${track.status===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></td>
        <td><textarea data-student="${attr(s.id)}" data-path="assignmentTracking.${rubric.id}.comments">${esc(track.comments||"")}</textarea></td>
      </tr>`;
    }).join("")}</tbody>
  </table></div>`;
}
function renderRubrics(){
  const filtered=RUBRICS.filter(r=>{
    const cfg=rubricConfig(r.id),q=rubricFilter.search.toLowerCase();
    if(q && !`${r.id} ${r.sourceTitle} ${r.sourceDimension}`.toLowerCase().includes(q))return false;
    if(rubricFilter.dimension && r.sourceDimension!==rubricFilter.dimension)return false;
    if(rubricFilter.mapping==="mapped"&&!cfg.assignedDimensions.length)return false;
    if(rubricFilter.mapping==="unmapped"&&cfg.assignedDimensions.length)return false;
    return true;
  });
  const sourceDims=[...new Set(RUBRICS.map(r=>r.sourceDimension))].sort();
  return `
    <div class="page-header"><div><div class="page-title">Assignment Rubrics</div><div class="page-sub">46 fixed curriculum rubrics. Grade each criterion 1–4 (Incomplete → Professional); weights calculate the assignment percentage. Map each rubric to the dimension it should feed.</div></div></div>
    <div class="section-card">
      <div class="gb-filter">
        <input type="text" placeholder="Search rubric…" value="${attr(rubricFilter.search)}" oninput="rubricFilter.search=this.value;renderActive()">
        <select onchange="rubricFilter.dimension=this.value;renderActive()"><option value="">All source dimensions</option>${sourceDims.map(x=>`<option ${rubricFilter.dimension===x?"selected":""}>${esc(x)}</option>`).join("")}</select>
        <select onchange="rubricFilter.mapping=this.value;renderActive()"><option value="">All mappings</option><option value="mapped" ${rubricFilter.mapping==="mapped"?"selected":""}>Mapped</option><option value="unmapped" ${rubricFilter.mapping==="unmapped"?"selected":""}>Unmapped</option></select>
      </div>
      <p class="note">${filtered.length} rubric(s) shown. Mapping and due dates are class-wide; student scores and submission status save per student.</p>
    </div>
    ${filtered.map(r=>{
      const cfg=rubricConfig(r.id),results=roster.map(s=>rubricResult(getStudent(s.id),r)),graded=results.filter(x=>x.complete),classAvg=avg(graded.map(x=>x.percentage));
      return `<details class="gb-details">
        <summary><div><strong>${esc(r.id)} · ${esc(r.sourceTitle)}</strong><div class="note">${esc(r.sourceDimension)} · ${r.hours} hours</div></div><div class="grow"></div>${pill(`${graded.length}/${roster.length} graded`,graded.length===roster.length?"good":"neutral")} ${pill(`Avg ${fmt(classAvg)}`,"neutral")}</summary>
        <div class="gb-details-body">
          <div class="gb-rubric-grid">
            <div class="gb-mini"><label>Active</label><select data-config-rubric="${attr(r.id)}" data-config-field="active"><option value="true" ${cfg.active!==false?"selected":""}>Yes</option><option value="false" ${cfg.active===false?"selected":""}>No</option></select></div>
            <div class="gb-mini"><label>Class due date</label><input type="date" data-config-rubric="${attr(r.id)}" data-config-field="dueDate" value="${attr(cfg.dueDate||"")}"></div>
            <div class="gb-mini" style="grid-column:span 2"><label>Feeds these dimensions</label><div class="gb-row">${DIMENSIONS.map(d=>`<label style="display:flex;gap:6px;align-items:center;margin:3px 10px 3px 0"><input type="checkbox" style="width:auto" data-config-map="${attr(r.id)}" value="${attr(d)}" ${cfg.assignedDimensions.includes(d)?"checked":""}>${esc(d)}</label>`).join("")}</div></div>
          </div>
          <div class="gb-mini"><strong>Deliverables</strong><ul style="margin:7px 0 0 18px">${r.deliverables.map(x=>`<li>${esc(x)}</li>`).join("")}</ul><p class="note"><strong>Completion standard:</strong> ${esc(r.completionStandard)}</p></div>
          <div class="gb-table-wrap" style="margin:12px 0"><table class="gb-criteria">
            <thead><tr><th>Criterion</th><th>Incomplete</th><th>Developing</th><th>Proficient</th><th>Professional</th><th>Weight</th></tr></thead>
            <tbody>${r.criteria.map(c=>`<tr><td><strong>${esc(c.Criteria)}</strong></td><td>${esc(c["Does Not Meet (1–2)"])}</td><td>${esc(c["Approaching (3)"])}</td><td>${esc(c["Meets (4)"])}</td><td>${esc(c["Exceeds (5)"])}</td><td>${esc(c.Weight)}</td></tr>`).join("")}</tbody>
          </table></div>
          ${rubricGradeTable(r)}
        </div>
      </details>`;
    }).join("")}`;
}

function reportHtml(studentId){
  const person=roster.find(s=>s.id===studentId),st=getStudent(studentId),ready=readiness(studentId),att=attendanceSummary(studentId),dem=demeritSummary(studentId),ace=aceResult(st),cert=certificationSummary(st);
  if(!person)return "";
  const mappedGrades=DIMENSIONS.map(d=>{
    const manual=d==="Professional Development"?st.manualGrades.professional:d==="Shop"?st.manualGrades.shop:d==="Math"?manualMathGrade(st):null;
    return [d,dimensionResult(st,d,manual)];
  });
  return `<div class="gb-report">
    <h1>ANEW Student Progress Report</h1>
    <p><strong>${esc(person.first+" "+person.last)}</strong> · ${esc((bootstrap.classes.find(c=>c.id===currentClassId)||{}).program_name||"")} · Target: ${esc(st.targetTrade||"Not selected")}</p>
    <p>Generated ${esc(new Date().toLocaleDateString())} · Status: <strong>${esc(ready.label)}</strong></p>
    <h2>Graduation Requirements</h2>
    <table><thead><tr><th>Requirement</th><th>Status</th><th>Detail</th></tr></thead><tbody>${ready.rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${r.complete?(r.pass?"Met":"Not met"):"Incomplete"}</td><td>${esc(r.detail)}</td></tr>`).join("")}</tbody></table>
    <h2>Dimension Grades</h2>
    <table><thead><tr><th>Dimension</th><th>Grade</th><th>Completed rubrics</th></tr></thead><tbody>${mappedGrades.map(([d,r])=>`<tr><td>${esc(d)}</td><td>${fmt(r.percentage)}</td><td>${r.completed}/${r.total||0}</td></tr>`).join("")}</tbody></table>
    <h2>Attendance & Conduct</h2><p>${att.absences} absence day(s), ${att.late} late, ${dem.total} active demerit point(s).</p>
    <h2>ACES</h2><p>${ace.passed}/${ace.total} stations passed (${fmt(ace.percentage)}).</p>
    <table><thead><tr><th>Station</th><th>Status</th><th>Attempts</th><th>Latest result</th><th>Latest time</th></tr></thead><tbody>${ACE_STATIONS.map(x=>{const s=attemptSummary(st,x.key);return `<tr><td>${esc(x.label)}</td><td>${esc(s.status||"Not attempted")}</td><td>${s.attempts.length}</td><td>${esc(s.latest.result||"")}</td><td>${esc(s.latest.time||"")}</td></tr>`}).join("")}</tbody></table>
    <h2>PDP Final</h2><table><thead><tr><th>Standard</th><th>Final</th><th>Evidence</th></tr></thead><tbody>${PDP_STANDARDS.map(([k,l])=>`<tr><td>${esc(l)}</td><td>${esc(st.professional.standards[k].final||"")}</td><td>${esc(st.professional.standards[k].evidence||"")}</td></tr>`).join("")}</tbody></table>
    <h2>Certifications</h2><p>${cert.passed}/${cert.total} passed/card received.</p>
    <table><thead><tr><th>Certification</th><th>Status</th><th>Date</th><th>Expiration</th><th>Credential</th></tr></thead><tbody>${CERTS.map(([k,l])=>{const c=st.safety[k];return `<tr><td>${esc(l)}</td><td>${esc(c.status)}</td><td>${esc(c.date)}</td><td>${esc(c.expiration)}</td><td>${esc(c.credential)}</td></tr>`}).join("")}</tbody></table>
  </div>`;
}
function renderReport(){
  return `<div class="page-header no-print"><div><div class="page-title">Student Progress Report</div><div class="page-sub">Printable midterm/final report with requirement status, grades, ACEs, PDP, attendance, demerits, and certifications.</div></div>
    <div class="gb-row" style="flex:0 1 520px"><div>${studentSelect(selectedStudentId,"selectedStudentId=this.value;renderActive()")}</div><button class="btn btn-primary" onclick="window.print()">Print</button></div></div>
    ${selectedStudentId?reportHtml(selectedStudentId):""}`;
}

document.addEventListener("change",event=>{
  const el=event.target;
  if(el.dataset.student && el.dataset.path){
    const state=getStudent(el.dataset.student);
    setPath(state,el.dataset.path,el.type==="checkbox"?el.checked:el.value);
    queueStudentSave(el.dataset.student);
    renderActive();
    return;
  }
  if(el.dataset.rubricScore){
    const state=getStudent(el.dataset.student);
    state.rubricRatings[el.dataset.rubricScore]=state.rubricRatings[el.dataset.rubricScore]||{};
    state.rubricRatings[el.dataset.rubricScore][el.dataset.scoreIndex]=el.value;
    queueStudentSave(el.dataset.student);renderActive();return;
  }
  if(el.dataset.configRubric){
    const cfg=rubricConfig(el.dataset.configRubric);
    cfg[el.dataset.configField]=el.dataset.configField==="active"?el.value==="true":el.value;
    queueConfigSave();renderActive();return;
  }
  if(el.dataset.configMap){
    const cfg=rubricConfig(el.dataset.configMap);
    const set=new Set(cfg.assignedDimensions);
    el.checked?set.add(el.value):set.delete(el.value);
    cfg.assignedDimensions=[...set];
    queueConfigSave();renderActive();
  }
});

function exportGradebook(){
  const payload={exportedAt:new Date().toISOString(),classId:currentClassId,className:(bootstrap.classes.find(c=>c.id===currentClassId)||{}).program_name||"",config:classConfig,students:roster.map(s=>({student:s,state:getStudent(s.id),attendance:attendanceFor(s.id),demerits:demeritsFor(s.id)}))};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`cohotrack-gradebook-${today()}.json`;a.click();URL.revokeObjectURL(a.href);
}
(async function init(){
  const saved=sessionStorage.getItem("cohotrack_gradebook_pw");
  if(saved){
    const classId=sessionStorage.getItem("cohotrack_gradebook_classId");
    const instructorId=sessionStorage.getItem("cohotrack_gradebook_instructorId");
    if(classId) currentClassId=classId;
    if(instructorId) currentInstructorId=instructorId;
    document.getElementById("gbPassword").value=saved;
    await gradebookLogin();
  }
})();
