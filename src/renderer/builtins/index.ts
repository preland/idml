import React from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

interface ComponentProps {
  [key: string]: any;
  children?: ReactNode;
}

const Text = ({ text, children, ...props }: ComponentProps) =>
  React.createElement('span', props, text || children);

const Heading = ({ level = 1, text, children, ...props }: ComponentProps) => {
  const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
  return React.createElement(Tag, props, text || children);
};

const BUTTON_BASE: React.CSSProperties = {
  border: 'none',
  outline: 'none',
  textDecoration: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
};

const Button = ({ text, children, onClick, href, style, ...props }: ComponentProps) => {
  const merged = { ...BUTTON_BASE, ...style };
  return href
    ? React.createElement(Link, { href: href as string, style: merged, ...props }, text || children)
    : React.createElement('button', { onClick, style: merged, ...props }, text || children);
};

const Image = ({ src, alt, ...props }: ComponentProps) =>
  React.createElement('img', { src, alt: alt || '', ...props });

const List = ({ items = [], children, ...props }: ComponentProps) =>
  React.createElement(
    'ul',
    props,
    items.map((item: any, i: number) =>
      React.createElement('li', { key: i }, typeof item === 'string' ? item : JSON.stringify(item))
    ),
    children
  );

const Card = ({ children, ...props }: ComponentProps) =>
  React.createElement('div', props, children);

const Divider = (props: ComponentProps) => React.createElement('hr', props);

const Spacer = (props: ComponentProps) => React.createElement('div', props);

const Icon = ({ name, ...props }: ComponentProps) =>
  React.createElement('span', props, name || '●');

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
