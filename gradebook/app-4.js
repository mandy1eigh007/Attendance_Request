function attemptSummary(state,key){
  const attempts=state.aces.stations[key].attempts||[];
  const latest=attempts[attempts.length-1]||{};
  const passed=attempts.filter(a=>a.status==="Pass");
  const best=passed[passed.length-1]||latest;
  return {attempts,latest,best,status:aceStationStatus(state,key)};
}
function renderAces(){
  const station=ACE_STATIONS.find(x=>x.key===selectedAceStation)||ACE_STATIONS[0];
  return `
    <div class="page-header">
      <div><div class="page-title">ACES Attempts</div><div class="page-sub">Track repeated attempts, time/result, safety, coaching notes, and final status for all 13 stations.</div></div>
      <div style="min-width:260px"><label>Station</label><select onchange="selectedAceStation=this.value;renderActive()">${ACE_STATIONS.map(x=>`<option value="${x.key}" ${x.key===station.key?"selected":""}>${esc(x.label)}</option>`).join("")}</select></div>
    </div>
    <div class="section-card">
      <div class="card-title">${esc(station.label)} standard</div>
      <p><strong>${esc(station.time)}</strong> · ${esc(station.goal)}</p>
    </div>
    <div class="section-card">
      <div class="gb-table-wrap"><table class="gb-table">
        <thead><tr><th>Student</th><th>Attempts</th><th>Latest date</th><th>Latest result</th><th>Latest time</th><th>Final status</th><th>Notes</th><th></th></tr></thead>
        <tbody>${roster.map(s=>{
          const st=getStudent(s.id),sum=attemptSummary(st,station.key);
          return `<tr><td class="gb-name">${esc(s.first+" "+s.last)}</td><td>${sum.attempts.length}</td>
            <td>${esc(sum.latest.date||"—")}</td><td>${esc(sum.latest.result||"—")}</td><td>${esc(sum.latest.time||"—")}</td>
            <td>${sum.status?pill(sum.status,sum.status==="Pass"?"good":"bad"):pill("Not attempted","neutral")}</td>
            <td>${esc(sum.latest.notes||"")}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="openAceModal('${attr(s.id)}','${attr(station.key)}')">Edit attempts</button></td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </div>`;
}
function openAceModal(studentId,stationKey){
  aceModalState={studentId,stationKey};
  renderAceModal();
  document.getElementById("aceModal").classList.add("on");
}
function closeAceModal(){document.getElementById("aceModal").classList.remove("on");aceModalState=null;}
function renderAceModal(){
  if(!aceModalState)return;
  const {studentId,stationKey}=aceModalState,station=ACE_STATIONS.find(x=>x.key===stationKey),attempts=getStudent(studentId).aces.stations[stationKey].attempts;
  document.getElementById("aceModalTitle").textContent=`${studentName(studentId)} — ${station.label}`;
  document.getElementById("aceModalSub").textContent=`${station.time} · ${station.goal}`;
  document.getElementById("aceModalBody").innerHTML=attempts.length?attempts.map((a,i)=>`
    <div class="gb-attempt">
      <div class="gb-row">
        <div><label>Date</label><input type="date" value="${attr(a.date||"")}" onchange="updateAceAttempt(${i},'date',this.value)"></div>
        <div><label>Result achieved</label><input type="text" value="${attr(a.result||"")}" placeholder="e.g. 21/24" onchange="updateAceAttempt(${i},'result',this.value)"></div>
        <div><label>Time</label><input type="text" value="${attr(a.time||"")}" placeholder="e.g. 1:54" onchange="updateAceAttempt(${i},'time',this.value)"></div>
        <div><label>Status</label><select onchange="updateAceAttempt(${i},'status',this.value)">${PASS_FAIL.map(x=>`<option ${a.status===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></div>
      </div>
      <div class="gb-row" style="margin-top:9px">
        <div><label>Safety issue</label><select onchange="updateAceAttempt(${i},'safety',this.value)">${YES_NO.map(x=>`<option ${a.safety===x?"selected":""}>${esc(x||"Not recorded")}</option>`).join("")}</select></div>
        <div style="flex:3 1 360px"><label>Coaching / notes</label><textarea onchange="updateAceAttempt(${i},'notes',this.value)">${esc(a.notes||"")}</textarea></div>
        <div style="flex:0 0 auto;align-self:end"><button class="btn btn-danger btn-sm" onclick="deleteAceAttempt(${i})">Delete</button></div>
      </div>
    </div>`).join(""):`<p class="note" style="margin-bottom:14px">No attempts recorded.</p>`;
}
function addAceAttempt(){
  if(!aceModalState)return;
  const st=getStudent(aceModalState.studentId);
  st.aces.stations[aceModalState.stationKey].attempts.push({date:today(),result:"",time:"",status:"",safety:"",notes:""});
  queueStudentSave(aceModalState.studentId);renderAceModal();renderActive();
}
function updateAceAttempt(index,key,value){
  const st=getStudent(aceModalState.studentId),arr=st.aces.stations[aceModalState.stationKey].attempts;
  if(arr[index])arr[index][key]=value;
  queueStudentSave(aceModalState.studentId);renderActive();
}
function deleteAceAttempt(index){
  if(!aceModalState||!confirm("Delete this ACE attempt?"))return;
  const st=getStudent(aceModalState.studentId);
  st.aces.stations[aceModalState.stationKey].attempts.splice(index,1);
  queueStudentSave(aceModalState.studentId);renderAceModal();renderActive();
}

function renderMath(){
  return `
    <div class="page-header"><div><div class="page-title">Math</div><div class="page-sub">Detailed math entry remains available as a fallback. Mapped Math rubrics automatically replace it.</div></div></div>
    <div class="section-card"><div class="gb-table-wrap"><table class="gb-table">
      <thead><tr><th>Student</th><th>Target</th>${MATH_FIELDS.map(([,l])=>`<th>${esc(l)}</th>`).join("")}<th>Calculated</th><th>Required</th><th>Status</th></tr></thead>
      <tbody>${roster.map(s=>{
        const st=getStudent(s.id),fallback=manualMathGrade(st),mapped=dimensionResult(st,"Math",fallback),threshold=tradeMathThreshold(st);
        return `<tr><td class="gb-name">${esc(s.first+" "+s.last)}</td><td>${esc(st.targetTrade||"—")}</td>
          ${MATH_FIELDS.map(([k])=>`<td><input type="number" min="0" max="100" data-student="${attr(s.id)}" data-path="math.${k}" value="${attr(st.math[k])}"></td>`).join("")}
          <td>${fmt(mapped.percentage)}</td><td>${threshold}%</td><td>${mapped.percentage===null?pill("Incomplete","warn"):mapped.percentage>=threshold?pill("Pass","good"):pill("Below","bad")}</td></tr>`;
      }).join("")}</tbody>
    </table></div></div>`;
}

function renderCertifications(){
  const cert=CERTS.find(([k])=>k===selectedCert)||CERTS[0];
  return `
    <div class="page-header"><div><div class="page-title">Safety Certifications</div><div class="page-sub">Track scheduled training, pass/fail, cards, credential dates, and expirations.</div></div>
      <div style="min-width:240px"><label>Certification</label><select onchange="selectedCert=this.value;renderActive()">${CERTS.map(([k,l])=>`<option value="${k}" ${k===cert[0]?"selected":""}>${esc(l)}</option>`).join("")}</select></div></div>
    <div class="section-card"><div class="gb-table-wrap"><table class="gb-table">
      <thead><tr><th>Student</th><th>Status</th><th>Certification date</th><th>Expiration</th><th>Card / credential #</th><th>Notes</th></tr></thead>
      <tbody>${roster.map(s=>{
        const row=getStudent(s.id).safety[cert[0]];
        return `<tr><td class="gb-name">${esc(s.first+" "+s.last)}</td>
          <td><select data-student="${attr(s.id)}" data-path="safety.${cert[0]}.status">${CERT_STATUSES.map(x=>`<option ${row.status===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></td>
          <td><input type="date" data-student="${attr(s.id)}" data-path="safety.${cert[0]}.date" value="${attr(row.date)}"></td>
          <td><input type="date" data-student="${attr(s.id)}" data-path="safety.${cert[0]}.expiration" value="${attr(row.expiration)}"></td>
          <td><input type="text" data-student="${attr(s.id)}" data-path="safety.${cert[0]}.credential" value="${attr(row.credential)}"></td>
          <td><textarea data-student="${attr(s.id)}" data-path="safety.${cert[0]}.notes">${esc(row.notes)}</textarea></td></tr>`;
      }).join("")}</tbody>
    </table></div></div>`;
}

function renderService(){
  return `
    <div class="page-header"><div><div class="page-title">Service Learning & Speed Mentoring</div><div class="page-sub">Handbook requirement: 8 service-learning hours and 2 speed-mentoring hours outside programming.</div></div></div>
    <div class="section-card"><div class="gb-table-wrap"><table class="gb-table">
      <thead><tr><th>Student</th><th>Service hours</th><th>Verified</th><th>Reflection</th><th>Mentoring hours</th><th>Verified</th><th>Notes</th><th>Status</th></tr></thead>
      <tbody>${roster.map(s=>{
        const st=getStudent(s.id),sv=st.service,res=serviceResult(st);
        return `<tr><td class="gb-name">${esc(s.first+" "+s.last)}</td>
          <td><input type="number" min="0" step=".25" data-student="${attr(s.id)}" data-path="service.serviceHours" value="${attr(sv.serviceHours)}"></td>
          <td><select data-student="${attr(s.id)}" data-path="service.serviceVerified">${YES_NO.map(x=>`<option ${sv.serviceVerified===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></td>
          <td><select data-student="${attr(s.id)}" data-path="service.reflectionSubmitted">${YES_NO.map(x=>`<option ${sv.reflectionSubmitted===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></td>
          <td><input type="number" min="0" step=".25" data-student="${attr(s.id)}" data-path="service.mentoringHours" value="${attr(sv.mentoringHours)}"></td>
          <td><select data-student="${attr(s.id)}" data-path="service.mentoringVerified">${YES_NO.map(x=>`<option ${sv.mentoringVerified===x?"selected":""}>${esc(x||"Select")}</option>`).join("")}</select></td>
          <td><textarea data-student="${attr(s.id)}" data-path="service.notes">${esc(sv.notes)}</textarea></td>
          <td>${res.complete?(res.pass?pill("Complete","good"):pill("Not complete","bad")):pill("Incomplete","warn")}</td></tr>`;
      }).join("")}</tbody>
    </table></div></div>`;
}

