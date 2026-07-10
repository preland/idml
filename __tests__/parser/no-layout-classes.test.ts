import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

// Rule 1: idml owns geometry — a class block may carry only visual styling.
// Any Tailwind class that controls spacing, size, or layout is rejected so a
// widget can never drive a visual change that idml doesn't define.
describe('idml parser — layout/sizing classes are rejected in class blocks', () => {
  const REJECTED = [
    'p-4', 'px-2', 'mt-1', 'mx-auto', 'gap-2', 'space-y-1',
    'w-full', 'h-screen', 'min-h-screen', 'max-w-md', 'size-4', 'basis-0',
    'flex', 'flex-1', 'inline-flex', 'grow', 'shrink-0',
    'items-center', 'justify-between', 'self-end', 'place-items-center',
    'grid', 'grid-cols-2', 'col-span-2', 'order-1',
    'block', 'inline-block', 'hidden', 'table',
    'absolute', 'fixed', 'relative', 'inset-0', 'top-0', 'z-50',
    'overflow-hidden', 'overflow-y-auto', 'overscroll-none',
    'float-left', 'text-center', 'text-left', 'text-sm', 'text-2xl', 'leading-6',
    'truncate',
  ];
  for (const cls of REJECTED) {
    it(`rejects "${cls}" in a variant class block`, () => {
      expect(() => parseIdml(`\nBad:Text \`${cls}\`\n./p\nBad("x")[100,100,top-left]{}\n`))
        .toThrow(/sizing\/layout/);
    });
  }

  const ALLOWED = [
    'bg-blue-600', 'text-gray-900', 'border-gray-300', 'border',
    'rounded-lg', 'rounded-full', 'shadow', 'shadow-lg',
    'font-medium', 'font-bold', 'font-mono', 'italic', 'uppercase',
    'opacity-75', 'transition-all', 'duration-300', 'transform', 'scale-0',
    'hover:bg-blue-700', 'focus:ring-2', 'group-hover:bg-gray-100',
    'whitespace-nowrap', 'break-all', 'object-contain', 'resize-none',
  ];
  it('allows purely-visual classes', () => {
    for (const cls of ALLOWED) {
      expect(() => parseIdml(`\nOk:Text \`${cls}\`\n./p\nOk("x")[100,100,top-left]{}\n`))
        .not.toThrow();
    }
  });

  it('strips !important and variant prefixes before matching the base class', () => {
    // group-hover:max-w-[7rem] is a sizing utility despite the prefix.
    expect(() => parseIdml(`\nBad:Col \`group-hover:max-w-[7rem]\`\n./p\nBad()[100,100,top-left]{Text("x")[100,100,top-left]{}}\n`))
      .toThrow(/sizing\/layout/);
    expect(() => parseIdml(`\nBad:Text \`!p-4\`\n./p\nBad("x")[100,100,top-left]{}\n`))
      .toThrow(/sizing\/layout/);
  });

  it('also rejects layout classes inside a conditional (?@ref) class block', () => {
    expect(() => parseIdml(
      `\n./p\nText("x")[100,100,top-left]\`w-full\`?@open{}\n`
    )).toThrow(/sizing\/layout/);
  });

  it('does not flag a colour that merely starts like a layout prefix', () => {
    // placeholder-*, border-<color>, text-<color> must survive.
    expect(() => parseIdml(`\nOk:Input \`placeholder-gray-400 border-gray-300 text-blue-800\`\n./p\nOk(~x)[100,100,top-left]{}\n`))
      .not.toThrow();
  });
});
