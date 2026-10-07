// Example widget: shows the instrument other widgets select (fdc3.instrument), publishes its own selection,
// and shows a toast. Replace with your logic; keep DOM updates through textContent / CSSOM (platform CSP).
import { $ } from './boot.js';

export async function start({ bridge, mode, toast }) {
  $('#mode').textContent = mode === 'host' ? 'in host' : 'standalone';

  bridge.context.subscribe('fdc3.instrument', payload => {
    const id = (payload && payload.id) || {};
    $('#instrument').textContent = id.ticker ? id.ticker + (id.mic ? ' @ ' + id.mic : '') : 'none';
  });

  $('#pick').addEventListener('click', () => {
    const ticker = $('#ticker').value.trim().toUpperCase();
    if (!ticker) return;
    bridge.context.publish('fdc3.instrument', { type: 'fdc3.instrument', id: { ticker } });
    toast('Sent ' + ticker + ' to neighbours', 'success');
  });
}
