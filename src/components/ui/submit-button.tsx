"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import React from "react";

import { Button, ButtonProps } from "@/components/ui/button";
import { useActionPending } from './action-form';

interface SubmitButtonProps extends ButtonProps {
  children: React.ReactNode;
  loadingText?: string;
}

export function SubmitButton({ 
  children, 
  loadingText = "Processing...", 
  className,
  ...props 
}: SubmitButtonProps) {
  const formStatus = useFormStatus();
  const actionPending = useActionPending();
  const pending = formStatus.pending || actionPending;

  return (
    <Button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      className={`${className || ""} ${pending ? "opacity-70 cursor-not-allowed" : ""}`}
    >
      {pending && (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      )}
      {pending ? loadingText : children}
    </Button>
  );
}
