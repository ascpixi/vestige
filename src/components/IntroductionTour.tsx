import * as flow from "@xyflow/react";
import { RiGraduationCapFill } from "@remixicon/react";
import { forwardRef, useCallback, useEffect, useState } from "react";

import { VestigeNode } from "../nodes";
import { distanceSqr, sqr } from "../util";
import { AbstractVestigeNode } from "../graph";
import { mutatePersistentData } from "../persistent";
import { AFTER_TOUR_PROJECT } from "../builtinProjects";

interface ExternalTourData {
  flowState: flow.ReactFlowInstance<VestigeNode, flow.Edge>;
  nodes: AbstractVestigeNode[];
  edges: flow.Edge[];
  viewport: flow.Viewport;
}

/**
 * Represents a tour step, with its own associated internal state.
 * Tour steps should never be re-used after the step index changes.
 */
interface TourStep {
  /** The content to display in the tour dialog box. */
  content: React.ReactNode;

  /**
   * A function which determines when to increment the current tour step.
   * Invoked for each external data change - if `true`, the current step is incremented.
   * Otherwise, no action is taken.
   * 
   * If not specified, a "next" button will be shown instead.
   */
  continueWhen?: (data: ExternalTourData) => boolean;

  /**
   * Invoked when the step is activated.
   */
  onInit?: (data: ExternalTourData) => void;
}

/** Represents a function that creates a `TourStep` alongside its internal state. */
type TourStepFactory = () => TourStep;

const STEPS: TourStepFactory[] = [
  (() => ({
    content: <>
      Welcome to Vestige, an interactive generative music synthesizer! With Vestige,
      you can create autonomous music compositions by connecting basic building blocks.
      Let's get started!
    </>
  })),

  (() => {
    let initialPos = { x: 0, y: 0 };

    return {
      content: <>
        In order to move around the flowchart, hold down your left mouse button
        and drag.
      </>,
      onInit(data) {
        initialPos = data.flowState.getViewport();
      },
      continueWhen(data) {
        return distanceSqr(initialPos, data.viewport) > sqr(300);
      },
    }
  }),

  (() => ({
    content: <>
      Right click anywhere on an empty spot on the grid to open
      the <b>add node</b> menu. Try adding a <b>melody (pentatonic)</b> node!
    </>,
    continueWhen(data) {
      return data.nodes.some(x => x.type == "pentatonic-melody")
    },
  })),

  (() => ({
    content: <>
      This is a <b>note generator</b> node. Think of it as a keyboard.
      You can move it around - try it! We now have to feed the nodes to an
      instrument. Just like you did with the <b>melody (pentatonic)</b> node,
      now try creating a <b>synth</b> node by right-clicking.
    </>,
    continueWhen(data) {
      return data.nodes.some(x => x.type == "synth")
    }
  })),

  (() => ({
    content: <>
      Nice! Now, connect the <b>main output</b> of the <b>melody (pentatonic)</b> node
      with the <b>main input</b> of the <b>synth</b> node. You can do this by
      clicking on the <b className="text-green-600">green circle</b> of the melody node,
      and dragging it to the <b className="text-green-600">green circle</b> of
      the synth one.
    </>,
    continueWhen(data) {
      return data.edges.some(x => {
        const src = data.nodes.find(y => y.id == x.source)!;
        const dst = data.nodes.find(y => y.id == x.target)!;

        return src.type == "pentatonic-melody" && dst.type == "synth";
      });
    }
  })),

  (() => ({
    content: <>
      Great! We don't hear anything yet - connect the <span className="text-blue-600">blue</span> <b>main output</b> of
      the <b>synth</b> to the <span className="text-blue-600">blue</span> <b>main input</b> of the <b>final output</b> node.
      Anything that comes inside this node will be played through your speakers.
    </>,
    continueWhen(data) {
      return data.edges.some(x => {
        const src = data.nodes.find(y => y.id == x.source)!;
        const dst = data.nodes.find(y => y.id == x.target)!;

        return src.type == "synth" && dst.type == "final";
      });
    }
  })),

  (() => ({
    content: <>
      Adjust your volume in the <b>final output</b> node to your liking, and
      then click <b>Next</b> to continue.
    </>
  })),

  (() => ({
    content: <>
      You've successfully created your first Vestige composition! It's quite
      simple for now - but there's much more you can do! Click <b>Next</b> for
      a more complex example.
    </>
  })),
];

export const IntroductionTour = forwardRef((
  { flowState, nodes, edges, viewport, tourStateChange }: ExternalTourData &
    {
      tourStateChange: (inTour: boolean) => void
    },
  ref: React.ForwardedRef<HTMLDialogElement>
) => {
  const [inTour, setInTour] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [step, setStep] = useState<TourStep>(STEPS[0]());

  const advance = useCallback(() => {
    if (stepIdx + 1 == STEPS.length) {
      handleTourFinished();
      return;
    }

    setStepIdx(stepIdx + 1);

    const step = STEPS[stepIdx + 1]();
    step.onInit?.({ flowState, nodes, edges, viewport });
    setStep(step);
  }, [stepIdx, edges, flowState, nodes, viewport]);

  useEffect(() => {
    if (step.continueWhen) {
      if (step.continueWhen({ flowState, nodes, edges, viewport })) {
        advance();
      }
    }
  }, [step, flowState, nodes, edges, viewport, advance]);

  
  function handleTourFinished() {
    mutatePersistentData({ tourComplete: true });
    location.hash = `#p:${AFTER_TOUR_PROJECT}`;
  }
  
  function enterTour() {
    if (nodes.length != 1 || edges.length != 0) {
      mutatePersistentData({ tourComplete: false });
      location.href = "#tour";
    }
    
    setInTour(true);
    tourStateChange(true);
  }

  function skipTour() {
    mutatePersistentData({ tourComplete: true });
  }

  if (!step)
    return <></>;

  return (
    <>
      <dialog ref={ref} className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Interactive tour (tutorial)</h3>
          <p className="py-4">
            Welcome! It looks like this is your first time using Vestige.
            Do you want to take an interactive tour that teaches you how to
            use it? <b>This is highly recommended if you are a newcomer.</b>
          </p>

          <div className="modal-action w-full">
            <form method="dialog" className="flex gap-2 w-full">
              <button onClick={enterTour} className="btn btn-primary w-1/2">Yes</button>
              <button onClick={skipTour} className="btn w-1/2">No, skip</button>
            </form>
          </div>
        </div>
      </dialog>

      <div className="absolute z-20 bottom-8 left-8 pr-8 sm:w-3/4">
        {
          !step || !inTour ? <></>
          : (
            <div className={`
              alert border border-solid border-gray-200 h-full
              bg-white shadow-[0_7px_9px_0_rgba(0,0,0,0.02)]
            `}>
              <RiGraduationCapFill/>
        
              <span>{step.content}</span>
              
              {
                step.continueWhen ? <></> :
                <div>
                  <button onClick={advance} className="btn btn-sm btn-primary">Next</button>
                </div>
              }
            </div>
          )
        }
      </div>
    </>
  );
});
