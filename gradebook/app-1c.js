function queueStudentSave(studentId){
  setSaveStatus("Unsaved");
  clearTimeout(studentSaveTimers.get(studentId));
  studentSaveTimers.set(studentId,setTimeout(()=>saveStudent(studentId),650));
}
async function saveStudent(studentId){
  const state=getStudent(studentId);
  setSaveStatus("Saving…");
  try{
    const summary=readiness(studentId);
    await api("saveStudent",{instructorId:currentInstructorId,classId:currentClassId,studentId,state,summaryScore:summary.percent});
    setSaveStatus("Saved","good");
  }catch(e){setSaveStatus("Save failed","bad");showToast(e.message,true);}
}
function queueConfigSave(){
  setSaveStatus("Unsaved");
  clearTimeout(configSaveTimer);
  configSaveTimer=setTimeout(saveConfig,650);
}
async function saveConfig(){
  setSaveStatus("Saving…");
  try{
    await api("saveConfig",{instructorId:currentInstructorId,classId:currentClassId,config:classConfig});
    setSaveStatus("Saved","good");
  }catch(e){setSaveStatus("Save failed","bad");showToast(e.message,true);}
}
