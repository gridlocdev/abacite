import { describe, expect, it } from 'vitest';
import { gridStep, rovingStep } from '../src/index.ts';

describe('moving along a list', () => {
  it('steps with the arrows and jumps with Home and End, stopping at the ends', () => {
    expect(rovingStep('ArrowDown', 1, 4)).toBe(2);
    expect(rovingStep('ArrowRight', 1, 4)).toBe(2);
    expect(rovingStep('ArrowUp', 1, 4)).toBe(0);
    expect(rovingStep('ArrowUp', 0, 4)).toBe(0);
    expect(rovingStep('ArrowDown', 3, 4)).toBe(3);
    expect(rovingStep('Home', 2, 4)).toBe(0);
    expect(rovingStep('End', 0, 4)).toBe(3);
  });

  it('goes round when asked to, and ignores other keys and empty lists', () => {
    expect(rovingStep('ArrowDown', 3, 4, true)).toBe(0);
    expect(rovingStep('ArrowLeft', 0, 4, true)).toBe(3);
    expect(rovingStep('a', 1, 4)).toBeUndefined();
    expect(rovingStep('ArrowDown', 0, 0)).toBeUndefined();
  });
});

describe('moving around a keypad', () => {
  // ( ) ⌫⌫
  // 7 8 9 ×
  // 0 0 . =
  const rows = [
    [
      { id: 'open', span: 1 },
      { id: 'close', span: 1 },
      { id: 'back', span: 2 },
    ],
    [
      { id: '7', span: 1 },
      { id: '8', span: 1 },
      { id: '9', span: 1 },
      { id: 'times', span: 1 },
    ],
    [
      { id: '0', span: 2 },
      { id: 'point', span: 1 },
      { id: 'equals', span: 1 },
    ],
  ];

  it('goes up and down to the key covering the same column', () => {
    expect(gridStep(rows, '9', 'ArrowUp')).toBe('back');
    expect(gridStep(rows, 'times', 'ArrowUp')).toBe('back');
    expect(gridStep(rows, '8', 'ArrowDown')).toBe('0');
    expect(gridStep(rows, 'point', 'ArrowUp')).toBe('9');
    expect(gridStep(rows, '0', 'ArrowUp')).toBe('7');
  });

  it('runs along the rows with ← and →, and stops at the edges', () => {
    expect(gridStep(rows, 'times', 'ArrowRight')).toBe('0');
    expect(gridStep(rows, '7', 'ArrowLeft')).toBe('back');
    expect(gridStep(rows, 'open', 'ArrowLeft')).toBe('open');
    expect(gridStep(rows, 'equals', 'ArrowRight')).toBe('equals');
    expect(gridStep(rows, 'open', 'ArrowUp')).toBe('open');
    expect(gridStep(rows, 'equals', 'ArrowDown')).toBe('equals');
  });

  it('jumps to the row’s ends with Home and End, and ignores other keys', () => {
    expect(gridStep(rows, '8', 'Home')).toBe('7');
    expect(gridStep(rows, '8', 'End')).toBe('times');
    expect(gridStep(rows, '8', 'Enter')).toBeUndefined();
    expect(gridStep(rows, 'nope', 'ArrowUp')).toBeUndefined();
  });
});
