# Monitoring API (for /homelab)

huismax.com/homelab reads one small HTTPS JSON API, which runs on your side (next to Prometheus, Netdata, a script, anything). The Worker calls it and passes the browser its own cleaned-up copy. Visitors never see the API's address or token.

## Connecting it

Cloudflare → Workers → huismax → Settings → Variables and Secrets:

| Name | Type | Value |
|---|---|---|
| `MONITORING_API_URL` | Text | Base URL, e.g. `https://monitor.example.com/api` (https only) |
| `MONITORING_API_TOKEN` | Secret | Optional. Sent as `Authorization: Bearer <token>` |

Until `MONITORING_API_URL` is set, /homelab shows demo data labelled "demo data". Once it is set, the page shows only what the API reports. `/admin` → homelab shows which mode the site is in.

## Endpoints

Two GET endpoints, both answering JSON with status 200. Each request gets 5 seconds to answer.

### `GET {base}/v1/servers`

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

### `GET {base}/v1/servers/{id}/history?range=1h|24h|7d`

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
