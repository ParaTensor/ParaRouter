#!/bin/bash
set -e

# Configuration
SERVICE_USER="$(id -un)"
SERVICE_HOME="$HOME"
PROJECT_DIR="$HOME/pararouter"
HUB_SERVICE="pararouter-hub"
GATEWAY_SERVICE="pararouter-gateway"

echo "--- Starting Remote Build and Setup ---"

# 0. Stop running services first (proper deployment: stop → build → start)
echo "Stopping existing services..."
sudo systemctl stop $HUB_SERVICE || true
sudo systemctl stop $GATEWAY_SERVICE || true
sudo systemctl stop xrouter-hub || true
sudo systemctl stop xrouter-gateway || true
sudo systemctl disable xrouter-hub || true
sudo systemctl disable xrouter-gateway || true
sudo systemctl stop pararouter-hub || true
sudo systemctl stop pararouter-gateway || true
sudo systemctl disable pararouter-hub || true
sudo systemctl disable pararouter-gateway || true

# 1. Update and install basic dependencies
if command -v yum &> /dev/null; then
    sudo yum update -y || true
    sudo yum install -y gcc gcc-c++ make pkgconfig openssl-devel curl git postgresql-server postgresql-contrib nginx
else
    sudo apt-get update
    sudo apt-get install build-essential pkg-config libssl-dev curl git postgresql postgresql-contrib nginx -y
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
sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw pararouter || sudo -u postgres psql -c "CREATE DATABASE pararouter OWNER xinference;" || echo "Failed to create database, DB might be down"

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

[source.rsproxy-sparse]
registry = "sparse+https://rsproxy.cn/index/"

[registries.rsproxy-sparse]
index = "sparse+https://rsproxy.cn/index/"

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
npm run build -w @pararouter/web

echo "Publishing frontend bundle to nginx web root..."
sudo mkdir -p /var/www/pararouter
sudo rm -rf /var/www/pararouter/*
sudo cp -R $PROJECT_DIR/dist/. /var/www/pararouter/
sudo chmod -R a+rX /var/www/pararouter

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

# 8. Install service files and fix ownership
echo "Configuring Systemd Services..."
sed \
    -e "s|__SERVICE_USER__|$SERVICE_USER|g" \
    -e "s|__SERVICE_HOME__|$SERVICE_HOME|g" \
    -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    "$PROJECT_DIR/deploy/pararouter-hub.service" | sudo tee /etc/systemd/system/pararouter-hub.service >/dev/null
sed \
    -e "s|__SERVICE_USER__|$SERVICE_USER|g" \
    -e "s|__SERVICE_HOME__|$SERVICE_HOME|g" \
    -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    "$PROJECT_DIR/deploy/pararouter-gateway.service" | sudo tee /etc/systemd/system/pararouter-gateway.service >/dev/null

sudo mkdir -p /etc/ssl/pararouter
if sudo test -f /etc/letsencrypt/live/pararouter.com/fullchain.pem && sudo test -f /etc/letsencrypt/live/pararouter.com/privkey.pem; then
    echo "Using Let's Encrypt origin TLS certificate for nginx..."
    sudo ln -sf /etc/letsencrypt/live/pararouter.com/fullchain.pem /etc/ssl/pararouter/origin.crt
    sudo ln -sf /etc/letsencrypt/live/pararouter.com/privkey.pem /etc/ssl/pararouter/origin.key
elif ! sudo test -f /etc/ssl/pararouter/origin.crt || ! sudo test -f /etc/ssl/pararouter/origin.key; then
    echo "Provisioning fallback self-signed origin TLS certificate for nginx..."
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -keyout /etc/ssl/pararouter/origin.key \
        -out /etc/ssl/pararouter/origin.crt \
        -subj "/CN=pararouter.com"
fi
sudo chmod 600 /etc/ssl/pararouter/origin.key
sudo chmod 644 /etc/ssl/pararouter/origin.crt

sudo cp $PROJECT_DIR/deploy/nginx/pararouter.conf /etc/nginx/conf.d/pararouter.conf || true
sudo rm -f /etc/nginx/sites-enabled/default || true
sudo systemctl daemon-reload

sudo chown -R $USER:$USER $PROJECT_DIR

# 8.5 Optional Cloudflare Tunnel (disabled by default for direct-origin deployments)
if [ -n "$TUNNEL_TOKEN" ]; then
    echo "Installing Cloudflare Tunnel (cloudflared)..."
    
    if ! command -v cloudflared &> /dev/null; then
        echo "Cloudflared not found. Installing natively via Cloudflare APT repository..."
        sudo mkdir -p --mode=0755 /usr/share/keyrings
        curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
        echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
        sudo apt-get update
        sudo apt-get install cloudflared -y
    fi
    
    if systemctl is-active --quiet cloudflared; then
        echo "Cloudflared tunnel is already active. Skipping re-registration."
    else
        echo "Registering cloudflared service..."
        sudo cloudflared service uninstall || true
        sudo rm -rf /etc/cloudflared/cert.pem /etc/cloudflared/config.yml || true
        sudo cloudflared service install "$TUNNEL_TOKEN"
        sudo systemctl enable cloudflared
        sudo systemctl restart cloudflared
    fi
else
    echo "No TUNNEL_TOKEN provided, skipping cloudflared setup."
fi

# 8.6 Hub mail (Resend): persist API key for systemd EnvironmentFile
if [ -n "$RESEND_API_KEY" ]; then
    ENV_FILE="$HOME/.pararouter.env"
    if [ -f "$ENV_FILE" ]; then
        grep -v '^RESEND_API_KEY=' "$ENV_FILE" > "${ENV_FILE}.tmp" || true
        chmod 600 "${ENV_FILE}.tmp"
        mv "${ENV_FILE}.tmp" "$ENV_FILE"
    else
        umask 077
        : >"$ENV_FILE"
    fi
    printf 'RESEND_API_KEY=%s\n' "$RESEND_API_KEY" >>"$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Updated RESEND_API_KEY in $ENV_FILE"
fi

# 8.7 Run database schema migration before service startup
echo "Applying database schema migration..."
sudo -u postgres psql -d pararouter -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/packages/shared/schema.sql"

# 9. Start services
echo "Starting services..."
sudo systemctl enable $HUB_SERVICE
sudo systemctl enable $GATEWAY_SERVICE
sudo systemctl start $HUB_SERVICE
sudo systemctl start $GATEWAY_SERVICE
sudo systemctl restart nginx || true

echo "--- Deployment Complete ---"
