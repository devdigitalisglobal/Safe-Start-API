export const RESOURCE_CATEGORIES = [
  'checklists',
  'resources',
  'helpful_links',
  'support',
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  checklists: 'Checklists',
  resources: 'Resources',
  helpful_links: 'Helpful Links',
  support: 'Support',
};

export function isResourceCategory(value: string): value is ResourceCategory {
  return (RESOURCE_CATEGORIES as readonly string[]).includes(value);
}
