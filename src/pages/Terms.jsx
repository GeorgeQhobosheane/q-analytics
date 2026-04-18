import { Link } from 'react-router-dom'
import { useEffect } from 'react'

export default function Terms() {
  useEffect(() => {
    document.title = 'Terms of Service — Q Analytics'
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
            <h1 className="text-2xl font-bold text-navy-900">Terms of Service</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: April 18, 2026</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">1. Acceptance of Terms</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              By accessing or using Q Analytics ("the Service"), you agree to be bound by these Terms of
              Service ("Terms"). If you are using the Service on behalf of a government agency, you represent
              that you have authority to bind that agency to these Terms. If you do not agree to these Terms,
              do not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">2. Description of Service</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics is a software-as-a-service platform designed for government agencies. The Service
              includes the following tools:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li><strong>DocuMind</strong> — AI-powered document analysis and question-answering</li>
              <li><strong>GrantRadar</strong> — Federal and state grant discovery and proposal drafting</li>
              <li><strong>ComplianceWatch</strong> — Regulatory compliance monitoring and alerting</li>
              <li><strong>BudgetLens</strong> — Budget file analysis and AI-generated insights</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">3. Eligibility</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              The Service is intended for use by government agencies, public sector organisations, and their
              authorised personnel. By creating an account, you confirm that you are accessing the Service
              in an official capacity on behalf of a qualifying agency or organisation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">4. Account Registration</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              You must provide accurate and complete information when creating your account. You are responsible
              for maintaining the confidentiality of your login credentials and for all activity that occurs
              under your account. Notify us immediately at{' '}
              <a href="mailto:support@q-analytics.app" className="text-blue-600 hover:underline">support@q-analytics.app</a>{' '}
              if you suspect any unauthorised access.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">5. Subscription and Payment</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics offers a free tier and paid subscription plans. Paid subscriptions are billed
              monthly or annually through Stripe. All fees are non-refundable except where required by law.
              We reserve the right to change pricing with 30 days' notice. Failure to pay may result in
              downgrade to the free tier or suspension of your account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">6. Acceptable Use</h2>
            <p className="text-sm text-gray-700 leading-relaxed">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700 leading-relaxed ml-2">
              <li>Upload content that is unlawful, defamatory, or infringes intellectual property rights</li>
              <li>Attempt to gain unauthorised access to other users' data or the Service infrastructure</li>
              <li>Use the Service to transmit malware, spam, or other harmful content</li>
              <li>Reverse-engineer, decompile, or attempt to derive source code from the Service</li>
              <li>Resell or sublicense access to the Service without our written consent</li>
              <li>Use AI-generated outputs as the sole basis for legally binding decisions without human review</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">7. AI-Generated Content</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics uses Anthropic's Claude AI to generate analysis, grant proposals, compliance
              summaries, and budget insights. AI-generated content is provided for informational purposes
              only and does not constitute legal, financial, or compliance advice. You are responsible for
              reviewing and verifying all AI outputs before relying on them for official decisions.
              Q Analytics makes no warranties regarding the accuracy, completeness, or fitness of
              AI-generated content for any particular purpose.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">8. Data and Privacy</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Your use of the Service is also governed by our{' '}
              <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>,
              which is incorporated into these Terms by reference. By using the Service, you consent to
              the collection and use of your information as described in the Privacy Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">9. Intellectual Property</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Q Analytics and its underlying technology, branding, and platform are owned by us and protected
              by applicable intellectual property laws. You retain ownership of all data and documents you
              upload. By uploading content, you grant us a limited licence to process that content for the
              purpose of providing the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">10. Disclaimer of Warranties</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              The Service is provided "as is" and "as available" without warranties of any kind, either
              express or implied. We do not warrant that the Service will be uninterrupted, error-free, or
              free of harmful components. Grant opportunities and compliance alerts are provided for
              informational purposes and may not be exhaustive or current.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">11. Limitation of Liability</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              To the maximum extent permitted by law, Q Analytics shall not be liable for any indirect,
              incidental, special, consequential, or punitive damages arising from your use of or inability
              to use the Service, including but not limited to loss of data, missed grant opportunities, or
              compliance penalties. Our total liability shall not exceed the amount paid by you in the
              12 months preceding the claim.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">12. Termination</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              You may cancel your account at any time through your Account settings or by contacting us.
              We reserve the right to suspend or terminate your account for violation of these Terms, with
              or without notice. Upon termination, your right to access the Service ceases immediately.
              You may request a data export before cancellation.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">13. Changes to Terms</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              We may update these Terms from time to time. We will notify you of material changes via email
              or a prominent notice in the Service. Continued use after changes take effect constitutes
              acceptance of the updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">14. Governing Law</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              These Terms are governed by applicable law. Any disputes arising from these Terms or your use
              of the Service shall be resolved through binding arbitration or in a court of competent
              jurisdiction, as agreed by the parties.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-bold text-navy-900">15. Contact</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              For questions about these Terms, contact us at{' '}
              <a href="mailto:support@q-analytics.app" className="text-blue-600 hover:underline">support@q-analytics.app</a>.
            </p>
          </section>

          <div className="pt-4 border-t border-gray-100 flex gap-4 text-sm">
            <Link to="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
            <Link to="/login" className="text-gray-500 hover:underline">Back to Sign In</Link>
          </div>
        </div>
      </main>
    </div>
  )
}
