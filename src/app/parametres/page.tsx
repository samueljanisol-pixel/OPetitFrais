import type { Metadata } from 'next'
import ParametresClient from './ParametresClient'

export const metadata: Metadata = {
  title: "Paramètres — O' Petit Frais",
}

export default function ParametresPage() {
  return <ParametresClient />
}
