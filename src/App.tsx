import * as flow from "@xyflow/react";
import * as tone from "tone";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiDeleteBinFill, RiFileCheckFill, RiFileMusicFill, RiGraduationCapFill, RiImportFill, RiInformation2Fill, RiLinkM, RiLinkUnlinkM, RiPlayFill, RiSaveFill, RiStopFill } from "@remixicon/react";

import "@xyflow/react/dist/style.css";
import iconShadow from "./assets/icon-shadow.svg";
import highSeasLogo from "./assets/highseas-logo.svg";

import { NodeTypeDescriptor, VESTIGE_NODE_SERIALIZERS, VESTIGE_NODE_TYPES, type VestigeNode } from "./nodes";
import { PENTATONIC_MELODY_NODE_DESCRIPTOR } from "./nodes/PentatonicMelodyNode";
import { FILTER_NODE_DESCRIPTOR } from "./nodes/FilterNode";
import { SYNTH_NODE_DESCRIPTOR } from "./nodes/SynthNode";
import { SAMPLER_NODE_DESCRIPTOR } from "./nodes/SamplerNode";
import { LFO_NODE_DESCRIPTOR } from "./nodes/LfoNode";
import { REVERB_NODE_DESCRIPTOR } from "./nodes/ReverbNode";
import { BALANCE_NODE_DESCRIPTOR } from "./nodes/BalanceNode";
import { MIX_NODE_DESCRIPTOR } from "./nodes/MixNode";
import { DELAY_NODE_DESCRIPTOR } from "./nodes/DelayNode";
import { PENTATONIC_CHORDS_NODE_DESCRIPTOR } from "./nodes/PentatonicChordsNode";
import { PICK_NOTE_DESCRIPTOR } from "./nodes/PickNoteNode";
import { createFinalNode } from "./nodes/FinalNode";

import { VestigeGraph, GraphMutator, graphFromExisting } from "./graph";
import { deserializeProject, deserializeBase64Project, serializeProject, serializeBase64Project } from "./serializer";
import { getPersistentData, mutatePersistentData } from "./persistent";
import { AFTER_TOUR_PROJECT } from "./builtinProjects";
import { isTauri, promptToSaveFile } from "./environment";

import { Link } from "./components/Link";
import { IntroductionTour } from "./components/IntroductionTour";
import { ContextMenu, ContextMenuEntry } from "./components/ContextMenu";
import { EDGE_TYPES as VESTIGE_EDGE_TYPES } from "./components/VestigeEdge";
import { CHORUS_NODE_DESCRIPTOR } from "./nodes/ChorusNode";
import { ARPEGGIATOR_NOTE_DESCRIPTOR } from "./nodes/ArpeggiatorNode";
import { renderOffline } from "./render";

const shouldShowTour = !getPersistentData().tourComplete;
const shouldLoadExisting = location.hash.startsWith("#p:");

const DEFAULT_VIEWPORT = { x: 500, y: 210, zoom: 1 };

