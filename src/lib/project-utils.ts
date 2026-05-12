import type { Project } from '@/lib/types'

const projectNameCollator = new Intl.Collator('ko-KR', {
  numeric: true,
  sensitivity: 'base',
})

function normalizeProjectName(name: string) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/[\[\]()"']/g, '')
    .trim()
}

export function sortProjectsForSelection(projects: Project[]) {
  return [...projects].sort((a, b) => {
    const categoryA = (a.category || '').trim()
    const categoryB = (b.category || '').trim()

    if (categoryA !== categoryB) {
      if (!categoryA) return 1
      if (!categoryB) return -1

      const categoryCompare = projectNameCollator.compare(categoryA, categoryB)
      if (categoryCompare !== 0) return categoryCompare
    }

    const nameCompare = projectNameCollator.compare(
      normalizeProjectName(a.name),
      normalizeProjectName(b.name)
    )
    if (nameCompare !== 0) return nameCompare

    return projectNameCollator.compare(a.created_at, b.created_at)
  })
}
