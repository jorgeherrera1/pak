import { Intake } from "./intake";

export default function Page() {
  return (
    <>
      <header className="flex h-16 items-center border-b border-border px-8">
        <span className="font-display font-bold">Dark Factory</span>
      </header>
      <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-8 pt-14 pb-20">
        <div className="flex flex-col gap-3">
          <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
            Station 1 · Requirements engineering
          </span>
          <h1 className="font-display text-h3">New run</h1>
          <p className="max-w-[60ch] text-pretty text-muted-foreground">
            Drop the source documents — an RFP, a PRD, a spec. Each one goes
            down the line: parsed into structure, then annotated with what every
            passage is.
          </p>
        </div>
        <Intake />
      </main>
    </>
  );
}
