# Revoca Backend — Clerk Flow Visual Guide

## 1. The Big Picture: Sign-Up → First Request

Complete flow from a brand new user signing up to their first authenticated API call.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 1: SIGN UP                                    │
└──────────────────────────────────────────────────────────────────────────────┘

  User (Browser)          Clerk Frontend SDK          Clerk Servers
       │                        │                          │
       │── Clicks "Sign Up" ───>│                          │
       │                        │── Create User ──────────>│
       │                        │<── User created ─────────│
       │                        │    (clerkUserId)         │
       │<── Signed in ──────────│                          │
       │    (session token)     │                          │
       │                        │                          │

  ✅ At this point: User exists in CLERK, but NOT in your database.
     They have a valid session token they can send with requests.


┌──────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 2: CREATE WORKSPACE                                │
└──────────────────────────────────────────────────────────────────────────────┘

  User (Browser)              Your Backend                 Clerk Servers
       │                           │                            │
       │── POST /api/v1/org/create │                            │
       │   { name, org_type }      │                            │
       │   + session token ───────>│                            │
       │                           │                            │
       │                   requireClerkAuth()                   │
       │                   extracts clerkUserId                 │
       │                   from session token                   │
       │                           │                            │
       │                           │── createOrganization() ───>│
       │                           │   { name, createdBy,       │
       │                           │     publicMetadata:        │
       │                           │       { org_type } }       │
       │                           │                            │
       │                           │<── Org created ────────────│
       │                           │    (clerkOrgId)            │
       │                           │                            │
       │<── 201 { clerkOrgId } ────│                            │
       │                           │                            │

  ✅ At this point: Org exists in CLERK, but NOT in your database yet.
     Clerk will now fire webhooks asynchronously.


┌──────────────────────────────────────────────────────────────────────────────┐
│              PHASE 3: WEBHOOKS (async, ~100-500ms later)                     │
└──────────────────────────────────────────────────────────────────────────────┘

  Clerk Servers              Your Backend                   Postgres
       │                          │                            │
       │── Webhook ──────────────>│                            │
       │   organization.created   │                            │
       │                          │  authHandler.ts reads      │
       │                          │  org_type from             │
       │                          │  public_metadata           │
       │                          │                            │
       │                          │── INSERT organizations ───>│
       │                          │   (org_type, name, ...)    │
       │                          │<── org row created ────────│
       │                          │                            │
       │── Webhook ──────────────>│                            │
       │   membership.created     │                            │
       │                          │  authHandler.ts reads      │
       │                          │  role from event.data.role │
       │                          │  strips "org:" prefix      │
       │                          │  "org:admin" → "admin"     │
       │                          │                            │
       │                          │── INSERT users ───────────>│
       │                          │   (role, email, ...)       │
       │                          │<── user row created ───────│
       │                          │                            │

  ✅ At this point: Both org AND user exist in your database.


┌──────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 4: NORMAL USAGE                                 │
└──────────────────────────────────────────────────────────────────────────────┘

  User (Browser)              Your Backend                   Postgres
       │                           │                            │
       │── GET /api/v1/resource    │                            │
       │   + session token ───────>│                            │
       │                           │                            │
       │                   authenticateUser()                   │
       │                   extracts clerkUserId                 │
       │                           │                            │
       │                           │── SELECT FROM users ──────>│
       │                           │   WHERE clerk_user_id = ?  │
       │                           │<── user found ─────────────│
       │                           │                            │
       │                   attaches user to req                 │
       │                           │                            │
       │<── 200 { data } ─────────│                            │
       │                           │                            │
