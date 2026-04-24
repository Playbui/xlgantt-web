'use client'
import type { PlateElementProps } from 'platejs/react'
import { type VariantProps, cva } from 'class-variance-authority'
import { PlateElement } from 'platejs/react'

const headingVariants = cva('relative mb-1 text-slate-950', {
  variants: {
    variant: {
      h1: 'mt-[1.6em] pb-1 text-4xl font-black tracking-tight',
      h2: 'mt-[1.4em] pb-px text-2xl font-bold tracking-tight',
      h3: 'mt-[1em] pb-px text-xl font-semibold tracking-tight',
      h4: 'mt-[0.75em] text-lg font-semibold tracking-tight',
      h5: 'mt-[0.75em] text-lg font-semibold tracking-tight',
      h6: 'mt-[0.75em] text-base font-semibold tracking-tight',
    },
  },
})

export function HeadingElement({
  variant = 'h1',
  ...props
}: PlateElementProps & VariantProps<typeof headingVariants>) {
  return (
    <PlateElement as={variant!} className={headingVariants({ variant })} {...props}>
      {props.children}
    </PlateElement>
  )
}

export const H1Element = (props: PlateElementProps) => <HeadingElement variant="h1" {...props} />
export const H2Element = (props: PlateElementProps) => <HeadingElement variant="h2" {...props} />
export const H3Element = (props: PlateElementProps) => <HeadingElement variant="h3" {...props} />
export const H4Element = (props: PlateElementProps) => <HeadingElement variant="h4" {...props} />
export const H5Element = (props: PlateElementProps) => <HeadingElement variant="h5" {...props} />
export const H6Element = (props: PlateElementProps) => <HeadingElement variant="h6" {...props} />
