/**
 * Form answers: the exact questions a lead was asked and what they answered.
 *
 * Pure module (no prisma / axios) so it is unit-testable and safe to import anywhere.
 *
 * Stored on CrmLead.formAnswers as FormAnswersDoc. Every answer is kept, in the form's own
 * question order; mapping an answer to a lead column never removes it from the list.
 */

export type AnswerValue = string | string[];

export interface FormAnswer {
  /** Meta question key (or website form fieldKey). */
  key: string;
  /** Human question text, as the prospect saw it. */
  label: string;
  type?: string;
  answer: AnswerValue;
  /** Lead column / custom field this answer also feeds, when any. */
  mapped_to?: string;
}

export interface FormAnswersDoc {
  v: 1;
  source: 'meta' | 'web_form' | 'csv' | 'other';
  formId?: string | null;
  formName?: string | null;
  submittedAt?: string | null;
  /** True when at least one label had to be guessed from the key (form definition unavailable). */
  labelsGuessed?: boolean;
  answers: FormAnswer[];
}

export interface FormQuestionDef {
  key: string;
  label: string;
  type?: string;
  options?: { key: string; value: string }[];
}

export interface RawAnswer {
  name: string;
  values?: string[];
}

/** 'what_is_your_monthly_budget?' -> 'What is your monthly budget?' */
export function humanizeKey(key: string): string {
  const spaced = String(key).replace(/[_\s]+/g, ' ').trim();
  if (!spaced) return String(key);
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Normalises Graph's questions payload ({data:[...]} or plain array). */
export function normalizeQuestions(raw: unknown): FormQuestionDef[] {
  const arr: any[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.data) ? (raw as any).data : [];
  const out: FormQuestionDef[] = [];
  for (const q of arr) {
    if (!q || typeof q.key !== 'string' || !q.key) continue;
    const options = Array.isArray(q.options)
      ? q.options
          .filter((o: any) => o && (o.key || o.value))
          .map((o: any) => ({ key: String(o.key ?? o.value), value: String(o.value ?? o.key) }))
      : undefined;
    out.push({ key: q.key, label: String(q.label ?? '').trim() || humanizeKey(q.key), type: q.type ? String(q.type) : undefined, options });
  }
  return out;
}

/**
 * Builds the ordered answer list.
 * - Order: the form's question order; answers for questions not in the definition follow in the
 *   order they arrived. Duplicate keys are all kept (stable).
 * - Option keys are swapped for option labels when the definition knows them.
 * - Multi-value answers stay arrays; single values are strings.
 * - Empty answers (no non-blank value) are skipped; nothing else is ever dropped.
 */
export function buildAnswerList(
  fieldData: RawAnswer[] | null | undefined,
  questions: FormQuestionDef[] = [],
  mappedTo: (key: string) => string | undefined = () => undefined,
): { answers: FormAnswer[]; labelsGuessed: boolean } {
  const defIndex = new Map<string, number>();
  questions.forEach((q, i) => { if (!defIndex.has(q.key)) defIndex.set(q.key, i); });

  const rows: { order: number; seq: number; a: FormAnswer }[] = [];
  let labelsGuessed = false;
  (fieldData ?? []).forEach((d, seq) => {
    if (!d || typeof d.name !== 'string') return;
    const def = questions[defIndex.get(d.name) ?? -1];
    const optMap = new Map((def?.options ?? []).map((o) => [o.key, o.value]));
    const values = (d.values ?? [])
      .map((v) => String(v ?? '').trim())
      .filter((v) => v !== '')
      .map((v) => optMap.get(v) ?? v);
    if (values.length === 0) return;
    if (!def) labelsGuessed = true;
    const a: FormAnswer = {
      key: d.name,
      label: def?.label ?? humanizeKey(d.name),
      ...(def?.type ? { type: def.type } : {}),
      answer: values.length === 1 ? values[0] : values,
    };
    const m = mappedTo(d.name);
    if (m) a.mapped_to = m;
    rows.push({ order: def ? defIndex.get(d.name)! : questions.length + 1000, seq, a });
  });

  rows.sort((x, y) => x.order - y.order || x.seq - y.seq);
  return { answers: rows.map((r) => r.a), labelsGuessed };
}

export function buildFormAnswersDoc(args: {
  source: FormAnswersDoc['source'];
  fieldData: RawAnswer[] | null | undefined;
  questions?: FormQuestionDef[];
  formId?: string | null;
  formName?: string | null;
  submittedAt?: string | null;
  mappedTo?: (key: string) => string | undefined;
}): FormAnswersDoc | null {
  const { answers, labelsGuessed } = buildAnswerList(args.fieldData, args.questions ?? [], args.mappedTo);
  if (answers.length === 0) return null;
  return {
    v: 1,
    source: args.source,
    formId: args.formId ?? null,
    formName: args.formName ?? null,
    submittedAt: args.submittedAt ?? null,
    labelsGuessed,
    answers,
  };
}

/** Plain-text rendering ("Question: answer" per line), used for Copy all and the notes block. */
export function answersToText(doc: Pick<FormAnswersDoc, 'answers' | 'formName'>): string {
  const lines = doc.answers.map((a) => `${a.label}: ${Array.isArray(a.answer) ? a.answer.join(', ') : a.answer}`);
  return (doc.formName ? [`Form: ${doc.formName}`, ...lines] : lines).join('\n');
}

/** Defensive reader for a JSON column value. */
export function readFormAnswers(v: unknown): FormAnswersDoc | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as FormAnswersDoc;
  if (!Array.isArray(d.answers) || d.answers.length === 0) return null;
  return d;
}

/** Short preview of the answers worth showing on a card: budget and service-like questions. */
export function previewAnswers(doc: FormAnswersDoc | null | undefined, max = 3): { label: string; text: string }[] {
  if (!doc) return [];
  const pri = (a: FormAnswer) => {
    const k = `${a.key} ${a.label}`.toLowerCase();
    if (/budget|invest|₹/.test(k)) return 0;
    if (/service|solution|looking.?for|need|type of (app|business)|requirement/.test(k)) return 1;
    return 9;
  };
  return doc.answers
    .filter((a) => pri(a) < 9)
    .sort((a, b) => pri(a) - pri(b))
    .slice(0, max)
    .map((a) => ({ label: a.label, text: Array.isArray(a.answer) ? a.answer.join(', ') : a.answer }));
}
