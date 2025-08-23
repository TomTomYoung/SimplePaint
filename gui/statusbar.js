export function updateStatus(message) {
  const el = document.getElementById('status');
  if (el) {
    el.textContent = message;
  }
}

export function updateZoom(percentage) {
  const el = document.getElementById('zoomPct');
  if (el) {
    el.textContent = `${percentage}%`;
  }
}
