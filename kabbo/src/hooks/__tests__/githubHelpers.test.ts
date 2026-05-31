import { describe, it, expect } from 'vitest';
// The shared edge-function helpers are pure (no Deno/network at import time),
// so we can unit-test them directly from the React test runner.
import {
  normalizeStage,
  extractStageTag,
  repoNameToTitle,
  parseSimpleYaml,
  countWordsInTex,
} from '../../../supabase/functions/_shared/github.ts';

describe('normalizeStage', () => {
  it('maps aliases to canonical stages', () => {
    expect(normalizeStage('wip')).toBe('draft');
    expect(normalizeStage('R&R')).toBe('revise_resubmit');
    expect(normalizeStage('forthcoming')).toBe('accepted');
    expect(normalizeStage('  Submitted ')).toBe('submitted');
  });
  it('returns null for unknown stages', () => {
    expect(normalizeStage('banana')).toBeNull();
  });
});

describe('extractStageTag', () => {
  it('pulls [stage:xxx] out of a commit message and normalises it', () => {
    expect(extractStageTag('Methods done [stage:draft]')).toBe('draft');
    expect(extractStageTag('Submitted to AER [stage:submitted]')).toBe('submitted');
    expect(extractStageTag('no tag here')).toBeNull();
    expect(extractStageTag('bad [stage:nope]')).toBeNull();
  });
});

describe('repoNameToTitle', () => {
  it('turns slugs into Title Case', () => {
    expect(repoNameToTitle('colonial-wages')).toBe('Colonial Wages');
    expect(repoNameToTitle('great_depression_paper')).toBe('Great Depression Paper');
  });
});

describe('parseSimpleYaml', () => {
  it('parses scalars and arrays from .kabbo.yaml', () => {
    const yaml = [
      '# comment',
      'title: "Colonial Wages"',
      'stage: draft',
      'target_year: 2026',
      'authors:',
      '  - Alice Smith',
      '  - Bob Jones',
      'themes:',
      '  - climate',
    ].join('\n');
    const parsed = parseSimpleYaml(yaml);
    expect(parsed.title).toBe('Colonial Wages');
    expect(parsed.stage).toBe('draft');
    expect(parsed.target_year).toBe(2026);
    expect(parsed.authors).toEqual(['Alice Smith', 'Bob Jones']);
    expect(parsed.themes).toEqual(['climate']);
  });
});

describe('countWordsInTex', () => {
  it('counts prose words, skipping commands and comments', () => {
    const tex = [
      '% this comment should not count',
      '\\section{Introduction}',
      'The quick brown fox jumps.',
      '\\cite{smith2020} again here',
    ].join('\n');
    const n = countWordsInTex(tex);
    // "The quick brown fox jumps" (5) + "again here" (2) = 7
    expect(n).toBe(7);
  });
  it('returns 0 for empty / command-only input', () => {
    expect(countWordsInTex('\\maketitle')).toBe(0);
    expect(countWordsInTex('')).toBe(0);
  });
});
