import { RiCloseCircleFill } from "@remixicon/react";
import { useReactFlow } from "@xyflow/react";
import React, { PropsWithChildren, useRef } from "react";
import { twMerge } from "tailwind-merge";

import { assert } from "../util";
 
/**
 * Represents the basis for all nodes provided by Vestige.
 */
export function VestigeNodeBase({ id, name, help, onRemove, className, children }: PropsWithChildren<{
  id: string,
  name: string
  help: React.ReactNode,
  onRemove?: () => void,
  className?: string
}>) {
  const { setNodes, setEdges } = useReactFlow();
  const helpModal = useRef<HTMLDialogElement>(null);

  function removeSelf() {
    assert(onRemove, "onRemove was null, but removeSelf was invoked");

    onRemove();
    setEdges(edges => edges.filter(x => x.source != id && x.target != id));
    setNodes(nodes => nodes.filter(x => x.id != id));
  }

  return (
    <>
      <div className={twMerge(
        "flex flex-col text-xs border border-solid border-gray-200 h-full rounded-2xl w-[400px] bg-white/70 shadow-[0_7px_9px_0_rgba(0,0,0,0.02)]",
        className
      )}>
        <header className={`
          flex items-center justify-between
          px-3 py-2 border-b border-solid border-gray-200 font-semibold rounded-t-2xl
        `}>
          <div>{name}</div>
          <div className="flex items-center gap-4">
            <div>
              <span
                onClick={() => helpModal.current!.showModal()}
                className="text-gray-300 underline cursor-pointer"
              >(help!)</span>
            </div>

            { !onRemove ? <></> :
              <div className="cursor-pointer" onClick={removeSelf}>
                <RiCloseCircleFill className="w-5 h-5 text-gray-600"/>
              </div>
            }
          </div>

        </header>

        <main className="relative bg-white py-3 pb-6 px-4 flex rounded-b-2xl">
          {children}
        </main>
      </div>

      <dialog ref={helpModal} className="modal fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-screen h-screen">
        <div className="modal-box">
          <h3 className="text-lg font-bold">{name} help</h3>
          <div className="py-4">{help}</div>

          <div className="modal-action">
            <form method="dialog">
              <button className="btn">Close</button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}
 
