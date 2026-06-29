#!/bin/bash
# Find a Raspberry Pi on the local network.
# Tries mDNS first, then falls back to nmap with Pi MAC prefixes.

set -e

# Known Raspberry Pi MAC address prefixes (OUI)
PI_OUI="DC:A6:32\|B8:27:EB\|E4:5F:01\|28:CD:C1\|2C:CF:67"

echo "Searching for Raspberry Pi on local network..."
echo ""

# --- Method 1: mDNS ---
IP=$(getent ahostsv4 raspberrypi.local 2>/dev/null | awk '{print $1}' | head -1)
if [ -n "$IP" ]; then
    echo "Found via mDNS: raspberrypi.local → $IP"
    echo ""
    echo "Saxi: http://$IP:9080"
    exit 0
fi

# --- Method 2: nmap ---
if ! command -v nmap &>/dev/null; then
    echo "nmap not found. Install it with:"
    echo "  sudo pacman -S nmap    # Arch"
    echo "  sudo apt install nmap  # Debian/Pi OS"
    exit 1
fi

# Detect local subnet
SUBNET=$(ip route | grep -v default | grep 'src' | awk '{print $1}' | grep '/' | head -1)
if [ -z "$SUBNET" ]; then
    SUBNET=$(ip route | grep -v default | awk '{print $1}' | grep '/' | head -1)
fi

if [ -z "$SUBNET" ]; then
    echo "Could not detect local subnet. Specify it manually:"
    echo "  nmap -sn 192.168.1.0/24 | grep -B2 'Raspberry'"
    exit 1
fi

echo "Scanning $SUBNET for Raspberry Pi MAC addresses..."
RESULT=$(sudo nmap -sn "$SUBNET" 2>/dev/null | grep -B2 -i "raspberry\|$PI_OUI" || true)

if [ -z "$RESULT" ]; then
    echo "No Raspberry Pi found on $SUBNET"
    echo ""
    echo "Make sure the Pi is on and connected to the same network."
else
    IP=$(echo "$RESULT" | grep -oP '(?<=scan report for )[0-9.]+' | head -1)
    echo "$RESULT"
    echo ""
    if [ -n "$IP" ]; then
        echo "Saxi: http://$IP:9080"
    fi
fi
