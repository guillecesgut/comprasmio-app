import WebSocket from 'ws';
const sellerId = process.argv[2];
const ws = new WebSocket('ws://localhost:4000/ws');
let got = false;
ws.on('open', () => ws.send(JSON.stringify({ type: 'subscribe', channel: `seller:${sellerId}` })));
ws.on('message', (raw) => {
  const { type, payload } = JSON.parse(raw.toString());
  if (type === 'thread:new') {
    console.log('RESULTADO: recibido thread:new en canal seller ->', payload.message.from, ':', payload.message.text.slice(0, 40));
    got = true;
    ws.close();
  }
});
setTimeout(() => { if (!got) console.log('RESULTADO: nunca llegó'); process.exit(got ? 0 : 1); }, 5000);
