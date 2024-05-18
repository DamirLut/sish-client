import type { Subprocess } from "bun";
import EventEmitter from "events";
import PackageJson from "./package.json";

interface ReadableStream<R = any> {
  [Symbol.asyncIterator](): AsyncIterableIterator<R>;
}

export type SishClientConfig = {
  local_port: number;
  remote_port?: number;
  local_host?: string;
  subdomain?: string;
  sish_host?: string;
};

interface SishClientEvents {
  ready: (type: "TCP" | "HTTPS", tunnel: string) => void;
  log: (data: string) => void;
  close: (exitCode: number) => void;
}

export interface SishClient {
  on<U extends keyof SishClientEvents>(
    event: U,
    listener: SishClientEvents[U]
  ): this;

  emit<U extends keyof SishClientEvents>(
    event: U,
    ...args: Parameters<SishClientEvents[U]>
  ): boolean;
}

export class SishClient extends EventEmitter {
  private _tunnelURL?: string;

  private _ready = false;

  private process: Subprocess<"ignore", "pipe", "inherit">;

  get tunnelURL() {
    return this._tunnelURL;
  }

  get version() {
    return PackageJson.version;
  }

  constructor({
    local_host = "localhost",
    local_port,
    remote_port = 80,
    subdomain,
    sish_host,
  }: SishClientConfig) {
    super({});

    if (!sish_host) {
      throw new Error("sish_host not provided");
    }

    if (subdomain && remote_port !== 80) {
      throw new Error("TCP alias not supported");
    }

    let params = `${remote_port}:${local_host}:${local_port}`;

    if (subdomain) {
      params = subdomain + ":" + params;
    }

    const spawn_args = [
      "ssh",
      "-o StrictHostKeyChecking=no",
      "-T", /// disable pseudo-tty allocation.
      `-R ${params}`,
      sish_host,
    ];

    this.process = Bun.spawn(spawn_args, {
      onExit: (process) => {
        this.emit("close", process.exitCode || 0);
      },
    });

    this.processStdout();
  }

  disconnect() {
    this.process.kill();
    this._tunnelURL = undefined;
  }

  private async processStdout() {
    if (!(this.process.stdout instanceof ReadableStream)) return;
    const stdout = this.process.stdout as unknown as ReadableStream;
    const decoder = new TextDecoder();

    const ANSIStyleRegex =
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

    for await (const data of stdout) {
      const lines = decoder.decode(data).split("\r\n");
      for (const line of lines) {
        if (!line) continue; /// skip empty lines
        const clearText = line.replace(ANSIStyleRegex, "");

        if (clearText.startsWith("HTTP: ")) {
          this._tunnelURL = clearText
            .replace("HTTP: ", "")
            .replace("http", "https");
          this._ready = true;
          this.emit("ready", "HTTPS", this._tunnelURL);
        } else if (clearText.startsWith("TCP: ")) {
          this._tunnelURL = clearText.replace("TCP: ", "");
          this._ready = true;
          this.emit("ready", "TCP", this._tunnelURL);
        } else {
          /// skip output before ready
          if (!this._ready) continue;
          this.emit("log", line);
        }
      }
    }
  }
}
