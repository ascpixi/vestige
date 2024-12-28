import * as flow from "@xyflow/react";
import * as tone from "tone";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RiDeleteBinFill, RiFileCheckFill, RiFileMusicFill, RiGraduationCapFill, RiImportFill, RiInformation2Fill, RiLinkM, RiLinkUnlinkM, RiPlayFill, RiSaveFill, RiStopFill } from "@remixicon/react";

import "@xyflow/react/dist/style.css";

import { VESTIGE_NODE_SERIALIZERS, VESTIGE_NODE_TYPES, type VestigeNode } from "./nodes";
import { createFinalNode } from "./nodes/FinalNode";

import { VestigeGraph, GraphMutator, graphFromExisting } from "./graph";
import { deserializeProject, deserializeBase64Project, serializeProject, serializeBase64Project } from "./serializer";
import { getPersistentData, mutatePersistentData } from "./persistent";
import { AFTER_TOUR_PROJECT } from "./builtinProjects";
import { isTauri, promptToSaveFile } from "./environment";

import { Link } from "./components/Link";
import { IntroductionTour } from "./components/IntroductionTour";
import { EDGE_TYPES as VESTIGE_EDGE_TYPES } from "./components/VestigeEdge";
import { AddNodeMenu } from "./components/app/AddNodeMenu";
import { AppRenderDialog } from "./components/app/AppRenderDialog";
import { AppAboutDialog } from "./components/app/AppAboutDialog";
import { ConfirmationDialog } from "./components/app/ConfirmationDialog";
import { AppProjectLinkDialog } from "./components/app/AppProjectLinkDialog";

const shouldShowTour = !getPersistentData().tourComplete;
const shouldLoadExisting = location.hash.startsWith("#p:");

const DEFAULT_VIEWPORT = { x: 500, y: 210, zoom: 1 };

export default function App() {
  const [thisFlow, setThisFlow] = useState<flow.ReactFlowInstance<VestigeNode, flow.Edge> | null>(null);
  const [viewport, setViewport] = useState<flow.Viewport>(DEFAULT_VIEWPORT);

  const [startTimeMs, setStartTimeMs] = useState(performance.now());
  const [playing, setPlaying] = useState(false);

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
  const renderDialogRef = useRef<HTMLDialogElement>(null);

  const [projLink, setProjLink] = useState<string>("");

  const [realtimeCtx] = useState(tone.getContext());

  const togglePlay = useCallback(async () => {
    if (!playing) {
      setStartTimeMs(performance.now());

      if (!wasStarted) {
        console.log("▶️ Playing (performing first time initialization)");
        await tone.start();
        setWasStarted(true);
      } else {
        console.log("▶️ Playing");
        tone.getDestination().volume.rampTo(tone.gainToDb(1), 0.25);
      }
    } else {
      console.log("⏹️ Stopping");
      tone.getDestination().volume.rampTo(-Infinity, 0.25);
    }

    setPlaying(!playing);
  }, [playing, wasStarted]);

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
    if (!playing)
      return;

    const handler = () => {
      const now = realtimeCtx.now();
      graph.nodes.forEach(x => x.data.onTick?.(now));
    };

    realtimeCtx.on("tick", handler);
    return () => { realtimeCtx.off("tick", handler); }
  }, [realtimeCtx, graphVer, playing]);

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

  function handleContextMenuOpen(ev: React.MouseEvent<HTMLDivElement>) {
    setCtxMenuPos({ x: ev.pageX, y: ev.pageY });
    setShowCtxMenu(true);
    ev.preventDefault();
  }

  async function saveAsLink() {
    const data = await serializeBase64Project(graph.nodes, graph.edges, VESTIGE_NODE_SERIALIZERS);
    const root = isTauri()
      ? "https://vestige.ascpixi.dev/"
      : location.origin + location.pathname;

    setProjLink(root + "#p:" + data);
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
  }, []);

  const onNodesChange = useCallback(
    (changes: flow.NodeChange<VestigeNode>[]) => {
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
    // that concerns us. We provide it as a dependency.
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
      <AddNodeMenu
        x={ctxMenuPos.x} y={ctxMenuPos.y}
        show={showCtxMenu}
        onNodeChoose={async (descriptor) => {
          const { x, y } = thisFlow!.screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
          });

          setGraph(mutator.addNode(graph, await descriptor.create(x - 200, y - 200)));
          setShowCtxMenu(false);
        }}
      />

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

      <AppAboutDialog ref={aboutDialogRef} />
      <AppProjectLinkDialog link={projLink}/>
      <AppRenderDialog ref={renderDialogRef} graph={graph} />

      <ConfirmationDialog
        ref={resetDialogRef}
        content={<>
          Are you sure you want to create a new project? If you did not save
          this one before, it will be lost forever!
        </>}
        confirm="Yes, create a new one"
        onConfirm={reset}
      />

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
