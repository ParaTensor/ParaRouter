import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from "react-i18next";

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export type Option = {
  value: string;
  label: string;
  /** 悬停提示（长文案时可与 label 相同） */
  title?: string;
};

export type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function Select({ value, onChange, options, placeholder = "Select...", className, disabled }: SelectProps) {
    const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm ring-offset-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-2 ring-zinc-950 ring-offset-2",
          className
        )}
      >
        <span
          className="min-w-0 flex-1 truncate"
          title={selectedOption ? selectedOption.title ?? selectedOption.label : undefined}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2">
          {options.length === 0 ? (
            <div className="py-6 text-center text-sm text-zinc-500">{t('select.no_options_found')}</div>
          ) : (
            options.map((option) => (
              <button
                key={option.value === '' ? '__placeholder__' : option.value}
                type="button"
                title={option.title ?? option.label}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full min-w-0 cursor-default select-none items-start gap-2 rounded-sm py-1.5 pl-2 pr-2 text-left text-sm text-zinc-900 outline-none hover:bg-zinc-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  value === option.value && "bg-zinc-50 font-medium"
                )}
              >
                <span className="flex h-5 w-4 shrink-0 items-center justify-start pt-0.5 text-zinc-600">
                  {value === option.value ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
                </span>
                <span className="min-w-0 flex-1 break-words leading-snug">{option.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
