export const EDITOR_PAGE_TEMPLATE = `import { EditorPage } from 'idml-ui/editor';
import { notFound } from 'next/navigation';

export default function Page() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return <EditorPage />;
}
`;
