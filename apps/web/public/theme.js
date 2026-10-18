// Apply the saved or system theme before first paint to avoid a flash.
// A separate file (not inline) so the site's Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('gv-theme');
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch (e) { document.documentElement.dataset.theme = 'light'; }
