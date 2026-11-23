import { Intake } from "./intake";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-8 pt-14 pb-20">
      <div className="flex flex-col gap-3">
        <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
          Station 1 · Requirements engineering
        </span>
        <h1 className="font-display text-h3">New job</h1>
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          Drop the source document. It is parsed into a document tree, then the
          engineer builds the requirements graph from what the source states.
        </p>
      </div>
      <Intake />
    </main>
  );
}
