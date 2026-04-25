# macOS Code Signing & Notarization Setup

This guide covers the GitHub secrets required to code-sign and notarize the GQuick macOS app in CI.

## Required GitHub Secrets

Create these secrets in **Settings > Secrets and variables > Actions**:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` Developer ID Application certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_SIGNING_IDENTITY` | Certificate name shown in Keychain (e.g., `Developer ID Application: Your Name (TEAMID)`) |
| `APPLE_ID` | Apple ID email used for notarization |
| `APPLE_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID (10-character string) |

## 1. Export the Developer ID Application Certificate

1. Open **Keychain Access** on a Mac.
2. In **My Certificates**, find your **Developer ID Application** certificate.
3. Expand it and select **both** the certificate and its private key.
4. Right-click > **Export 2 items…**
5. Choose format **Personal Information Exchange (.p12)** and save as `certificate.p12`.
6. Set a strong password when prompted — this becomes `APPLE_CERTIFICATE_PASSWORD`.

## 2. Base64-Encode the Certificate

**Important:** Strip newlines from the base64 output. Line-wrapped base64 will cause `security import` to fail in CI.

Run this in Terminal:

```bash
base64 -i certificate.p12 | tr -d '\n' | pbcopy
```

Paste the output into the `APPLE_CERTIFICATE` GitHub secret.

## 3. Find the Signing Identity

In Terminal, run:

```bash
security find-identity -v -p codesigning
```

Copy the full name of your **Developer ID Application** identity (including the Team ID in parentheses) into `APPLE_SIGNING_IDENTITY`.

## 4. Create an App-Specific Password

1. Visit [appleid.apple.com](https://appleid.apple.com).
2. Sign in and go to **App-Specific Passwords**.
3. Generate a new password.
4. Save it as the `APPLE_PASSWORD` secret.

## 5. Find Your Team ID

1. Go to [developer.apple.com/account](https://developer.apple.com/account).
2. Select **Membership details** from the sidebar.
3. Copy the **Team ID** (10 characters) into `APPLE_TEAM_ID`.

## Troubleshooting

### `security import: failed to import keychain certificate`

This error means Tauri could not import the `.p12` into the CI keychain. Common causes:

| Cause | Fix |
|-------|-----|
| Base64 has line breaks | Re-encode with `base64 -i certificate.p12 \| tr -d '\n' \| pbcopy` and re-paste the secret |
| Wrong certificate type | Must be **Developer ID Application**, not "Apple Development" or "Mac Developer" |
| Missing private key | Export **both** the certificate and its private key from Keychain Access |
| Wrong password | Verify `APPLE_CERTIFICATE_PASSWORD` matches the password you set when exporting the `.p12` |
| Secret not set | Check the secret exists and is not empty in **Settings > Secrets and variables > Actions** |

### Verify the password locally

```bash
# Create a temp keychain and try importing
security create-keychain -p "temp123" /tmp/test.keychain
security unlock-keychain -p "temp123" /tmp/test.keychain
security import certificate.p12 -P "YOUR_PASSWORD_HERE" -k /tmp/test.keychain
security find-identity -v -p codesigning /tmp/test.keychain
```

If this fails with the same error, your password is wrong or the `.p12` is missing the private key. Re-export from Keychain Access.

### Quick validation

Decode the secret locally and inspect it:

```bash
echo "$APPLE_CERTIFICATE" | base64 -d -o certificate_check.p12
# Verify it's a valid PKCS#12 (use -legacy on OpenSSL 3.x)
openssl pkcs12 -in certificate_check.p12 -info -noout -legacy
```

You should see `PKCS7 Encrypted data` and a `shrouded keybag`. If the file is corrupt, re-export and re-encode.

> **Note:** On macOS with OpenSSL 3.x, you may see `unsupported: Algorithm (RC2-40-CBC)` without `-legacy`. This is normal — the certificate is still valid, OpenSSL just can't decrypt the legacy encryption. The macOS `security` tool handles this fine.

## CI Behavior

These secrets are injected only into the macOS ARM64 build job. Tauri v2 reads them automatically during `tauri build` to sign the `.app` bundle and submit it for notarization. No changes to `tauri.conf.json` are required.
