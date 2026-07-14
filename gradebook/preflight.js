// Remove the unused password-cache key from an earlier review build.
// Cohotrack Gradebook keeps the password in memory only.
try { sessionStorage.removeItem('cohotrack_gradebook_pw'); } catch {}
