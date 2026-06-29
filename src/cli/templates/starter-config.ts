export const STARTER_CONFIG = {
  $schema: './node_modules/idml/ui.config.schema.json',
  version: '1',
  tokens: {
    colors: [
      { name: 'primary', value: '#1a56db', darkValue: '#60a5fa' },
      { name: 'surface', value: '#ffffff', darkValue: '#1e1e2e' },
      { name: 'on-surface', value: '#111827', darkValue: '#f9fafb' },
      { name: 'danger', value: '#dc2626', darkValue: '#f87171' },
    ],
    typography: [
      { name: 'heading-xl', fontSize: '2.25rem', fontWeight: 700, lineHeight: '1.25' },
      { name: 'body-md', fontSize: '1rem', fontWeight: 400, lineHeight: '1.6' },
      { name: 'label-sm', fontSize: '0.75rem', fontWeight: 500, lineHeight: '1.4' },
    ],
    spacing: [
      { name: 'gap-sm', value: '0.5rem' },
      { name: 'gap-md', value: '1rem' },
      { name: 'gap-lg', value: '2rem' },
    ],
  },
  pages: [
    {
      route: '/',
      title: 'Home',
      layout: {
        type: 'flex',
        direction: 'column',
        gap: 'gap-lg',
        size: { width: '100%', minHeight: '100%' },
        children: [],
      },
      components: [
        {
          id: 'heading',
          type: 'Heading',
          props: { level: 1, text: 'Welcome to idml' },
          tokenProps: { typography: 'heading-xl', color: 'on-surface' },
        },
        {
          id: 'description',
          type: 'Text',
          props: { text: 'Edit the config to build your UI. Changes appear instantly in the editor.' },
          tokenProps: { color: 'on-surface' },
        },
      ],
    },
  ],
};
