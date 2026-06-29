#!/usr/bin/env node
// Test script: pen up, pen down, draw 30mm line to the right.
// Usage: node test1.js [--device /dev/ttyUSB0]

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const args = process.argv.slice(2);
const deviceIdx = args.indexOf('--device');
const device = deviceIdx !== -1 ? args[deviceIdx + 1] : '/dev/ttyUSB0';

const COMMANDS = [
  { cmd: '$X',             label: 'unlock alarm' },
  { cmd: 'G21',            label: 'mm mode' },
  { cmd: 'G90',            label: 'absolute coords' },
  { cmd: 'G92 X0 Y0',      label: 'set origin here' },
  { cmd: 'M3 S50',          label: 'PEN UP' },
  { cmd: 'G4 P0.5',        label: 'wait servo' },
  { cmd: 'M5',             label: 'PEN DOWN' },
  { cmd: 'G4 P0.5',        label: 'wait servo' },
  { cmd: 'G1 X0 Y30 F1000', label: 'draw 30mm right (Y=horizontal on this machine)' },
  { cmd: 'G4 P0.2',        label: 'dwell' },
  { cmd: 'M3 S50',          label: 'PEN UP' },
  { cmd: 'G1 X0 Y0 F3000', label: 'return home' },
  // NOTE: pen control via M3/M5 doesn't work — replace with correct command below
  // Try Z axis: G0 Z5 (up) / G0 Z0 (down)

];

let idx = 0;

function sendNext(port) {
  if (idx >= COMMANDS.length) {
    console.log('\nDone!');
    port.close();
    return;
  }
  const { cmd, label } = COMMANDS[idx++];
  console.log(`> [${label}] ${cmd}`);
  port.write(cmd + '\n');
}

console.log(`Connecting to ${device} at 115200 baud...`);
const port = new SerialPort({ path: device, baudRate: 115200 });
const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

let ready = false;

parser.on('data', (raw) => {
  const line = raw.trim();
  if (!line) return;
  console.log(`< "${line}"`);

  // Wait for GRBL startup banner before sending anything
  if (!ready && line.startsWith('Grbl')) {
    ready = true;
    console.log('GRBL ready, starting sequence...\n');
    setTimeout(() => sendNext(port), 200);
    return;
  }

  if (line === 'ok' || line.startsWith('error') || line.startsWith('ALARM')) {
    sendNext(port);
  }
});

port.on('open', () => {
  console.log('Port open. Waiting for GRBL banner...\n');
  // Fallback: if no banner after 3s (Arduino without auto-reset), start anyway
  setTimeout(() => {
    if (!ready) {
      ready = true;
      console.log('No banner received, starting anyway...\n');
      sendNext(port);
    }
  }, 3000);
});

port.on('error', (err) => {
  console.error('Serial error:', err.message);
  process.exit(1);
});
