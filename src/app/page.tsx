import { SealCheckIcon } from "@phosphor-icons/react/ssr";
import { Verifier } from "@/components/Verifier";
import { ThemeToggle } from "@/components/ThemeToggle";
import { version } from "../../package.json";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-4 border-b border-divider px-6 py-3">
        {/* A plain link, so clicking it reloads the page and clears everything, like Start over. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="mr-auto flex items-center gap-2 text-lg font-semibold hover:text-accent-text">
          <SealCheckIcon size={24} weight="duotone" className="text-accent" aria-hidden />
          Bulk COLA Application &amp; Label Verifier
        </a>
        <span className="hidden text-sm text-muted sm:inline">TTB COLA compliance check</span>
        <ThemeToggle />
      </nav>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-14 pb-20">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl">Verify a label</h1>
          <p className="max-w-xl text-lg text-muted">
            Drop in COLA applications (Form 5100.31) and their labels, all together (PDFs, images, saved web pages, and more
            are accepted). If the label images are already inside the application file, the application is all you need.
          </p>
        </div>

        <Verifier historyEnabled={Boolean(process.env.DATABASE_URL)} />
      </main>

      <footer className="border-t border-divider px-6 py-4 text-center text-sm text-muted">
        Built by{" "}
        <a href="https://lukeaslanian.com" target="_blank" rel="noopener noreferrer" className="text-accent-text underline hover:text-accent">
          Luke Aslanian
        </a>{" "}
        | v{version.split(".").slice(0, 2).join(".")}
      </footer>
    </div>
  );
}
