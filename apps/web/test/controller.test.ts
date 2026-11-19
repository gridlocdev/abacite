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
    app.walkHistory(-1);
    expect(app.line.value.text).toBe('2+2');
    app.walkHistory(-1);
    app.walkHistory(-1);
    expect(app.line.value.text).toBe('1+1');
    app.walkHistory(1);
    expect(app.line.value.text).toBe('2+2');
    app.walkHistory(1);
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

describe('tape changes and undo (PRD §7.2, §7.3)', () => {
  it('undoes and redoes commits, deleted lines and Clear Tape', () => {
    const { app } = makeApp();
    enter(app, 'x = 4', 'x * 2');
    app.deleteLine(0);
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['x * 2']);
    expect(app.shown.value.kind).toBe('error');
    app.clearTape();
    expect(app.canStepTape('undo')).toBe(true);
    app.stepTape('undo');
    app.stepTape('undo');
    expect(app.tape.value.lines).toHaveLength(2);
    expect(app.shown.value.text).toBe('8');
    app.stepTape('undo');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['x = 4']);
    app.stepTape('redo');
    app.stepTape('redo');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['x * 2']);
  });

  it('leaves ⌘Z to the expression line while it has text', () => {
    const { app } = makeApp();
    enter(app, '1');
    type(app, '2');
    expect(app.canStepTape('undo')).toBe(false);
    app.clear();
    expect(app.canStepTape('undo')).toBe(true);
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

  it('shows a conversion with its unit, and copies the number alone', async () => {
    const { app, copied } = makeApp();
    type(app, '1500 m to km');
    expect(app.shown.value).toMatchObject({ kind: 'live', text: '1.5 km' });
    enter(app, '');
    enter(app, '2 mi to ft');
    expect(app.shown.value).toMatchObject({ kind: 'result', text: '10,560 ft' });
    await app.copyResult();
    expect(copied).toEqual(['10560']);
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

  it('takes settings another window changed, without saving them back, and keeps its own angle', () => {
    const { app, storage, widths } = makeApp({ angle: 'deg' });
    app.setAngle('rad');
    type(app, '1234');
    let saves = 0;
    const save = storage.save.bind(storage);
    storage.save = (s) => {
      saves++;
      save(s);
    };
    storage.change({ theme: 'dark', mode: 'scientific', groupDigits: false, angle: 'deg' });
    expect(app.settings.value).toMatchObject({ theme: 'dark', mode: 'scientific', angle: 'rad' });
    expect(app.shown.value.text).toBe('1234');
    expect(widths.at(-1)).toBe(windowWidth('scientific', false));
    storage.change({ entry: 'classic' });
    expect(app.classicEntry()).toBe(true);
    expect(saves).toBe(0);
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

describe('the display after a commit (PRD §9.1, §14)', () => {
  it('keeps a committed error shown when a setting changes', () => {
    const { app } = makeApp();
    enter(app, '5', '1/0');
    app.setGroupDigits(false);
    app.toggleAngle();
    expect(app.shown.value).toEqual({ kind: 'error', text: 'Can’t divide by zero.' });
    type(app, '2');
    expect(app.shown.value).toEqual({ kind: 'live', text: '2' });
  });

  it('keeps the last result for a comment line, so it can still be copied and repeated', () => {
    const { app } = makeApp();
    enter(app, '5+3', '# a note');
    expect(app.shown.value).toEqual({ kind: 'result', text: '8' });
    expect(app.currentValue()).toBe('8');
  });

  it('announces the same result twice in a row', () => {
    const { app } = makeApp();
    enter(app, '2+3');
    const first = app.announcement.value;
    enter(app, '1+4');
    expect(app.announcement.value).not.toBe(first);
    expect(app.announcement.value.trim()).toBe('Result 5');
  });

  it('draws rand() afresh after the line is cleared', () => {
    const { app } = makeApp();
    type(app, 'rand()');
    expect(app.shown.value.text).toBe('0.25');
    app.clear();
    type(app, 'rand()');
    expect(app.shown.value.text).toBe('0.5');
  });
});

describe('memory keys (PRD §5)', () => {
  const inputs = (app: ReturnType<typeof makeApp>['app']) => app.tape.value.lines.map((l) => l.input);

  it('adds the typed line’s result after committing it, and shows M', () => {
    const { app } = makeApp();
    type(app, '5*3');
    expect(app.memorySet()).toBe(false);
    app.press(key('madd'));
    expect(inputs(app)).toEqual(['5*3', 'mem = mem + 15']);
    expect(app.memorySet()).toBe(true);
    app.press(key('msubtract'));
    expect(inputs(app).at(-1)).toBe('mem = mem - 15');
    expect(app.memorySet()).toBe(false);
  });

  it('uses the last result on an empty line, and 0 with none', () => {
    const { app } = makeApp();
    app.press(key('madd'));
    expect(inputs(app)).toEqual(['mem = mem + 0']);
    enter(app, '2^10');
    app.press(key('msubtract'));
    expect(inputs(app).at(-1)).toBe('mem = mem - 1024');
    expect(app.shown.value.text).toBe('-1,024');
  });

  it('clears memory with a line, and recalls it into the expression line', () => {
    const { app } = makeApp();
    enter(app, '7');
    app.press(key('madd'));
    type(app, '2*');
    app.press(key('mrecall'));
    expect(app.line.value.text).toBe('2*mem');
    expect(app.shown.value.text).toBe('14');
    app.press(key('mclear'));
    expect(inputs(app).at(-1)).toBe('mem = 0');
    expect(app.memorySet()).toBe(false);
    expect(app.line.value.text, 'MC keeps the typing').toBe('2*mem');
    expect(app.shown.value.text).toBe('0');
  });

  it('adds nothing when the line has no result', () => {
    const { app } = makeApp();
    type(app, '1/0');
    app.press(key('madd'));
    expect(inputs(app)).toEqual([]);
    expect(app.notice.value?.text).toBe('There’s no result to put in memory.');
  });
});

describe('classic entry (PRD §9.3)', () => {
  /** Types `text` as keys, the way the keyboard does in classic entry. */
  const keys = (app: ReturnType<typeof makeApp>['app'], text: string) => {
    for (const ch of text.replaceAll(' ', '')) expect(app.typeKey(ch), ch).toBe(true);
  };

  it('shows operators applying as they are pressed, and = commits the calculation', () => {
    const { app } = makeApp({ entry: 'classic' });
    keys(app, '2+3*');
    expect(app.shown.value).toMatchObject({ kind: 'live', text: '3' });
    keys(app, '4');
    expect(app.shown.value.text).toBe('4');
    keys(app, '-');
    expect(app.shown.value.text).toBe('14');
    app.press(key('back'));
    keys(app, '1=');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['2 + 3 * 4 - 1']);
    expect(app.shown.value).toMatchObject({ kind: 'result', text: '13' });
  });

  it('repeats the last operation when = is pressed again', () => {
    const { app } = makeApp({ entry: 'classic' });
    keys(app, '10+5==');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['10 + 5', 'ans + 5']);
    expect(app.shown.value.text).toBe('20');
  });

  it('applies a function to the number shown, and an operator after = goes on from the result', () => {
    const { app } = makeApp({ entry: 'classic' });
    keys(app, '9');
    app.press(key('sqrt'));
    expect(app.shown.value.text).toBe('3');
    app.commit();
    keys(app, '*2=');
    expect(app.tape.value.lines.map((l) => l.input)).toEqual(['sqrt(9)', 'ans * 2']);
    expect(app.shown.value.text).toBe('6');
  });

  it('groups typed digits, and C clears the number before AC clears the rest', () => {
    const { app } = makeApp({ entry: 'classic' });
    keys(app, '1234.5');
    expect(app.shown.value.text).toBe('1,234.5');
    expect(app.hasEntry()).toBe(true);
    keys(app, '+');
    keys(app, '7');
    app.clear();
    expect(app.classic.value.parts).toEqual(['1234.5', '+']);
    app.clear();
    expect(app.hasEntry()).toBe(false);
    expect(app.shown.value.text).toBe('0');
  });

  it('shows errors, and m+ adds the calculation’s result', () => {
    const { app } = makeApp({ entry: 'classic' });
    keys(app, '1/0');
    app.press(key('equals'));
    expect(app.shown.value).toMatchObject({ kind: 'error', text: 'Can’t divide by zero.' });
    keys(app, '6*7');
    app.press(key('madd'));
    expect(app.tape.value.lines.map((l) => l.input).slice(1)).toEqual(['6 * 7', 'mem = mem + 42']);
    app.press(key('mrecall'));
    expect(app.shown.value.text).toBe('42');
  });

  it('switches with ⌘E, keeps the setting, and leaves typed keys alone in expression entry', () => {
    const { app, catalog, storage } = makeApp();
    expect(app.typeKey('5')).toBe(false);
    catalog.run('view.classic');
    expect(storage.load().entry).toBe('classic');
    expect(app.typeKey('5')).toBe(true);
    expect(app.typeKey('a')).toBe(false);
    expect(app.notice.value?.text).toBe('Classic entry is on.');
    catalog.run('view.classic');
    expect(app.classicEntry()).toBe(false);
  });
});
