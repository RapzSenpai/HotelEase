# HotelEase

A web-based Hotel Property Management System (PMS) built for the BSHM department at Consolatrix College of Toledo City. Manages the full guest lifecycle — from browsing rooms and booking, to check-in/out, payments, housekeeping, and analytics.

## Tech Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 3, shadcn/ui (Radix UI)
- **Backend:** Firebase (Firestore, Authentication)
- **Image Hosting:** Cloudinary (unsigned uploads)
- **AI Chatbot:** Groq API (LLaMA 3.1 8B)
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
- A Groq API key (for AI chatbot)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd HotelEase

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Firebase, Cloudinary, Groq, and EmailJS credentials

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
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Cloudinary unsigned upload preset |
| `VITE_GROQ_API_KEY` | Groq API key for AI chatbot |
| `VITE_EMAILJS_SERVICE_ID` | EmailJS service ID |
| `VITE_EMAILJS_TEMPLATE_ID` | EmailJS template ID |
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
- **Payment Processing:** GCash, Bank Transfer, Credit/Debit Card, Over-the-Counter with proof upload
- **Housekeeping Management:** Kanban board, staff assignment, photo verification, cleaning timer
- **AI Chatbot:** Context-aware room recommendations powered by Groq/LLaMA
- **Training Mode:** Sandboxed demo environment with session codes and data isolation
- **Real-time Updates:** Firestore onSnapshot subscriptions for live data
- **Keyboard Shortcuts:** FO hotkeys (C, O, H) for quick operations
- **Analytics Dashboard:** Occupancy rates, revenue tracking, booking trends

## Project Structure

```
src/
  components/       # Reusable UI components
  contexts/         # React context providers (Auth)
  hooks/            # Custom React hooks
  layouts/          # App shell, navigation
  lib/              # Utilities, routing helpers
  pages/            # Page components (public/, fo/, admin/)
  services/         # Firebase/Firestore service layer
  firebase/         # Firebase configuration
  cloudinary/       # Cloudinary configuration
```

## License

Academic project — Consolatrix College of Toledo City