```

---

## 2. Middleware Chain — How Requests Flow Through app.ts

Every request hits these layers **in order**. The position of each router matters.

```
                          Incoming Request
                               │
                               ▼
                   ┌───────────────────────┐
                   │  Path: /api/v1/auth?  │
                   └───────────────────────┘
                      │                │
                     YES               NO
                      │                │
                      ▼                ▼
            ┌─────────────────┐  ┌──────────────────────┐
            │   authRouter    │  │  clerkMiddleware()    │
            │                 │  │  populates auth data  │
            │  raw body +     │  └──────────────────────┘
            │  webhook handler│             │
            │                 │             ▼
            │  📁 authRouter  │  ┌──────────────────────┐
            │     .ts         │  │  express.json()       │
            └────────┬────────┘  │  parses req.body      │
                     │           └──────────────────────┘
                     ▼                      │
              Response sent                 ▼
                              ┌──────────────────────┐
                              │  cors()               │
                              │  sets CORS headers    │
                              └──────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │  Path: /api/v1/org?   │
                                └───────────────────────┘
                                   │                │
                                  YES               NO
                                   │                │
                                   ▼                ▼
                         ┌──────────────┐  ┌────────────────────┐
                         │  orgRouter   │  │  / or /health      │
                         │              │  │  or future routes  │
                         │  requireClerk│  │  (authenticateUser │
                         │  Auth then   │  │   middleware)      │
                         │  createOrg   │  └────────┬───────────┘
                         └──────┬───────┘           │
                                │                   ▼
                                ▼            Response sent
                         Response sent
```

**Why is `authRouter` BEFORE `clerkMiddleware()`?**
The webhook endpoint receives a raw body signed by Svix. If `express.json()` parsed it first, the signature verification would fail.

**Why is `orgRouter` AFTER `clerkMiddleware()`?**
`requireClerkAuth` calls `getAuth(req)`, which only works after `clerkMiddleware()` has populated the auth data.

---

## 3. Webhook Processing — What Clerk Sends and What You Do With It

```
  Clerk fires webhook
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │  authController.ts — handleWebhook()        │
  │                                             │
  │  1. Grab svix-id, svix-timestamp,           │
  │     svix-signature from headers             │
  │  2. Verify signature with Svix SDK          │
  │  3. Switch on event.type                    │
  └──────────────────┬──────────────────────────┘
                     │
       ┌─────────────┼─────────────┬─────────────┐
       ▼             ▼             ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │org.      │ │membership│ │membership│ │membership│
  │created   │ │.created  │ │.updated  │ │.deleted  │
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
       │             │             │             │
       ▼             ▼             ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ INSERT   │ │ INSERT   │ │ UPDATE   │ │ UPDATE   │
  │ organi-  │ │ users    │ │ users    │ │ users    │
  │ zations  │ │          │ │ SET role │ │ SET      │
  │          │ │ with     │ │          │ │deleted_at│
  │ with     │ │ role from│ │          │ │          │
  │ org_type │ │ event    │ │          │ │ (soft    │
  │ from     │ │ data     │ │          │ │  delete) │
  │ metadata │ │          │ │          │ │          │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
