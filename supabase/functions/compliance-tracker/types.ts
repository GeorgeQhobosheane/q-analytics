// ── Q Analytics · compliance-tracker · TypeScript types ─────────────────────

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
  city: string | null
  state: string | null
  population: number | null
  department_focus: string | null
  current_projects: string | null
}

/** Merged view of a single customer used throughout the function */
export interface Agency {
  profile: Profile
  agencyProfile: AgencyProfile
}

// ── Federal Register API ─────────────────────────────────────────────────────

/** One document from the Federal Register API results array */
export interface FedRegDocument {
  document_number: string        // dedup key
  title: string
  abstract: string | null
  agency_names: string[]
  html_url: string               // stored as source_url
  publication_date: string       // "YYYY-MM-DD"
  type: 'RULE' | 'PROPOSED_RULE' | 'NOTICE'
  effective_on: string | null    // deadline for RULE type
  comment_date: string | null    // deadline for PROPOSED_RULE type
}

/** Top-level Federal Register API response envelope */
export interface FedRegResponse {
  count: number
  total_pages: number
  results: FedRegDocument[]
}

// ── Claude API ────────────────────────────────────────────────────────────────

/** Exact JSON shape Claude must return for each regulation evaluation */
export interface ComplianceAnalysis {
  relevant: boolean
  urgency: 'critical' | 'high' | 'medium' | 'low'
  plain_english_summary: string   // 1 sentence
  action_required: string         // specific action this agency must take
  deadline: string | null         // "YYYY-MM-DD" or null
  consequence_of_inaction: string // 1 sentence
}

// ── Database insert shapes ────────────────────────────────────────────────────

/** Row to insert into public.compliance_items */
export interface ComplianceItemRow {
  agency_id: string
  regulation_title: string
  action_required: string         // packed: SUMMARY + ACTION + CONSEQUENCE
  deadline: string | null
  urgency: 'critical' | 'high' | 'medium' | 'low'
  status: 'pending' | 'overdue'
  source_url: string
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
  regulationsEvaluated: number
  itemsSaved: number
  notificationsSent: number
  errors: string[]
}
