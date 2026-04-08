#!/bin/bash
set -e

# Configuration
PROJECT_DIR="/home/mac-m4/openhub"
HUB_SERVICE="openhub-hub"
GATEWAY_SERVICE="openhub-gateway"

echo "--- Starting Remote Build and Setup ---"

# 1. Update and install basic dependencies
sudo apt-get update
sudo apt-get install build-essential pkg-config libssl-dev curl git postgresql postgresql-contrib -y

# 1.1 Initialize Database if not exists
echo "Initializing Database..."
# Ensure postgresql is actively running before we try to connect
sudo systemctl start postgresql || sudo systemctl restart postgresql || true
sleep 3

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='xinference'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER xinference WITH PASSWORD 'password' SUPERUSER;" || echo "Failed to create user, DB might be down"
sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw openhub || sudo -u postgres psql -c "CREATE DATABASE openhub OWNER xinference;" || echo "Failed to create database, DB might be down"

# 2. Check for Swap (Rust build needs it)
if ! free | grep -i swap > /dev/null; then
    echo "Creating 2GB Swap file for Rust compilation..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# 3. Install Rustup if missing
# First, try to source the env to see if it's already installed
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

if ! command -v rustc &> /dev/null; then
    echo "Installing Rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
else
    rustup update stable
    rustup toolchain list | grep -v stable | xargs -I {} rustup toolchain uninstall {} || true
fi

# 4. Install Node.js if missing (using NodeSource)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 5. Output versions
node -v
npm -v
cargo -V

# 6. Build Node packages (Web and Hub + Packages)
echo "Building Node workspace (Frontend / Hub / Shared)..."
cd $PROJECT_DIR
npm install
npm run build -w @openhub/web
# Note: npm install prepares node_modules for @openhub/hub since we run it at project root.

# 7. Build Gateway (Rust)
echo "Building Gateway (this may take a few minutes)..."
cd $PROJECT_DIR/gateway
cargo build --release

# 7.1 Reclaim disk space! (CRITICAL for 10GB GCP VMs)
echo "Extracting binary and sweeping rust compilation caches..."
mkdir -p $PROJECT_DIR/gateway/bin
cp target/release/gateway $PROJECT_DIR/gateway/bin/gateway
rm -rf target/
rm -rf ~/.cargo/registry/
rm -rf /root/.cargo/registry/

# 8. Restart Services
echo "Configuring and Restarting Systemd Services..."
sudo cp $PROJECT_DIR/deploy/openhub-hub.service /etc/systemd/system/openhub-hub.service
sudo cp $PROJECT_DIR/deploy/openhub-gateway.service /etc/systemd/system/openhub-gateway.service
sudo systemctl daemon-reload

# Fix ownership back to the execution user since 'sudo bash' created node_modules and target as root!
sudo chown -R mac-m4:mac-m4 $PROJECT_DIR

sudo systemctl enable $HUB_SERVICE
sudo systemctl enable $GATEWAY_SERVICE

sudo systemctl restart $HUB_SERVICE
sudo systemctl restart $GATEWAY_SERVICE

echo "--- Deployment Complete ---"
