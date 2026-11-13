"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
export default function ActionModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-zinc-100 shadow-2xl backdrop:bg-black/85"
    >
      <h2 className="mb-4 font-bebas text-3xl break-words">{title}</h2>
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-5 rounded-lg border border-zinc-600 px-4 py-2 text-sm"
        >
          Tutup
        </button>
      )}
    </dialog>
  );
}
type Question = { title: string; message: string; challenge?: string };
export function useConfirmation() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [typed, setTyped] = useState("");
  const resolver = useRef<((value: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolver.current?.(false);
    },
    [],
  );
  function finish(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setQuestion(null);
  }
  const confirm = (value: Question) =>
    new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setTyped("");
      setQuestion(value);
    });
  const dialog = question ? (
    <ActionModal title={question.title} onClose={() => finish(false)}>
      <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">
        {question.message}
      </p>
      {question.challenge && (
        <label className="mt-4 block text-sm">
          Ketik {question.challenge} untuk melanjutkan
          <input
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-2 w-full rounded border border-zinc-600 bg-zinc-900 p-3"
          />
        </label>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={() => finish(false)}
          className="rounded border border-zinc-600 px-4 py-2"
        >
          Batal
        </button>
        <button
          disabled={!!question.challenge && typed !== question.challenge}
          onClick={() => finish(true)}
          className="rounded bg-red-600 px-4 py-2 disabled:opacity-40"
        >
          Ya, lanjutkan
        </button>
      </div>
    </ActionModal>
  ) : null;
  return { confirm, dialog };
}
