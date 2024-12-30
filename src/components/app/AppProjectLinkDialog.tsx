import { useEffect, useRef } from "react"

export function AppProjectLinkDialog({ link }: {
  link: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (link.trim() == "")
      return;

    dialogRef.current!.showModal();

    setTimeout(() => {
      textAreaRef.current!.focus();
      textAreaRef.current!.select();
    }, 50);
  }, [link]);

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box max-w-none w-1/2">
        <h3 className="font-bold text-lg">Project link</h3>
        <p className="py-4">
          This is a link to your project - whenever you'll open it, this
          version of the project will be restored.
        </p>

        <textarea ref={textAreaRef}
          className="textarea textarea-bordered w-full h-full min-h-[200px]"
          aria-label="Project link"
          value={link}
          readOnly
        />
        
        <div className="modal-action">
          <form method="dialog">
            <button className="btn">Close</button>
          </form>
        </div>
      </div>
    </dialog>
  );
};