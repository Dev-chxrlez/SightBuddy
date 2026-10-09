# SightBuddy

SightBuddy is a local-first, voice-first visual companion for blind and visually impaired people. On an iPhone, one large accessible button starts the rear camera, local voice commands, local object detection, and spoken answers.

The core experience does not depend entirely on a cloud model:

- Vosk recognizes a controlled set of voice commands locally.
- TensorFlow.js COCO-SSD runs on every requested camera frame locally.
- Browser speech synthesis reads answers aloud.
- A service worker caches the application and local models for offline relaunch.
- When configured and online, OpenAI vision adds richer scene details and follow-up answers.
- If OpenAI is unavailable, SightBuddy quietly speaks the local COCO-SSD result.

SightBuddy is an awareness aid, not a navigation or safety system. It must never be used to decide whether walking or another physical action is safe.

## Current experience

1. Open SightBuddy on the iPhone.
2. Activate the large **Start SightBuddy** button.
3. Ask a supported voice question, such as:
   - “What’s in front of me?”
   - “Can you see my backpack?”
   - “Where is the chair?”
   - “What is beside the table?”
   - “What color is it?”
   - “Tell me more.”
   - “Repeat.”
   - “Stop.”
4. SightBuddy captures a fresh frame, runs local COCO-SSD, and speaks the result.
5. With connected vision configured, SightBuddy can add visible colors, counts, text, positions, relationships, and conversational follow-ups.

The local Vosk recognizer uses a restricted grammar for predictable mobile performance. It is not open-ended dictation or an always-on wake-word engine.

## Architecture and model disclosure

| Component | Where it runs | Purpose |
| --- | --- | --- |
| React 19.2 + Vite 7.3 | Browser/build tool | Accessible PWA interface and production build |
| TensorFlow.js 4.22 WebGL | iPhone browser | Local inference runtime |
| COCO-SSD 2.2.3, MobileNetV2 backbone | iPhone browser | Local multi-object detection and bounding boxes |
| Vosk Browser 0.0.8 with `vosk-model-small-en-us-0.15` | iPhone browser | Local command recognition |
| Safari `speechSynthesis` | iPhone browser | Spoken responses; Karen (`en-AU`) is preferred when Safari exposes it |
| OpenAI Responses API, `gpt-6-luna` by default | OpenAI API, optional | Connected image understanding and follow-up answers |
| Service worker and Cache Storage | iPhone browser | Versioned application, detector, and voice caches |

Bundled model/runtime assets are intentionally large:

- COCO-SSD MobileNetV2: approximately 64.63 MiB
- Vosk small English model: approximately 39.28 MiB
- MobileNetV2 classification assets retained from an earlier fallback: approximately 7.56 MiB
- Experimental YOLOv5n ONNX model: approximately 7.54 MiB
- ONNX Runtime WASM retained for the experimental detector: approximately 11.35 MiB

The active MVP uses Vosk and COCO-SSD. MobileNet and YOLO/ONNX code and assets are retained for experimentation but are not part of the primary interface.

## Prerequisites

