// Raw serial test — reads every byte from ESP32
const { SerialPort } = require('serialport');

const SERIAL_PORT = process.env.SERIAL_PORT || 'COM4';
const BAUD = 115200;

console.log(`Opening ${SERIAL_PORT} @ ${BAUD}...`);
console.log('Send a LoRa packet from the Pi to trigger ESP32 output!\n');

const port = new SerialPort({ path: SERIAL_PORT, baudRate: BAUD });

let buffer = '';

port.on('open', () => {
  console.log('PORT OPEN — waiting for ANY bytes...\n');
});

// Read raw data events
port.on('data', (chunk) => {
  const hex = chunk.toString('hex');
  const ascii = chunk.toString('ascii').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  console.log(`[BYTES] hex=${hex}  ascii="${ascii}"  len=${chunk.length}`);

  // Also accumulate into lines
  buffer += chunk.toString('ascii');
  let lines = buffer.split('\n');
  while (lines.length > 1) {
    const line = lines.shift().replace(/\r$/, '');
    console.log(`[LINE] >>> "${line}" <<<`);
  }
  buffer = lines[0];
});

port.on('error', (err) => {
  console.log('ERROR:', err.message);
});

setTimeout(() => {
  console.log('\n60s timeout — closing.');
  if (buffer.length > 0) console.log(`[LEFTOVER] "${buffer}"`);
  port.close();
  process.exit(0);
}, 60000);
