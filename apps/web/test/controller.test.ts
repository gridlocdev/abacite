import { describe, expect, it, vi } from 'vitest';
import { ALL_KEYS, windowWidth } from '../src/index.ts';
import { enter, makeApp, type } from './helpers.ts';

const key = (id: string) => ALL_KEYS.find((k) => k.id === id)!;

describe('live results (PRD §9.1)', () => {
  it('shows the result as you type', () => {
    const { app } = makeApp();
    type(app, '2*(3+4');
    expect(app.shown.value).toEqual({ kind: 'live', text: '14' });
    expect(app.ghost.value.missingParens).toBe(1);
  });

  it('greys the last complete result while the line is unfinished', () => {
    const { app } = makeApp();
    type(app, '12');
    type(app, '+');
    expect(app.shown.value).toEqual({ kind: 'pending', text: '12' });
  });

  it('shows an error once the line is complete, underlined where it is', () => {
    const { app } = makeApp();
    type(app, '1/0');
    expect(app.shown.value.kind).toBe('error');
  });

  it('waits while a name is being typed, then underlines an unknown one', () => {
    const { app } = makeApp();
    type(app, '2+foo');
    expect(app.shown.value).toEqual({ kind: 'pending', text: '0' });
    type(app, ' ');
    expect(app.shown.value).toEqual({ kind: 'error', text: expect.stringContaining('foo') as string });
    expect(app.ghost.value.errorAt).toBe(2);
  });

  it('groups digits when the setting is on', () => {
    const { app } = makeApp();
    type(app, '1234567');
    expect(app.shown.value.text).toBe('1,234,567');
    app.setGroupDigits(false);
    expect(app.shown.value.text).toBe('1234567');
  });
});

describe('the tape (PRD §7.1)', () => {
  it('commits a line, clears it and keeps the result on the display', () => {
    const { app } = makeApp();
    enter(app, '5+3');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['5+3']);
    expect(app.line.value.text).toBe('');
    expect(app.shown.value).toEqual({ kind: 'result', text: '8' });
    expect(app.announcement.value).toBe('Result 8');
  });

  it('puts ans in front of a leading operator', () => {
    const { app } = makeApp();
    enter(app, '10');
    type(app, '*2');
    expect(app.ghost.value.ans).toBe(true);
    expect(app.shown.value.text).toBe('20');
    app.commit();
    expect(app.shown.value.text).toBe('20');
  });

  it('repeats the last operation on Enter with an empty line', () => {
    const { app } = makeApp();
    enter(app, '5+3');
    app.commit();
    app.commit();
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['5+3', 'ans +3', 'ans +3']);
    expect(app.shown.value.text).toBe('14');
  });

  it('does nothing on Enter with an empty line and nothing to repeat', () => {
    const { app } = makeApp();
    app.commit();
    enter(app, '7');
    app.commit();
    expect(app.tape.value.lines).toHaveLength(1);
  });

  it('commits an error line and shows the error', () => {
    const { app } = makeApp();
    enter(app, '1/0');
    expect(app.tape.value.lines[0]!.result.kind).toBe('error');
    expect(app.shown.value.kind).toBe('error');
  });

  it('walks the inputs with ↑ and ↓, then gives back what was typed', () => {
    const { app } = makeApp();
    enter(app, '1+1', '2+2');
    type(app, '9');
    app.historyBack();
    expect(app.line.value.text).toBe('2+2');
    app.historyBack();
    app.historyBack();
    expect(app.line.value.text).toBe('1+1');
    app.historyForward();
    expect(app.line.value.text).toBe('2+2');
    app.historyForward();
    expect(app.line.value.text).toBe('9');
  });

  it('keeps the rand() value the preview showed', () => {
    const { app } = makeApp();
    type(app, 'rand()');
    const shown = app.shown.value.text;
    app.commit();
    expect(app.shown.value.text).toBe(shown);
    expect(shown).toBe('0.25');
  });

  it('clears the tape and puts it back with Undo', () => {
    const { app } = makeApp();
    enter(app, '1', '2');
    app.clearTape();
    expect(app.tape.value.lines).toHaveLength(0);
    expect(app.notice.value?.text).toBe('Cleared 2 lines.');
    app.notice.value!.action!.run();
    expect(app.tape.value.lines).toHaveLength(2);
    expect(app.shown.value.text).toBe('2');
  });
});

describe('clearing (PRD §9.2)', () => {
  it('clears the line first, then the last result', () => {
    const { app } = makeApp();
    enter(app, '42');
    type(app, '1+');
    app.clear();
    expect(app.line.value.text).toBe('');
    expect(app.shown.value.text).toBe('42');
    app.clear();
    expect(app.shown.value.text).toBe('0');
    expect(app.tape.value.lines).toHaveLength(1);
  });
});

describe('keypad keys', () => {
  it('type digits and operators, and = commits', () => {
    const { app } = makeApp();
    for (const id of ['d7', 'multiply', 'd6', 'equals']) app.press(key(id));
    expect(app.tape.value.lines[0]!.input).toBe('7*6');
    expect(app.shown.value.text).toBe('42');
  });

  it('2nd switches a function key once', () => {
    const { app } = makeApp();
    app.press(key('second'));
    app.press(key('sin'));
    expect(app.line.value.text).toBe('asin(');
    expect(app.second.value).toBe(false);
    app.press(key('sin'));
    expect(app.line.value.text).toBe('asin(sin(');
  });

  it('1/x works on the last result from an empty line', () => {
    const { app } = makeApp();
    enter(app, '4');
    app.press(key('reciprocal'));
    expect(app.line.value.text).toBe('1/(ans)');
    expect(app.shown.value.text).toBe('0.25');
  });

  it('the angle key switches degrees and radians', () => {
    const { app } = makeApp();
    type(app, 'sin(90)');
    expect(app.shown.value.text).toBe('1');
    app.press(key('angle'));
    expect(app.settings.value.angle).toBe('rad');
    expect(app.shown.value.text).toBe('0.89399666360055789051826949840421');
  });
});

describe('pasting (PRD §10)', () => {
  it('cleans grouping commas', () => {
    const { app } = makeApp();
    app.paste('1,234 + 1');
    expect(app.line.value.text).toBe('1234 + 1');
    expect(app.shown.value.text).toBe('1,235');
  });
});

describe('Copy Result', () => {
  it('copies the number shown without commas', async () => {
    const { app, copied } = makeApp();
    enter(app, '1234*1000');
    await app.copyResult();
    expect(copied).toEqual(['1234000']);
  });

  it('says so when there is nothing to copy', async () => {
    const { app, copied } = makeApp();
    type(app, '1/0');
    await app.copyResult();
    expect(copied).toEqual([]);
    expect(app.notice.value?.tone).toBe('error');
  });
});

describe('settings and the window (PRD §9.1, §11)', () => {
  it('keeps settings and grows the window for Scientific and the tape', () => {
    const { app, storage, widths } = makeApp();
    app.setMode('scientific');
    app.toggleTape();
    expect(storage.load()).toMatchObject({ mode: 'scientific', showTape: true });
    expect(widths).toEqual([windowWidth('scientific', false), windowWidth('scientific', true)]);
  });

  it('dismisses a notice after a while', () => {
    vi.useFakeTimers();
    try {
      const { app } = makeApp();
      app.say('Hello.');
      vi.advanceTimersByTime(5_000);
      expect(app.notice.value).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
