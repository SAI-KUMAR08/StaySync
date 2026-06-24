window.__onError = function(err) {
  var d = document.createElement('div');
  d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#EF4444;color:white;padding:16px;font-size:14px;z-index:99999;font-family:monospace;white-space:pre-wrap;';
  d.textContent = 'RUNTIME ERROR: ' + (err?.message || err || 'Unknown');
  document.body.appendChild(d);
};
window.addEventListener('error', function(e) { window.__onError(e.error || e.message); });
window.addEventListener('unhandledrejection', function(e) { window.__onError(e.reason?.message || 'Promise rejected'); });
