# Monitoring API (for /homelab)

huismax.com/homelab reads the Huismax Monitoring API at **https://api.huismax.com**: FastAPI over Prometheus, reached through Cloudflare Tunnel. The Worker calls it and hands the browser its own cleaned-up copy. Visitors never see the API's address, any token, or a LAN address.

## Connecting it

`MONITORING_API_URL` is set to `https://api.huismax.com` in `wrangler.jsonc` (vars). If the API ever needs a token, add the Secret `MONITORING_API_TOKEN` in Cloudflare → Workers → huismax → Settings → Variables and Secrets. It is sent as `Authorization: Bearer <token>`.

With no `MONITORING_API_URL` (local dev without one), /homelab shows demo data labelled "demo data". `/admin` → homelab shows which mode the site is in.

## Which endpoints the site uses

The site asks for **`/v1/servers`** first (the contract below). While FastAPI doesn't have it yet (a 404), the site reads the **existing endpoints** instead, and checks again for `/v1` every 10 minutes. Adding the `/v1` compatibility layer to FastAPI later needs no change on the website.

### Today: the existing endpoints (`src/lib/homelab-api.ts`)

| The site needs | It reads |
|---|---|
| Servers, CPU %, memory %, memory total, uptime, status (`online` → up) | `GET /servers` |
| Disks per server (`/boot` and `/boot/efi` left out) | `GET /storage` → `filesystems[]` |
| Network rate per server | `GET /network` → `network[]` |
| Containers: name, state, CPU %, memory | `GET /containers` → `containers[]` |
| Name, role, OS, kernel, CPU model, vCPUs, virtualization, Docker engine | `GET /system-info` → `systems[]` (optional) |
| History: CPU, memory, network in / out | `GET /history/{cpu,memory,network_rx,network_tx}?server=<id>&hours=1\|24\|168` |

- Containers have no server field. They go to the server whose system-info has a Docker engine (docker-server). If a container ever carries a `server` field, that wins.
- A server without a system-info entry (monitoring, for now) shows its id as its name, and no OS line. Adding it to the inventory fills that in.
- Never read: `instance`, `network.ipv4`, and the Prometheus labels in `/history` (they hold LAN addresses).

### Later: the /v1 contract (the compatibility layer FastAPI can add)

Two GET endpoints, both answering JSON with status 200. Each request gets 5 seconds to answer.

#### `GET {base}/v1/servers`

Everything about every server, right now. Asked at most every 15 s per Cloudflare location.

```json
{
  "generatedAt": "2026-10-05T12:00:00Z",
  "servers": [
    {
      "id": "atlas",
      "name": "atlas",
      "role": "hypervisor",
      "status": "up",
      "lastSeen": "2026-10-05T11:59:58Z",
      "uptimeSeconds": 3542400,
      "cpu": { "usagePercent": 23.5, "load": [2.1, 1.8, 1.6], "temperatureC": 48 },
      "memory": { "usedBytes": 40000000000, "totalBytes": 68719476736 },
      "swap": { "usedBytes": 0, "totalBytes": 8589934592 },
      "storage": [
        { "mount": "/", "label": "system", "fs": "ext4", "usedBytes": 170000000000, "totalBytes": 511000000000 }
      ],
      "network": { "rxBytesPerSec": 2200000, "txBytesPerSec": 750000 },
      "interfaces": [
        { "name": "eth0", "rxBytesPerSec": 2200000, "txBytesPerSec": 750000, "speedMbps": 1000, "up": true }
      ],
      "system": {
        "hostname": "atlas", "os": "Debian 12", "kernel": "6.1.0-25-amd64", "arch": "x86_64",
        "cpuModel": "AMD Ryzen 9 5950X", "cores": 16, "threads": 32,
        "virtualization": "bare metal", "bootTime": "2026-08-25T08:00:00Z", "dockerVersion": "27.3.1"
      },
      "containers": [
        {
          "name": "nextcloud", "image": "nextcloud:29-apache", "state": "running", "status": "Up 3 days",
          "health": "healthy", "cpuPercent": 1.2, "memoryBytes": 671088640, "memoryLimitBytes": 68719476736,
          "restartCount": 0, "startedAt": "2026-10-02T09:00:00Z"
        }
      ]
    }
  ]
}
```

- **Required:** `id` and `lastSeen`. Everything else is optional; a missing field shows as "—".
- **`id`:** letters, digits, `-` and `_`, up to 40 characters. It becomes the page address: `/homelab/atlas`.
- **`lastSeen`:** when this server last reported. Older than 3 minutes means the server shows as **down**.
- **`status`** (optional): `up`, `degraded` or `down`. The site also works it out on its own:
  - **degraded:** CPU or memory at 90% or more, a disk at 90% or more, or a container that is `unhealthy`, `restarting` or `dead`;
  - **down:** no report for 3 minutes.
- **Units:** bytes, bytes per second, percentages from 0 to 100. Times can be ISO 8601 strings, or epoch seconds or milliseconds.
- **`containers[].state`:** Docker's state: `running`, `paused`, `restarting`, `created`, `exited` or `dead`. `health` is `healthy`, `unhealthy` or `starting`.
- **Accepted alternative names:** `used`/`total` for `usedBytes`/`totalBytes`; `rx`/`tx` for the `…BytesPerSec` fields; `usage` for `usagePercent`.

#### `GET {base}/v1/servers/{id}/history?range=1h|24h|7d`

CPU, memory and network over time, for the charts. Ranges: `1h`, `24h` and `7d`. Suggested steps: 1 minute, 15 minutes and 1 hour (about 60–170 points). Asked at most every 1, 5 and 15 minutes respectively.

```json
{
  "points": [
    { "t": "2026-10-05T11:00:00Z", "cpu": 21.5, "memory": 61.2, "rx": 1800000, "tx": 420000 },
    { "t": "2026-10-05T11:01:00Z", "cpu": null, "memory": 61.0, "rx": null, "tx": null }
  ]
}
```

- `cpu` and `memory` are percentages; `rx` and `tx` are bytes per second.
- `null` is a gap; the line breaks there.
- The site only asks for ids that `/v1/servers` lists.

## What never reaches the page

The Worker keeps only the fields above. Even inside them, anything that looks like an IPv4, IPv6 or MAC address is replaced with `•••`. Ports, addresses and credentials stay on your side.

If the API stops answering, the page shows its last good answer, marked "stale", for up to a week. With nothing kept, it says monitoring is unreachable.
