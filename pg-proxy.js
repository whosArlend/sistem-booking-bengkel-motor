const net = require('net');
const { execSync } = require('child_process');

const wslIp = execSync('wsl hostname -I', { encoding: 'utf8' }).trim().split(/\s+/)[0];
console.log('WSL IP:', wslIp);

const server = net.createServer((client) => {
  const target = net.connect(5432, wslIp);
  client.pipe(target).pipe(client);
  client.on('error', () => target.destroy());
  target.on('error', () => client.destroy());
});

server.listen(5432, '0.0.0.0', () => {
  console.log(`Proxy running on 5432 -> ${wslIp}:5432`);
});
