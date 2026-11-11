import type { ComponentProps, ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// One labelled input with an optional error message underneath.
// Shared by the login and sign-up forms so they look and behave the same.
type FormFieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  /** Optional extra shown at the right of the label, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
};

export function FormField({ id, label, error, labelAction, ...inputProps }: FormFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-2">
      {/* htmlFor ties the label to the input, so clicking the label focuses
          the field and screen readers read the label aloud. */}
      {labelAction ? (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          {labelAction}
        </div>
      ) : (
        <Label htmlFor={id}>{label}</Label>
      )}
      <Input
        id={id}
        name={id}
        className="h-10"
        // aria-invalid turns the border red (see the Input styles) and tells
        // screen readers the value is wrong; aria-describedby reads the error.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
