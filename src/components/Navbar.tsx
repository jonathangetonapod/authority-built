import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';

// These sections live on the booking service page, which moved off "/" when the
// agency landing page took the root. Pointing them at "/" sent the reader to a
// page that has none of them.
const navLinks = [
  { href: '/#tour', label: 'Product' },
  { href: '/#portal', label: 'Client Portal' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/resources', label: 'Resources' },
  { href: '/login', label: 'Workspace Login' },
];

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className="fixed left-0 right-0 top-0 z-50">
      <div className="border-b border-[#0d1b2a]/8 bg-[#f4ede4]/88 px-4 py-2 backdrop-blur-sm">
        <div className="container flex items-center justify-center gap-4 text-center text-[10px] uppercase leading-5 tracking-[0.18em] text-[#7a6554] sm:justify-between sm:text-left sm:text-[11px] sm:tracking-[0.22em]">
          <span className="font-mono">Podcast placement system for trust-led sales</span>
          <span className="hidden font-mono sm:block">Audience-fit targeting, outreach, approvals, and tracking</span>
        </div>
      </div>

      <div className="px-4 pt-3">
        <div className="container mx-auto">
          <div
            className={`transition-all duration-300 ${
              isScrolled
                ? 'rounded-[28px] border border-[#0d1b2a]/10 bg-[#fffdf9]/92 shadow-[0_18px_44px_rgba(13,27,42,0.12)] backdrop-blur-xl'
                : 'rounded-[28px] border border-[#ffffff]/70 bg-[#fffdf9]/72 backdrop-blur-md'
            }`}
          >
            <div className="flex items-center justify-between gap-6 px-5 py-4 md:px-6 md:py-5">
              <Link to="/" className="min-w-0">
                <div className="font-display text-2xl font-semibold leading-none tracking-[-0.05em] text-[#0d1b2a]">
                  Get On A Pod
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-[#7a6554]">
                  Buyer trust through podcast placement
                </div>
              </Link>

              <div className="hidden items-center gap-7 lg:flex">
                {navLinks.map((link) =>
                  link.href.includes('#') ? (
                    <a
                      key={link.href}
                      href={link.href}
                      className="text-sm font-medium text-[#645447] transition-colors hover:text-[#0d1b2a]"
                    >
                      {link.label}
                    </a>
                  ) : (
                    <Link
                      key={link.href}
                      to={link.href}
                      className="text-sm font-medium text-[#645447] transition-colors hover:text-[#0d1b2a]"
                    >
                      {link.label}
                    </Link>
                  )
                )}
                <Button variant="hero" size="default" className="rounded-full px-6" asChild>
                  <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                    Book My Shortlist Call
                  </a>
                </Button>
              </div>

              <button
                className="rounded-full border border-[#0d1b2a]/10 bg-[#fffdf9] p-2 text-[#0d1b2a] lg:hidden"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Toggle navigation"
              >
                {isMobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>

            {isMobileMenuOpen && (
              <div className="border-t border-[#0d1b2a]/10 bg-[#fffdf9]/94 px-5 py-4 lg:hidden">
                <div className="flex flex-col gap-1">
                  {navLinks.map((link) =>
                    link.href.includes('#') ? (
                      <a
                        key={link.href}
                        href={link.href}
                        className="px-2 py-2 text-sm font-medium text-[#645447] transition-colors hover:text-[#0d1b2a]"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={link.href}
                        to={link.href}
                        className="px-2 py-2 text-sm font-medium text-[#645447] transition-colors hover:text-[#0d1b2a]"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                  <div className="pt-3">
                    <Button variant="hero" size="default" className="w-full rounded-full" asChild>
                      <a href="https://calendly.com/getonapodjg/30min" target="_blank" rel="noopener noreferrer">
                        Book My Shortlist Call
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
