import { forwardRef, useState } from "react"

import { VestigeGraph } from "../../graph";
import { renderOffline } from "../../render";

export const AppRenderDialog = forwardRef((
  { graph }: {
    graph: VestigeGraph,
  },
  ref: React.ForwardedRef<HTMLDialogElement>
) => {
  const [isRendering, setIsRendering] = useState(false);
  const [renderLength, setRenderLength] = useState(30);
  const [renderProgress, setRenderProgress] = useState(0);

  async function render() {
    setIsRendering(true);

    try {
      await renderOffline(
        renderLength,
        graph.nodes, graph.edges,
        setRenderProgress
      );
    }
    catch (err) {
      alert(`Oops, something went wrong while rendering your project...\n\n${err}`);
      setIsRendering(false);
      throw err;
    }

    setIsRendering(false);
  }

  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box max-w-none w-1/2">
        <h3 className="font-bold text-lg mb-2">Render to audio file</h3>
        <p className="mb-8">
          Your project will be rendered to a lossless WAV file. Please note that
          more complex projects may take longer to render.
        </p>

        <div className="flex flex-col gap-2">
          <b>Length <span className="text-gray-400">({renderLength} s)</span></b>

          <input
            type="range"
            min={0} max={7 * 60} value={renderLength} step={0.5}
            onChange={ev => setRenderLength(ev.target.valueAsNumber)}
            className="range range-primary"
            disabled={isRendering}
          />
        </div>

        <div className="modal-action items-center">
          {
            !isRendering ? <></>
              : (
                <div className="flex flex-col gap-2 mr-4">
                  <span>{
                    renderProgress < 0.96
                    ? `Rendering... (${Math.floor(renderProgress * 100)}%)`
                    : "Finishing up..."
                  }</span>

                  {
                    renderProgress < 0.96
                    ? (
                      <progress
                        className="progress progress-primary w-56"
                        value={renderProgress * 1000}
                        max="1000"
                      />
                    )
                    : <progress className="progress progress-primary w-56" />
                  }
                </div>
              )
          }

          <button className="btn btn-primary" disabled={isRendering} onClick={render}>Render</button>

          <form method="dialog">
            <button className="btn" disabled={isRendering}>Cancel</button>
          </form>
        </div>
      </div>
    </dialog>
  )
});