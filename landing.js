const oldLink = new URLSearchParams(location.hash.slice(1));
if (oldLink.has('event') || oldLink.has('receipt')) {
  location.replace(new URL('./app.html' + location.hash, location.href));
}
