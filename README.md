# Verisight

**Verisight** is an AI image and video detector. A user picks a photo or video (or pastes an image link) and the app returns a likelihood range that the file is AI-generated, together with plain-language reasons. It also reads and verifies **content credentials (C2PA)** when a file carries them, and it can highlight the parts of an image that the detector was most sensitive to.

This is a final-year project (FYP) by Zaynah Nadeem, Computer Science, Bahria University, Lahore Campus. Supervisor: [supervisor name].

> The result is a probability estimate, not proof. Missing content credentials tell you nothing either way.

---

## Table of contents
1. [Features](#features)
2. [How a verdict is made](#how-a-verdict-is-made)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Project structure](#project-structure)
6. [Setup: backend](#setup-backend)
7. [Setup: mobile app](#setup-mobile-app)
8. [Using the app away from your home network](#using-the-app-away-from-your-home-network)
9. [Chrome extension](#chrome-extension)
10. [API overview](#api-overview)
11. [Database](#database)
12. [Configuration](#configuration)
13. [Limitations](#limitations)
14. [Future work](#future-work)
15. [Disclaimer](#disclaimer)

---

## Features

**Scanning**
- Scan an image or video from the phone's files or gallery. Choosing from Files sends the original, untouched file.
- Capture a photo live with the in-app camera.
- Paste an image link and let the server download and scan it.

**Results**
- A verdict of *Likely authentic*, *Inconclusive* or *Likely AI-generated*, shown as a likelihood **range** (not a single number) so the app never claims more certainty than it has.
- A "Why we say that" section that explains the decision in plain words.
- **Show highlights** (images): a red overlay showing which parts of the picture the detector was most sensitive to when it decided.
- A content-credentials panel showing who signed the file, what tool made it, and whether the credentials are still valid.
- Reverse image search shortcut (Google Lens).
- **Share report**: exports the result as a PDF report.
- **Report wrong result**: users can flag a verdict they believe is wrong.

**Accounts and limits**
- Guests get a limited number of free scans, counted on the server per device.
- Signed-in users get unlimited scans, a dashboard and a saved history with the scanned files.
- Sign-up, sign-in, forgot-password and delete-account flows.

**App experience**
- Intro cards for first-time users, animated shutter splash screen, bottom tab bar, light and dark themes, haptic feedback on results.

---

## How a verdict is made

Each file goes through these steps on the server:

1. **Upload and cache check.** The file is hashed. If the same file was scanned before with the same settings, the saved result is returned instantly.
2. **Content credentials (C2PA).** The server reads any embedded C2PA manifest and checks that it matches the file and that the signer is on a trusted list. A valid or unverified credential that says the file is AI-generated gives an immediate *AI-generated* verdict with 95 to 99% likelihood, and the detector is skipped.
3. **Main detector (images).** Where there is no AI credential, an ensemble of two vision models scores the image: a **SigLIP** model with LoRA fine-tuning and a **DINOv2** (ViT-L/14) model run at 392 px. The scores are combined into one probability.
4. **Face and video models.** For images with faces and for videos, extra models can only *soften* a "likely authentic" verdict to "inconclusive". They never turn a verdict into "AI-generated" by themselves.
5. **Video.** The server samples frames from the video, scores each frame with the main detector, averages them, and adds a video-level model as a second opinion.
6. **Verdict and range.** The probability is turned into a verdict using fixed thresholds:

   | Score | Verdict |
   |---|---|
   | below 0.35 | Likely authentic |
   | 0.35 to 0.65 | Inconclusive |
   | above 0.65 | Likely AI-generated |

   The range shown is the score plus or minus 10 points for images, and plus or minus 15 points for videos.
7. **Highlights.** For images that are not clearly real, a gradient-based attribution map is computed on the DINOv2 model, cleaned of glitch patches, blurred and drawn as a transparent red overlay.

Only one heavy scan runs at a time, and all models are loaded when the server starts so the first scan is not slow.

---

## Architecture

```
 Phone (Expo Go / APK)          Computer (laptop)
 ┌──────────────────┐   HTTPS   ┌────────────────────────────┐
 │ React Native app │ ────────▶ │ FastAPI backend            │
 │ (mobile/)        │ ◀──────── │  ├─ image / video pipeline │
 └──────────────────┘           │  ├─ C2PA reader + trust list│
                                │  ├─ PyTorch models          │
 Chrome extension ────────────▶ │  └─ SQLAlchemy             │
 (extension repo)               └──────────────┬─────────────┘
                                               │
                                   PostgreSQL + uploads folder
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | React Native with Expo (SDK 58), JavaScript |
| Backend | Python 3.12, FastAPI, Uvicorn |
| Database | PostgreSQL 18, SQLAlchemy |
| Models | PyTorch, timm, SigLIP (LoRA), DINOv2 |
| Content credentials | C2PA with a trusted-signer list |
| Local sharing | ngrok (optional, for testing away from home Wi-Fi) |
| Builds | EAS Build (Android APK) |

---

## Project structure

```
deepfake-detector/
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app and routers
│   │   ├── config.py           # settings (thresholds, frame count, flags)
│   │   ├── schemas.py          # response models
│   │   ├── routers/            # auth, scans, reports routes
│   │   └── services/inference/ # image, video, face, C2PA, highlight code
│   ├── models/                 # model weights (not in the repo)
│   ├── trust/                  # trusted signer list for C2PA
│   ├── tests/
│   ├── fetch_trust_list.py     # downloads the trust list
│   ├── evaluate.py             # evaluates the detector on a test set
│   ├── requirements.txt
│   └── .env.example
├── mobile/
│   ├── App.js                  # screen flow and navigation
│   ├── app.json
│   ├── assets/                 # icon and splash images
│   └── src/
│       ├── components/         # tab bar, splash, modals
│       ├── context/            # auth, history, settings, theme
│       ├── screens/            # Home, Dashboard, Result, History, Settings...
│       ├── services/           # API client
│       ├── theme/
│       ├── utils/
│       └── config.js           # server address and limits
└── README.md
```

---

## Setup: backend

**Requirements:** Python 3.12, PostgreSQL 18, and about 8 GB of RAM. The models run on CPU, so scans take a few seconds each, and videos longer.

1. **Create the database.** In `psql`:
   ```sql
   CREATE USER your_user WITH PASSWORD 'your_password';
   CREATE DATABASE your_database OWNER your_user;
   ```
2. **Create the settings file.** Copy `backend/.env.example` to `backend/.env` and fill in your own values (see [Configuration](#configuration)). Never commit `.env`.
3. **Create a virtual environment and install packages.**
   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
4. **Add the model weights.** The weights are about 7 GB and are not included in this repository. [Add where to download them, or how the backend fetches them on first start.]
5. **Download the C2PA trust list.**
   ```powershell
   python fetch_trust_list.py
   ```
6. **Run the server.**
   ```powershell
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
   Wait for "Application startup complete". The first start takes a while because the models load into memory. The tables are created automatically on startup.
7. **Check it works:** open `http://localhost:8000/health`.

---

## Setup: mobile app

**Requirements:** Node.js (LTS), and the **Expo Go** app on your phone.

1. ```powershell
   cd mobile
   npm install
   ```
2. Open `mobile/src/config.js` and set the server address:
   - Same Wi-Fi: `http://YOUR_LAPTOP_IP:8000` (find the IP with `ipconfig`)
   - Laptop hotspot: `http://192.168.137.1:8000`
   - ngrok: your `https://...ngrok-free.app` address
3. ```powershell
   npx expo start
   ```
4. Scan the QR code with Expo Go. If that fails, use `npx expo start --tunnel`, or `npx expo start -c` to clear the cache.

**Android APK:** build with `eas build -p android --profile preview` after setting `android.package` in `app.json` and an HTTPS server address in `config.js`.

---

## Using the app away from your home network

University and public Wi-Fi often stop phones from reaching a laptop. Two options:

- **Laptop hotspot:** turn on Windows Mobile Hotspot and connect the phone to it. The laptop's address is `192.168.137.1`.
- **ngrok tunnel:** run `ngrok http 8000 --url https://YOUR-DOMAIN.ngrok-free.app` and use that address in `config.js`.

The server runs on the laptop, so the laptop, PostgreSQL and the backend must be running while the app is in use.

---

## Chrome extension

A companion extension checks pictures directly on Instagram and Facebook pages in desktop Chrome or Edge. It talks to the same backend at `http://localhost:8000`.

Repository: https://github.com/zaynah-nadeem/verisight-extension

---

## API overview

| Method and path | Purpose |
|---|---|
| `POST /detect/image` | Scan an uploaded image |
| `POST /detect/url` | Download and scan an image from a link |
| `POST /detect/video` | Scan an uploaded video |
| `POST /reports` | Send a "wrong result" report |
| `GET /guest/usage` | How many free scans this device has used |
| `/auth/...` | Sign-up, sign-in, forgot password, profile, delete account |
| `GET /health` | Server status |

Guests are identified by an `X-Device-Id` header. Signed-in requests use a bearer token.

---

## Database

PostgreSQL, with tables created by SQLAlchemy:

| Table | What it stores |
|---|---|
| `users` | Accounts: name, email, hashed password |
| `scans` | Each signed-in user's scans: file name, type, verdict, range, reasons, credentials result |
| `guest_usage` | Free-scan count per guest device |
| `result_reports` | "Report wrong result" submissions |
| `password_resets` | Temporary codes for the forgot-password flow |

Scanned files for signed-in users are kept in `backend/uploads/`, and the `scans` table points to them.

---

## Configuration

Settings live in `backend/.env`. Example names (use your own values):

```
DATABASE_URL=postgresql+psycopg2://USER:PASSWORD@localhost:5432/DATABASE_NAME
SECRET_KEY=change-me
```

Other settings, such as `real_below` (0.35), `ai_above` (0.65) and `video_frames` (4), are in `backend/app/config.py`. Changing a detector setting changes the pipeline version, which clears old cached results automatically.

---

## Limitations

- No detector is perfect. New image generators and heavily compressed, screenshotted or re-saved images are hard to judge.
- The models run on CPU, so scans take seconds and videos take longer.
- The server runs on a personal computer, so the app only works while that computer is on.
- Content credentials are only present on files from tools that add them, and they are lost when a file is screenshotted or re-encoded.
- Video highlights are not implemented yet; highlights work for images only.

---

## Future work

- Fine-tune the detector's final layers on newer generators.
- A video highlight timeline.
- Hosting the backend online, so it no longer depends on a personal computer.
- Publishing the Chrome extension to the Chrome Web Store.
- Support for iPhone builds.

---

## Disclaimer

Verisight gives a probability estimate, not proof. Always verify important claims through other sources. Do not use a single result to make decisions about people.

---

## Author

Zaynah Nadeem, Computer Science, Bahria University, Lahore Campus. GitHub: https://github.com/zaynah-nadeem