'use strict'

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const AGENCY_ID = 'a8f7424f-37fe-4e6f-b272-057cf1c7d13b'

const items = [
  {
    agency_id: AGENCY_ID,
    regulation_title: 'EPA Drinking Water Standards Update — PFAS Maximum Contaminant Levels',
    action_required: [
      'SUMMARY: The EPA has finalized maximum contaminant levels (MCLs) for six PFAS chemicals in public drinking water systems, requiring municipal water providers to test, treat, and report within 5 years.',
      'ACTION: Conduct baseline PFAS testing of all municipal water sources. Procure EPA-certified laboratory testing services and begin treatment infrastructure assessment within 90 days.',
      'CONSEQUENCE: Non-compliant systems face federal enforcement action, public notification requirements, and potential civil penalties of up to $25,000 per day.',
    ].join('\n\n'),
    deadline: '2026-05-01',
    urgency: 'critical',
    status: 'pending',
    source_url: 'https://www.federalregister.gov/documents/2024/04/26/2024-07773/pfas-national-primary-drinking-water-regulation',
  },
  {
    agency_id: AGENCY_ID,
    regulation_title: 'FEMA Hazard Mitigation Grant Program — Pre-Disaster Mitigation Update',
    action_required: [
      'SUMMARY: FEMA updated Pre-Disaster Mitigation (PDM) grant requirements, mandating local hazard mitigation plans be updated every 5 years with new climate risk assessments.',
      'ACTION: Review current Hazard Mitigation Plan expiration date. If plan is older than 4 years, begin update process immediately. Submit updated plan to state FEMA office before deadline.',
      'CONSEQUENCE: Municipalities with expired plans become ineligible for all FEMA Hazard Mitigation Assistance grants, including BRIC and FMA programs.',
    ].join('\n\n'),
    deadline: '2026-06-15',
    urgency: 'high',
    status: 'pending',
    source_url: 'https://www.federalregister.gov/documents/2024/03/14/2024-05234/hazard-mitigation-assistance-program-updates',
  },
  {
    agency_id: AGENCY_ID,
    regulation_title: 'DOT Infrastructure Investment — ADA Transition Plan Compliance',
    action_required: [
      'SUMMARY: DOT issued guidance requiring all municipal recipients of federal transportation funding to have updated ADA Transition Plans with specific pedestrian facility improvement timelines.',
      'ACTION: Audit current ADA Transition Plan for completeness. Update pedestrian facility inventory and establish priority list for curb ramp improvements. Submit updated plan to state DOT.',
      'CONSEQUENCE: Failure to maintain compliant ADA Transition Plans risks suspension of federal transportation formula funds and potential civil rights complaints.',
    ].join('\n\n'),
    deadline: '2026-07-30',
    urgency: 'medium',
    status: 'pending',
    source_url: 'https://www.federalregister.gov/documents/2024/02/08/2024-02514/ada-transition-plan-requirements',
  },
  {
    agency_id: AGENCY_ID,
    regulation_title: 'FinCEN Beneficial Ownership Reporting — Government Entity Exemptions Clarification',
    action_required: [
      'SUMMARY: FinCEN issued final rules clarifying which government entities are exempt from Corporate Transparency Act beneficial ownership reporting requirements.',
      'ACTION: Confirm with city attorney that Bayonne City Government qualifies for the governmental entity exemption. Document exemption determination in compliance records.',
      'CONSEQUENCE: Misclassification of exemption status could result in missed filing deadlines and civil penalties of $500 per day.',
    ].join('\n\n'),
    deadline: '2026-08-31',
    urgency: 'low',
    status: 'pending',
    source_url: 'https://www.federalregister.gov/documents/2024/01/11/2024-00499/beneficial-ownership-information-reporting',
  },
  {
    agency_id: AGENCY_ID,
    regulation_title: 'EPA Clean Air Act — Municipal Vehicle Fleet Emission Standards',
    action_required: [
      'SUMMARY: EPA finalized updated emission standards for municipal vehicle fleets operating diesel equipment, requiring transition plans to lower-emission alternatives by 2027.',
      'ACTION: Inventory all diesel fleet vehicles. Develop fleet electrification or alternative fuel transition plan. Apply for EPA Clean School Bus and Clean Heavy-Duty Vehicle programs.',
      'CONSEQUENCE: Fleets failing to meet 2027 standards face operational restrictions and ineligibility for EPA Diesel Emissions Reduction Act (DERA) grants.',
    ].join('\n\n'),
    deadline: '2026-03-20',
    urgency: 'high',
    status: 'overdue',
    source_url: 'https://www.federalregister.gov/documents/2024/01/18/2024-00794/control-of-air-pollution-from-new-motor-vehicles',
  },
  {
    agency_id: AGENCY_ID,
    regulation_title: 'HUD Community Development Block Grant — Income Documentation Requirements',
    action_required: [
      'SUMMARY: HUD updated CDBG income documentation requirements for low-to-moderate income benefit activities, adding new self-certification options and area benefit calculation methods.',
      'ACTION: Review current CDBG program income documentation procedures. Update intake forms. Train program staff on updated area benefit methodology.',
      'CONSEQUENCE: Non-compliant documentation practices flagged during HUD monitoring visits result in findings requiring repayment of CDBG funds for ineligible activities.',
    ].join('\n\n'),
    deadline: null,
    urgency: 'low',
    status: 'complete',
    source_url: 'https://www.federalregister.gov/documents/2024/04/01/2024-06789/community-development-block-grant-program-updates',
  },
]

async function seed() {
  console.log(`Seeding ${items.length} compliance items for agency ${AGENCY_ID}...`)

  // Clear existing items first
  const { error: delErr } = await supabase
    .from('compliance_items')
    .delete()
    .eq('agency_id', AGENCY_ID)
  if (delErr) console.warn('Delete warning:', delErr.message)

  const { data, error } = await supabase
    .from('compliance_items')
    .insert(items)
    .select('id, regulation_title, urgency, status')

  if (error) {
    console.error('Insert error:', error)
    process.exit(1)
  }

  console.log('Seeded:')
  data.forEach(r => console.log(`  [${r.urgency}/${r.status}] ${r.regulation_title.slice(0, 60)}...`))
  process.exit(0)
}

seed()
