function renderAll(){ renderTabs(); renderActive(); }
function renderTabs(){
  document.getElementById("gbTabs").innerHTML=TABS.map(([id,label])=>
    `<button class="nav-tab ${activeTab===id?"active":""}" onclick="switchTab('${id}')">${esc(label)}</button>`
  ).join("");
}
function switchTab(id){activeTab=id;renderAll();}
function renderActive(){
  const fn={overview:renderOverview,requirements:renderRequirements,pdp:renderPdp,aces:renderAces,math:renderMath,
    certifications:renderCertifications,service:renderService,rubrics:renderRubrics,report:renderReport}[activeTab]||renderOverview;
  document.getElementById("gbView").innerHTML=fn();
}
function studentSelect(value=selectedStudentId,onchange="selectStudent(this.value)"){
  return `<select onchange="${onchange}">${roster.map(s=>`<option value="${attr(s.id)}" ${s.id===value?"selected":""}>${esc(s.first+" "+s.last)}</option>`).join("")}</select>`;
}
function selectStudent(id){selectedStudentId=id;renderActive();}
function stat(label,value){return `<div class="gb-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}

function renderOverview(){
  const statuses=roster.map(s=>readiness(s.id));
  const eligible=statuses.filter(x=>x.label==="Eligible").length;
  const notEligible=statuses.filter(x=>x.label==="Not Eligible").length;
  const incomplete=statuses.filter(x=>x.label==="Incomplete").length;
  const risk=roster.filter(s=>riskFlags(s.id).length).length;
  return `
    <div class="page-header"><div><div class="page-title">Program Readiness</div><div class="page-sub">Handbook requirements plus curriculum rubric grades. Attendance and demerits come directly from Cohotrack.</div></div></div>
    <div class="gb-grid">
      ${stat("Students",String(roster.length))}${stat("Eligible",String(eligible))}
      ${stat("Not eligible",String(notEligible))}${stat("Incomplete",String(incomplete))}
      ${stat("Needs attention",String(risk))}
    </div>
    <div class="section-card">
      <div class="card-title">Class status</div>
      <div class="gb-table-wrap"><table class="gb-table">
        <thead><tr><th>Student</th><th>Target</th><th>Attendance</th><th>Demerits</th><th>PDP</th><th>ACEs</th><th>Shop</th><th>Math</th><th>Certs</th><th>Status</th><th></th></tr></thead>
        <tbody>${roster.map(s=>{
          const st=getStudent(s.id),att=attendanceSummary(s.id),dem=demeritSummary(s.id),pdp=pdpResult(st),ace=aceResult(st);
          const shop=dimensionResult(st,"Shop",st.manualGrades.shop),math=dimensionResult(st,"Math",manualMathGrade(st)),cert=certificationSummary(st),ready=readiness(s.id);
          return `<tr>
            <td class="gb-name">${esc(s.first+" "+s.last)}</td><td>${esc(st.targetTrade||"—")}</td>
            <td>${att.absences} absent · ${att.late} late</td><td>${dem.total}</td>
            <td>${pdp.complete?(pdp.pass?pill("Pass","good"):pill("Below standard","bad")):pill("Incomplete","warn")}</td>
            <td>${ace.passed}/${ace.total} · ${fmt(ace.percentage)}</td><td>${fmt(shop.percentage)}</td><td>${fmt(math.percentage)}</td>
            <td>${cert.passed}/${cert.total}</td><td>${pill(ready.label,ready.type)}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="selectedStudentId='${attr(s.id)}';switchTab('requirements')">Open</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>`;
}

function renderRequirements(){
  if(!selectedStudentId)return `<div class="section-card">No students found.</div>`;
  const st=getStudent(selectedStudentId),ready=readiness(selectedStudentId),flags=riskFlags(selectedStudentId);
  const pd=dimensionResult(st,"Professional Development",st.manualGrades.professional),shop=dimensionResult(st,"Shop",st.manualGrades.shop),math=dimensionResult(st,"Math",manualMathGrade(st));
  return `
    <div class="page-header">
      <div><div class="page-title">Graduation Requirements</div><div class="page-sub">A checklist, not a blended average. A failed completed requirement blocks eligibility.</div></div>
      <div style="min-width:260px">${studentSelect()}</div>
    </div>
    <div class="section-card">
      <div class="card-title">Student settings</div>
      <div class="gb-row">
        <div><label>Target trade</label><select data-student="${attr(selectedStudentId)}" data-path="targetTrade">${TRADE_OPTIONS.map(x=>`<option ${st.targetTrade===x?"selected":""}>${esc(x||"Select trade")}</option>`).join("")}</select></div>
        <div><label>Drug screening</label><select data-student="${attr(selectedStudentId)}" data-path="drugScreen">${PASS_FAIL.map(x=>`<option ${st.drugScreen===x?"selected":""}>${esc(x||"Not recorded")}</option>`).join("")}</select></div>
        <div><label>Physical fitness test</label><select data-student="${attr(selectedStudentId)}" data-path="fitnessTest">${PASS_FAIL.map(x=>`<option ${st.fitnessTest===x?"selected":""}>${esc(x||"Not recorded")}</option>`).join("")}</select></div>
        <div><label>PD assignments on time — manual fallback</label><select data-student="${attr(selectedStudentId)}" data-path="pdAssignmentsOnTime">${YES_NO.map(x=>`<option ${st.pdAssignmentsOnTime===x?"selected":""}>${esc(x||"Not recorded")}</option>`).join("")}</select></div>
      </div>
      <div class="gb-row" style="margin-top:12px">
        <div><label>Manual PD grade fallback</label><input type="number" min="0" max="100" data-student="${attr(selectedStudentId)}" data-path="manualGrades.professional" value="${attr(st.manualGrades.professional)}"></div>
        <div><label>Manual Shop grade fallback</label><input type="number" min="0" max="100" data-student="${attr(selectedStudentId)}" data-path="manualGrades.shop" value="${attr(st.manualGrades.shop)}"></div>
        <div><label>Manual Math override</label><input type="number" min="0" max="100" data-student="${attr(selectedStudentId)}" data-path="manualGrades.math" value="${attr(st.manualGrades.math)}"></div>
      </div>
      <p class="note">Mapped rubric grades replace the manual fallback for that dimension. Math requires 80% when the target contains Electrical or Plumbing; otherwise 70%.</p>
    </div>
    <div class="gb-grid">
      ${stat("Professional Development",fmt(pd.percentage))}
      ${stat("Shop",fmt(shop.percentage))}
      ${stat("Math",`${fmt(math.percentage)} / ${tradeMathThreshold(st)}%`)}
      ${stat("Readiness",ready.label)}
    </div>
    <div class="section-card">
      <div class="card-title">Requirement checklist</div>
      <div class="gb-checklist">${ready.rows.map(r=>`
        <div class="gb-check">
          <div>${r.complete?(r.pass?pill("Met","good"):pill("Not met","bad")):pill("Incomplete","warn")}</div>
          <div><strong>${esc(r.label)}</strong><p>${esc(r.detail)}</p></div>
        </div>`).join("")}
      </div>
      ${flags.length?`<div class="gb-risk"><strong>Needs attention:</strong> ${esc(flags.join(" · "))}</div>`:`<div class="gb-success"><strong>No active risk flags.</strong></div>`}
    </div>
    <div class="section-card">
      <div class="card-title">Live Cohotrack records</div>
      <p>Attendance and demerit values above are read from the existing Cohotrack tables. Use the <a class="gb-link" href="/admin/">Instructor Hub</a> to edit those records.</p>
    </div>`;
}

function renderPdp(){
  if(!selectedStudentId)return "";
  const st=getStudent(selectedStudentId),result=pdpResult(st);
  return `
    <div class="page-header"><div><div class="page-title">PDP Checkpoints</div><div class="page-sub">Intro, midterm, and final evidence for all six professional standards.</div></div><div style="min-width:260px">${studentSelect()}</div></div>
    <div class="section-card">
      <div class="gb-row" style="margin-bottom:12px"><div>${result.complete?(result.pass?pill("Final standards met","good"):pill("Final standards below requirement","bad")):pill("Final checkpoint incomplete","warn")}</div></div>
      <div class="gb-table-wrap"><table class="gb-table">
        <thead><tr><th>Standard</th><th>Intro</th><th>Midterm</th><th>Final</th><th>Instructor evidence / notes</th></tr></thead>
        <tbody>${PDP_STANDARDS.map(([key,label])=>{
          const row=st.professional.standards[key];
          const opts=value=>PDP_LEVELS.map(x=>`<option ${value===x?"selected":""}>${esc(x||"Select")}</option>`).join("");
          return `<tr><td class="gb-name">${esc(label)}</td>
            <td><select data-student="${attr(selectedStudentId)}" data-path="professional.standards.${key}.intro">${opts(row.intro)}</select></td>
            <td><select data-student="${attr(selectedStudentId)}" data-path="professional.standards.${key}.mid">${opts(row.mid)}</select></td>
            <td><select data-student="${attr(selectedStudentId)}" data-path="professional.standards.${key}.final">${opts(row.final)}</select></td>
            <td><textarea data-student="${attr(selectedStudentId)}" data-path="professional.standards.${key}.evidence">${esc(row.evidence)}</textarea></td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>`;
}

