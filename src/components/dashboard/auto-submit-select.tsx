"use client";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/**
 * A select inside a GET form that submits the form when changed (with JavaScript). Without JavaScript the form's
 * own submit button does the same.
 */
export function AutoSubmitSelect({
  id,
  name,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <NativeSelect
      id={id}
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="w-full min-w-44"
    >
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