```

### Webhook payload cheat sheet:

| Webhook Event | Key Fields Your Code Reads | What It Does |
|---|---|---|
| `organization.created` | `event.data.id`, `event.data.name`, `event.data.public_metadata.org_type` | Creates org row in DB |
| `organizationMembership.created` | `public_user_data.user_id`, `organization.id`, `identifier` (email), `role` | Creates user row in DB |
| `organizationMembership.updated` | Same as above | Updates user's role |
| `organizationMembership.deleted` | `user_id`, `organization.id` | Soft-deletes user |

---

## 4. JIT Provisioning — The Race Condition Safety Net

Sometimes a user's first API call arrives **before** the webhook has been processed.

```
  authenticateUser() called
  📁 middlewares/auth.ts
         │
         ▼
  getAuth(req) — extract clerkUserId + clerkOrgId
         │
         ▼
  ┌─────────────────────┐
  │ clerkUserId exists? │
  └─────────────────────┘
       │            │
      NO           YES
       │            │
       ▼            ▼
  ┌────────┐   userRepository.findByClerkUserId()
  │  401   │        │
  └────────┘        ▼
              ┌──────────────────┐
              │ User found in DB?│
              └──────────────────┘
                 │            │
                YES           NO
                 │            │
                 ▼            ▼
          ┌───────────┐  ⚡ JIT PROVISIONING
          │ Attach    │       │
          │ user to   │       ▼
          │ req,      │  ┌─────────────────────┐
          │ call      │  │ clerkOrgId exists?   │──── NO ───> 400 error
          │ next()    │  └─────────────────────┘
          └───────────┘       │
               ▲             YES
               │              │
               │              ▼
               │     orgRepository.findByClerkOrgId()
               │              │
               │              ▼
               │     ┌──────────────────┐
               │     │ Org found in DB? │──── NO ───> 400 error
               │     └──────────────────┘
               │              │
               │             YES
               │              │
               │              ▼
               │     clerkClient.users.getUser()
               │     get email from Clerk
               │              │
               │              ▼
               │     ┌──────────────────┐
               │     │ Email found?     │──── NO ───> 400 error
               │     └──────────────────┘
               │              │
               │             YES
               │              │
               │              ▼
               │     getOrganizationMembershipList()
               │     find this user's membership
               │              │
               │              ▼
               │     Strip "org:" prefix from role
               │     e.g. "org:admin" → "admin"
               │              │
               │              ▼
               │     userRepository.create()
               │     INSERT INTO users
               │              │
               └──────────────┘
```

**Why does JIT need the org to already exist in the DB?**
The `organization.created` webhook fires **before** `organizationMembership.created`. So by the time a user's first request arrives, the org is almost always already in the DB — even if the user row isn't yet.

---

## 5. File Map — Which File Does What

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MIDDLEWARES                                  │
│                                                                     │
│  requireClerkAuth.ts ─── Pre-DB auth: just checks Clerk session    │
│                          Used by: /api/v1/org/create                │
│                                                                     │
│  auth.ts ──────────────── Full auth: DB lookup + JIT provisioning  │
│                           Used by: all future protected routes      │
│                                                                     │
│  errorMiddleware.ts ───── Catches errors, maps PG codes to HTTP    │
└─────────────────────────────────────────────────────────────────────┘
         │                        │
         │ guards                 │ guards
         ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       ROUTE HANDLERS                                │
│                                                                     │
│  modules/auth/                    modules/org/                      │
│  ├── authRouter.ts                ├── orgRouter.ts                  │
│  │   POST /api/v1/auth/webhook    │   POST /api/v1/org/create      │
│  │          │                     │          │                      │
│  │          ▼                     │          ▼                      │
│  ├── authController.ts            └── orgController.ts              │
│  │   Svix signature verify            Creates org in Clerk          │
│  │          │                                                       │
│  │          ▼                                                       │
│  └── authHandler.ts                                                 │
│      Webhook event handlers                                         │
└─────────────────────────────────────────────────────────────────────┘
         │
         │ calls
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
│                                                                     │
│  orgRepository.ts ─────── CRUD for organizations table             │
│  userRepository.ts ────── CRUD for users table                     │
│         │                                                           │
│         ▼                                                           │
│  db/pool.ts ──────────── Postgres connection pool                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      TYPE DEFINITIONS                               │
│                                                                     │
│  types/orgs.ts ────────── Organization, CreateOrganizationInput    │
│  types/users.ts ───────── User, CreateUser, UpdateUser             │
│  types/express.d.ts ───── Augments Request with user + clerkUserId │
└─────────────────────────────────────────────────────────────────────┘
```

### The two middlewares serve different purposes:

| Middleware | When to use | What it checks | Attaches to `req` |
|---|---|---|---|
| `requireClerkAuth` | User may not exist in DB yet | Clerk session only | `req.clerkUserId` |
| `authenticateUser` | All normal protected routes | Clerk session + DB lookup + JIT | `req.user` + `req.clerkUserId` |
