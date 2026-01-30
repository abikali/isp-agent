# Cloudflare Origin CA Certificates

This directory should contain your Cloudflare Origin CA certificates for SSL termination.

## Required Files

- `origin.pem` - The Origin CA certificate
- `origin.key` - The private key

## How to Generate

### Step 1: Create Origin CA Certificate in Cloudflare

1. Log in to Cloudflare Dashboard
2. Select your domain (libancom.co)
3. Go to **SSL/TLS** → **Origin Server**
4. Click **Create Certificate**
5. Configure:
   - **Private key type**: RSA (2048)
   - **Hostnames**:
     - `libancom.co`
     - `*.libancom.co`
   - **Certificate Validity**: 15 years (recommended)
6. Click **Create**
7. **IMPORTANT**: Copy both the certificate AND private key immediately
   - You won't be able to see the private key again!

### Step 2: Save the Certificate Files

```bash
# Save the Origin Certificate as origin.pem
cat > config/nginx/certs/origin.pem << 'EOF'
-----BEGIN CERTIFICATE-----
[paste certificate content here]
-----END CERTIFICATE-----
EOF

# Save the Private Key as origin.key
cat > config/nginx/certs/origin.key << 'EOF'
-----BEGIN PRIVATE KEY-----
[paste private key content here]
-----END PRIVATE KEY-----
EOF

# Set proper permissions
chmod 600 config/nginx/certs/origin.key
chmod 644 config/nginx/certs/origin.pem
```

### Step 3: Configure Cloudflare SSL Settings

1. In Cloudflare Dashboard → **SSL/TLS** → **Overview**
2. Set SSL/TLS encryption mode to **Full (strict)**

### Step 4: Configure DNS Records

Add DNS records in Cloudflare (with orange cloud proxy enabled):

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | libancom.co | [your-server-ip] | Proxied |
| A | v | [your-server-ip] | Proxied |

## Optional: Authenticated Origin Pulls

For extra security, you can enable Cloudflare Authenticated Origin Pulls:

1. In Cloudflare Dashboard → **SSL/TLS** → **Origin Server**
2. Enable **Authenticated Origin Pulls**
3. Download the Cloudflare CA certificate:
   ```bash
   curl -o config/nginx/certs/cloudflare-origin-pull.pem \
     https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
   ```
4. Uncomment these lines in nginx.conf:
   ```nginx
   ssl_client_certificate /etc/nginx/certs/cloudflare-origin-pull.pem;
   ssl_verify_client on;
   ```

## Security Notes

- **NEVER commit** `origin.key` or `origin.pem` to version control
- These files are already in `.gitignore`
- Store backups of these certificates securely
- The Origin CA certificate is only valid for Cloudflare-proxied traffic

## Verification

After setup, verify SSL is working:

```bash
# Check certificate from Cloudflare edge (should show Cloudflare cert)
curl -vI https://libancom.co 2>&1 | grep "subject:"

# Check origin certificate directly (if needed for debugging)
openssl s_client -connect your-server-ip:443 -servername libancom.co
```
