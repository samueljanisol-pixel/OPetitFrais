'use client'

import * as React from 'react'
import NextLink, { type LinkProps } from 'next/link'

type AppLinkProps = LinkProps & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>

/** Next.js `Link` wrappé pour l’utiliser avec `component={AppLink}` sur les composants MUI. */
const AppLink = React.forwardRef<HTMLAnchorElement, AppLinkProps>(function AppLink({ href, ...rest }, ref) {
  return <NextLink ref={ref} href={href} {...rest} />
})

export default AppLink
