# Product Decisions

Key product decisions and rationale.

---

## Niche: Small businesses, not enterprise

**Decision:** Target businesses with 5–50 employees that cannot afford Glean ($20,000+/year), Guru, or Notion AI at enterprise pricing.

**Why:**
- Enterprise tools are sales-led with 6–12 month procurement cycles — incompatible with SMB buying behavior
- SMBs have the same knowledge fragmentation problem but no IT team to solve it
- Self-serve signup + $20–50/month fits credit-card budget decisions

**Risk:** Lower ACV means needing volume. Mitigated by low infrastructure cost per tenant (shared PostgreSQL, serverless frontend).

---

## Pricing: $20–50/month

**Decision:** Two tiers at launch.

| Tier | Price | Includes |
|------|-------|----------|
| Starter | $20/month | 3 integrations, 100 queries/month, 1 user |
| Pro | $50/month | Unlimited integrations, 500 queries/month, 5 users |

**Why $20 floor:**
- Below $20 feels "too cheap to trust" for a product handling business email and Slack
- Covers API costs (OpenAI embeddings + Claude) for ~100 queries/month with margin
- 10× cheaper than the cheapest enterprise alternative

**Why $50 Pro tier:**
- Teams of 3–5 need multiple users and higher query volume
- $50/month is still impulse-buy territory for a business expense
- Upsell path: Pro → custom pricing at 50+ users (Phase 3)

---

## Phase 1 integrations: Slack, Gmail, Google Drive

**Decision:** Launch with the three tools most SMBs already use daily.

**Why not more at launch:**
- Each connector is a maintenance surface (OAuth, API changes, rate limits)
- These three cover the scenario in our core pitch: "Why did we stop using this supplier?" requires Slack threads + email + docs
- Google OAuth app covers both Gmail and Drive with one consent flow

**WhatsApp, GitHub, Notion deferred to Phase 2** because they require separate OAuth apps and serve narrower use cases.

---

## "I don't know" over hallucination

**Decision:** When confidence is below threshold, explicitly say "I couldn't find enough information" rather than generating a plausible-sounding answer.

**Why:**
- One hallucinated answer about a business decision destroys trust permanently
- SMB users are connecting sensitive data (email, internal Slack) — trust is the product
- "I don't know" with a suggestion to connect more sources is actionable; a wrong answer is harmful

---

## Morning digest as MVP feature

**Decision:** Ship email digest in Phase 1, not Phase 2.

**Why:**
- Creates daily engagement even when users don't actively query
- Demonstrates value before the user asks their first question ("Here's what happened in your business yesterday")
- Low engineering cost — reuses the same Claude summarization pipeline
- Differentiator vs. pure search tools (Glean doesn't push proactive summaries to SMBs)

---

## Web-first, no mobile app

**Decision:** Phase 1 is a web application only. No iOS/Android app.

**Why:**
- Target use case is desk work ("why did we decide X?") — desktop browser is the primary context
- Web app ships faster and works on all devices
- PWA wrapper is an option in Phase 2 if mobile demand appears

---

## Self-serve onboarding, no sales team

**Decision:** Users sign up, connect integrations, and get value without talking to anyone.

**Why:**
- Sales-led motion requires ACV of $5,000+ to justify CAC
- At $20–50/month, the entire funnel must be self-serve
- OAuth connect flows are the onboarding — if a user connects Slack in 2 minutes, they'll stay

---

## Students and small teams as secondary audience

**Decision:** Market to student project teams and study groups alongside SMBs.

**Why:**
- Same core need: querying notes, emails, and group chats simultaneously
- Lower willingness to pay but higher viral potential (team members invite others)
- Good for early traction and feedback before SMB sales motion ramps
- Starter tier at $20/month is affordable for a student team splitting cost

**Risk:** Students churn after project ends. Acceptable for early growth; retention focus stays on SMB segment.
