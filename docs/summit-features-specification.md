# Summit - Feature Specification (Updated)

**Last Updated:** February 15, 2026  
**Version:** 1.0 (Fixed-Bid Projects Only)

## Overview
This document outlines the features for Summit, organized by implementation phase and functional area.

**Version 1 Scope:** Fixed-bid projects with milestone-based invoicing ONLY. Session packs and retainer agreements are deferred to future versions.

---

## Tech Foundation

### Tenant & Identity
**Create and manage accounts: signup, login, workspace creation, and roles.**

**Implementation Model:**
- One user = one workspace (email globally unique)
- First user who signs up = workspace owner
- Owners can invite members to their workspace
- No multi-workspace support (users belong to exactly one workspace)

**Features:**
- Signup with email verification ✅ (DB trigger ready, UI to build)
- User profile management ⏳
- Email verification ⏳
- Password reset ⏳
- Role model: owner vs member ✅ (DB implemented)
- Member management: owner can invite/remove ⏳

**Role Capabilities:**

| Capability | Owner | Member |
|-----------|-------|--------|
| Create/edit clients | ✅ | ✅ |
| Create/edit projects | ✅ | ✅ |
| Mark milestones complete | ✅ | ✅ |
| Generate invoices | ✅ | ✅ |
| Send invoices | ✅ | ✅ |
| View billing info | ✅ | ✅ (read-only) |
| Manage subscription | ✅ | ❌ |
| Invite/remove members | ✅ | ❌ |
| Delete workspace | ✅ | ❌ |

**Key Difference from Original Spec:**
- Members have FULL data access (not limited)
- Distinction is primarily for billing/admin operations
- Simpler than original admin/user/viewer model

### Authorization & Access
**Enforce permissions so only the right users can perform the right actions in the workspace.**

**Implementation:**
- RLS policies enforce workspace isolation at database level ✅
- Owner-only restrictions for: subscription management, member management, workspace deletion ✅
- All data operations filtered by workspace_id ✅
- No project-level permissions (workspace-level only)

**Features:**
- Workspace isolation (workspace_id required on all queries) ✅
- RLS policies ✅
- Authorization helper functions ⏳
- Role-based UI controls ⏳

### Security Baseline
**Protect Summit against account abuse, data leaks, and payment-related security risks.**

**Features:**
- Strong password rules (8+ characters) ⏳
- Login rate limiting ⏳
- Rate protection on signups ⏳
- Secure session handling (httpOnly cookies) ✅
- Secure storage of secrets (env vars) ✅
- Security headers (CSP, HSTS, etc.) ⏳
- Audit log for critical events ⏳ (deferred to later sprint)

### Billing & Subscriptions
**Sell Summit subscriptions and automatically block or allow access based on payment status.**

**Trial Period:** 14 days (starts after email verification)

**Subscription Model:**
- Workspace subscription (not per-user) ✅
- One tier: "Summit Pro" (monthly or yearly) ✅
- Pricing: €15/month or €150/year ✅
- Future: May add "Solo" tier with team limitations

**Access Control:**
- Workspace status: trial | active | past_due | suspended | canceled ✅
- `trial` or `active` = full access
- `past_due`, `suspended`, `canceled` = read-only access (can view data, cannot create/edit)

**Features:**
- Trial tracking ✅ (DB implemented)
- Checkout flow (Mollie) ⏳
- Webhook processing (idempotent) ⏳
- Subscription status tracking ✅ (DB ready)
- Access control based on status ⏳
- Grace period handling ⏳

**Key Differences from Original Spec:**
- 14-day trial (not unspecified)
- Read-only access when suspended (not fully blocked)
- Simplified pricing (one tier to start)

---

## App Core (Version 1: Fixed-Bid Projects Only)

### Core Domain Model
**Define the core business objects (clients, projects, milestones, invoices) and how they relate.**

**Version 1 Entities:**
- Client entity ⏳
- Project entity (fixed-bid only) ⏳
- Milestones ⏳
- Invoice model (draft | issued | paid | void) ⏳
- Payment record model ⏳

**Deferred to v2:**
- ❌ Service offering templates
- ❌ Session packs
- ❌ Retainer periods

