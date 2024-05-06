# sish-client

Bun client for [sish](https://github.com/antoniomika/sish)

## Usage

```ts
import { SishClient } from "sish-client";

const tunnel = new SishClient({
  local_host: "localhost",
  local_port: 3000,
  remote_port: 80,
  sish_host: "tuns.sh",
  subdomain: "awesome-site",
});

tunnel.on("ready", (type: "HTTP" | "TCP", link: string) => {
  console.log("Connected", type, link);
});

tunnel.on("log", (message: string) => {
  console.log(message);
});
```
