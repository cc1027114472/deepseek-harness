import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import type { LanAddressInfo } from './types.ts'

/**
 * Well-known virtual network adapter name keywords (case-insensitive).
 */
const VIRTUAL_NAME_PATTERNS = [
  'vmware',
  'vmnet',
  'virtual',
  'vbox',
  'vethernet',
  'wsl',
  'hyper-v',
  'docker',
  'container',
  'veth',
  'virbr',
  'br-',
  'tailscale',
  'zerotier',
  'wireguard',
  'wg',
  'clash',
  'meta',
  'tun',
  'tap',
  'utun',
  'npcap',
  'loopback',
  'pseudo',
  'bluetooth',
  'teredo',
  'isatap',
  '6to4',
]

/**
 * Well-known virtual adapter MAC OUI prefixes (lower-case, first 8 characters "xx:xx:xx").
 */
const VIRTUAL_MAC_OUIS = new Set([
  '00:50:56', // VMware
  '00:0c:29', // VMware
  '00:05:69', // VMware
  '00:15:5d', // Microsoft Hyper-V / WSL
  '08:00:27', // Oracle VirtualBox
  '0a:00:27', // Oracle VirtualBox
  '00:1c:42', // Parallels
  '52:54:00', // QEMU / KVM
  '00:16:3e', // Xen
])

/** Check whether a network interface is virtual based on its name or MAC address. */
export function isVirtualInterface(name: string, mac?: string): boolean {
  const lowerName = name.toLowerCase()
  for (const pattern of VIRTUAL_NAME_PATTERNS) {
    if (lowerName.includes(pattern)) return true
  }
  if (mac) {
    const oui = mac.toLowerCase().slice(0, 8)
    if (VIRTUAL_MAC_OUIS.has(oui)) return true
  }
  return false
}

/** Rank IPv4 subnets so that physical home/office subnets sort first. */
function subnetPriority(ip: string): number {
  if (ip.startsWith('192.168.')) return 1
  if (ip.startsWith('10.')) return 2
  const parts = ip.split('.').map(Number)
  if (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) return 3
  return 4
}

/**
 * Resolve accessible physical LAN addresses, excluding virtual/container adapters.
 * If all adapters are virtual (e.g. running inside a cloud VM), falls back to all non-internal IPv4.
 *
 * @param port - Active web server listening port.
 * @param customInterfaces - Optional interface dictionary for testing.
 * @returns Array of LanAddressInfo objects.
 */
export function resolvePhysicalLanAddresses(
  port: number,
  customInterfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>,
): LanAddressInfo[] {
  const ifaces = customInterfaces ?? networkInterfaces()
  const physicalEntries: { name: string; ip: string }[] = []
  const allValidEntries: { name: string; ip: string }[] = []

  for (const [name, list] of Object.entries(ifaces)) {
    if (!list) continue
    for (const iface of list) {
      if (
        iface.family === 'IPv4' &&
        !iface.internal &&
        !iface.address.startsWith('127.') &&
        !iface.address.startsWith('169.254.') &&
        iface.address !== '0.0.0.0'
      ) {
        allValidEntries.push({ name, ip: iface.address })
        if (!isVirtualInterface(name, iface.mac)) {
          physicalEntries.push({ name, ip: iface.address })
        }
      }
    }
  }

  // Sort entries by subnet priority
  physicalEntries.sort((a, b) => subnetPriority(a.ip) - subnetPriority(b.ip))
  allValidEntries.sort((a, b) => subnetPriority(a.ip) - subnetPriority(b.ip))

  const selected = physicalEntries.length > 0 ? physicalEntries : allValidEntries

  // Deduplicate by IP address while preserving priority
  const seenIps = new Set<string>()
  const result: LanAddressInfo[] = []
  for (const entry of selected) {
    if (!seenIps.has(entry.ip)) {
      seenIps.add(entry.ip)
      result.push({
        name: entry.name,
        ip: entry.ip,
        url: `http://${entry.ip}:${port}`,
      })
    }
  }

  return result
}
