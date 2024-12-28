import { forwardRef } from "react"

export const ConfirmationDialog = forwardRef((
  { title, content, confirm, onConfirm }: {
    title?: React.ReactNode,
    content: React.ReactNode,
    confirm: React.ReactNode,
    onConfirm: () => void
  },
  ref: React.ForwardedRef<HTMLDialogElement>
) => {
  title ??= "Confirm operation";

  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="py-4">{content}</p>

        <div className="modal-action w-full">
          <form method="dialog" className="flex gap-2 w-full">
            <button onClick={onConfirm} className="btn btn-primary w-1/2">{confirm}</button>
            <button className="btn w-1/2">Cancel</button>
          </form>
        </div>
      </div>
    </dialog>
  )
});