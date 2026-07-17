async function gradebookLogin(){
  const btn=document.getElementById("gbLoginBtn");
  const err=document.getElementById("gbLoginError");
  gbPassword=document.getElementById("gbPassword").value;
  err.style.display="none"; btn.disabled=true; btn.textContent="Signing in…";
  try{
    bootstrap=await api("bootstrap");
    fillContextSelectors();
    document.getElementById("gbLogin").style.display="none";
    document.getElementById("gbShell").style.display="block";
    if(bootstrap.instructors.length) currentInstructorId=bootstrap.instructors[0].id;
    syncContextSelections();
    await loadGradebookClass();
  }catch(e){
    gbPassword="";
    document.getElementById("gbPassword").value="";
    err.textContent=e.message; err.style.display="block";
  }finally{btn.disabled=false;btn.textContent="Sign In";}
}
function gradebookLogout(){
  gbPassword="";
  // Clear the hub SSO handoff keys so the reload lands on the login screen
  // instead of auto-signing back in.
  try{
    sessionStorage.removeItem("cohotrack_gradebook_pw");
    sessionStorage.removeItem("cohotrack_gradebook_classId");
    sessionStorage.removeItem("cohotrack_gradebook_instructorId");
  }catch{}
  location.reload();
}
function fillContextSelectors(){
  const i=document.getElementById("gbInstructor"), c=document.getElementById("gbClass");
  i.innerHTML=(bootstrap.instructors||[]).map(x=>`<option value="${attr(x.id)}">${esc(x.name)}</option>`).join("");
  c.innerHTML=(bootstrap.classes||[]).map(x=>`<option value="${attr(x.id)}">${esc(x.program_name)}</option>`).join("");
  if(!currentInstructorId && bootstrap.instructors?.length) currentInstructorId=bootstrap.instructors[0].id;
  if(!currentClassId){
    const linked=(bootstrap.classes||[]).find(x=>(x.instructor_ids||[]).includes(currentInstructorId));
    currentClassId=(linked||bootstrap.classes?.[0]||{}).id||"";
  }
  syncContextSelections();
}
function syncContextSelections(){
  const i=document.getElementById("gbInstructor"),c=document.getElementById("gbClass");
  if(i) i.value=currentInstructorId;
  if(c) c.value=currentClassId;
}
function onGradebookContextChange(){
  currentInstructorId=document.getElementById("gbInstructor").value;
  const linked=(bootstrap.classes||[]).filter(x=>(x.instructor_ids||[]).includes(currentInstructorId));
  const c=document.getElementById("gbClass");
  const current=c.value;
  c.innerHTML=linked.map(x=>`<option value="${attr(x.id)}">${esc(x.program_name)}</option>`).join("");
  currentClassId=linked.some(x=>x.id===current)?current:(linked[0]?.id||"");
  c.value=currentClassId;
}
async function loadGradebookClass(){
  currentInstructorId=document.getElementById("gbInstructor").value;
  currentClassId=document.getElementById("gbClass").value;
  if(!currentInstructorId||!currentClassId){showToast("Choose an instructor and class.",true);return;}
  setSaveStatus("Loading…");
  try{
    const data=await api("loadClass",{instructorId:currentInstructorId,classId:currentClassId});
    roster=data.students||[];
    live={attendance:data.attendance||[],demerits:data.demerits||[]};
    studentStates={};
    roster.forEach(st=>studentStates[st.id]=normalizeStudentState(data.states?.[st.id]));
    classConfig=normalizeConfig(data.config);
    selectedStudentId=roster.some(s=>s.id===selectedStudentId)?selectedStudentId:(roster[0]?.id||"");
    setSaveStatus("Loaded","good");
    renderAll();
  }catch(e){setSaveStatus("Load failed","bad");showToast(e.message,true);}
}
