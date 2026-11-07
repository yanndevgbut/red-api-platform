# RED/API — Frontend Platform

High velocity REST API Platform frontend built with **Next.js 15 App Router**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

## Tech Stack
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS (Dark + Red Industrial Theme)
- **Typography**: Bebas Neue (Headlines), JetBrains Mono (Code/Telemetry), Plus Jakarta Sans (Body)
- **Database / Auth**: Supabase (PostgreSQL with RLS)
- **Backend Node**: Pterodactyl Node Server (`http://103.155.224.102:3016`)

## Environment Variables
Create `.env.local` with the following variables:
```env
NEXT_PUBLIC_API_BASE_URL=http://103.155.224.102:3016
NEXT_PUBLIC_SUPABASE_URL=https://mntrffrihkbxvtxsktkw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_or_service_key
```

## Getting Started
```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
