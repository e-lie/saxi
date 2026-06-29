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
  { cmd: 'M3',             label: 'PEN UP' },
  { cmd: 'G4 P0.5',        label: 'wait servo' },
  { cmd: 'M5',             label: 'PEN DOWN' },
  { cmd: 'G4 P0.5',        label: 'wait servo' },
  { cmd: 'G1 X30 Y0 F1000', label: 'draw 30mm right' },
  { cmd: 'G4 P0.2',        label: 'dwell' },
  { cmd: 'M3',             label: 'PEN UP' },
  { cmd: 'G1 X0 Y0 F3000', label: 'return home' },
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

parser.on('data', (raw) => {
  const line = raw.trim();
  if (!line || line.startsWith('<') || line.startsWith('Grbl')) return;
  console.log(`< ${line}`);
  if (line === 'ok' || line.startsWith('error') || line.startsWith('ALARM')) {
    sendNext(port);
  }
});

port.on('open', () => {
  console.log('Port open. Starting in 1s...\n');
  setTimeout(() => sendNext(port), 1000);
});

port.on('error', (err) => {
  console.error('Serial error:', err.message);
  process.exit(1);
});
