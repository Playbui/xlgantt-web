'use client'

import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import type { PlateContentProps } from 'platejs/react'
import { cva } from 'class-variance-authority'
import { PlateContainer, PlateContent } from 'platejs/react'
import { cn } from '@/lib/utils'

const editorContainerVariants = cva(
  'relative w-full cursor-text select-text overflow-y-auto caret-primary selection:bg-blue-500/15 focus-visible:outline-none',
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'h-full',
        fullWidth: 'h-full',
      },
    },
  }
)

export function EditorContainer({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof editorContainerVariants>) {
  return <PlateContainer className={cn(editorContainerVariants({ variant }), className)} {...props} />
}

const editorVariants = cva(
  cn(
    'group/editor relative w-full cursor-text select-text overflow-x-hidden whitespace-pre-wrap break-words rounded-md focus-visible:outline-none',
    'placeholder:text-muted-foreground/80 [&_[data-slate-placeholder]]:text-muted-foreground/80'
  ),
  {
    defaultVariants: {
      variant: 'default',
    },
    variants: {
      variant: {
        default: 'min-h-full px-8 py-6 text-[15px] leading-7',
        fullWidth: 'min-h-full px-8 py-6 text-[15px] leading-7',
        compact: 'min-h-full px-4 py-3 text-sm leading-6',
      },
    },
  }
)

export type EditorProps = PlateContentProps & VariantProps<typeof editorVariants>

export const Editor = React.forwardRef<HTMLDivElement, EditorProps>(function Editor(
  { className, variant, ...props },
  ref
) {
  return <PlateContent ref={ref} className={cn(editorVariants({ variant }), className)} {...props} />
})
