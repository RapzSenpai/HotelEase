# HotelEase

A web-based Hotel Property Management System for the BSHM department at Consolatrix College of Toledo City. Covers room browsing, booking, check-in/out, payments, housekeeping, and analytics.

## Tech Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 3, shadcn/ui (Radix UI)
- **Backend:** Firebase (Firestore, Authentication)
- **Images:** Cloudinary (unsigned uploads, client-side compression, on-the-fly optimization)
- **AI:** Groq API (OpenAI GPT-OSS 20B) via a Cloudflare Worker proxy
- **Email:** EmailJS
- **PDF:** jsPDF + jsPDF-AutoTable
- **Charts:** Recharts
- **Calendar:** FullCalendar.js

## User Roles

| Role | Access |
|------|--------|
| **Guest** | Browse rooms, book, pay (online checkout or proof upload), review, chatbot |
| **Front Office** | Check-in/out, payments, housekeeping, bookings, announcements, cancellations |
| **Admin** | Analytics + AI insights, user management, room management, system settings, training mode |

## Setup

### Prerequisites

- Node.js 18+
- npm
- A Firebase project (Firestore + Authentication enabled)
- A Cloudinary account (unsigned upload preset)
- A deployed Cloudflare Worker for the AI proxy (see [worker/](./worker))

### Installation

```bash
git clone <your-repo-url>
cd HotelEase
npm install
cp .env.example .env
# Fill in Firebase, Cloudinary, Groq proxy, and EmailJS credentials
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics 4 measurement ID (optional) |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned upload preset |
| `VITE_GROQ_PROXY_URL` | URL of the deployed Cloudflare Worker AI proxy |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS template ID (booking confirmation) |
| `VITE_EMAILJS_REPLY_TEMPLATE_ID` | EmailJS template ID (message reply) |
| `VITE_EMAILJS_VERIFY_TEMPLATE_ID` | EmailJS template ID (verification OTP) |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS public key |

### Deployment

Pushes to `main` auto-deploy the site to Firebase Hosting via GitHub Actions. Firestore rules are not covered by that pipeline — deploy them manually:

```bash
firebase deploy --only firestore:rules
```

## Features

- **Booking lifecycle:** Awaiting Payment/Pending → Approved → Checked In → Checked Out, with conflict checking inside transactions and a 48-hour payment deadline on holds
- **Payments:** Simulated gateway checkout for GCash and Bank Transfer (sandbox provider behind an adapter, demo receipts labeled), manual proof upload as fallback, front-desk payment for Card/Over-the-Counter
- **Email verification:** 6-digit OTP on signup with on-screen fallback when delivery fails
- **Housekeeping:** Kanban board, staff assignment, photo verification, cleaning timer, guest mid-stay requests
- **AI:** Guest concierge chatbot, admin Ops Assistant with on-demand charts, and one-click insight reports — rate limited per user through the Worker proxy
- **Training mode:** Sandboxed demo environment with session codes and data isolation from production
- **Analytics:** Occupancy rates, revenue, booking trends, peak days
- **Real-time updates:** Firestore listeners across bookings, rooms, and notifications
- **Keyboard shortcuts:** FO hotkeys (C, O, H) for quick operations
- **Image handling:** Client-side compression before upload, lazy loading, Cloudinary URL transformations

## Project Structure

```
src/
  components/       # Reusable UI components
  contexts/         # React context providers (Auth)
  hooks/            # Custom React hooks
  layouts/          # App shell, navigation
  lib/              # Utilities, routing helpers, payment details, Cloudinary transforms
  pages/            # Page components (public/, fo/, admin/)
  services/         # Firestore service layer (bookings, payments, rooms, gateway, etc.)
  firebase/         # Firebase configuration
  cloudinary/       # Cloudinary configuration
worker/
  src/index.js      # Cloudflare Worker: AI proxy (chat, insights, admin-chat), admin-verified user deletion, rate limiting
```

## License

Academic project — Consolatrix College of Toledo City
