import { StepsCanvas } from "./steps-canvas";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-8 pt-14 pb-20">
      <span className="font-display text-eyebrow tracking-eyebrow text-primary uppercase">
        Station 1 · Requirements engineering
      </span>
      <StepsCanvas id={id} />
    </main>
  );
}
