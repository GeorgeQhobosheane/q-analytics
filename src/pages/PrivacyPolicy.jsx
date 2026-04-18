import { Link } from 'react-router-dom'
import { useEffect } from 'react'

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy — Q Analytics'
    return () => { document.title = 'Q Analytics' }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy-900 px-6 py-5">
        <Link to="/" className="text-2xl font-bold text-white">Q Analytics</Link>
        <p className="text-blue-300 text-sm mt-0.5">Government Intelligence Platform</p>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-8">

          <div>
            <h1 className="text-2xl font-bold text-navy-900">Privacy Policy</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: April 18, 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">1. Who We Are</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics ("we," "us," or "our") is a software-as-a-service platform built for
              government agencies. We provide tools for grant matching, regulatory compliance monitoring,
              document analysis, and budget analysis. Our registered business address is available upon
              request at <a href="mailto:privacy@q-analytics.app" className="text-blue-600 hover:underline">privacy@q-analytics.app</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">2. Information We Collect</h2>
            <p className="text-sm text-gray-700 leading-relaxed">We collect the following information:</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li><strong>Account information:</strong> Agency name, contact name, title, email address, and password (hashed)</li>
              <li><strong>Agency profile data:</strong> Agency type, address, jurisdiction population, department focus, and current projects — used to personalise grant matches</li>
              <li><strong>Uploaded documents:</strong> PDF files you upload to DocuMind, stored securely in private cloud storage</li>
              <li><strong>Budget files:</strong> Spreadsheet files uploaded to BudgetLens, processed in memory and not permanently stored</li>
              <li><strong>Usage data:</strong> Pages visited, features used, and timestamps — used for product improvement</li>
              <li><strong>Payment information:</strong> Handled entirely by Stripe. We never see or store your card details</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li>To provide, operate, and improve the Q Analytics platform</li>
              <li>To match your agency with relevant federal and state grants</li>
              <li>To generate compliance alerts based on your agency type and jurisdiction</li>
              <li>To send weekly grant digest and compliance alert emails (you may unsubscribe at any time)</li>
              <li>To process subscription payments through Stripe</li>
              <li>To respond to support requests</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">4. AI Processing</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics uses Anthropic's Claude AI to analyse documents, generate grant proposals,
              and assess regulatory compliance. Data sent to Claude is processed subject to
              Anthropic's <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>.
              We do not use your data to train AI models. Document content and budget data are
              transmitted to Claude only for the specific analysis you request and are not retained
              by Anthropic beyond that request.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">5. Data Sharing</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              We do not sell, rent, or share your personal data with third parties for marketing purposes.
              We share data only with:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li><strong>Supabase</strong> — database and file storage (SOC 2 compliant)</li>
              <li><strong>Anthropic</strong> — AI processing of documents and budget data</li>
              <li><strong>Stripe</strong> — payment processing (PCI DSS compliant)</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
              <li><strong>Vercel</strong> — application hosting</li>
              <li>Law enforcement or government bodies when required by law</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">6. Data Retention</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              We retain your account data for as long as your account is active. Uploaded documents
              are retained until you delete them. Budget files are processed in memory and not stored
              permanently. You may request deletion of all your data at any time by contacting
              us at <a href="mailto:privacy@q-analytics.app" className="text-blue-600 hover:underline">privacy@q-analytics.app</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">7. Security</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              All data is encrypted in transit (TLS 1.2+) and at rest. Access to your data is
              restricted by row-level security policies — each agency can only access its own data.
              Passwords are hashed using bcrypt and never stored in plaintext.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">8. Your Rights</h2>
            <p className="text-sm text-gray-700 leading-relaxed">You have the right to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate data through your Account settings</li>
              <li>Request deletion of your account and associated data</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent for email communications at any time</li>
            </ul>
            <p className="text-sm text-gray-700 leading-relaxed">
              To exercise any of these rights, email <a href="mailto:privacy@q-analytics.app" className="text-blue-600 hover:underline">privacy@q-analytics.app</a>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">9. Contact</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              For privacy questions or concerns, contact us at{' '}
              <a href="mailto:privacy@q-analytics.app" className="text-blue-600 hover:underline">privacy@q-analytics.app</a>.
            </p>
          </section>

          <div className="pt-4 border-t border-gray-100 flex gap-4 text-sm">
            <Link to="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
            <Link to="/login" className="text-gray-500 hover:underline">Back to Sign In</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
