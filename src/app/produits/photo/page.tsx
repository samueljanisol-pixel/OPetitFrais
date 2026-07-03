import { Suspense } from 'react'
import { CircularProgress, Box } from '@mui/material'
import ProductPhotoCaptureClient from './ProductPhotoCaptureClient'

export default function ProductPhotoPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
          <CircularProgress />
        </Box>
      }
    >
      <ProductPhotoCaptureClient />
    </Suspense>
  )
}
