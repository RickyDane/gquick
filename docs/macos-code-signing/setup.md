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

Run this in Terminal:

```bash
base64 -i certificate.p12 | pbcopy
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

## CI Behavior

These secrets are injected only into the macOS ARM64 build job. Tauri v2 reads them automatically during `tauri build` to sign the `.app` bundle and submit it for notarization. No changes to `tauri.conf.json` are required.
