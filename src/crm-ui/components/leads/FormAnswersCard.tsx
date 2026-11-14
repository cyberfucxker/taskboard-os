import { Copy } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { useToast } from '../../context/ToastContext';
import { answersToText, readFormAnswers } from '../../../crm-server/services/formAnswers';

/**
 * The exact questions a lead was asked on its form and the answers they gave, in the form's order.
 * Multi-select answers render as chips. Source form + submitted time sit on top.
 */
export function FormAnswersCard({
  formAnswers,
  fallbackFormName,
  fallbackSubmittedAt,
  className,
}: {
  formAnswers: unknown;
  fallbackFormName?: string | null;
  fallbackSubmittedAt?: string | null;
  className?: string;
}) {
  const { toast } = useToast();
  const doc = readFormAnswers(formAnswers);
  if (!doc) return null;

  const formName = doc.formName ?? fallbackFormName ?? null;
  const when = doc.submittedAt ?? fallbackSubmittedAt ?? null;
  const submitted = when ? new Date(when).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(answersToText({ answers: doc.answers, formName }));
      toast({ title: 'Form answers copied', variant: 'success' });
    } catch {
      toast({ title: 'Could not copy', variant: 'error' });
    }
  };

  return (
    <Card className={className}>
      <CardHeader
        title="Form answers"
        subtitle={[formName, submitted && `Submitted ${submitted}`].filter(Boolean).join(' · ') || 'What they answered on the form'}
        action={
          <Button variant="ghost" size="sm" leftIcon={<Copy size={13} />} onClick={copyAll}>
            Copy all
          </Button>
        }
      />
      <dl className="divide-y divide-line">
        {doc.answers.map((a, i) => (
          <div key={`${a.key}-${i}`} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
            <dt className="text-[12px] text-ink-muted">{a.label}</dt>
            <dd className="text-[13px] text-ink">
              {Array.isArray(a.answer) ? (
                <span className="flex flex-wrap gap-1.5">
                  {a.answer.map((v, j) => (
                    <span key={j} className="rounded-full border border-edge bg-raised px-2 py-0.5 text-[12px] text-ink">
                      {v}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="whitespace-pre-wrap break-words">{a.answer}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
