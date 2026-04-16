// ── Q Analytics · grant-matcher · TypeScript types ─────────────────────────

// ── Supabase rows ────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  agency_name: string
  contact_email: string
  subscription_tier: string
}

export interface AgencyProfile {
  id: string
  user_id: string
  agency_type: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  population: number | null
  department_focus: string | null
  current_projects: string | null
  contact_name: string | null
  contact_title: string | null
}

/** Merged view of a single customer used throughout the function */
export interface Agency {
  profile: Profile
  agencyProfile: AgencyProfile
}

// ── grants.gov REST API ───────────────────────────────────────────────────────

/** One record from the grants.gov opportunity search response */
export interface GrantsGovOpportunity {
  id: number
  number: string         // e.g. "HUD-2026-OP-001"
  title: string
  agencyCode: string
  agencyName: string
  openDate: string       // "MM/DD/YYYY"
  closeDate: string      // "MM/DD/YYYY" — empty string if no deadline
  oppStatus: string      // "posted" | "forecasted" | "closed" | "archived"
  category: string       // Funding category code e.g. "CD", "HL"
  categoryExplanation: string | null
  costSharing: string    // "Yes" | "No"
  awardCeiling: number | null
  awardFloor: number | null
  estimatedFunding: number | null
  expectedNumberOfAwards: number | null
}

/** Top-level grants.gov search response envelope */
export interface GrantsGovResponse {
  errorcode: number
  oppHits: GrantsGovOpportunity[]
  totalHits: number
}

// ── Claude API ────────────────────────────────────────────────────────────────

/** Exact JSON shape Claude must return for each grant evaluation */
export interface GrantMatchResult {
  match_score: number       // integer 1–10
  qualify_reason: string    // exactly 2 sentences
  action_items: string[]    // 3–5 actionable steps
  deadline: string          // ISO "YYYY-MM-DD" preferred, human-readable accepted
  estimated_amount: string  // e.g. "$100,000 – $500,000"
}

// ── Database insert shapes ────────────────────────────────────────────────────

/** Row to insert into public.grant_matches */
export interface GrantMatchRow {
  agency_id: string
  grant_title: string
  amount_min: number | null
  amount_max: number | null
  deadline: string | null   // ISO date "YYYY-MM-DD"
  match_score: number
  qualify_reason: string
  action_items: string      // JSON-stringified string[]
  source_url: string | null
  status: 'new'
}

/** Row to insert into public.notifications */
export interface NotificationRow {
  agency_id: string
  type: string
  title: string
  message: string
  read: false
}

// ── Run telemetry ─────────────────────────────────────────────────────────────

export interface RunSummary {
  agenciesProcessed: number
  grantsEvaluated: number
  matchesSaved: number
  emailsSent: number
  errors: string[]
}

/** Pair used to build the email digest */
export interface EmailMatch {
  grant: GrantsGovOpportunity
  result: GrantMatchResult
}
