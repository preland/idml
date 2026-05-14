import React from 'react';

const Text = ({ text, children, ...props }: Record<string, any>) => (
  <span {...props}>{text || children}</span>
);

const Heading = ({ level = 1, text, children, ...props }: Record<string, any>) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return React.createElement(Tag, props, text || children);
};

const Button = ({ text, children, onClick, ...props }: Record<string, any>) => (
  <button onClick={onClick} {...props}>
    {text || children}
  </button>
);

const Image = ({ src, alt, ...props }: Record<string, any>) => (
  <img src={src} alt={alt || ''} {...props} />
);

const List = ({ items = [], children, ...props }: Record<string, any>) => (
  <ul {...props}>
    {items.map((item: any, i: number) => (
      <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
    ))}
    {children}
  </ul>
);

const Card = ({ children, ...props }: Record<string, any>) => (
  <div {...props}>{children}</div>
);

const Divider = (props: Record<string, any>) => <hr {...props} />;

const Spacer = ({ ...props }: Record<string, any>) => <div {...props} />;

const Icon = ({ name, ...props }: Record<string, any>) => (
  <span {...props}>{name || '●'}</span>
);

export const BUILTIN_COMPONENTS = {
  Text,
  Heading,
  Button,
  Image,
  List,
  Card,
  Divider,
  Spacer,
  Icon,
};
