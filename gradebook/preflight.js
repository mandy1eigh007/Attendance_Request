// Intentionally a no-op.
//
// The hub's openGradebook() stores the session password in
// sessionStorage('cohotrack_gradebook_pw') so app-5.js can auto-sign-in
// (single sign-on from /admin/). An earlier build deleted that key here,
// which ran BEFORE app-5.js read it and silently broke the handoff.
// The key is session-scoped and cleared on hub Sign Out, so leaving it
// alone is safe. Do not re-add a removeItem() call for it.
