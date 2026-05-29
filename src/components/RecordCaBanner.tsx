import type { CaRecordRef } from '@/lib/ca/types'

type RecordCaBannerProps = {
  className?: string
  variant?: 'global' | 'magasin'
  previousRecord?: CaRecordRef | null
  formatAmount: (value: number) => string
  formatDate: (iso: string) => string
}

/** Bandeau de félicitations affiché lors d'un jour record de CA. */
export default function RecordCaBanner({
  className = '',
  variant = 'global',
  previousRecord,
  formatAmount,
  formatDate,
}: RecordCaBannerProps) {
  const isMagasin = variant === 'magasin'

  return (
    <div
      className={`rounded-xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 shadow-sm ${
        isMagasin ? 'mt-3 px-3 py-2' : 'mt-2 px-4 py-3'
      } ${className}`}
      role="status"
    >
      <p className={`font-bold text-amber-950 ${isMagasin ? 'text-sm' : ''}`}>
        {isMagasin ? 'Record magasin !' : "Record de chiffre d'affaires !"}
      </p>
      {previousRecord ? (
        <p className={`mt-1 font-medium capitalize text-amber-950/90 ${isMagasin ? 'text-xs' : 'text-sm'}`}>
          Dernier record : {formatAmount(previousRecord.total)} — {formatDate(previousRecord.date)}
        </p>
      ) : null}
      <p className={`mt-0.5 leading-snug text-amber-900/90 ${isMagasin ? 'text-xs' : 'text-sm'}`}>
        {previousRecord
          ? isMagasin
            ? 'Record battu pour ce magasin — bravo !'
            : "Record battu — bravo à toute l'équipe !"
          : isMagasin
            ? "Meilleur jour pour ce magasin depuis le début de l'historique."
            : "Meilleur jour depuis le début de l'historique — bravo à toute l'équipe !"}
      </p>
    </div>
  )
}
