import { RegexParser } from "./regex-transform-stream";
import { Motion, PenMotion, Plan, XYMotion } from "./planning";

interface PendingCommand {
  resolve: (lines: string[]) => void;
  reject: (e: Error) => void;
  lines: string[];
}

export class GRBL {
  public port: SerialPort;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private commandQueue: PendingCommand[] = [];

  public constructor(port: SerialPort) {
    this.port = port;
    this.writer = this.port.writable.getWriter();

    port.readable
      .pipeThrough(new RegexParser({ regex: /[\r\n]+/ }))
      .pipeTo(new WritableStream({
        write: (chunk) => {
          const line = (chunk as any).toString().trim();
          if (!line) return;
          // Startup banner and real-time status reports — ignore
          if (line.startsWith('<') || line.startsWith('Grbl ') || line === 'Grbl') return;
          // Feedback messages like [MSG:...] [VER:...] [OPT:...] — accumulate into current command
          if (line.startsWith('[')) {
            if (this.commandQueue[0]) this.commandQueue[0].lines.push(line);
            return;
          }

          const pending = this.commandQueue.shift();
          if (!pending) {
            console.log(`GRBL unexpected: ${line}`);
            return;
          }
          if (line === 'ok') {
            pending.resolve(pending.lines);
          } else if (line.startsWith('error:')) {
            pending.reject(new Error(`GRBL ${line}`));
          } else if (line.startsWith('ALARM:')) {
            pending.reject(new Error(`GRBL alarm: ${line}`));
          } else {
            // Unknown line — log and resolve anyway so the queue doesn't stall
            console.log(`GRBL unknown response: ${line}`);
            pending.resolve(pending.lines);
          }
        }
      }));
  }

  private write(str: string): Promise<void> {
    if (process.env.DEBUG_SAXI_COMMANDS) {
      console.log(`GRBL > ${str.trim()}`);
    }
    const encoder = new TextEncoder();
    return this.writer.write(encoder.encode(str));
  }

  /** Send a G-code command and wait for the `ok` response. */
  public command(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve: () => resolve(), reject, lines: [] });
      this.write(`${cmd}\n`);
    });
  }

  private commandWithResponse(cmd: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve, reject, lines: [] });
      this.write(`${cmd}\n`);
    });
  }

  public async close(): Promise<void> {
    return this.port.close();
  }

  /** Unlock alarm and set mm + absolute mode. `microsteppingMode` is ignored (GRBL uses firmware config). */
  public async enableMotors(_microsteppingMode?: number): Promise<void> {
    await this.command('$X');         // unlock alarm
    await this.command('M3 S50');     // pen up before any move
    await this.command('G21');        // mm mode
    await this.command('G90');        // absolute coordinates
    await this.command('G92 X0 Y0'); // current pen position = origin (0,0)
    await this.command('$1=255');     // keep motors energized during plot
    await this.command('G1 F4000');  // default feed rate mm/min
  }

  public async disableMotors(): Promise<void> {
    // No direct equivalent in GRBL
  }

  /** GRBL has no servo power timeout — always false. */
  public async supportsSR(): Promise<boolean> {
    return false;
  }

  /** No-op — only called when supportsSR() is true. */
  public setServoPowerTimeout(_timeout: number, _power?: boolean): Promise<void> {
    return Promise.resolve();
  }

  /** No-op — pen control is handled via executePenMotion (M3/M5). */
  public setPenHeight(_height: number, _rate: number, _delay = 0): Promise<void> {
    return Promise.resolve();
  }

  public async setPenUp(): Promise<void> {
    await this.command('M3 S50');
  }

  public async setPenDown(): Promise<void> {
    await this.command('M5');
  }

  /** Wait for all buffered motion to complete by sending a zero-dwell G4. */
  public async waitUntilMotorsIdle(): Promise<void> {
    await this.command('G4 P0');
  }

  /** Returns the GRBL build info string via $I. */
  public async firmwareVersion(): Promise<string> {
    const lines = await this.commandWithResponse('$I');
    return lines.join(' ') || 'GRBL (unknown version)';
  }

  public async executeMotion(m: Motion): Promise<void> {
    if (m instanceof XYMotion) {
      await this.executeXYMotion(m);
    } else if (m instanceof PenMotion) {
      await this.executePenMotion(m);
    } else {
      throw new Error(`Unknown motion type: ${(m as any).constructor.name}`);
    }
  }

  private async executeXYMotion(motion: XYMotion): Promise<void> {
    for (const block of motion.blocks) {
      const vMax = Math.max(block.vInitial, block.vFinal);
      if (vMax === 0) continue;
      const feedRate = Math.round(vMax * 60); // mm/s → mm/min
      const x = block.p2.x.toFixed(3);
      const y = block.p2.y.toFixed(3);
      await this.command(`G1 X${x} Y${y} F${feedRate}`);
    }
  }

  private async executePenMotion(pm: PenMotion): Promise<void> {
    if (pm.isUp) {
      await this.command('G4 P0.2');  // dwell before lift
      await this.command('M3 S50');   // pen up
      await this.command('G4 P0.2');  // wait for servo to settle
    } else {
      await this.command('M5');       // pen down
      await this.command('G4 P0.5'); // wait for servo to settle before drawing
    }
  }

  public async executePlan(plan: Plan): Promise<void> {
    await this.enableMotors();
    for (const m of plan.motions) {
      await this.executeMotion(m);
    }
    await this.waitUntilMotorsIdle();
  }
}
