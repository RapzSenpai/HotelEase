# HotelEase

A web-based Hotel Property Management System (PMS) built for the BSHM department at Consolatrix College of Toledo City. Manages the full guest lifecycle — from browsing rooms and booking, to check-in/out, payments, housekeeping, and analytics.

## Tech Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 3, shadcn/ui (Radix UI)
- **Backend:** Firebase (Firestore, Authentication)
- **Image Hosting:** Cloudinary (unsigned uploads, client-side compression, on-the-fly optimization)
- **AI Chatbot:** Groq API (LLaMA 3.1 8B), proxied server-side via a Cloudflare Worker
- **Email:** EmailJS (client-side)
- **PDF:** jsPDF + jsPDF-AutoTable
- **Charts:** Recharts
- **Calendar:** FullCalendar.js

## User Roles

| Role | Access |
|------|--------|
| **Guest** | Browse rooms, book, pay (proof upload), review, use chatbot |
| **Front Office** | Check-in/out, payments, housekeeping, bookings, announcements, cancellations |
| **Admin** | Analytics, user management, room management, system settings, training mode |

## Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- A Firebase project (Firestore + Authentication enabled)
- A Cloudinary account (unsigned upload preset)
- A Cloudflare Worker for the AI chatbot (see [worker/]('./worker'))

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd HotelEase

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Firebase, Cloudinary, Groq proxy, and EmailJS credentials

# Start the dev server
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
| `VITE_GROQ_PROXY_URL` | URL of the deployed Cloudflare Worker AI chat proxy |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS template ID (booking confirmation) |
| `VITE_EMAILJS_REPLY_TEMPLATE_ID` | EmailJS template ID (message reply) |
| `VITE_EMAILJS_VERIFY_TEMPLATE_ID` | EmailJS template ID (verification OTP) |
| `VITE_EMAILJS_PUBLIC_KEY` | EmailJS public key |

### Build & Deploy

```bash
# Production build
npm run build

# Deploy to Firebase Hosting
firebase deploy
```

## Features

- **Booking Lifecycle:** Pending → Approved → Awaiting Payment → Checked In → Checked Out
- **Verification OTP:** Email-based code on signup, with on-screen fallback if email delivery fails
- **Payment Processing:** GCash, Bank Transfer, Credit/Debit Card, Over-the-Counter with proof upload
- **Housekeeping Management:** Kanban board, staff assignment, photo verification, cleaning timer
- **AI Chatbot:** Context-aware room recommendations powered by Groq/LLaMA (server-side proxy)
- **Training Mode:** Sandboxed demo environment with session codes and data isolation
- **Real-time Updates:** Firestore onSnapshot subscriptions for live data
- **Keyboard Shortcuts:** FO hotkeys (C, O, H) for quick operations
- **Analytics Dashboard:** Occupancy rates, revenue tracking, booking trends
- **Image Optimization:** Client-side compression before upload, lazy loading, Cloudinary URL transformations
- **Email Notifications:** Booking confirmations, support replies, and verification OTPs via EmailJS

## Project Structure

```
src/
  components/       # Reusable UI components
  contexts/         # React context providers (Auth)
  hooks/            # Custom React hooks
  layouts/          # App shell, navigation
  lib/              # Utilities, routing helpers, image compression, Cloudinary transforms
  pages/            # Page components (public/, fo/, admin/)
  services/         # Firebase/Firestore service layer
  firebase/         # Firebase configuration
  cloudinary/       # Cloudinary configuration
worker/
  src/index.js      # Cloudflare Worker AI chat proxy (keeps Groq key server-side)
```

## License

Academic project — Consolatrix College of Toledo City