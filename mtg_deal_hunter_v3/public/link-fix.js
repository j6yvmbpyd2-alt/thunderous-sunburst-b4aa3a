document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;

  const label = (button.textContent || '').trim().toLowerCase();
  if (!['open deal', 'open scryfall', 'open listing'].includes(label)) return;

  const code = button.getAttribute('onclick') || '';
  const match = code.match(/(?:window\.open|location\.assign)\(\s*(["'])(.*?)\1/);
  if (!match || !match[2]) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    const destination = new URL(match[2], window.location.href);
    if (destination.protocol === 'http:' || destination.protocol === 'https:') {
      window.location.href = destination.href;
    }
  } catch {}
}, true);
