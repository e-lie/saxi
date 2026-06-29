#!/usr/bin/env node
// Test script: move to X150 Y150 then draw a circle of radius 20mm.
// Usage: node test3.js [--device /dev/ttyUSB0]

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const args = process.argv.slice(2);
const deviceIdx = args.indexOf('--device');
const device = deviceIdx !== -1 ? args[deviceIdx + 1] : '/dev/ttyUSB0';

const R = 20;
const CX = 150; // circle center X
const CY = 150; // circle center Y

// Start point of arc: center + R on Y axis
const SY = CY + R;

const COMMANDS = [
  { cmd: '$X',                                   label: 'unlock alarm' },
  { cmd: 'G21',                                  label: 'mm mode' },
  { cmd: 'G90',                                  label: 'absolute coords' },
  { cmd: 'G92 X0 Y0',                            label: 'set origin here' },
  { cmd: 'M3 S50',                               label: 'PEN UP' },
  { cmd: 'G4 P0.5',                              label: 'wait servo' },
  { cmd: `G1 X${CX} Y${SY} F3000`,              label: `move to circle start (X${CX} Y${SY})` },
  { cmd: 'G4 P0.2',                              label: 'dwell' },
  { cmd: 'M5',                                   label: 'PEN DOWN' },
  { cmd: 'G4 P0.5',                              label: 'wait servo' },
  { cmd: `G2 X${CX} Y${SY} I0 J${-R} F1000`,   label: 'draw full circle (CW)' },
  { cmd: 'G4 P0.2',                              label: 'dwell' },
  { cmd: 'M3 S50',                               label: 'PEN UP' },
  { cmd: 'G1 X0 Y0 F3000',                       label: 'return home' },
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
