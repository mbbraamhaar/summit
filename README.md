# Summit

**Automate your freelance invoicing for fixed-bid projects**

Summit helps freelancers and small studios automate milestone-based billing for fixed-price projects. Track clients, set up project milestones, and automatically generate invoices when work is completed.

## Features

### Core Capabilities
- 🎯 **Client & Project Management** - Track clients and fixed-bid projects
- 📊 **Milestone Tracking** - Define project milestones with payment schedules
- 📄 **Automated Invoice Generation** - Generate invoices when milestones are completed
- 💳 **Payment Processing** - Mollie integration with webhook automation
- 👥 **Multi-user Workspaces** - Team collaboration with role-based access
- 🔒 **Workspace Isolation** - Complete data separation between workspaces

### Coming Soon
- Session pack agreements (hourly/block time billing)
- Retainer agreements with recurring billing

### Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui (installed on-demand)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth with RLS
- **Payments**: Mollie
- **Deployment**: Vercel

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- Mollie account (for payments)

### Installation

1. Clone the repository:
```bash
   git clone https://github.com/mbbraamhaar/summit.git
   cd summit
```

2. Install dependencies:
```bash
   npm install
```

3. Copy `.env.example` to `.env.local` and fill in your values:
```bash
   cp .env.example .env.local
```

4. Run the development server:
```bash
   npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Project Structure
```
/app          # Next.js app router pages and API routes
/components   # Reusable React components
  /ui         # shadcn/ui components (installed on-demand)
  /auth       # Authentication components
  /billing    # Subscription/billing components
  /summit     # Custom Summit domain components (timelines, schedules, etc)
  /layout     # Layout components (nav, sidebar)
/lib          # Utilities, configurations, and business logic
  /supabase   # Supabase client configuration
  /mollie     # Mollie client configuration
  /auth       # Authentication helpers
  /subscriptions # Subscription management
/types        # TypeScript type definitions
/hooks        # Custom React hooks
/public       # Static assets
```

## Architecture Overview

### Multi-tenancy Model
Summit uses a **workspace-based multi-tenancy model**:
- Each workspace is an isolated tenant
- All data queries require and enforce `workspace_id`
- RLS policies ensure complete data isolation
- Users can belong to multiple workspaces with different roles

### Authorization Model
Two role types:
- **Owner**: Full permissions including billing, member management, workspace settings
- **Member**: Can manage clients, projects, and invoices within workspace

### Security
- Row-level security (RLS) on all tables
- Workspace isolation enforced at database level
- Rate limiting on authentication and public endpoints
- Audit logging for critical operations
- Secure credential storage via environment variables

## Development

### Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/*` - Feature branches off develop

### Workflow
1. Create feature branch from `develop`
2. Implement feature following Sprint 0 conventions
3. Create PR to merge into `develop`
4. After testing, merge `develop` → `main`

### Installing shadcn/ui Components
Components are installed on-demand as needed:
```bash
npx shadcn@latest add [component-name]
```

## Documentation

- [Sprint 0: Technical Foundation](./docs/sprint-0-technical-foundation.md)
- [Feature Specification](./docs/summit-features-specification.md)
- Database Schema (coming soon)
- API Documentation (coming soon)

## License

Copyright © 2026 Around Us BV. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, 
or use of this software is strictly prohibited.