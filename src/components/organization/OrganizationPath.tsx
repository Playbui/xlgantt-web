import { Badge } from '@/components/ui/badge'
import { useOrganizationStore } from '@/stores/organization-store'

interface OrganizationPathProps {
  userId: string
  emptyLabel?: string
}

export function OrganizationPath({ userId, emptyLabel = '미지정' }: OrganizationPathProps) {
  const label = useOrganizationStore((state) => state.getPathLabel(userId))

  if (!label) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        {emptyLabel}
      </Badge>
    )
  }

  return (
    <div className="min-w-0">
      <span className="text-xs text-foreground/80 truncate block">{label}</span>
    </div>
  )
}