**Project Statuses:**
- draft - Not started
- active - In progress
- completed - All milestones done
- canceled - Project canceled

**Milestone Statuses:**
- pending - Not yet completed
- completed - Done, ready to invoice
- invoiced - Invoice generated

### Invoice Engine
**Generate invoices when milestones are completed.**

**Version 1 Features:**
- Fixed project (milestone-based) ⏳
- Manual milestone completion ⏳
- Draft invoice generation ⏳
- Manual invoice trigger ⏳

**Deferred to v2:**
- ❌ Session pack agreements
- ❌ Retainer agreements
- ❌ Automatic trigger rules
- ❌ Invoice preview timeline

**Workflow:**
1. User marks milestone as complete
2. System generates draft invoice
3. User reviews and sends invoice to client

### Invoicing & Compliance
**Produce and send compliant invoices (numbering, PDFs, branding, delivery) to the client.**

**Features:**
- Invoice numbering per workspace ⏳
- PDF generation ⏳
- Email sending ⏳
- Payment terms configuration ⏳

**Deferred to v2:**
- ❌ Branding (logo, custom footer)
- ❌ URL attachments

### UI Design
**Provide the app structure and reusable UI components needed to build the product screens.**

**Features:**
- App layout structure ⏳
- Navigation model ⏳
- Core shadcn/ui components (install on-demand) ⏳
- Loading / empty / error states ⏳

---

## Pipeline & Work Tracking (Deferred to v2)

**Not in Version 1:**
- ❌ Leads / opportunities
- ❌ Convert opportunity → project
- ❌ Project timeline view (beyond basic list)

**Version 1 has:**
- ✅ Simple project list
- ✅ Milestone completion tracking
- ✅ Invoice generation from milestones

### Notifications & Messaging
**Send the key emails users and clients rely on.**

**Version 1 Features:**
- Transactional emails (via Supabase): ⏳
  - Email verification ⏳
  - Password reset ⏳
  - Member invitation ⏳
- Invoice email delivery ⏳

**Deferred to v2:**
- ❌ Receipt emails
- ❌ Reminder emails
- ❌ In-app notifications

### Payments & Reconciliation
**Record payments against invoices.**

**Version 1 Features:**
- Manual payment recording ⏳
- Mark invoice as paid ⏳

**Deferred to v2:**
- ❌ Payment links
- ❌ Webhook: automatic payment reconciliation

---

## Admin

### Observability & Reliability (Minimal for v1)

**Version 1:**
- Basic error tracking (frontend + backend) ⏳
- Structured logging ⏳ (minimal)

**Deferred to v2:**
- ❌ Background jobs + retries
- ❌ Automated backups beyond Supabase defaults
- ❌ Advanced health checks
- ❌ Metrics counters

### Admin & Internal Tools (Deferred to v2)

**Not in Version 1:**
- ❌ Internal admin panel
- ❌ Workspace directory
- ❌ Webhook event log
- ❌ Feature flags

**Version 1:**
- Manual support via Supabase dashboard

### Business Metrics (Deferred to v2)

**Not in Version 1:**
- ❌ Dashboard with MRR, churn, etc.

**Version 1:**
- Manual queries via Supabase dashboard

---

## Implementation Notes

### Tech Stack Alignment
- **Framework**: Next.js 16+ (App Router), TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui (on-demand)
- **Database**: PostgreSQL via Supabase with RLS policies ✅
- **Auth**: Supabase Auth with cookie-based sessions ✅
- **Payments**: Mollie integration for subscriptions ⏳
- **Deployment**: Vercel

### Feature Priorities

**Sprint 0 (Foundation) - 10 days:**
- Days 1-3: Environment + Database ✅
- Days 4-5: Authentication ⏳
- Days 6-7: Authorization + Workspace System ⏳
- Days 8-9: Mollie Integration + Subscriptions ⏳
- Day 10: Security + Compliance ⏳

**Sprint 1 (Core Product) - 10-14 days:**
- Clients CRUD
- Projects CRUD (fixed-bid only)
- Milestones management
- Basic invoice generation
- Invoice PDF creation
- Invoice email sending

**Sprint 2+ (Full v1) - 10-14 days:**
- Payment recording
- Invoice status tracking
- User profile editing
- Member invitation system
- Polish and testing
- Deploy to production

