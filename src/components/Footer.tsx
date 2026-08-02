import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="border-t border-[#0d1b2a]/8 bg-[#f3f5f7] py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="font-display text-2xl font-semibold tracking-[-0.05em] text-[#0d1b2a]">
              GET ON A POD
            </div>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#4c5d73]">
              Done-for-you podcast booking for founders, financial professionals, and experts who need buyer trust before they sell.
            </p>
            <a
              href="https://calendly.com/getonapodjg/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center rounded-full border border-[#0d1b2a]/10 bg-[#f3f7fc] px-4 py-2 text-sm font-medium text-[#0d1b2a] transition hover:-translate-y-0.5 hover:bg-[#ffffff]"
            >
              Book My Shortlist Call
            </a>
          </div>

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-[#0d1b2a]">Navigate</h4>
              <nav className="mt-3 flex flex-col gap-2">
                <a href="/podcast-booking#results" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Results</a>
                <a href="/podcast-booking#pricing" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Pricing</a>
                <a href="/podcast-booking#faq" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">FAQ</a>
                <Link to="/what-to-expect" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">What to Expect</Link>
              </nav>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#0d1b2a]">Access</h4>
              <nav className="mt-3 flex flex-col gap-2">
                <a href="/podcast-booking#how-it-works" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">How It Works</a>
                <Link to="/resources" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Resources</Link>
                <Link to="/blog" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Blog</Link>
                <Link to="/login" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Workspace Login</Link>
                <Link to="/portal/login" className="text-sm text-[#4c5d73] transition-colors hover:text-[#0d1b2a]">Client Portal Login</Link>
              </nav>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-[#0d1b2a]/8 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[#5d7188]">
            &copy; {new Date().getFullYear()} Get On A Pod. All rights reserved.
          </p>
          <p className="text-sm text-[#5d7188]">
            Audience-fit podcast outreach, managed inside a live client portal.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
