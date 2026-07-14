// Post-render guard: placeholder labels must save as an empty value, not as their text.
function normalizeGradebookBlankOptions(){
  const placeholderLabels = new Set(['Select','Select trade','Not recorded']);
  document.querySelectorAll('option').forEach(option => {
    if (placeholderLabels.has(option.textContent.trim())) option.value = '';
  });
}

const cohotrackOriginalRenderActive = renderActive;
renderActive = function(){
  cohotrackOriginalRenderActive();
  normalizeGradebookBlankOptions();
};

const cohotrackOriginalRenderAceModal = renderAceModal;
renderAceModal = function(){
  cohotrackOriginalRenderAceModal();
  normalizeGradebookBlankOptions();
};

normalizeGradebookBlankOptions();
