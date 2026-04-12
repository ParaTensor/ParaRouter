#!/bin/bash
set -e

# Configuration
PROJECT_DIR="/root/openhub"
HUB_SERVICE="openhub-hub"
GATEWAY_SERVICE="openhub-gateway"

echo "--- Starting Remote Build and Setup ---"

# 0. Stop running services first (proper deployment: stop → build → start)
echo "Stopping existing services..."
sudo systemctl stop $HUB_SERVICE || true
sudo systemctl stop $GATEWAY_SERVICE || true
sudo systemctl stop xrouter-hub || true
sudo systemctl stop xrouter-gateway || true
sudo systemctl disable xrouter-hub || true
sudo systemctl disable xrouter-gateway || true

# 1. Update and install basic dependencies
if command -v yum &> /dev/null; then
    sudo yum update -y || true
    sudo yum install -y gcc gcc-c++ make pkgconfig openssl-devel curl git postgresql-server postgresql-contrib
else
    sudo apt-get update
    sudo apt-get install build-essential pkg-config libssl-dev curl git postgresql postgresql-contrib -y
fi

# 1.1 Initialize Database if not exists
echo "Initializing Database..."
if command -v yum &> /dev/null; then
    sudo postgresql-setup --initdb || true
    # Hotfix to prevent "Ident authentication failed" for local PostgreSQL connections on RHEL systems
    sudo sed -i -e 's/ident/md5/g' -e 's/peer/md5/g' /var/lib/pgsql/data/pg_hba.conf || true
fi
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
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

export RUSTUP_DIST_SERVER="https://rsproxy.cn"
export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"

if ! command -v rustc &> /dev/null; then
    echo "Installing Rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://rsproxy.cn/rustup-init.sh | sh -s -- -y
    source "$HOME/.cargo/env"
else
    rustup update stable
    rustup toolchain list | grep -v stable | xargs -I {} rustup toolchain uninstall {} || true
fi

# Configure Cargo mirror to prevent slow downloads
mkdir -p "$HOME/.cargo"
cat << 'EOF' > "$HOME/.cargo/config.toml"
[source.crates-io]
replace-with = 'rsproxy-sparse'
[source.rsproxy]
registry = "https://rsproxy.cn/crates.io-index"
[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"
[registries.rsproxy]
index = "https://rsproxy.cn/crates.io-index"
[net]
git-fetch-with-cli = true
EOF

# 4. Install Node.js if missing (using NodeSource)
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    if command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    else
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
fi

# 5. Output versions
node -v
npm -v
cargo -V

# 6. Build Node packages (Web and Hub + Packages)
echo "Building Node workspace (Frontend / Hub / Shared)..."
cd $PROJECT_DIR
npm config set registry https://registry.npmmirror.com/
npm install
npm run build -w @openhub/web

# 7. Build Gateway (Rust)
echo "Building Gateway (this may take a few minutes)..."
cd $PROJECT_DIR/gateway
cargo build --release

# 7.1 Extract binary and reclaim disk space (CRITICAL for 10GB GCP VMs)
echo "Extracting binary and cleaning build caches..."
mkdir -p $PROJECT_DIR/gateway/bin
cp target/release/gateway $PROJECT_DIR/gateway/bin/gateway
rm -rf target/
rm -rf ~/.cargo/registry/
rm -rf /root/.cargo/registry/

# 8. Install service files and fix ownership
echo "Configuring Systemd Services..."
sudo cp $PROJECT_DIR/deploy/openhub-hub.service /etc/systemd/system/openhub-hub.service
sudo cp $PROJECT_DIR/deploy/openhub-gateway.service /etc/systemd/system/openhub-gateway.service
sudo cp $PROJECT_DIR/deploy/nginx/openhub.conf /etc/nginx/conf.d/openhub.conf || true
sudo systemctl daemon-reload

sudo chown -R root:root $PROJECT_DIR

# 8.5 Install Cloudflare Tunnel
if [ -n "$TUNNEL_TOKEN" ]; then
    echo "Installing Cloudflare Tunnel (cloudflared)..."
    
    # Clean up any potential broken binary
    sudo rm -f /usr/local/bin/cloudflared
    
    if [ -f "$PROJECT_DIR/cloudflared" ]; then
        sudo mv $PROJECT_DIR/cloudflared /usr/local/bin/
        sudo chmod +x /usr/local/bin/cloudflared
    fi
    
    # Verify the binary exists and has a reasonable size
    if [ ! -s /usr/local/bin/cloudflared ] || [ $(wc -c < /usr/local/bin/cloudflared) -lt 10000000 ]; then
        echo "ERROR: Missing or invalid cloudflared binary!"
        exit 1
    fi
    
    sudo cloudflared service uninstall || true
    sudo rm -rf /etc/cloudflared/cert.pem /etc/cloudflared/config.yml || true
    sudo cloudflared service install "$TUNNEL_TOKEN"
    sudo systemctl enable cloudflared
    sudo systemctl restart cloudflared
else
    echo "No TUNNEL_TOKEN provided, skipping cloudflared setup."
fi

# 9. Start services
echo "Starting services..."
sudo systemctl enable $HUB_SERVICE
sudo systemctl enable $GATEWAY_SERVICE
sudo systemctl start $HUB_SERVICE
sudo systemctl start $GATEWAY_SERVICE
sudo systemctl restart nginx || true

echo "--- Deployment Complete ---"
