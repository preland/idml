import { describe, it, expect } from 'vitest';
import { parseIdml } from '../../src/parser/idml-parser';

describe('idml parser — dark { } block', () => {
  it('parses entries into darkStyles with mapped selectors + style props', () => {
    const config = parseIdml(`
dark {
  root { bg: #111827 fg: #e5e7eb }
  bg-white { bg: #1f2937 }
  text-gray-900 { fg: #f3f4f6 }
  border-gray-200 { borderColor: #374151 }
  controls { bg: #374151 fg: #f3f4f6 borderColor: #4b5563 }
}
./home
Col()[100,100,top-left]{}
`);
    expect(config.darkStyles).toEqual([
      { selector: '', style: { backgroundColor: '#111827', color: '#e5e7eb' } },
      { selector: '.bg-white', style: { backgroundColor: '#1f2937' } },
      { selector: '.text-gray-900', style: { color: '#f3f4f6' } },
      { selector: '.border-gray-200', style: { borderColor: '#374151' } },
      {
        selector: 'input, select, textarea',
        style: { backgroundColor: '#374151', color: '#f3f4f6', borderColor: '#4b5563' },
      },
    ]);
  });

  it('leaves darkStyles undefined when there is no dark block', () => {
    const config = parseIdml(`
./home
Col()[100,100,top-left]{}
`);
    expect(config.darkStyles).toBeUndefined();
  });

  it('propagates a dark block from an imported file', () => {
    const config = parseIdml(
      `
import "./shared.idml"
./home
Col()[100,100,top-left]{}
`,
      { resolve: () => `dark { bg-white { bg: #1f2937 } }` }
    );
    expect(config.darkStyles).toEqual([{ selector: '.bg-white', style: { backgroundColor: '#1f2937' } }]);
  });
});
