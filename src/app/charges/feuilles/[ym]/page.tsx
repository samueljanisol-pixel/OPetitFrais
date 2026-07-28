import FeuilleDetailClient from './FeuilleDetailClient'

type PageProps = { params: Promise<{ ym: string }> }

export default async function ChargesFeuillePage({ params }: PageProps) {
  const { ym } = await params
  return <FeuilleDetailClient ym={ym} />
}
