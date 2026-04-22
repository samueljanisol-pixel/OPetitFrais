import ProductFormClient from '../ProductFormClient'

type Props = { params: Promise<{ id: string }> }

export default async function EditProduitPage({ params }: Props) {
  const { id } = await params
  return <ProductFormClient productId={id} />
}
