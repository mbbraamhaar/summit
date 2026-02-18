# Summit

**Automate your freelance invoicing for fixed-bid projects**

Summit helps freelancers and small studios automate milestone-based billing for fixed-price projects. Track clients, set up project milestones, and automatically generate invoices when work is completed.

## Features

### Core Capabilities
- 🎯 **Client & Project Management** - Track clients and fixed-bid projects
- 📊 **Milestone Tracking** - Define project milestones with payment schedules
- 📄 **Automated Invoice Generation** - Generate invoices when milestones are completed
- 💳 **Payment Processing** - Mollie integration with webhook automation
- 👥 **Multi-user Companies** - Team collaboration with role-based access
- 🔒 **Company Isolation** - Complete data separation between companies

### Coming Soon
- Session pack agreements (hourly/block time billing)
- Retainer agreements with recurring billing

### Tech Stack
- **Framework**: Next.js 16+ (App Router)
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

Authoritative architecture, identity, billing, and gating rules live in the docs listed in the Documentation section. The summary below is non-canonical.

### Multi-tenancy Model
Summit uses a **single-company multi-tenancy model**:
- Each company is an isolated tenant
- All data queries require and enforce `company_id`
- RLS policies ensure complete data isolation
- Users belong to exactly one company

### Authorization Model
Two role types:
- **Owner**: Full permissions including billing, member management, company settings
- **Member**: Full data permissions in the company (no billing/member-management access)

### Security
- Row-level security (RLS) on all tables
- Company isolation enforced at database level
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

- [Development Context (Authority Map)](./docs/development-context.md)
- [Database Schema](./docs/database-schema.md)
- [Feature Specification](./docs/summit-features-specification.md)
- [Identity and Auth](./docs/identity-and-auth.md)
- [Access Control and Status Gating](./docs/access-control-and-status-gating.md)
- [Billing and Tax Policy](./docs/billing-and-tax-policy.md)
- [Mollie Subscriptions](./docs/mollie-subscriptions.md)
- [Invoice Engine Architecture](./docs/invoice-engine-architecture.md)
- [Sprint 0 Overview](./docs/sprint-0-overview.md)

## License

Copyright © 2026 Around Us BV. All rights reserved.

This software is proprietary and confidential. Unauthorized copying, distribution, 
or use of this software is strictly prohibited.