export default function App() {
  const [thisFlow, setThisFlow] = useState<flow.ReactFlowInstance<VestigeNode, flow.Edge> | null>(null);
  const [viewport, setViewport] = useState<flow.Viewport>(DEFAULT_VIEWPORT);

  const [startTimeMs, setStartTimeMs] = useState(performance.now());
  const [playing, setPlaying] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);

  const [wasStarted, setWasStarted] = useState(false);
  const [connectedFinalBefore, setConnectedFinalBefore] = useState(false);

  let [graph, setGraph] = useState(new VestigeGraph());
  const [graphVer, setGraphVer] = useState(0);

  const [ctxMenuPos, setCtxMenuPos] = useState({ x: 0, y: 0 });
  const [showCtxMenu, setShowCtxMenu] = useState(false);

  const [inTour, setInTour] = useState(false);
  const tourDialogRef = useRef<HTMLDialogElement>(null);

  const aboutDialogRef = useRef<HTMLDialogElement>(null);
  const resetDialogRef = useRef<HTMLDialogElement>(null);

  const [projLink, setProjLink] = useState<string>("");
  const projLinkDialogRef = useRef<HTMLDialogElement>(null);
  const projLinkTextRef = useRef<HTMLTextAreaElement>(null);

  const [isRendering, setIsRendering] = useState(false);
  const [renderLength, setRenderLength] = useState(30);
  const [renderProgress, setRenderProgress] = useState(0);
  const renderDialogRef = useRef<HTMLDialogElement>(null);

  const togglePlay = useCallback(async () => {
    if (!playing) {
      setStartTimeMs(performance.now());

      if (!wasStarted) {
        console.log("▶️ Playing (performing first time initialization)");
        await tone.start();
        setWasStarted(true);
      } else {
        console.log("▶️ Playing");
        tone.getDestination().volume.rampTo(prevVolume, 0.25);
      }
    } else {
      console.log("⏹️ Stopping");
      setPrevVolume(tone.getDestination().volume.value);
      tone.getDestination().volume.rampTo(-Infinity, 0.25);
    }

    setPlaying(!playing);
  }, [playing, prevVolume, wasStarted]);

  const mutator = useMemo(() => new GraphMutator({
    onSignalConnect(_src, dst) {
      if (dst.nodeType != "FINAL")
        return;

      if (!connectedFinalBefore) {
        if (!playing) {
          togglePlay();
        }

        setConnectedFinalBefore(true);
     } 
    }
  }), [connectedFinalBefore, playing, togglePlay]);

  useEffect(() => {
    window.addEventListener("hashchange", () => {
      if (location.hash.startsWith("#p:") || location.hash.startsWith("#tour")) {
        location.reload();
      }
    });
  }, []);

  useEffect(() => {
    if (!shouldLoadExisting) 
      return;

    (async () => {
      const data = location.hash.substring(3);
      const result = await deserializeBase64Project(data, VESTIGE_NODE_SERIALIZERS);
  
      setGraph(graphFromExisting(result.nodes, result.edges));
  
      console.log("✅ Successfully loaded project from URL.", result);
      location.hash = "";
    })();
  }, []);

  function getContextMenuEntry(descriptor: NodeTypeDescriptor): ContextMenuEntry {
    return {
      type: "ITEM",
      content: <div className="flex gap-2 items-center">
        {descriptor.icon("w-4 h-4")}
        {descriptor.displayName}
      </div>,
      onChoose: async () => {
        const { x, y } = thisFlow!.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        setGraph(mutator.addNode(graph, await descriptor.create(x - 200, y - 200)));
        setShowCtxMenu(false);
      }
    }
  }

  function handleContextMenuOpen(ev: React.MouseEvent<HTMLDivElement>) {
    if (ev.pageX == 1 && ev.pageY == 1) {
      // Touch devices seem to report the event originating at (1, 1) - in this
      // case, we position the context menu at the top of the page, centered horizontally.
      setCtxMenuPos({
        x: (document.body.clientWidth / 2) - 150,
        y: 96
      });
    } else {
      setCtxMenuPos({ x: ev.pageX, y: ev.pageY });
    }

    setShowCtxMenu(true);
    ev.preventDefault();
  }

  async function saveAsLink() {
    const data = await serializeBase64Project(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS);
    const root = isTauri()
      ? "https://vestige.ascpixi.dev/"
      : location.origin + location.pathname;

    setProjLink(root + "#p:" + data);
    projLinkDialogRef.current!.showModal();

    setTimeout(() => {
      projLinkTextRef.current!.focus();
      projLinkTextRef.current!.select();
    }, 50);
  }

  async function saveAsFile() {
    await promptToSaveFile(
      await serializeProject(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS),
      "untitled",
      "Vestige Project",
      "vestigeproj"
    );
  }

  async function loadFromFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".vestigeproj";
    
    const file = await new Promise<File>(resolve => {
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) resolve(file);
      };

      input.click();
    });

    const data = await new Promise<ArrayBuffer>(resolve => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.readAsArrayBuffer(file);
    });

    const result = await deserializeProject(new Uint8Array(data), VESTIGE_NODE_SERIALIZERS);
    setGraph(graphFromExisting(result.nodes, result.edges));
  }

  function loadFromLink() {
    const link = prompt("Paste the link in the input box below.");
    if (link == null)
      return;

    const linkHashIdx = link.indexOf("#");
    location.hash = link.substring(linkHashIdx);
  }

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

  function reset() {
    location.hash = "";
    location.reload();
  }

  useEffect(() => {
    if (shouldLoadExisting) 
      return;

    // Load default project
    setTimeout(() => {
      setGraph(mutator.mutate(graph, { nodes: [createFinalNode(0, 0)] }));

      if (shouldShowTour) {
        tourDialogRef.current!.showModal();
      }
    }, 300);
  //
  // If we were to add "graph" and "mutator" to the dependencies, we would have an
  // infinite loop of changing the graph because it changed, and so on...
  //
  // Silly React! Bad!
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodesChange = useCallback(
    (changes: flow.NodeChange<VestigeNode>[]) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      graph = mutator.mutate(graph, { nodes: flow.applyNodeChanges(changes, graph.nodes) });
      setGraph(graph);

      if (changes.some(x => x.type != "position")) {
        setGraphVer(x => x + 1);
      }
    },
    [graph, mutator],
  );

  const onEdgesChange = useCallback(
    (changes: flow.EdgeChange<flow.Edge>[]) => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      graph = mutator.mutateEdges(graph, changes);
      setGraph(graph);
      setGraphVer(x => x + 1);
    },
    [graph, mutator]
  );

  const onConnect = useCallback(
    (params: flow.Connection) => {
      // We can't connect two different sources to one target
      if (graph.edges.some(x => x.target == params.target && x.targetHandle == params.targetHandle))
        return;
 
      setGraph(mutator.mutate(graph, {
        edges: flow.addEdge({ ...params, type: "vestige" }, graph.edges)
      }));

      setGraphVer(x => x + 1);
    },
    [graph, mutator]
  );

  useEffect(() => {
    if (playing) {
      const id = setInterval(() => {
        graph.traceGraph((performance.now() - startTimeMs) / 1000);
      }, (1 / 96) * 1000);

      return () => clearInterval(id);
    }
  },
    // We only want to restart the graph tracer task when the graph changes in a meaningful
    // way - `nodes` changes when a node is re-positioned, and we really don't need to reset
    // the interval just for that (we don't care about node positions!) - we instead keep
    // a "graph version" counter, which we increment every time the graph changes in a way
    // that concerns us. We provide it as a dependency. Applying what the exhaustive
    // dependency warning tells us to do would actually do more harm than good.
    //
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphVer, startTimeMs, playing]
  );

  function handleTourFinished() {
    mutatePersistentData({ tourComplete: true });
    location.hash = `#p:${AFTER_TOUR_PROJECT}`;
  }

  function enterTour() {
    if (graph.nodes.length != 1 || graph.edges.length != 0) {
      mutatePersistentData({ tourComplete: false });
      location.href = "#tour";
    }
    
    setInTour(true);
  }

  function skipTour() {
    mutatePersistentData({ tourComplete: true });
  }

  return (
    <main className="w-screen h-screen overflow-hidden" onContextMenu={handleContextMenuOpen}>
      <div
        style={{ top: ctxMenuPos.y, left: ctxMenuPos.x }}
        className={`
          absolute z-50
          ${showCtxMenu ? "" : "hidden"}
        `}
      >
        <ContextMenu
          title="add node"
          openSide={ctxMenuPos.x > (document.body.clientWidth * .65) ? "LEFT" : "RIGHT"}
          entries={[
            {
              type: "GROUP", content: "melodies & chords", entries: [
                getContextMenuEntry(PENTATONIC_MELODY_NODE_DESCRIPTOR),
                getContextMenuEntry(PENTATONIC_CHORDS_NODE_DESCRIPTOR),
                getContextMenuEntry(ARPEGGIATOR_NOTE_DESCRIPTOR),
                getContextMenuEntry(PICK_NOTE_DESCRIPTOR),
              ]
            },
            {
              type: "GROUP", content: "instruments", entries: [
                getContextMenuEntry(SYNTH_NODE_DESCRIPTOR),
                getContextMenuEntry(SAMPLER_NODE_DESCRIPTOR)
              ]
            },
            {
              type: "GROUP", content: "effects", entries: [
                getContextMenuEntry(FILTER_NODE_DESCRIPTOR),
                getContextMenuEntry(REVERB_NODE_DESCRIPTOR),
                getContextMenuEntry(DELAY_NODE_DESCRIPTOR),
                getContextMenuEntry(CHORUS_NODE_DESCRIPTOR)
              ]
            },
            getContextMenuEntry(LFO_NODE_DESCRIPTOR),
            getContextMenuEntry(MIX_NODE_DESCRIPTOR),
            getContextMenuEntry(BALANCE_NODE_DESCRIPTOR)
        ]}/>
      </div>

      {
        !thisFlow || !inTour ? <></> :
        <div className="absolute z-20 bottom-8 left-8 pr-8 sm:w-3/4">
          <IntroductionTour
            nodes={graph.nodes}
            edges={graph.edges}
            flowState={thisFlow}
            viewport={viewport}
            onTourFinish={handleTourFinished}
          />
        </div>
      }

      <dialog ref={projLinkDialogRef} className="modal">
        <div className="modal-box max-w-none w-1/2">
          <h3 className="font-bold text-lg">Project link</h3>
          <p className="py-4">
            This is a link to your project - whenever you'll open it, this
            version of the project will be restored.
          </p>

          <textarea ref={projLinkTextRef}
            className="textarea textarea-bordered w-full h-full min-h-[200px]"
            aria-label="Project link"
            value={projLink}
            readOnly
          />
          
          <div className="modal-action">
            <form method="dialog">
              <button className="btn">Close</button>
            </form>
          </div>
        </div>
      </dialog>

      <dialog ref={resetDialogRef} className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Confirm operation</h3>
          <p className="py-4">
            Are you sure you want to create a new project? If you did not save
            this one before, it will be lost forever!
          </p>

          <div className="modal-action w-full">
            <form method="dialog" className="flex gap-2 w-full">
              <button onClick={reset} className="btn btn-primary w-1/2">Yes, create a new one</button>
              <button className="btn w-1/2">Cancel</button>
            </form>
          </div>
        </div>
      </dialog>

      <dialog ref={tourDialogRef} className="modal">
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

      <dialog ref={aboutDialogRef} className="modal">
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

      <dialog ref={renderDialogRef} className="modal">
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

      <flow.ReactFlow
        onMouseDownCapture={() => setShowCtxMenu(false)}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={VESTIGE_NODE_TYPES}
        edgeTypes={VESTIGE_EDGE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onViewportChange={setViewport}
        defaultViewport={DEFAULT_VIEWPORT}
        onInit={setThisFlow}
        fitView={shouldLoadExisting}
        translateExtent={inTour ? [[-1500, -500], [2000, 750]] : undefined}
      >
        <flow.Background variant={flow.BackgroundVariant.Dots}/>
        <flow.Controls />
        <flow.Panel position="top-left">
          <nav className="flex gap-2">
            <button onClick={togglePlay}
              title={playing ? "stop" : "play"}
              className="btn btn-square bg-white"
            >
              { playing ? <RiStopFill/> : <RiPlayFill/> }
            </button>

            <div className="dropdown">
              <button
                title="save or load project"
                tabIndex={0}
                role="button"
                className="btn btn-square bg-white"
                disabled={inTour}
              >
                <RiSaveFill/>
              </button>

              <ul tabIndex={0} className="dropdown-content menu bg-white mt-2 rounded-box z-[1] w-52 p-2 shadow">
                <li><a onClick={saveAsFile}><RiFileCheckFill className="w-4"/> Save as file</a></li>
                <li><a onClick={saveAsLink}><RiLinkM className="w-4"/>Save as link</a></li>
                <li><a onClick={loadFromFile}><RiImportFill className="w-4"/>Load from file</a></li>
                <li><a onClick={() => renderDialogRef.current!.showModal()}><RiFileMusicFill className="w-4"/>Render to audio file</a></li>

                {
                  !isTauri() ? <></> :
                  <li><a onClick={loadFromLink}><RiLinkUnlinkM className="w-4"/>Load from link</a></li>
                }
              </ul>
            </div>

            <button onClick={() => resetDialogRef.current!.showModal()}
              title="delete project" 
              className="btn btn-square bg-white"
              disabled={inTour}
            >
              <RiDeleteBinFill/>
            </button>

            <button onClick={() => tourDialogRef.current!.showModal()}
              title="show introduction tour"
              className="btn btn-square bg-white"
              disabled={inTour}
            >
              <RiGraduationCapFill/>
            </button>

            <button onClick={() => aboutDialogRef.current!.showModal()}
              title="about Vestige"
              className="btn btn-square bg-white"
            >
              <RiInformation2Fill/>
            </button>
          </nav>
        </flow.Panel>
      </flow.ReactFlow>
    </main>
  );
}
