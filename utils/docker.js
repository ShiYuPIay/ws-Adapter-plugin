import fs from 'fs'
import { execSync } from 'child_process'

export function isInDocker() {
  try {
    return fs.existsSync('/.dockerenv') ||
      fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker')
  } catch {
    return false
  }
}

/**
 * Try to read the Docker bridge gateway IP from the host's default route.
 * On Linux Docker this is typically 172.17.0.1; falls back to that if detection fails.
 */
export function getDockerGatewayIp() {
  try {
    // Works on Linux: reads the gateway from the default route table
    const out = execSync("ip route | awk '/default/ {print $3; exit}'", { timeout: 1000 }).toString().trim()
    if (/^\d+\.\d+\.\d+\.\d+$/.test(out)) return out
  } catch {}
  return '172.17.0.1'  // Linux Docker bridge default
}

export function getRecommendedUrls() {
  const inDocker = isInDocker()
  const gatewayIp = inDocker ? getDockerGatewayIp() : null

  return {
    inDocker,
    gatewayIp,
    // Same-network hostname resolution (only works when containers share a Docker network)
    snowlumaDocker: 'ws://snowluma:3001/',
    // Linux Docker bridge gateway — cross-network, works when port is mapped to host
    snowlumaGateway: gatewayIp ? `ws://${gatewayIp}:3001/` : null,
    // Docker Desktop (Mac/Windows) equivalent of the gateway
    hostInternal: 'ws://host.docker.internal:3001/',
    // Loopback — works when running outside Docker or in host-network mode
    snowlumaLocal: 'ws://127.0.0.1:3001/'
  }
}
