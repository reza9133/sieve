import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode;
}

export function FieldShell({ label, hint, error, children }: FieldShellProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  mono?: boolean;
}

export function TextField({ label, hint, error, mono, className = '', ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(a11y) => <input className={`input ${mono ? 'mono' : ''} ${className}`} spellCheck={false} autoComplete="off" {...a11y} {...rest} />}
    </FieldShell>
  );
}

interface AreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export function TextArea({ label, hint, error, className = '', ...rest }: AreaProps) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(a11y) => <textarea className={`input min-h-28 resize-y ${className}`} {...a11y} {...rest} />}
    </FieldShell>
  );
}
