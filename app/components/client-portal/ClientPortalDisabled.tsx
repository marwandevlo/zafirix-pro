import Link from 'next/link';

export default function ClientPortalDisabled() {
  return (
    <div className="min-h-screen bg-[#0F1F3D] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white p-8 shadow-xl border border-gray-100 text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400 text-lg font-bold text-[#0F1F3D]">
          Z
        </div>
        <h1 className="text-lg font-bold text-gray-900">Espace client</h1>
        <p className="mt-2 text-sm text-gray-600">
          Le portail client n&apos;est pas activé sur cet environnement. Contactez votre cabinet comptable.
        </p>
        <Link
          href="/landing"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#0F1F3D] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1a3060]"
        >
          Retour
        </Link>
      </div>
    </div>
  );
}
