// @vitest-environment happy-dom
// The reading of every scan for forbidden wording in the web tests (R11 QA hardening): textContent
// runs the text of adjacent elements together, so a word-boundary or phrase scan over it can miss
// wording a reader sees. claimTexts adds the text nodes joined by spaces and keeps textContent
// itself, so no earlier reading is lost. Synthetic markup only.
import { describe, expect, it } from 'vitest';
import { claimTexts } from './support.js';

/** A detached element holding the given text and elements, in order. */
function tree(tag: string, ...children: Array<string | Node>): HTMLElement {
  const element = document.createElement(tag);
  element.append(...children);
  return element;
}

describe('claimTexts', () => {
  it('finds wording that textContent runs together or spaces twice, and keeps the textContent reading', () => {
    const G1_PASS = /\bg1 pass\b/i;
    const READY = /ready for signer/i;
    const cases = [
      {
        name: 'a tag followed by a label',
        root: tree('div', tree('span', 'G1 PASS'), tree('span', 'Selection')),
        pattern: G1_PASS,
        inTextContent: false,
      },
      {
        name: 'a phrase across elements without whitespace',
        root: tree('p', tree('strong', 'Ready for'), tree('em', 'signer')),
        pattern: READY,
        inTextContent: false,
      },
      {
        name: 'whitespace on both sides of an element boundary',
        root: tree('p', 'Ready for ', tree('span', ' signer')),
        pattern: READY,
        inTextContent: false,
      },
      {
        name: 'a word split across elements',
        root: tree('p', 'G', tree('b', '1'), ' PASS'),
        pattern: G1_PASS,
        inTextContent: true,
      },
    ];
    for (const { name, root, pattern, inTextContent } of cases) {
      expect(pattern.test(root.textContent ?? ''), name).toBe(inTextContent);
      expect(
        claimTexts(root).some((text) => pattern.test(text)),
        name,
      ).toBe(true);
      expect(claimTexts(root)[0], name).toBe(root.textContent);
    }
  });
});