- Windows 10 or 11 for the documented LAN HTTPS workflow
- Node.js 22 LTS recommended; Vite 7 requires Node.js 20.19+ or 22.12+
- npm
- An iPhone and Windows PC on the same Wi-Fi network
- [mkcert](https://github.com/FiloSottile/mkcert) for a locally trusted HTTPS certificate
- Optional: an OpenAI API project and funded API key for connected vision

Camera and microphone access on an iPhone require a trusted secure context. A plain `http://192.168.x.x` address will not work.

## Clone and install

```powershell
git clone <repository-url>
cd SightBuddy
npm ci
```

The repository includes the local model files under `public/models`. `npm ci` installs the JavaScript dependencies exactly from `package-lock.json`.

Run the repository checks:

```powershell
npm run verify:classifier
npm run verify:coco
npm run verify:model
npm run verify:voice
npm test
npm run lint
npm run build
```

`npm run build` also generates the versioned service worker and verifies the essential offline build assets.

## Optional OpenAI connected vision

SightBuddy works locally without an OpenAI key. To enable richer connected answers, copy the example environment file:

```powershell
Copy-Item .env.example .env.local
```

Edit `.env.local`:

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_VISION_MODEL=gpt-6-luna
```

Do not rename the key to `VITE_OPENAI_API_KEY`. Variables prefixed with `VITE_` are included in the browser bundle and would expose the secret. SightBuddy reads the key only inside the local HTTPS preview server and proxies same-origin requests to OpenAI.

Verify the configured key and image-input capability with a tiny synthetic image:

```powershell
npm run verify:openai
```

This verification makes one billable API request. OpenAI API billing is separate from a ChatGPT subscription.

Connected behavior:

- A frame is uploaded only after an explicit visual question.
- Continuous camera video and microphone audio are never uploaded by SightBuddy.
- The request uses `store: false`.
- COCO-SSD still runs locally before the connected request.
- An API error, timeout, missing key, or offline state automatically returns the local result.
- Safety/navigation questions never receive an affirmative safety decision.

## Create the local HTTPS certificate

Find the PC’s Wi-Fi IPv4 address:

```powershell
ipconfig
```

Look under the active **Wireless LAN adapter** for an address similar to `192.168.1.25`. Then create a certificate for that exact address:

```powershell
$env:SIGHTBUDDY_HOST = "192.168.1.25"
New-Item -ItemType Directory -Force .cert
mkcert -install
mkcert -cert-file ".cert\$env:SIGHTBUDDY_HOST.pem" -key-file ".cert\$env:SIGHTBUDDY_HOST-key.pem" $env:SIGHTBUDDY_HOST localhost 127.0.0.1
```

Replace the example IP with the PC’s real Wi-Fi address. The preview script normally auto-detects a private LAN address. Set `SIGHTBUDDY_HOST` in the same PowerShell session, or uncomment it in `.env.local`, if Windows has multiple network adapters and auto-detection chooses the wrong one.

The `.cert` directory and `.env.local` are ignored by Git. Never commit the HTTPS private key, mkcert root private key, or OpenAI API key.

## Trust mkcert on the iPhone

Run this on Windows to locate mkcert’s certificate authority directory:

```powershell
mkcert -CAROOT
```

Transfer only `rootCA.pem` from that directory to the test iPhone. Never transfer or share `rootCA-key.pem`.

On the iPhone:

1. Open `rootCA.pem` and allow the configuration profile download.
2. Open **Settings → General → VPN & Device Management**.
3. Select the mkcert profile and install it.
4. Open **Settings → General → About → Certificate Trust Settings**.
5. Enable full trust for the mkcert root certificate.

This trusts certificates created by that mkcert root. Remove the profile after the local test environment is no longer needed.

## Build and run on the LAN

```powershell
npm run build
npm run preview:https
```

The terminal prints the exact network URL, for example:

```text
https://192.168.1.25:4173/
```

Keep that PowerShell window open. If Windows Firewall asks, allow Node.js on **Private networks** only.

Open the printed URL directly in regular iPhone Safari. Do not use an embedded Messenger browser or Private Browsing.

On first use:

1. Set Safari’s per-site Camera and Microphone settings to **Allow**.
2. Activate **Start SightBuddy**.
3. Wait for the Vosk voice model and COCO-SSD model to initialize and cache.
4. Ask “What’s in front of me?”
5. Add the page to the Home Screen only after the first initialization completes.

The first load transfers more than 100 MiB of local model assets. Keep Safari foregrounded and the phone connected to power during initial setup.

## Offline verification

Complete the online first-run setup before testing offline. This prepares the core, detector, and voice caches.

1. Launch SightBuddy once from the Home Screen while online.
2. Confirm the camera, Vosk commands, COCO-SSD, and speech work.
3. Fully close SightBuddy.
4. Enable Airplane Mode and turn Wi-Fi off.
5. Reopen SightBuddy from its Home Screen icon.
6. Start SightBuddy and ask about a clear COCO category such as a person, chair, bottle, backpack, or cell phone.

Offline answers are limited to what the bundled local models recognize. Relationship questions, arbitrary objects, fine text, and detailed scene understanding may require connected vision. iOS can evict service-worker storage under device pressure, so offline relaunch must be verified on the physical test device before a live presentation.

## Suggested judge demonstration

1. Explain that Vosk command recognition and COCO-SSD inference run locally on the iPhone.
2. Start SightBuddy with the single accessible button.
3. Ask “What’s in front of me?” while showing several recognizable objects.
4. Ask a connected follow-up such as “What color is it?” or “What is beside the chair?”
5. Demonstrate the pre-cached PWA in Airplane Mode with a clear local object.
6. Explain that connected vision enriches the result but does not replace the local voice and detection pipeline.

Keep a short screen recording of the verified physical-device flow as a backup for venue Wi-Fi problems.

## Troubleshooting

### Port 4173 is already in use

Find the listening process:

```powershell
netstat -ano | Select-String ':4173'
```

Use the numeric PID from the `LISTENING` row:

```powershell
Get-Process -Id 12345
Stop-Process -Id 12345
npm run preview:https
```

Replace `12345` with the actual numeric PID. Do not type the word `PROCESS_ID`.

### Certificate name mismatch

The certificate IP, `SIGHTBUDDY_HOST`, printed preview URL, and address opened on the iPhone must be identical. Regenerate the certificate after the PC’s Wi-Fi IP changes.

### Old interface remains on the iPhone

Keep the server running, refresh Safari twice, close the tab or installed PWA, and reopen it. If necessary, remove the old Home Screen installation and install again from the same HTTPS origin.

### Connected vision falls back locally

- Confirm the PC has internet access.
- Confirm `.env.local` contains `OPENAI_API_KEY` without a `VITE_` prefix.
- Run `npm run verify:openai`.
- Restart `npm run preview:https` after changing `.env.local` or server-side prompts.

### Voice or camera permission is requested repeatedly

Open the exact HTTPS URL in Safari, open **Website Settings**, and set Camera and Microphone to **Allow**. iOS controls permission persistence; the website cannot bypass the initial system prompts.

## Safety and known limitations

- SightBuddy does not provide navigation, obstacle avoidance, emergency guidance, or safety decisions.
- COCO-SSD recognizes only its trained COCO categories and can be wrong despite a high score.
- OpenAI vision can also make mistakes. Connected answers are constrained to visible evidence but are not guaranteed correct.
- Positions describe locations within the camera frame, not verified physical distance.
- The restricted Vosk grammar improves command reliability but does not support unrestricted conversation.
- Safari may suspend microphone processing when SightBuddy enters the background.
- Browser voices depend on what iOS Safari exposes; Karen (`en-AU`) falls back to another English voice when unavailable.
- Model initialization and WebGL memory use can be significant on mobile Safari.
- Physical-device confirmation is required; a successful desktop build does not prove iPhone behavior.

## Privacy

Local COCO-SSD and Vosk processing occurs in the browser. SightBuddy does not record or persist microphone audio or continuous video.

When connected vision is configured, an explicit visual question sends one compressed camera frame, the question, optional previous question/answer context, and non-sensitive local detection hints through the Windows proxy to the OpenAI Responses API. The OpenAI key remains server-side. Users should be informed before connected vision is enabled, and sensitive scenes should not be submitted.

## Verification commands

```powershell
npm test
npm run lint
npm run verify:classifier
npm run verify:coco
npm run verify:model
npm run verify:voice
npm run build
npm run verify:offline
npm run verify:openai   # optional; billable and requires a configured key
```

No successful physical-device result should be claimed until the complete flow has been tested on the target iPhone.
