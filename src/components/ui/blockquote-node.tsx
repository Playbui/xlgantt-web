'use client'

import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'

export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      className="my-3 border-l-2 border-slate-300 pl-6 italic text-slate-700"
      {...props}
    />
  )
}