**Deferred to v2:**
- Session packs
- Retainer agreements
- Advanced automation
- Reporting and analytics
- Admin tools
- Business metrics dashboard

### Security Considerations

**All features must adhere to:**
- RLS policies enforced at database level ✅
- Workspace isolation on all queries ✅
- Rate limiting on public endpoints ⏳
- Audit logging for sensitive operations ⏳ (minimal in v1)
- Secure credential storage ✅
- HTTPS-only in production

### Compliance Requirements

**Version 1 Requirements:**
- GDPR data deletion requests ⏳
- Terms of service and privacy policy ⏳
- Cookie consent (if needed for EU) ⏳

**Deferred to v2:**
- ❌ Invoice numbering compliance per jurisdiction
- ❌ Advanced PCI compliance (handled by Mollie)

---

## Feature Dependencies

### Critical Path (Version 1)
1. **Tenant & Identity** ✅ (DB ready) → Authentication UI ⏳
2. **Authorization & Access** ✅ (RLS ready) → Helper functions ⏳
3. **Billing & Subscriptions** ✅ (DB ready) → Mollie integration ⏳
4. **Core Domain Model** → Clients, Projects, Milestones ⏳
5. **Invoice Engine** → Generate invoices from milestones ⏳
6. **Invoicing & Compliance** → PDF generation, email sending ⏳

### Optional/Enhanced Features
- Notifications (basic email is enough for v1)
- Advanced pipeline tracking (deferred to v2)
- Admin tools (use Supabase dashboard for v1)
- Metrics (manual queries for v1)

---

## Success Metrics

### Technical Metrics (Version 1)
- 99% uptime for core services
- < 3s page load times
- < 200ms API response times (p95)
- Zero critical security vulnerabilities

### Business Metrics (Version 1)
- User signup to first workspace creation: < 2 minutes (automatic)
- Time to create first invoice: < 20 minutes
- Email delivery rate: > 95%

### User Experience Metrics (Version 1)
- Invoice generation success rate: > 95%
- User-reported critical bugs: < 1 per 50 active users

---

## Version 1 vs. Future Versions

### What's IN Version 1
✅ Fixed-bid projects  
✅ Milestone-based billing  
✅ Manual invoice generation  
✅ Email delivery  
✅ Workspace collaboration (owner + members)  
✅ Mollie subscription payments  
✅ 14-day trial  

### What's NOT in Version 1 (Deferred)
❌ Session packs (hourly/block time)  
❌ Retainer agreements  
❌ Automatic invoice triggers  
❌ Invoice timeline preview  
❌ Payment links  
❌ Client portal  
❌ Time tracking  
❌ Expense tracking  
❌ Advanced reporting  
❌ Admin dashboard  

---

## Appendix

### Glossary (Version 1)
- **Workspace**: A tenant/account containing users, clients, projects, and invoices
- **Owner**: User role with full permissions including billing and member management
- **Member**: User role with full data permissions but no billing/admin access
- **Client**: External entity that receives invoices (no login access)
- **Project**: Fixed-bid work engagement with a client
- **Milestone**: Fixed deliverable in a project with associated payment amount
- **Invoice**: Billing document sent to client via email
- **Trial**: 14-day free access period starting after email verification
- **Workspace Status**: trial | active | past_due | suspended | canceled

### Related Documents
- Sprint 0: Technical Foundation (Updated): `/docs/sprint-0-technical-foundation-updated.md`
- Development Context: `/docs/development-context.md`
- Database Schema: `/docs/database-schema.md`
- Authentication Prompt: `/docs/cursor-prompt-authentication.md`

---

## Changelog

### Version 1.0 (February 15, 2026)
- Updated to reflect simplified workspace model (one user = one workspace)
- Clarified role model (owner vs member with full data access for both)
- Defined v1 scope (fixed-bid projects only)
- Updated trial period to 14 days
- Clarified pricing (€15/€150 for Pro tier)
- Deferred session packs, retainers, and advanced features to v2

---

*Document Version: 1.0 (Updated)*  
*Last Updated: February 15, 2026*  
*Reflects actual implementation decisions and v1 scope*
