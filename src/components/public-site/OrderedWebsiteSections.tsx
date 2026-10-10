import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { websiteSections, type WebsiteDesign } from '@/lib/public-site-builder';
export function OrderedWebsiteSections({ children, design }: { children: ReactNode; design?: WebsiteDesign }) {
  const sections = Children.toArray(children).filter(isValidElement) as ReactElement<{ id?: string }>[];
  const hero = sections.find((section) => section.props.id === 'welcome');
  return <>{hero}{websiteSections(design).filter((item) => item.visible).map((item) => sections.find((section) => section.props.id === item.id) || null)}</>;
}
