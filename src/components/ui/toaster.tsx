"use client"

import * as React from "react"
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast"

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: "default" | "destructive" | "success"
}

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type Action =
  | { type: typeof actionTypes.ADD_TOAST; toast: ToasterToast }
  | { type: typeof actionTypes.UPDATE_TOAST; toast: Partial<ToasterToast> }
  | { type: typeof actionTypes.DISMISS_TOAST; toastId?: string }
  | { type: typeof actionTypes.REMOVE_TOAST; toastId?: string }

interface State {
  toasts: ToasterToast[]
}

export const toastState = {
  toasts: [] as ToasterToast[],
  listeners: [] as ((state: State) => void)[],
  addToast(toast: ToasterToast) {
    this.toasts = [toast, ...this.toasts].slice(0, TOAST_LIMIT)
    this.listeners.forEach((listener) => listener({ toasts: this.toasts }))
  },
  dismissToast(toastId?: string) {
    this.toasts = this.toasts.filter((t) => t.id !== toastId)
    this.listeners.forEach((listener) => listener({ toasts: this.toasts }))
  },
  subscribe(listener: (state: State) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  },
}

export function toast(props: Omit<ToasterToast, "id">) {
  const id = genId()
  toastState.addToast({ ...props, id })
  return {
    id,
    dismiss: () => toastState.dismissToast(id),
  }
}

export function useToast() {
  const [state, setState] = React.useState<State>({ toasts: toastState.toasts })

  React.useEffect(() => {
    return toastState.subscribe(setState)
  }, [])

  return {
    toasts: state.toasts,
    toast,
    dismiss: toastState.dismissToast,
  }
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} {...props} className={variant === 'destructive' ? 'border-danger text-danger' : variant === 'success' ? 'border-success text-success' : ''}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
