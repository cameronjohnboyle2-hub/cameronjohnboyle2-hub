# Neon Saber

An original 30-second rhythm game. The desktop renders a saber and blocks while a paired phone provides motion input. Mouse practice lets you try the same level on one computer.

## Run locally

Requires Node.js 22 or later.

```sh
npm ci
npm start
```

Open http://127.0.0.1:4545/game and select **Practice with Mouse**. For phone motion, the controller needs HTTPS. The original Windows tunnel integration looks for a separately installed `tools/cloudflared.exe`. With that executable present, the server attempts to open a temporary tunnel when it starts. Use the displayed QR code and calibrate the phone in its browser.

`npm test` runs the server, input, and orientation tests. This source snapshot includes no tunnel executable or recorded motion diagnostics.
