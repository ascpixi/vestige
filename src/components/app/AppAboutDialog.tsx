import { forwardRef } from "react"

import { Link } from "../Link";

import iconShadow from "../../assets/icon-shadow.svg";
import highSeasLogo from "../../assets/highseas-logo.svg";

export const AppAboutDialog = forwardRef((
  _,
  ref: React.ForwardedRef<HTMLDialogElement>
) => {
  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box max-w-none w-1/2">
        <h3 className="font-bold text-lg mb-2">About Vestige</h3>

        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-4 w-full">
            <img className="w-32" src={iconShadow} alt="Vestige logo" aria-hidden/>

            <p className="py-4">
              <b>Vestige</b> is an open-source generative music synthesizer created
              by <Link href="https://ascpixi.dev">@ascpixi</Link> for
              the Hack Seas High Seas 2024 event. You can view its source code over
              at <Link href="https://github.com/ascpixi/vestige">ascpixi/vestige</Link>.
            </p>
          </div>

          <Link isContainer href="https://highseas.hackclub.com" className="w-1/2" ariaLabel="Hack Club High Seas">
            <img src={highSeasLogo} alt="" aria-hidden/>
          </Link>
        </div>

        <div className="modal-action">
          <form method="dialog">
            <button className="btn">Close</button>
          </form>
        </div>
      </div>
    </dialog>
  )
});