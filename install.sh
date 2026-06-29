#!/bin/bash
set -e

SAXI_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="saxi"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=== Saxi GRBL Install Script ==="
echo "Saxi directory: $SAXI_DIR"
echo ""

# --- Node.js ---
if ! command -v node &>/dev/null; then
    echo "[1/4] Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "[1/4] Node.js $(node --version) already installed."
fi

# --- Serial port permissions ---
echo "[2/4] Adding $USER to dialout group..."
sudo usermod -a -G dialout "$USER"

# --- Build ---
echo "[3/4] Installing dependencies and building..."
cd "$SAXI_DIR"
npm install
npx tsc && npx webpack --mode=production

# --- Systemd service ---
echo "[4/4] Installing systemd service..."
sudo cp "$(dirname "$0")/saxi.service" "$SERVICE_FILE"
sudo sed -i "s|__USER__|${USER}|g" "$SERVICE_FILE"
sudo sed -i "s|__SAXI_DIR__|${SAXI_DIR}|g" "$SERVICE_FILE"
sudo sed -i "s|/usr/bin/node|$(which node)|g" "$SERVICE_FILE"

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo ""
echo "=== Terminé ! ==="
echo "Saxi tourne sur http://$(hostname -I | awk '{print $1}'):9080"
echo ""
echo "Commandes utiles :"
echo "  sudo journalctl -fu saxi     # logs en direct"
echo "  sudo systemctl restart saxi  # redémarrer"
echo "  sudo systemctl stop saxi     # arrêter"
