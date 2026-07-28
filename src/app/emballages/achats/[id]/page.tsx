import AchatDetailClient from './AchatDetailClient'

type Props = { params: Promise<{ id: string }> }

export default async function AchatDetailPage({ params }: Props) {
  const { id } = await params
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <AchatDetailClient achatId={id} />
      </div>
    </div>
  )
}
