import ProductFormWithReturn from './ProductFormWithReturn'

type Props = { params: Promise<{ id: string }> }

export default async function EditProduitPage({ params }: Props) {
  const { id } = await params
  return <ProductFormWithReturn productId={id} />
}
