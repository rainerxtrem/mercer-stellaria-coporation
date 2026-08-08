import { Link } from "@tanstack/react-router";
import logo from "@/assets/ms-logo.png";
import { BRAND } from "@/lib/brand";
import { Facebook, Twitter, Linkedin, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-24 gov-gradient text-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <img src={logo} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 object-contain" />
            <div className="font-display text-base font-bold leading-tight">{BRAND.shortName}<span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-gold">Corporation</span></div>
          </div>
          <p className="mt-4 text-sm text-white/70">
            {BRAND.tagline}
          </p>
          <div className="mt-6 flex gap-3 text-white/70">
            <Facebook className="h-5 w-5 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:text-gold" />
            <Twitter className="h-5 w-5 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:text-gold" />
            <Linkedin className="h-5 w-5 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:text-gold" />
            <Youtube className="h-5 w-5 cursor-pointer transition-all duration-300 hover:-translate-y-0.5 hover:text-gold" />
          </div>
        </div>
        <FooterCol title="Le groupe" links={[
          { to: "/le-barreau", label: "Le groupe" },
          { to: "/actualites", label: "Actualités" },
          { to: "/contact", label: "Contact" },
        ]} />
        <FooterCol title="Services" links={[
          { to: "/avocats", label: "Registre des avocats" },
          { to: "/cabinets", label: "Registre des cabinets" },
          { to: "/verification", label: "Vérifier une licence" },
          { to: "/admissions", label: "Admissions" },
          { to: "/bibliotheque", label: "Bibliothèque juridique" },
        ]} />
        <FooterCol title="Espaces" links={[
          { to: "/espace-avocat", label: "Espace Avocat" },
          { to: "/espace-batonnier", label: "Administration Corporate" },
          { to: "/examen", label: "Examen du Barreau" },
          { to: "/formations", label: "Formation continue" },
        ]} />
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-white/60 md:flex-row md:items-center md:justify-between">
          <div>{BRAND.legalLine} · Mentions légales · Protection des données</div>
          <div className="text-gold-soft">{BRAND.fictionNote}</div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold">{title}</div>
      <ul className="space-y-2 text-sm text-white/75">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="inline-block transition-all duration-300 hover:translate-x-0.5 hover:text-gold">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
