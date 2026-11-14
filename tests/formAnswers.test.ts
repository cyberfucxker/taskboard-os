import { describe, expect, it } from 'vitest';
import {
  buildAnswerList, buildFormAnswersDoc, answersToText, humanizeKey, normalizeQuestions, previewAnswers, readFormAnswers,
} from '../src/crm-server/services/formAnswers';
import { mappedTargets, metaFormAnswersDoc } from '../src/crm-server/services/leadFieldMapping';

const questions = normalizeQuestions([
  { key: 'full_name', label: 'Full name', type: 'FULL_NAME' },
  { key: 'what_is_your_monthly_budget?', label: 'What is your monthly budget?', type: 'CUSTOM', options: [{ key: 'a', value: 'Below ₹50k' }, { key: 'b', value: '₹50k - 1L' }] },
  { key: 'services_needed', label: 'Which services do you need?', type: 'CUSTOM' },
  { key: 'phone_number', label: 'Phone number', type: 'PHONE' },
]);

describe('buildAnswerList', () => {
  it('keeps form question order and uses the question label', () => {
    const { answers } = buildAnswerList(
      [{ name: 'phone_number', values: ['+911234567890'] }, { name: 'full_name', values: ['Asha Rao'] }, { name: 'what_is_your_monthly_budget?', values: ['b'] }],
      questions,
    );
    expect(answers.map((a) => a.label)).toEqual(['Full name', 'What is your monthly budget?', 'Phone number']);
    expect(answers[1].answer).toBe('₹50k - 1L'); // option key -> option label
  });

  it('falls back to a humanised key when the question is not in the definition, appended in arrival order', () => {
    const r = buildAnswerList([{ name: 'zz_extra_q', values: ['x'] }, { name: 'full_name', values: ['A'] }, { name: 'another_one', values: ['y'] }], questions);
    expect(r.answers.map((a) => a.label)).toEqual(['Full name', 'Zz extra q', 'Another one']);
    expect(r.labelsGuessed).toBe(true);
  });

  it('works with no definition at all (missing label)', () => {
    const r = buildAnswerList([{ name: 'what_is_your_budget?', values: ['10k'] }]);
    expect(r.answers).toEqual([{ key: 'what_is_your_budget?', label: 'What is your budget?', answer: '10k' }]);
  });

  it('keeps multi-value answers as arrays and single as strings', () => {
    const { answers } = buildAnswerList([{ name: 'services_needed', values: ['SEO', 'Social Media'] }, { name: 'full_name', values: ['A'] }], questions);
    expect(answers.find((a) => a.key === 'services_needed')!.answer).toEqual(['SEO', 'Social Media']);
    expect(answers.find((a) => a.key === 'full_name')!.answer).toBe('A');
  });

  it('preserves unicode verbatim', () => {
    const { answers } = buildAnswerList([{ name: 'full_name', values: ['आशा राव'] }, { name: 'q', values: ['₹3 लाख 😀 café'] }], questions);
    expect(answers[0].answer).toBe('आशा राव');
    expect(answers[1].answer).toBe('₹3 लाख 😀 café');
  });

  it('keeps duplicate keys (both answers, stable order) and skips blank answers only', () => {
    const { answers } = buildAnswerList(
      [{ name: 'services_needed', values: ['SEO'] }, { name: 'full_name', values: ['A'] }, { name: 'services_needed', values: ['PPC'] }, { name: 'phone_number', values: ['  '] }, { name: 'other', values: [] }],
      questions,
    );
    expect(answers.map((a) => `${a.key}=${a.answer}`)).toEqual(['full_name=A', 'services_needed=SEO', 'services_needed=PPC']);
  });

  it('records mapped_to without removing the answer', () => {
    const { answers } = buildAnswerList([{ name: 'full_name', values: ['A'] }, { name: 'x', values: ['1'] }], questions, (k) => (k === 'full_name' ? 'fullName' : undefined));
    expect(answers[0].mapped_to).toBe('fullName');
    expect(answers[1].mapped_to).toBeUndefined();
  });
});

describe('docs and helpers', () => {
  it('returns null doc when there are no answers', () => {
    expect(buildFormAnswersDoc({ source: 'meta', fieldData: [] })).toBeNull();
    expect(readFormAnswers(null)).toBeNull();
    expect(readFormAnswers({ answers: [] })).toBeNull();
  });
  it('answersToText renders Question: answer lines (arrays joined)', () => {
    const doc = buildFormAnswersDoc({ source: 'meta', formName: 'Form A', fieldData: [{ name: 'services_needed', values: ['SEO', 'PPC'] }], questions })!;
    expect(answersToText(doc)).toBe('Form: Form A\nWhich services do you need?: SEO, PPC');
  });
  it('humanizeKey', () => {
    expect(humanizeKey('what_is_your_monthly_budget?')).toBe('What is your monthly budget?');
  });
  it('normalizeQuestions accepts {data:[]} and drops keyless entries', () => {
    expect(normalizeQuestions({ data: [{ key: 'a', label: 'A' }, { label: 'no key' }] }).map((q) => q.key)).toEqual(['a']);
  });
  it('previewAnswers picks budget then service answers', () => {
    const doc = buildFormAnswersDoc({ source: 'meta', fieldData: [{ name: 'full_name', values: ['A'] }, { name: 'services_needed', values: ['SEO'] }, { name: 'what_is_your_monthly_budget?', values: ['10k'] }], questions })!;
    expect(previewAnswers(doc).map((p) => p.text)).toEqual(['10k', 'SEO']);
  });
});

describe('meta mapping integration', () => {
  it('standard fields are mapped AND still listed; unmapped questions kept verbatim', () => {
    const fd = [
      { name: 'full_name', values: ['Asha Rao'] },
      { name: 'email', values: ['a@x.com'] },
      { name: 'phone_number', values: ['+911234567890'] },
      { name: 'city', values: ['Pune'] },
      { name: 'what_is_your_monthly_budget?', values: ['a'] },
      { name: 'some_odd_question', values: ['odd answer'] },
    ];
    const t = mappedTargets(fd, 'F', 'C');
    expect(t.email).toBe('email');
    expect(t.phone_number).toBe('phone');
    expect(t.city).toBe('city');
    expect(t.some_odd_question).toBeUndefined();
    const doc = metaFormAnswersDoc({ fieldData: fd, questions, formId: '1', formName: 'F', submittedAt: '2026-10-01T00:00:00+0000' })!;
    expect(doc.answers).toHaveLength(6);
    expect(doc.answers.find((a) => a.key === 'some_odd_question')!.answer).toBe('odd answer');
    expect(doc.answers.find((a) => a.key === 'email')!.mapped_to).toBe('email');
    expect(doc.formName).toBe('F');
  });
});
