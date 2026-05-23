type RecordCaBannerProps = {
  className?: string
}

/** Bandeau de félicitations affiché lors d'un jour record de CA. */
export default function RecordCaBanner({ className = '' }: RecordCaBannerProps) {
  return (
    <div
      className={`mt-2 rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 px-4 py-3 shadow-sm ${className}`}
      role="status"
    >
      <p className="font-bold text-amber-950">Record de chiffre d&apos;affaires !</p>
      <p className="mt-0.5 text-sm leading-snug text-amber-900/90">
        Meilleur jour depuis le début de l&apos;historique — bravo à toute l&apos;équipe !
      </p>
    </div>
  )
}
